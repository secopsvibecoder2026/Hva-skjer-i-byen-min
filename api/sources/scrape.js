/**
 * api/sources/scrape.js
 * Web-scraping av lokale norske event-sider
 *
 * Bruker node-html-parser (ingen headless browser = Vercel-kompatibel).
 * Installasjon: npm install node-html-parser
 *
 * VIKTIG: Nettsiders HTML-struktur endres uten varsel.
 * Logg feil i produksjon og oppdater selektorer ved behov.
 * Sjekk alltid nettsidenes vilkår (ToS) for scraping-tillatelse.
 *
 * Dekker (nøyaktig URL kan endre seg):
 *   - visitbergen.com  → konserter, kultur, familieevents
 *   - visitoslo.com    → konserter, kultur
 *   - visittrondheim.no → lokale events
 *
 * Legg til nye byer ved å legge inn en entry i CITY_SOURCES.
 */

import { parse } from "node-html-parser";

/**
 * Konfigurer scraping-mål per by.
 * url:       Siden å hente
 * scraper:   Funksjon som parser HTML og returnerer event-array
 */
const CITY_SOURCES = {
  bergen: [
    {
      url:     "https://www.visitbergen.com/hva-skjer",
      scraper: scrapeVisitBergen,
      label:   "visitbergen.com",
    },
    // Legg til ba.no, bergenkommune.no o.l. her
  ],
  oslo: [
    {
      url:     "https://www.visitoslo.com/no/hva-skjer/",
      scraper: scrapeVisitOslo,
      label:   "visitoslo.com",
    },
  ],
  trondheim: [
    {
      url:     "https://www.visittrondheim.no/arrangement/",
      scraper: scrapeVisitTrondheim,
      label:   "visittrondheim.no",
    },
  ],
  stavanger: [
    {
      url:     "https://www.regionstavanger-ryfylke.com/hva-skjer/",
      scraper: scrapeGeneric,
      label:   "regionstavanger.com",
    },
  ],
};

/**
 * Henter og scraper alle event-sider for en gitt by
 * @param {string} city
 * @returns {Promise<object[]>}
 */
export async function scrapeLocalSites(city) {
  const sources = CITY_SOURCES[city.toLowerCase()] || [];
  if (sources.length === 0) {
    console.warn(`Ingen scraping-mål konfigurert for by: ${city}`);
    return [];
  }

  const results = await Promise.allSettled(
    sources.map((src) => scrapeSource(src))
  );

  const events = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      events.push(...result.value);
    } else {
      console.error("Scraping feil:", result.reason?.message);
    }
  }

  return events;
}

/**
 * Henter HTML fra en URL og kjører scraper-funksjonen
 */
async function scrapeSource({ url, scraper, label }) {
  const res = await fetch(url, {
    headers: {
      // Normalt User-Agent for å unngå bot-blokkering
      "User-Agent":
        "Mozilla/5.0 (compatible; HvaSkjerBot/1.0; +https://hva-skjer.no/bot)",
      "Accept-Language": "nb-NO,nb;q=0.9",
    },
    signal: AbortSignal.timeout(8000), // 8 sek timeout
  });

  if (!res.ok) {
    throw new Error(`${label} svarte med ${res.status}`);
  }

  const html = await res.text();
  const root = parse(html);
  const events = scraper(root, label);

  console.info(`${label}: fant ${events.length} arrangementer`);
  return events;
}

/* ============================================================
   SCRAPER-FUNKSJONER PER NETTSTED
   Oppdater CSS-selektorer om siden endrer struktur.
   ============================================================ */

/**
 * Scraper for visitbergen.com/hva-skjer
 * Tilpass selektorer til faktisk HTML-struktur.
 */
