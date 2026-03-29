/**
 * scripts/sources/scrape.js
 * Web-scraping av lokale norske event-sider
 *
 * Bruker node-html-parser (ingen headless browser, fungerer i GitHub Actions).
 *
 * VIKTIG: Nettsiders HTML-struktur endres uten varsel.
 * Oppdater CSS-selektorer ved behov og sjekk nettsidenes ToS for scraping.
 *
 * Legg til nye byer i CITY_SOURCES-objektet nedenfor.
 */

import { parse } from "node-html-parser";

const CITY_SOURCES = {
  bergen: [
    {
      url:     "https://www.visitbergen.com/hva-skjer",
      scraper: scrapeVisitBergen,
      label:   "visitbergen.com",
    },
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
  eidsvoll: [
    {
      url:     "https://www.visiteidsvoll.no/hva-skjer/",
      scraper: scrapeGeneric,
      label:   "visiteidsvoll.no",
    },
    {
      url:     "https://www.eidsvoll.kommune.no/kultur-og-fritid/",
      scraper: scrapeGeneric,
      label:   "eidsvoll.kommune.no",
    },
  ],
  lillestrom: [
    {
      url:     "https://detskjerilillestrom.no/arrangementer/",
      scraper: scrapeGeneric,
      label:   "detskjerilillestrom.no",
    },
    {
      url:     "https://www.lillestrom-kultursenter.no/program/",
      scraper: scrapeGeneric,
      label:   "lillestrom-kultursenter.no",
    },
    {
      url:     "https://www.lillestromkulturpub.no/program",
      scraper: scrapeGeneric,
      label:   "lillestromkulturpub.no",
    },
    {
      url:     "https://www.visitgreateroslo.com/no/Romerike/hva-skjer?by=17",
      scraper: scrapeGeneric,
      label:   "visitgreateroslo.com",
    },
    {
      url:     "https://lillestrom.kommune.no/kultur-og-fritid/arrangementer/",
      scraper: scrapeGeneric,
      label:   "lillestrom.kommune.no",
    },
    {
      url:     "https://www.visitromerike.no/hva-skjer/",
      scraper: scrapeGeneric,
      label:   "visitromerike.no",
    },
  ],
  "aurskog-holand": [
    {
      url:     "https://www.aurskog-holand.kommune.no/kultur-og-fritid/",
      scraper: scrapeGeneric,
      label:   "aurskog-holand.kommune.no",
    },
  ],
  kristiansand: [
    {
      url:     "https://www.visitsorlandet.com/hva-skjer/",
      scraper: scrapeGeneric,
      label:   "visitsorlandet.com",
    },
    {
      url:     "https://www.kristiansand.kommune.no/kultur-og-fritid/",
      scraper: scrapeGeneric,
      label:   "kristiansand.kommune.no",
    },
  ],
  tromso: [
    {
      url:     "https://www.visittromso.no/hva-skjer/",
      scraper: scrapeGeneric,
      label:   "visittromso.no",
    },
  ],
  drammen: [
    {
      url:     "https://www.visitdrammen.no/hva-skjer/",
      scraper: scrapeGeneric,
      label:   "visitdrammen.no",
    },
  ],
  fredrikstad: [
    {
      url:     "https://www.visitfredrikstad.com/hva-skjer/",
      scraper: scrapeGeneric,
      label:   "visitfredrikstad.com",
    },
  ],
  alesund: [
    {
      url:     "https://www.visitalesund.com/hva-skjer/",
      scraper: scrapeGeneric,
      label:   "visitalesund.com",
    },
  ],
  bodo: [
    {
      url:     "https://www.visitbodo.com/hva-skjer/",
      scraper: scrapeGeneric,
      label:   "visitbodo.com",
    },
  ],
  hamar: [
    {
      url:     "https://www.visitinnlandet.com/hva-skjer/",
      scraper: scrapeGeneric,
      label:   "visitinnlandet.com",
    },
  ],
  tonsberg: [
    {
      url:     "https://www.visitvestfold.com/hva-skjer/",
      scraper: scrapeGeneric,
      label:   "visitvestfold.com",
    },
  ],
  moss: [
    {
      url:     "https://www.visitmoss.no/hva-skjer/",
      scraper: scrapeGeneric,
      label:   "visitmoss.no",
    },
  ],
  haugesund: [
    {
      url:     "https://www.visithaugesund.no/hva-skjer/",
      scraper: scrapeGeneric,
      label:   "visithaugesund.no",
    },
  ],
  sandefjord: [
    {
      url:     "https://www.visitsandefjord.com/hva-skjer/",
      scraper: scrapeGeneric,
      label:   "visitsandefjord.com",
    },
  ],
  arendal: [
    {
      url:     "https://www.visitarendal.com/hva-skjer/",
      scraper: scrapeGeneric,
      label:   "visitarendal.com",
    },
  ],
  molde: [
    {
      url:     "https://www.visitmolde.com/hva-skjer/",
      scraper: scrapeGeneric,
      label:   "visitmolde.com",
    },
  ],
  voss: [
    {
      url:     "https://www.visitvoss.no/hva-skjer/",
      scraper: scrapeGeneric,
      label:   "visitvoss.no",
    },
  ],
  kongsberg: [
    {
      url:     "https://www.visitkongsberg.no/hva-skjer/",
      scraper: scrapeGeneric,
      label:   "visitkongsberg.no",
    },
  ],
};

export async function scrapeLocalSites(city) {
  const sources = CITY_SOURCES[city.toLowerCase()] || [];
  if (sources.length === 0) {
    console.warn(`Ingen scraping-mål konfigurert for by: ${city}`);
    return [];
  }

  const results = await Promise.allSettled(sources.map(scrapeSource));
  const events  = [];
  for (const r of results) {
    if (r.status === "fulfilled") events.push(...r.value);
    else console.error("Scraping feil:", r.reason?.message);
  }
  return events;
}

async function scrapeSource({ url, scraper, label }) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":      "Mozilla/5.0 (compatible; HvaSkjerBot/1.0; +https://hva-skjer.no/bot)",
      "Accept-Language": "nb-NO,nb;q=0.9",
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`${label} svarte med ${res.status}`);

  const root   = parse(await res.text());
  const events = scraper(root, label);
  console.info(`${label}: fant ${events.length} arrangementer`);
  return events;
}

