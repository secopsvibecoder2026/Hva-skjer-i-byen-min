#!/usr/bin/env node
/**
 * scripts/agent/find-events.mjs
 * Søkeagent: lar Claude søke på nettet etter kommende arrangementer per by.
 *
 * Kjøres manuelt – lokalt eller fra GitHub Actions («Finn arrangementer (agent)»).
 *
 * Bruk:
 *   node scripts/agent/find-events.mjs                     # alle byer
 *   node scripts/agent/find-events.mjs --city bergen,voss  # utvalgte byer
 *   node scripts/agent/find-events.mjs --under 5           # byer med færre enn 5 arrangementer
 *   node scripts/agent/find-events.mjs --city voss --dry-run   # vis funn, skriv ingenting
 *
 * Valg:
 *   --city, -c        By-id-er, kommaseparert (se scripts/cities.mjs)
 *   --under N         Bare byer som i dag har færre enn N arrangementer
 *   --max-searches N  Maks websøk per by (standard 6)
 *   --days N          Hvor langt frem i tid det letes (standard 90)
 *   --model ID        Claude-modell (standard: $AGENT_MODEL eller claude-opus-5-5)
 *   --concurrency N   Byer som kjøres samtidig (standard 2)
 *   --dry-run         Skriv ut funn uten å lagre noe
 *
 * Krever ANTHROPIC_API_KEY. Pris: $10 per 1000 websøk + tokens for
 * søkeresultatene som modellen leser. Se README, «Søkeagent».
 *
 * Etter en kjøring: node scripts/generate-city-pages.mjs, så by-pillene og
 * sitemap oppdateres (workflowen gjør dette automatisk).
 */

import { parseArgs } from "node:util";
import { readFile, appendFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";

import { CITIES } from "../cities.mjs";
import { todayStr } from "../lib/events.mjs";
import { runCity } from "./agent.mjs";
import { writeAgentCache, mergeIntoCityFile } from "./store.mjs";

const DEFAULT_MODEL       = "claude-opus-5-5";
const SEARCH_PRICE_USD    = 10 / 1000;
const MAX_KNOWN_TITLES    = 60;

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function positiveInt(value, name, fallback) {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) fail(`${name} må være et positivt heltall (fikk «${value}»)`);
  return n;
}

const { values: args } = parseArgs({
  options: {
    city:           { type: "string", short: "c", multiple: true },
    under:          { type: "string" },
    "max-searches": { type: "string" },
    days:           { type: "string" },
    model:          { type: "string" },
    concurrency:    { type: "string" },
    "dry-run":      { type: "boolean", default: false },
    help:           { type: "boolean", short: "h", default: false },
  },
});