function scrapeVisitBergen(root, label) {
  const events = [];

  // Prøver vanlige event-liste-strukturer (tilpass til faktisk markup)
  const items = root.querySelectorAll(
    ".event-item, .eventlist-item, article.event, [class*='event-card']"
  );

  for (const item of items) {
    const title    = extractText(item, "h2, h3, .event-title, [class*='title']");
    const dateStr  = extractText(item, "time, .date, [class*='date'], [datetime]");
    const location = extractText(item, ".location, .venue, [class*='location']");
    const href     = extractHref(item,  "a");
    const imgSrc   = extractImg(item);

    if (!title) continue;

    const parsedDate = parseNorwegianDate(dateStr);

    events.push({
      id:          `scrape-vb-${slugify(title)}-${parsedDate?.date || ""}`,
      title,
      description: extractText(item, ".description, .summary, p") || `Arrangement i Bergen`,
      date:        parsedDate?.date || tomorrowDateStr(),
      time:        parsedDate?.time || "12:00",
      endTime:     null,
      location:    location || "Bergen",
      categories:  guessCategories(title),
      ticketUrl:   href ? absoluteUrl(href, "https://www.visitbergen.com") : null,
      affiliateUrl: href
        ? `${absoluteUrl(href, "https://www.visitbergen.com")}?ref=hvaSkjerIByenMin`
        : null,
      imageUrl:    imgSrc || null,
      imageEmoji:  "🎪",
      sponsored:   false,
      featured:    false,
      source:      "scrape",
    });
  }

  return events;
}

/**
 * Scraper for visitoslo.com
 */
function scrapeVisitOslo(root, label) {
  const events = [];

  const items = root.querySelectorAll(
    ".event-card, .events-list__item, article[class*='event'], .eventcard"
  );

  for (const item of items) {
    const title    = extractText(item, "h2, h3, h4, .title, [class*='title']");
    const dateStr  = extractText(item, "time, .date, [datetime], [class*='date']");
    const location = extractText(item, ".venue, .location, [class*='location']");
    const href     = extractHref(item, "a");
    const imgSrc   = extractImg(item);

    if (!title) continue;

    const parsedDate = parseNorwegianDate(dateStr);

    events.push({
      id:          `scrape-vo-${slugify(title)}-${parsedDate?.date || ""}`,
      title,
      description: extractText(item, ".description, .summary, p") || `Arrangement i Oslo`,
      date:        parsedDate?.date || tomorrowDateStr(),
      time:        parsedDate?.time || "12:00",
      endTime:     null,
      location:    location || "Oslo",
      categories:  guessCategories(title),
      ticketUrl:   href ? absoluteUrl(href, "https://www.visitoslo.com") : null,
      affiliateUrl: href
        ? `${absoluteUrl(href, "https://www.visitoslo.com")}?ref=hvaSkjerIByenMin`
        : null,
      imageUrl:    imgSrc || null,
      imageEmoji:  "🎪",
      sponsored:   false,
      featured:    false,
      source:      "scrape",
    });
  }

  return events;
}

/**
 * Scraper for visittrondheim.no
 */
function scrapeVisitTrondheim(root, label) {
  // Likner på Bergen-scraperen – tilpass selektorer
  return scrapeGenericWithBase(root, "Trondheim", "https://www.visittrondheim.no", "vt");
}

/**
 * Generisk scraper – prøver vanlige HTML-mønstre
 * Brukes for byer uten dedikert scraper
 */
function scrapeGeneric(root, label) {
  return scrapeGenericWithBase(root, label, "", "gen");
}

function scrapeGenericWithBase(root, city, baseUrl, prefix) {
  const events = [];

  const candidates = root.querySelectorAll(
    "article, .event, [class*='event-'], [class*='arrangement'], li.item"
  );

  for (const item of candidates) {
    const title = extractText(item, "h2, h3, h4, .title, [class*='title']");
    if (!title || title.length < 5) continue;

    const dateStr    = extractText(item, "time, .date, [datetime], [class*='date']");
    const location   = extractText(item, ".venue, .location, [class*='location']");
    const href       = extractHref(item, "a");
    const imgSrc     = extractImg(item);
    const parsedDate = parseNorwegianDate(dateStr);

    events.push({
      id:          `scrape-${prefix}-${slugify(title)}-${parsedDate?.date || ""}`,
      title,
      description: extractText(item, ".description, .summary, p") || `Arrangement i ${city}`,
      date:        parsedDate?.date || tomorrowDateStr(),
      time:        parsedDate?.time || "12:00",
      endTime:     null,
      location:    location || city,
      categories:  guessCategories(title),
      ticketUrl:   href ? absoluteUrl(href, baseUrl) : null,
      affiliateUrl: href ? `${absoluteUrl(href, baseUrl)}?ref=hvaSkjerIByenMin` : null,
      imageUrl:    imgSrc || null,
      imageEmoji:  "🎪",
      sponsored:   false,
      featured:    false,
      source:      "scrape",
    });
  }

  return events;
}

