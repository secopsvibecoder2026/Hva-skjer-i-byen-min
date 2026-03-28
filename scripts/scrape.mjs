/**
 * scripts/scrape.mjs
 * Standalone scraper – kjøres av GitHub Actions daglig.
 *
 * Bruk:
 *   node scripts/scrape.mjs
 *
 * Miljøvariabler (settes som GitHub Secrets):
 *   TM_API_KEY  – Ticketmaster Consumer Key  (valgfri, men anbefalt)
 *   EB_TOKEN    – Eventbrite Private Token    (valgfri, men anbefalt)
 *
 * Output: data/events-{by}.json for hver by i CITIES-listen.
 * GitHub Pages serverer disse filene som statiske JSON-filer.
 *
 * Uten API-nøkler: bare scraping av lokale nettsider kjøres.
 * Resultatet lagres uansett – tom array om ingen kilder svarer.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { fetchTicketmaster } from "../api/sources/ticketmaster.js";
import { fetchEventbrite }   from "../api/sources/eventbrite.js";
import { scrapeLocalSites }  from "../api/sources/scrape.js";

/** Byer som skal hentes data for */
const CITIES = ["bergen", "oslo", "trondheim", "stavanger", "eidsvoll"];

/** Sikre at data/-mappen finnes */
await mkdir("data", { recursive: true });

let totalEvents = 0;

for (const city of CITIES) {
  console.log(`\n⟶  Henter data for ${city}…`);

  const [tmResult, ebResult, scrapeResult] = await Promise.allSettled([
    fetchTicketmaster(city),
    fetchEventbrite(city),
    scrapeLocalSites(city),
  ]);

  // Logg kilderesultater
  const tmEvents     = tmResult.status     === "fulfilled" ? tmResult.value     : [];
  const ebEvents     = ebResult.status     === "fulfilled" ? ebResult.value     : [];
  const scrapeEvents = scrapeResult.status === "fulfilled" ? scrapeResult.value : [];

  if (tmResult.status     === "rejected") console.warn(`  ⚠ Ticketmaster: ${tmResult.reason?.message}`);
  if (ebResult.status     === "rejected") console.warn(`  ⚠ Eventbrite:   ${ebResult.reason?.message}`);
  if (scrapeResult.status === "rejected") console.warn(`  ⚠ Scraping:      ${scrapeResult.reason?.message}`);

  console.log(`  Ticketmaster: ${tmEvents.length} events`);
  console.log(`  Eventbrite:   ${ebEvents.length} events`);
  console.log(`  Scraping:     ${scrapeEvents.length} events`);

  // Slå sammen og dedupliser
  const allEvents = deduplicate([...tmEvents, ...ebEvents, ...scrapeEvents]);

  // Sorter: sponsede øverst, deretter dato stigende
  allEvents.sort((a, b) => {
    if (a.sponsored && !b.sponsored) return -1;
    if (!a.sponsored && b.sponsored) return  1;
    return new Date(a.date + "T" + (a.time || "00:00"))
         - new Date(b.date + "T" + (b.time || "00:00"));
  });

  // Fjern arrangementer som allerede er passert
  const today = new Date().toLocaleDateString("sv-SE");
  const upcoming = allEvents.filter((e) => e.date >= today);

  // Skriv JSON-fil
  const outputPath = `data/events-${city}.json`;
  const output = {
    events: upcoming,
    meta: {
      city,
      count:     upcoming.length,
      fetchedAt: new Date().toISOString(),
      sources: {
        ticketmaster: tmEvents.length,
        eventbrite:   ebEvents.length,
        scrape:       scrapeEvents.length,
      },
    },
  };

  await writeFile(outputPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`  ✓ Lagret ${upcoming.length} kommende events → ${outputPath}`);
  totalEvents += upcoming.length;
}

console.log(`\n✅ Ferdig! Totalt ${totalEvents} events lagret for ${CITIES.length} byer.\n`);

/* ============================================================
   HJELPEFUNKSJONER
   ============================================================ */

/**
 * Fjern duplikater basert på tittel + dato.
 * Prioriterer poster fra kilder med rikere data.
 */
function deduplicate(events) {
  const priority = { ticketmaster: 0, eventbrite: 1, scrape: 2, local: 3 };
  const seen = new Map();

  for (const event of events) {
    const key = `${event.title.toLowerCase().trim()}|${event.date}`;
    if (!seen.has(key)) {
      seen.set(key, event);
    } else {
      const existing = seen.get(key);
      if ((priority[event.source] ?? 99) < (priority[existing.source] ?? 99)) {
        seen.set(key, event);
      }
    }
  }

  return [...seen.values()];
}