if (args.help) {
  const src = await readFile(new URL(import.meta.url), "utf-8");
  console.log(src.split("*/")[0].replace(/^#!.*\n\/\*\*?\n?/, "").replace(/^ \* ?/gm, ""));
  process.exit(0);
}

const maxSearches = positiveInt(args["max-searches"], "--max-searches", 6);
const horizonDays = positiveInt(args.days, "--days", 90);
const concurrency = positiveInt(args.concurrency, "--concurrency", 2);
const under       = args.under === undefined || args.under === "" ? null : positiveInt(args.under, "--under");
const model       = args.model || process.env.AGENT_MODEL || DEFAULT_MODEL;
const dryRun      = args["dry-run"];
const today       = todayStr();

// — Hvilke byer? —
const requested = (args.city || []).flatMap((c) => c.split(",")).map((c) => c.trim().toLowerCase()).filter(Boolean);
const unknown   = requested.filter((id) => !CITIES.some((c) => c.id === id));
if (unknown.length) {
  fail(`ukjent by: ${unknown.join(", ")}\n  Gyldige: ${CITIES.map((c) => c.id).join(", ")}`);
}

async function readCityFile(id) {
  try {
    return JSON.parse(await readFile(`data/events-${id}.json`, "utf-8")).events || [];
  } catch {
    return [];
  }
}

let cities = requested.length ? CITIES.filter((c) => requested.includes(c.id)) : [...CITIES];
const existingByCity = Object.fromEntries(await Promise.all(cities.map(async (c) => [c.id, await readCityFile(c.id)])));

if (under !== null) {
  cities = cities.filter((c) => existingByCity[c.id].filter((e) => e.date >= today).length < under);
}
if (cities.length === 0) {
  console.log("Ingen byer å søke for med disse valgene.");
  process.exit(0);
}

if (!process.env.ANTHROPIC_API_KEY) {
  fail("ANTHROPIC_API_KEY er ikke satt.\n" +
       "  Lokalt:          export ANTHROPIC_API_KEY=sk-ant-...\n" +
       "  GitHub Actions:  Settings → Secrets and variables → Actions → New repository secret");
}

const client = new Anthropic({ maxRetries: 4 });

console.log(`Søkeagent – ${cities.length} by(er), modell ${model}, maks ${maxSearches} søk per by, ${horizonDays} dager frem${dryRun ? " (tørrkjøring)" : ""}`);
console.log(`Maks søkekostnad: $${(cities.length * maxSearches * SEARCH_PRICE_USD).toFixed(2)} + tokens\n`);

// — Kjør, med begrenset samtidighet —
const results = [];

async function processCity(city) {
  const lines = [`⟶  ${city.name}`];
  const log   = (msg) => lines.push(msg);

  const known = existingByCity[city.id]
    // Agentens egne tidligere funn holdes utenfor: står de på "har allerede"-
    // lista, finner ikke agenten dem igjen, og de ville falt ut av bufferen
    .filter((e) => e.source !== "agent" && e.date >= today)
    .slice(0, MAX_KNOWN_TITLES)
    .map((e) => `${String(e.title).slice(0, 80)} (${e.date})`);

  try {
    const result = await runCity({ client, city, model, today, horizonDays, maxSearches, knownTitles: known, log });
    log(`  ✓ ${result.accepted.length} godkjent, ${result.rejected.length} avvist`);
    for (const r of result.rejected.slice(0, 8)) log(`    – avvist: ${r.title} (${r.reason})`);
    if (result.rejected.length > 8) log(`    … og ${result.rejected.length - 8} til`);
    if (result.searchErrors.length) log(`  ⚠ søkefeil: ${result.searchErrors.join(", ")}`);

    let total = null;
    let kept  = 0;
    if (dryRun) {
      for (const e of result.accepted) log(`    + ${e.date}${e.time ? " " + e.time : ""}  ${e.title}  [${e.location}]  ${e.ticketUrl}`);
    } else {
      const cache  = await writeAgentCache({ city, today, result, model });
      kept = cache.keptPrevious;
      if (kept) log(`  ↺ ingen nye funn – beholder ${kept} tidligere agent-funn`);
      const merged = await mergeIntoCityFile({ city, today, agentEvents: cache.events });
      total = merged.total;
      log(`  → data/events-${city.id}.json: ${merged.total} arrangementer (${merged.fromAgent} fra agenten)`);
    }
    results.push({ city, ok: true, result, total, kept });
  } catch (err) {
    // SDK-feil har API-ets egen melding i err.error.error.message – den er mest lesbar
    const apiMsg = err?.error?.error?.message;
    const msg = err?.status ? `HTTP ${err.status}: ${apiMsg || err.message}` : err?.message || String(err);
    log(`  ✗ feilet: ${msg}`);
    results.push({ city, ok: false, error: msg });
  } finally {
    console.log(lines.join("\n") + "\n");
  }
}

const queue = [...cities];
await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
  while (queue.length) await processCity(queue.shift());
}));

// — Oppsummering —
const ok        = results.filter((r) => r.ok);
const failed    = results.filter((r) => !r.ok);
const searches  = ok.reduce((s, r) => s + r.result.usage.searches, 0);
const inTok     = ok.reduce((s, r) => s + r.result.usage.inputTokens, 0);
const outTok    = ok.reduce((s, r) => s + r.result.usage.outputTokens, 0);
const accepted  = ok.reduce((s, r) => s + r.result.accepted.length, 0);
const rejected  = ok.reduce((s, r) => s + r.result.rejected.length, 0);

console.log("─".repeat(60));
console.log(`Ferdig: ${ok.length} by(er) OK, ${failed.length} feilet`);
console.log(`Arrangementer: ${accepted} godkjent, ${rejected} avvist`);
console.log(`Bruk: ${searches} søk ($${(searches * SEARCH_PRICE_USD).toFixed(2)}), ${inTok.toLocaleString("nb-NO")} input- / ${outTok.toLocaleString("nb-NO")} output-tokens`);
if (failed.length) console.log(`Feilet: ${failed.map((r) => `${r.city.id} (${r.error})`).join("; ")}`);

// Oppsummering i Actions-grensesnittet
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = results
    .sort((a, b) => a.city.name.localeCompare(b.city.name, "nb"))
    .map((r) => r.ok
      ? `| ${r.city.name} | ${r.result.usage.searches} | ${r.result.accepted.length} | ${r.result.rejected.length} | ${r.total ?? "–"} | ${r.kept ? `beholdt ${r.kept} tidligere` : ""} |`
      : `| ${r.city.name} | – | – | – | – | ✗ ${r.error.replace(/\|/g, "/").slice(0, 120)} |`);
  await appendFile(process.env.GITHUB_STEP_SUMMARY, [
    `## Søkeagent ${dryRun ? "(tørrkjøring)" : ""}`,
    "",
    `Modell \`${model}\` · ${searches} søk (≈ $${(searches * SEARCH_PRICE_USD).toFixed(2)}) · ${inTok.toLocaleString("nb-NO")} input-tokens · ${outTok.toLocaleString("nb-NO")} output-tokens`,
    "",
    "| By | Søk | Godkjent | Avvist | Totalt på siden | Merknad |",
    "|---|---:|---:|---:|---:|---|",
    ...rows,
    "",
  ].join("\n"));
}

process.exit(ok.length === 0 ? 1 : 0);
