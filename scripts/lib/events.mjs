/**
 * scripts/lib/events.mjs
 * Felles logikk for å slå sammen arrangementer fra flere kilder.
 * Brukes av scrape.mjs (nattlig) og agent/find-events.mjs (manuell søkeagent).
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Når samme arrangement finnes i flere kilder, vinner kilden med lavest tall.
 * Ticketmaster har strukturerte data (pris, klokkeslett, bilde); agenten har
 * verifiserte lenker men tolket tekst; generisk scraping er mest støyete.
 */
export const SOURCE_PRIORITY = { ticketmaster: 0, agent: 1, scrape: 2, local: 3 };

/** Dagens dato som "YYYY-MM-DD" i norsk tid (runneren i Actions går på UTC) */
export function todayStr(now = new Date()) {
  return now.toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
}

/**
 * Normaliserer en tittel for sammenligning, så "Bo Kaspers Orkester!" og
 * "bo kaspers orkester" regnes som samme arrangement.
 */
export function normalizeTitle(title = "") {
  return String(title)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Fjerner duplikater (samme normaliserte tittel + dato); høyest prioriterte kilde vinner */
export function deduplicate(events) {
  const seen = new Map();
  for (const event of events) {
    const key = `${normalizeTitle(event.title)}|${event.date}`;
    const prev = seen.get(key);
    if (!prev || (SOURCE_PRIORITY[event.source] ?? 99) < (SOURCE_PRIORITY[prev.source] ?? 99)) {
      seen.set(key, event);
    }
  }
  return [...seen.values()];
}

/** Sponsede først, deretter kronologisk (ukjent klokkeslett sorteres som midnatt) */
export function sortEvents(events) {
  return [...events].sort((a, b) => {
    if (a.sponsored && !b.sponsored) return -1;
    if (!a.sponsored && b.sponsored) return 1;
    return new Date(`${a.date}T${a.time || "00:00"}`) - new Date(`${b.date}T${b.time || "00:00"}`);
  });
}

/**
 * Leser agentens hurtigbuffer for en by (data/agent/events-{by}.json).
 * Mangler filen, har agenten aldri kjørt for byen – det er normalt.
 * @returns {Promise<object[]>} kommende agent-arrangementer
 */
export async function loadAgentEvents(city, today, dataDir = "data") {
  try {
    const raw  = await readFile(join(dataDir, "agent", `events-${city}.json`), "utf-8");
    const data = JSON.parse(raw);
    return (Array.isArray(data.events) ? data.events : []).filter((e) => e.date >= today);
  } catch {
    return [];
  }
}
