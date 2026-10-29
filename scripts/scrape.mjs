/**
 * scripts/scrape.mjs
 * Standalone scraper – kjøres av GitHub Actions daglig.
 *
 * Bruk:
 *   node scripts/scrape.mjs
 *
 * Miljøvariabler (settes som GitHub Secrets):
 *   TM_API_KEY  – Ticketmaster Consumer Key  (valgfri, men anbefalt)
 *
 * Output: data/events-{by}.json for hver by i CITIES-listen.
 * GitHub Pages serverer disse filene som statiske JSON-filer.
 *
 * Oppførsel:
 *   - Utløpte events fjernes alltid (dato < i dag).
 *   - Hvis alle kilder returnerer 0 events, beholdes eksisterende
 *     fil uendret (beskytter mot midlertidige nettverksfeil).
 *   - Filen skrives alltid om minst én kilde leverte data.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fetchTicketmaster } from "./sources/ticketmaster.js";
import { scrapeLocalSites }  from "./sources/scrape.js";
import { CITY_IDS }          from "./cities.mjs";
import { deduplicate, sortEvents, loadAgentEvents } from "./lib/events.mjs";

const CITIES = CITY_IDS;

await mkdir("data", { recursive: true });

const today = new Date().toLocaleDateString("sv-SE"); // "YYYY-MM-DD" lokal tid
let totalEvents = 0;

for (const city of CITIES) {
  console.log(`\n⟶  Henter data for ${city}…`);

  const [tmResult, scrapeResult] = await Promise.allSettled([
    fetchTicketmaster(city),
    scrapeLocalSites(city),
  ]);

  const tmEvents     = tmResult.status     === "fulfilled" ? tmResult.value     : [];
  const scrapeEvents = scrapeResult.status === "fulfilled" ? scrapeResult.value : [];

  if (tmResult.status     === "rejected") console.warn(`  ⚠ Ticketmaster: ${tmResult.reason?.message}`);
  if (scrapeResult.status === "rejected") console.warn(`  ⚠ Scraping:     ${scrapeResult.reason?.message}`);

  // Søkeagentens funn (scripts/agent/) ligger i en egen hurtigbuffer og
  // flettes inn her – ellers ville denne kjøringen skrevet over dem.
  const agentEvents = await loadAgentEvents(city, today);

  const sourcesGotData = tmEvents.length + scrapeEvents.length > 0;
  console.log(`  Ticketmaster: ${tmEvents.length} | Scraping: ${scrapeEvents.length} | Agent (buffer): ${agentEvents.length}`);

  const outputPath = `data/events-${city}.json`;

  if (!sourcesGotData) {
    // Ingen kilder svarte – behold eksisterende fil, men fjern utløpte events
    console.warn(`  ⚠ Ingen nye data fra noen kilde – rydder utløpte events fra eksisterende fil`);
    try {
      const existing = JSON.parse(await readFile(outputPath, "utf-8"));
      const fresh = existing.events.filter((e) => e.date >= today);
      const removed = existing.events.length - fresh.length;
      if (removed > 0) {
        existing.events = fresh;
        existing.meta.count = fresh.length;
        existing.meta.fetchedAt = new Date().toISOString();
        await writeFile(outputPath, JSON.stringify(existing, null, 2), "utf-8");
        console.log(`  ✓ Fjernet ${removed} utløpte events – ${fresh.length} gjenstår`);
      } else {
        console.log(`  ✓ Ingen utløpte events å fjerne – fil uendret`);
      }
      totalEvents += fresh.length;
    } catch {
      console.warn(`  ⚠ Ingen eksisterende fil og ingen data – hopper over ${city}`);
    }
    continue;
  }

  // Slå sammen, dedupliser og sorter
  const merged = sortEvents(deduplicate([...tmEvents, ...scrapeEvents, ...agentEvents]));

  // Fjern utløpte events
  const upcoming = merged.filter((e) => e.date >= today);

  await writeFile(
    outputPath,
    JSON.stringify({
      events: upcoming,
      meta: {
        city,
        count:     upcoming.length,
        fetchedAt: new Date().toISOString(),
        sources: {
          ticketmaster: tmEvents.length,
          scrape:       scrapeEvents.length,
          agent:        upcoming.filter((e) => e.source === "agent").length,
        },
      },
    }, null, 2),
    "utf-8"
  );

  console.log(`  ✓ ${upcoming.length} kommende events lagret → ${outputPath}`);
  totalEvents += upcoming.length;
}

console.log(`\n✅ Ferdig! ${totalEvents} events for ${CITIES.length} byer.\n`);