/* ============================================================
   HJELPEFUNKSJONER
   ============================================================ */

/** Hent tekst fra første matchende selektor */
function extractText(node, selectors) {
  for (const sel of selectors.split(",").map((s) => s.trim())) {
    const el = node.querySelector(sel);
    if (el) {
      const text = el.textContent.trim();
      if (text) return text;
    }
  }
  return "";
}

/** Hent href fra første matchende anker */
function extractHref(node, sel) {
  const el = node.querySelector(sel);
  return el?.getAttribute("href") || "";
}

/** Hent første bilde-URL */
function extractImg(node) {
  const img = node.querySelector("img");
  return (
    img?.getAttribute("src") ||
    img?.getAttribute("data-src") ||
    img?.getAttribute("data-lazy-src") ||
    null
  );
}

/** Gjør relativ URL absolutt */
function absoluteUrl(href, base) {
  if (!href) return null;
  if (href.startsWith("http")) return href;
  try { return new URL(href, base).href; } catch { return href; }
}

/** Gjetter kategorier basert på tittelord (nøkkelord-matching) */
function guessCategories(title = "") {
  const t = title.toLowerCase();
  const cats = new Set();

  if (/konsert|musikk|festival|jazz|rock|pop|metal|klassisk|gospel|kor/i.test(t)) cats.add("konsert");
  if (/bar|nattklubb|club|uteliv|dj-sett|afterparty/i.test(t))                     cats.add("uteliv");
  if (/familie|barn|unge|barn|junior|for barn|aktivitet/i.test(t))                  cats.add("familie");
  if (/barn|junior|unge|for barn|barneshow|barneteater/i.test(t))                   cats.add("barn");
  if (/gratis|fri inngang|free|åpent|åpen|open house/i.test(t))                     cats.add("gratis");

  if (cats.size === 0) cats.add("familie"); // Standard-kategori
  return [...cats];
}

/**
 * Parser norsk datostreng til { date: "YYYY-MM-DD", time: "HH:MM" }
 * Støtter format som: "5. april 2026", "lørdag 5. apr", "2026-04-05", "05.04.2026"
 */
function parseNorwegianDate(dateStr = "") {
  if (!dateStr) return null;

  // ISO-format
  const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const timeMatch = dateStr.match(/(\d{2}):(\d{2})/);
    return {
      date: `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`,
      time: timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : "12:00",
    };
  }

  // Norsk dd.mm.yyyy
  const noMatch = dateStr.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (noMatch) {
    const d = noMatch[1].padStart(2, "0");
    const m = noMatch[2].padStart(2, "0");
    const y = noMatch[3];
    return { date: `${y}-${m}-${d}`, time: "12:00" };
  }

  // Norsk tekstformat "5. april 2026"
  const months = {
    januar:1, februar:2, mars:3, april:4, mai:5, juni:6,
    juli:7, august:8, september:9, oktober:10, november:11, desember:12,
    jan:1, feb:2, mar:3, apr:4, jun:6, jul:7, aug:8, sep:9, okt:10, nov:11, des:12,
  };
  const textMatch = dateStr.match(/(\d{1,2})\.\s*(\w+)\s*(\d{4})?/i);
  if (textMatch) {
    const day    = textMatch[1].padStart(2, "0");
    const month  = months[textMatch[2].toLowerCase()];
    const year   = textMatch[3] || new Date().getFullYear().toString();
    if (month) {
      const timeMatch = dateStr.match(/(\d{2}):(\d{2})/);
      return {
        date: `${year}-${String(month).padStart(2, "0")}-${day}`,
        time: timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : "12:00",
      };
    }
  }

  return null;
}

/** Returner ISO-dato for i morgen */
function tomorrowDateStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("sv-SE");
}

/** Lag en enkel URL-slug av en streng */
function slugify(str = "") {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").substring(0, 40);
}