/* ============================================================
   SCRAPER-FUNKSJONER PER NETTSTED
   Tilpass CSS-selektorer om siden endrer struktur.
   ============================================================ */

function scrapeVisitBergen(root) {
  return scrapeItems(root, [
    ".event-item", ".eventlist-item", "article.event", "[class*='event-card']",
  ], "Bergen", "https://www.visitbergen.com", "vb");
}

function scrapeVisitOslo(root) {
  return scrapeItems(root, [
    ".event-card", ".events-list__item", "article[class*='event']", ".eventcard",
  ], "Oslo", "https://www.visitoslo.com", "vo");
}

function scrapeVisitTrondheim(root) {
  return scrapeGenericWithBase(root, "Trondheim", "https://www.visittrondheim.no", "vt");
}

function scrapeGeneric(root, label) {
  return scrapeGenericWithBase(root, label, "", "gen");
}

function scrapeGenericWithBase(root, city, baseUrl, prefix) {
  return scrapeItems(root, [
    "article", ".event", "[class*='event-']", "[class*='arrangement']", "li.item",
  ], city, baseUrl, prefix);
}

function scrapeItems(root, selectors, city, baseUrl, prefix) {
  const events = [];
  const items  = root.querySelectorAll(selectors.join(", "));

  for (const item of items) {
    const title = extractText(item, "h2, h3, h4, .event-title, [class*='title']");
    if (!title || title.length < 5) continue;

    const dateStr    = extractText(item, "time, .date, [class*='date'], [datetime]");
    const location   = extractText(item, ".location, .venue, [class*='location']");
    const href       = extractHref(item, "a");
    const imgSrc     = extractImg(item);
    const parsedDate = parseNorwegianDate(dateStr);
    const absHref    = href ? absoluteUrl(href, baseUrl) : null;

    events.push({
      id:          `scrape-${prefix}-${slugify(title)}-${parsedDate?.date || ""}`,
      title,
      description: extractText(item, ".description, .summary, p") || `Arrangement i ${city}`,
      date:        parsedDate?.date || tomorrowDateStr(),
      time:        parsedDate?.time || "12:00",
      endTime:     null,
      location:    location || city,
      categories:  guessCategories(title),
      ticketUrl:   absHref,
      affiliateUrl: absHref ? `${absHref}?ref=hvaSkjerIByenMin` : null,
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

function extractText(node, selectors) {
  for (const sel of selectors.split(",").map((s) => s.trim())) {
    const text = node.querySelector(sel)?.textContent?.trim();
    if (text) return text;
  }
  return "";
}

function extractHref(node, sel) {
  return node.querySelector(sel)?.getAttribute("href") || "";
}

function extractImg(node) {
  const img = node.querySelector("img");
  return img?.getAttribute("src") || img?.getAttribute("data-src") || null;
}

function absoluteUrl(href, base) {
  if (!href) return null;
  if (href.startsWith("http")) return href;
  try { return new URL(href, base).href; } catch { return href; }
}

function guessCategories(title = "") {
  const t    = title.toLowerCase();
  const cats = new Set();
  if (/konsert|musikk|festival|jazz|rock|pop|metal|klassisk|gospel|kor/i.test(t)) cats.add("konsert");
  if (/bar|nattklubb|club|uteliv|dj|afterparty/i.test(t))                          cats.add("uteliv");
  if (/familie|for barn|aktivitet/i.test(t))                                        cats.add("familie");
  if (/barn|junior|barneshow|barneteater/i.test(t))                                 cats.add("barn");
  if (/gratis|fri inngang|free|åpen/i.test(t))                                      cats.add("gratis");
  if (cats.size === 0) cats.add("familie");
  return [...cats];
}

function parseNorwegianDate(dateStr = "") {
  if (!dateStr) return null;

  const iso = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const t = dateStr.match(/(\d{2}):(\d{2})/);
    return { date: `${iso[1]}-${iso[2]}-${iso[3]}`, time: t ? `${t[1]}:${t[2]}` : "12:00" };
  }

  const no = dateStr.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (no) {
    return { date: `${no[3]}-${no[2].padStart(2,"0")}-${no[1].padStart(2,"0")}`, time: "12:00" };
  }

  const months = {
    januar:1,februar:2,mars:3,april:4,mai:5,juni:6,
    juli:7,august:8,september:9,oktober:10,november:11,desember:12,
    jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,aug:8,sep:9,okt:10,nov:11,des:12,
  };
  const txt = dateStr.match(/(\d{1,2})\.\s*(\w+)\s*(\d{4})?/i);
  if (txt) {
    const month = months[txt[2].toLowerCase()];
    const year  = txt[3] || new Date().getFullYear();
    if (month) {
      const t = dateStr.match(/(\d{2}):(\d{2})/);
      return {
        date: `${year}-${String(month).padStart(2,"0")}-${txt[1].padStart(2,"0")}`,
        time: t ? `${t[1]}:${t[2]}` : "12:00",
      };
    }
  }
  return null;
}

function tomorrowDateStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("sv-SE");
}

function slugify(str = "") {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").substring(0, 40);
}
