/**
 * scripts/agent/store.mjs
 * Lagrer agentens funn og slår dem inn i byfilene nettsiden leser.
 *
 * To filer per by:
 *   data/agent/events-{by}.json  agentens egen hurtigbuffer (kun agent-funn + metadata)
 *   data/events-{by}.json        det nettsiden viser; agent-funn flettes inn her
 *
 * Hurtigbufferen er nødvendig fordi den nattlige scraperen skriver byfilene
 * på nytt hver natt. scrape.mjs leser derfor hurtigbufferen og fletter den inn
 * igjen, ellers ville agentens funn forsvunnet ved første nattkjøring.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { deduplicate, sortEvents } from "../lib/events.mjs";

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Skriver agentens hurtigbuffer for en by.
 *
 * Gir en vellykket kjøring null godkjente arrangementer, beholdes tidligere
 * funn som fortsatt er kommende. Et tomt resultat skyldes oftere et uheldig
 * søk enn at alt som var planlagt er avlyst.
 *
 * @returns {Promise<{events: object[], keptPrevious: number}>}
 */
export async function writeAgentCache({ dataDir = "data", city, today, result, model }) {
  const dir  = join(dataDir, "agent");
  const path = join(dir, `events-${city.id}.json`);
  await mkdir(dir, { recursive: true });

  let events = result.accepted;
  let keptPrevious = 0;

  if (events.length === 0) {
    const prev = await readJson(path);
    const stillUpcoming = (prev?.events || []).filter((e) => e.date >= today);
    if (stillUpcoming.length > 0) {
      events = stillUpcoming;
      keptPrevious = stillUpcoming.length;
    }
  }

  const data = {
    events: sortEvents(events),
    meta: {
      city:         city.id,
      fetchedAt:    new Date().toISOString(),
      model,
      searches:     result.usage.searches,
      inputTokens:  result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      accepted:     result.accepted.length,
      keptPrevious,
      rejected:     result.rejected,
      searchErrors: result.searchErrors,
      notes:        result.notes,
      sourceUrls:   result.sourceUrls.slice(0, 50),
    },
  };

  await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
  return { events: data.events, keptPrevious };
}

/**
 * Fletter agent-funn inn i byfilen nettsiden leser.
 * Tidligere agent-arrangementer erstattes; alt fra andre kilder beholdes.
 * Ved duplikater vinner kilden med høyest prioritet (Ticketmaster før agent).
 *
 * @returns {Promise<{total: number, fromAgent: number}>}
 */
export async function mergeIntoCityFile({ dataDir = "data", city, today, agentEvents }) {
  const path     = join(dataDir, `events-${city.id}.json`);
  const existing = await readJson(path);

  const others = (existing?.events || []).filter((e) => e.source !== "agent" && e.date >= today);
  const merged = sortEvents(deduplicate([...others, ...agentEvents.filter((e) => e.date >= today)]));

  const meta = existing?.meta || { city: city.id, sources: {} };
  meta.count          = merged.length;
  meta.sources        = { ...(meta.sources || {}), agent: merged.filter((e) => e.source === "agent").length };
  meta.agentFetchedAt = new Date().toISOString();

  await writeFile(path, JSON.stringify({ events: merged, meta }, null, 2), "utf-8");
  return { total: merged.length, fromAgent: meta.sources.agent };
}
