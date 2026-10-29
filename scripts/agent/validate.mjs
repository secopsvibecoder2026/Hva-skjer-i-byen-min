/**
 * scripts/agent/validate.mjs
 * Validerer og normaliserer arrangementene søkeagenten leverer.
 *
 * Alt agenten returnerer er tolket fra tilfeldige nettsider og må behandles
 * som upålitelig. Hvert felt sjekkes, og hvert arrangement må ha en lenke til
 * et domene som faktisk dukket opp i websøkene i samme kjøring. Det er den
 * viktigste vernet mot oppdiktede arrangementer: en modell kan finne på en
 * tittel og en dato, men den kan ikke få et domene den aldri så til å dukke
 * opp i søkeresultatene.
 */

import { createHash } from "node:crypto";
import { normalizeTitle } from "../lib/events.mjs";

export const ALLOWED_CATEGORIES = ["konsert", "uteliv", "teater", "familie", "barn", "sport", "gratis"];

const MAX_TITLE       = 140;
const MAX_VENUE       = 120;
const MAX_DESCRIPTION = 240;
const MAX_PRICE       = 100_000;

const HTML_LIKE = /<[a-z!/][^>]*>/i;
// Kontrolltegn og usynlige retningsmarkører – ingen plass i en tittel
const CONTROL   = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g;

function cleanText(value) {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL, " ").replace(/\s+/g, " ").trim();
}

/** Kort, stabil id – hash i stedet for slug, så titler med bare æøå ikke kolliderer */
function eventId(cityId, title, date) {
  const h = createHash("sha1").update(`${normalizeTitle(title)}|${date}`).digest("hex").slice(0, 10);
  return `agent-${cityId}-${date}-${h}`;
}

function isRealDate(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(`${str}T00:00:00Z`);
  return !isNaN(d) && d.toISOString().slice(0, 10) === str;
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "www.grieghallen.no" og "grieghallen.no" regnes som samme vert */
export function hostKey(urlOrHost) {
  try {
    const host = urlOrHost.includes("://") ? new URL(urlOrHost).hostname : urlOrHost;
    return host.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function truncateAtWord(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:.\s]+$/, "")}…`;
}

/**
 * @param {unknown} raw            agentens events-liste (fra submit_events)
 * @param {object}  ctx
 * @param {{id:string,name:string}} ctx.city
 * @param {string}  ctx.today       "YYYY-MM-DD"
 * @param {number}  ctx.horizonDays hvor langt frem i tid vi godtar
 * @param {Set<string>} ctx.seenHosts verter (hostKey) fra websøkene i kjøringen
 * @returns {{accepted: object[], rejected: {title: string, reason: string}[]}}
 */
export function validateEvents(raw, { city, today, horizonDays, seenHosts }) {
  const accepted = [];
  const rejected = [];
  const latest   = addDays(today, horizonDays);
  const seenKeys = new Set();

  if (!Array.isArray(raw)) {
    return { accepted, rejected: [{ title: "(hele svaret)", reason: "events er ikke en liste" }] };
  }

  for (const item of raw) {
    const reject = (reason) => rejected.push({ title: cleanText(item?.title).slice(0, 80) || "(uten tittel)", reason });

    if (!item || typeof item !== "object") { reject("ikke et objekt"); continue; }

    // — Tittel —
    const title = cleanText(item.title);
    if (title.length < 3)               { reject("tittel mangler eller er for kort"); continue; }
    if (title.length > MAX_TITLE)       { reject("tittel er for lang"); continue; }
    if (HTML_LIKE.test(title))          { reject("tittel inneholder HTML"); continue; }
    if (/^hva skjer i\b/i.test(title))  { reject("ser ut som en oversiktsside, ikke et arrangement"); continue; }

    // — Dato —
    const date = cleanText(item.date);
    if (!isRealDate(date))              { reject(`ugyldig dato «${date}»`); continue; }
    if (date < today)                   { reject(`dato ${date} er passert`); continue; }
    if (date > latest)                  { reject(`dato ${date} er utenfor tidsrommet`); continue; }

    // — Lenke: må peke til et domene vi faktisk så i søkene —
    let url;
    try { url = new URL(cleanText(item.url)); } catch { reject("ugyldig lenke"); continue; }
    if (url.protocol !== "https:" && url.protocol !== "http:") { reject("lenken er ikke http(s)"); continue; }
    if (!seenHosts.has(hostKey(url.hostname))) {
      reject(`lenken (${url.hostname}) var ikke blant søkeresultatene`);
      continue;
    }

    // — Sted —
    const venue = cleanText(item.venue);
    if (venue.length < 2 || venue.length > MAX_VENUE || HTML_LIKE.test(venue)) {
      reject("sted mangler eller er ugyldig");
      continue;
    }
    const location = normalizeTitle(venue).includes(normalizeTitle(city.name))
      ? venue
      : `${venue}, ${city.name}`;

    // — Duplikater innad i samme svar —
    const key = `${normalizeTitle(title)}|${date}`;
    if (seenKeys.has(key)) { reject("duplikat i samme svar"); continue; }
    seenKeys.add(key);

    // — Valgfrie felter: ugyldige verdier blir null, ikke avvisning —
    let time = typeof item.time === "string" ? cleanText(item.time) : null;
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) time = null;
    // 00:00 betyr nesten alltid "ukjent" i kildene, ikke midnatt
    if (time === "00:00") time = null;

    let priceFrom = typeof item.priceFrom === "number" && Number.isFinite(item.priceFrom) ? item.priceFrom : null;
    if (priceFrom !== null && (priceFrom < 0 || priceFrom > MAX_PRICE)) priceFrom = null;

    const categories = [...new Set(
      (Array.isArray(item.categories) ? item.categories : [])
        .map((c) => cleanText(c).toLowerCase())
        .filter((c) => ALLOWED_CATEGORIES.includes(c))
    )];
    if (priceFrom === 0 && !categories.includes("gratis")) categories.push("gratis");

    let description = cleanText(item.description);
    if (HTML_LIKE.test(description)) description = "";
    description = description ? truncateAtWord(description, MAX_DESCRIPTION) : null;

    accepted.push({
      id:           eventId(city.id, title, date),
      title,
      description,
      date,
      time,
      endTime:      null,
      location,
      categories,
      priceFrom,
      currency:     priceFrom === null ? null : "NOK",
      ticketUrl:    url.href,
      affiliateUrl: null,
      imageUrl:     null,
      imageEmoji:   "🎪",
      sponsored:    false,
      featured:     false,
      source:       "agent",
    });
  }

  return { accepted, rejected };
}
