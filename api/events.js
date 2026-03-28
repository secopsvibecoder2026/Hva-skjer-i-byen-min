/**
 * api/events.js
 * Vercel Serverless Function – hoved-aggregator
 *
 * Endpoint:  GET /api/events?city=bergen
 *
 * Flyt:
 *  1. Henter data parallelt fra Ticketmaster, Eventbrite og scraping
 *  2. Slår sammen til unified format
 *  3. Deduplicerer (samme tittel + dato = duplikat)
 *  4. Sorterer: sponsede øverst, deretter dato stigende
 *  5. Returnerer JSON med CORS og cache-headers
 *
 * Miljøvariabler (sett i Vercel Dashboard → Settings → Environment Variables):
 *   TM_API_KEY   – Ticketmaster API-nøkkel  (https://developer.ticketmaster.com)
 *   EB_TOKEN     – Eventbrite API-token      (https://www.eventbrite.com/platform/api)
 */

import { fetchTicketmaster } from "./sources/ticketmaster.js";
import { fetchEventbrite }   from "./sources/eventbrite.js";
import { scrapeLocalSites }  from "./sources/scrape.js";

export default async function handler(req, res) {
  // CORS – tillat kall fra alle origins (juster om nødvendig)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const city = (req.query.city || "bergen").toLowerCase().trim();

  try {
    // Kjør alle kilder parallelt – Promise.allSettled sikrer at en feilet kilde
    // ikke stopper resten
    const [tmResult, ebResult, scrapeResult] = await Promise.allSettled([
      fetchTicketmaster(city),
      fetchEventbrite(city),
      scrapeLocalSites(city),
    ]);

    // Plukk ut vellykkede resultater
    const tmEvents     = tmResult.status     === "fulfilled" ? tmResult.value     : [];
    const ebEvents     = ebResult.status     === "fulfilled" ? ebResult.value     : [];
    const scrapeEvents = scrapeResult.status === "fulfilled" ? scrapeResult.value : [];

    // Logg feil uten å krasje
    if (tmResult.status     === "rejected") console.error("Ticketmaster feil:", tmResult.reason);
    if (ebResult.status     === "rejected") console.error("Eventbrite feil:", ebResult.reason);
    if (scrapeResult.status === "rejected") console.error("Scraping feil:", scrapeResult.reason);

    // Slå sammen og dedupliser
    const allEvents = deduplicate([...tmEvents, ...ebEvents, ...scrapeEvents]);

    // Sorter: sponsede øverst, deretter dato stigende
    allEvents.sort((a, b) => {
      if (a.sponsored && !b.sponsored) return -1;
      if (!a.sponsored && b.sponsored) return  1;
      return new Date(a.date + "T" + (a.time || "00:00"))
           - new Date(b.date + "T" + (b.time || "00:00"));
    });

    // Cache i 1 time på CDN, men tillat stale serving mens ny hentes
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");

    return res.status(200).json({
      events: allEvents,
      meta: {
        city,
        count: allEvents.length,
        sources: {
          ticketmaster: tmEvents.length,
          eventbrite:   ebEvents.length,
          scrape:       scrapeEvents.length,
        },
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("Feil i /api/events:", err);
    return res.status(500).json({ error: "Intern serverfeil", message: err.message });
  }
}

/**
 * Enkel deduplicering – fjerner arrangementer med samme tittel og dato.
 * Prioriterer poster fra Ticketmaster (har rikere data) over scraping.
 */
function deduplicate(events) {
  const seen = new Map();
  for (const event of events) {
    const key = `${event.title.toLowerCase().trim()}|${event.date}`;
    if (!seen.has(key)) {
      seen.set(key, event);
    } else {
      // Behold den med rikere data (prioritet: ticketmaster > eventbrite > scrape > local)
      const priority = { ticketmaster: 0, eventbrite: 1, scrape: 2, local: 3 };
      const existing = seen.get(key);
      if ((priority[event.source] ?? 99) < (priority[existing.source] ?? 99)) {
        seen.set(key, event);
      }
    }
  }
  return [...seen.values()];
}
