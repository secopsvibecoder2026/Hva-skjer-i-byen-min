/**
 * Tester for søkeagenten – kjøres uten nett og uten API-nøkkel:
 *   npm test
 *
 * API-et erstattes av en skriptet test-dobbel som returnerer svar med samme
 * form som Messages API med web search (server_tool_use, web_search_tool_result,
 * pause_turn, tool_use).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { validateEvents, hostKey } from "./validate.mjs";
import { runCity, WEB_SEARCH_TOOL_TYPE } from "./agent.mjs";
import { writeAgentCache, mergeIntoCityFile } from "./store.mjs";

const CITY  = { id: "voss", name: "Voss", region: "Vestland" };
const TODAY = "2026-10-29";
const CTX   = { city: CITY, today: TODAY, horizonDays: 90, seenHosts: new Set(["vosskulturhus.no", "ticketco.events"]) };

const good = (over = {}) => ({
  title: "Konsert med Voss Spelemannslag",
  date: "2026-11-14",
  time: "19:30",
  venue: "Voss kulturhus",
  description: "Tradisjonsmusikk fra Vossabygda.",
  categories: ["konsert"],
  priceFrom: 250,
  url: "https://www.vosskulturhus.no/program/spelemannslag",
  ...over,
});

// ── validateEvents ─────────────────────────────────────────────

test("godtar et gyldig arrangement og normaliserer feltene", () => {
  const { accepted, rejected } = validateEvents([good()], CTX);
  assert.equal(rejected.length, 0);
  assert.equal(accepted.length, 1);
  const e = accepted[0];
  assert.equal(e.source, "agent");
  assert.equal(e.location, "Voss kulturhus");           // inneholder bynavnet allerede
  assert.equal(e.currency, "NOK");
  assert.equal(e.affiliateUrl, null);                   // ingen falske ref-lenker
  assert.match(e.id, /^agent-voss-2026-11-14-[0-9a-f]{10}$/);
});

test("avviser lenker til domener som ikke var i søkeresultatene", () => {
  const { accepted, rejected } = validateEvents([good({ url: "https://oppdiktet-arrangor.no/x" })], CTX);
  assert.equal(accepted.length, 0);
  assert.match(rejected[0].reason, /ikke blant søkeresultatene/);
});

test("www-prefiks teller ikke ved domenesjekken", () => {
  assert.equal(hostKey("https://www.vosskulturhus.no/a"), "vosskulturhus.no");
  const { accepted } = validateEvents([good({ url: "https://vosskulturhus.no/b" })], CTX);
  assert.equal(accepted.length, 1);
});

test("avviser passerte, ugyldige og for fjerne datoer", () => {
  const { accepted, rejected } = validateEvents([
    good({ title: "Passert", date: "2026-10-01" }),
    good({ title: "Ugyldig", date: "2026-02-30" }),
    good({ title: "Feil format", date: "14.11.2026" }),
    good({ title: "For langt frem", date: "2027-06-01" }),
  ], CTX);
  assert.equal(accepted.length, 0);
  assert.deepEqual(rejected.map((r) => r.title), ["Passert", "Ugyldig", "Feil format", "For langt frem"]);
});

test("avviser HTML, oversiktssider og duplikater", () => {
  const { accepted, rejected } = validateEvents([
    good({ title: '<img src=x onerror="alert(1)">' }),
    good({ title: "Hva skjer i Voss" }),
    good(),
    good({ title: "konsert med voss spelemannslag!" }),     // samme som forrige, normalisert
  ], CTX);
  assert.equal(accepted.length, 1);
  assert.deepEqual(rejected.map((r) => r.reason), [
    "tittel inneholder HTML",
    "ser ut som en oversiktsside, ikke et arrangement",
    "duplikat i samme svar",
  ]);
});

test("ugyldige valgfrie felter blir null i stedet for å avvise arrangementet", () => {
  const { accepted } = validateEvents([good({
    time: "kl 19", priceFrom: -5, description: "<b>reklame</b>", categories: ["konsert", "festival", "KONSERT"],
  })], CTX);
  const e = accepted[0];
  assert.equal(e.time, null);
  assert.equal(e.priceFrom, null);
  assert.equal(e.currency, null);
  assert.equal(e.description, null);
  assert.deepEqual(e.categories, ["konsert"]);           // ukjent kategori og duplikat fjernet
});

test("00:00 tolkes som ukjent klokkeslett, pris 0 gir gratis-kategori", () => {
  const { accepted } = validateEvents([good({ time: "00:00", priceFrom: 0, categories: [] })], CTX);
  assert.equal(accepted[0].time, null);
  assert.deepEqual(accepted[0].categories, ["gratis"]);
});

test("legger til bynavnet når stedet ikke nevner byen", () => {
  const { accepted } = validateEvents([good({ venue: "Fleischer's Hotel" })], CTX);
  assert.equal(accepted[0].location, "Fleischer's Hotel, Voss");
});

test("tåler at events ikke er en liste", () => {
  const { accepted, rejected } = validateEvents("ikke en liste", CTX);
  assert.equal(accepted.length, 0);
  assert.equal(rejected.length, 1);
});

// ── runCity mot en skriptet API-klient ─────────────────────────

function fakeClient(responses) {
  const calls = [];
  return {
    calls,
    messages: {
      async create(params) {
        // Kopi av messages, siden løkka muterer lista mellom kallene
        calls.push({ ...params, messages: params.messages.map((m) => ({ ...m })) });
        const next = responses.shift();
        if (!next) throw new Error("test-klienten gikk tom for svar");
        return next;
      },
    },
  };
}

const searchBlocks = (urls) => [
  { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "hva skjer i voss" } },
  {
    type: "web_search_tool_result",
    tool_use_id: "srvtoolu_1",
    content: urls.map((url) => ({ type: "web_search_result", url, title: "t", encrypted_content: "ENC", page_age: null })),
  },
];

const usage = (searches) => ({ input_tokens: 1000, output_tokens: 100, server_tool_use: { web_search_requests: searches } });

test("runCity: pause_turn sendes tilbake uendret, og levering valideres mot søkene", async () => {
  const pausedContent = searchBlocks(["https://www.vosskulturhus.no/program"]);
  const client = fakeClient([
    { stop_reason: "pause_turn", content: pausedContent, usage: usage(1) },
    {
      stop_reason: "tool_use",
      usage: usage(1),
      content: [
        ...searchBlocks(["https://ticketco.events/no/nb/e/vossajazz"]),
        { type: "tool_use", id: "toolu_1", name: "submit_events", input: {
          events: [
            good(),
            good({ title: "Vossajazz-klubb", url: "https://ticketco.events/no/nb/e/vossajazz", date: "2026-11-20" }),
            good({ title: "Hallusinert", url: "https://finnes-ikke.no/x" }),
          ],
          notes: "Brukte kulturhuset og TicketCo.",
        } },
      ],
    },
  ]);

  const res = await runCity({ client, city: CITY, model: "test-model", today: TODAY, horizonDays: 90, maxSearches: 6, knownTitles: [] });

  assert.equal(res.accepted.length, 2);
  assert.equal(res.rejected.length, 1);
  assert.equal(res.usage.searches, 2);
  assert.equal(res.usage.requests, 2);
  assert.equal(res.notes, "Brukte kulturhuset og TicketCo.");

  // Andre kall må inneholde det pausede svaret nøyaktig slik det kom
  const second = client.calls[1].messages;
  assert.equal(second.length, 2);
  assert.equal(second[1].role, "assistant");
  assert.strictEqual(second[1].content, pausedContent);

  // Verktøyoppsettet
  const ws = client.calls[0].tools[0];
  assert.equal(ws.type, WEB_SEARCH_TOOL_TYPE);
  assert.equal(ws.max_uses, 6);
  assert.deepEqual(ws.user_location, { type: "approximate", city: "Voss", region: "Vestland", country: "NO", timezone: "Europe/Oslo" });
  assert.equal(client.calls[0].tools[1].name, "submit_events");
});

test("runCity: sender én påminnelse hvis agenten avslutter uten levering", async () => {
  const client = fakeClient([
    { stop_reason: "end_turn", usage: usage(2), content: [
      ...searchBlocks(["https://vosskulturhus.no/a"]),
      { type: "text", text: "Jeg fant noen arrangementer." },
    ] },
    { stop_reason: "tool_use", usage: usage(0), content: [
      { type: "tool_use", id: "toolu_2", name: "submit_events", input: { events: [good()] } },
    ] },
  ]);
  const res = await runCity({ client, city: CITY, model: "m", today: TODAY, horizonDays: 90, maxSearches: 6 });
  assert.equal(res.accepted.length, 1);
  const last = client.calls[1].messages.at(-1);
  assert.equal(last.role, "user");
  assert.match(last.content, /submit_events/);
});

test("runCity: gir opp etter andre avslutning uten levering", async () => {
  const done = { stop_reason: "end_turn", usage: usage(0), content: [{ type: "text", text: "ferdig" }] };
  const client = fakeClient([done, { ...done }]);
  await assert.rejects(
    runCity({ client, city: CITY, model: "m", today: TODAY, horizonDays: 90, maxSearches: 6 }),
    /leverte ikke resultater/,
  );
});

test("runCity: søkefeil registreres, og lenker uten søketreff avvises", async () => {
  const client = fakeClient([
    { stop_reason: "tool_use", usage: usage(0), content: [
      { type: "server_tool_use", id: "srvtoolu_9", name: "web_search", input: { query: "x" } },
      { type: "web_search_tool_result", tool_use_id: "srvtoolu_9",
        content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } },
      { type: "tool_use", id: "toolu_3", name: "submit_events", input: { events: [good()] } },
    ] },
  ]);
  const res = await runCity({ client, city: CITY, model: "m", today: TODAY, horizonDays: 90, maxSearches: 6 });
  assert.deepEqual(res.searchErrors, ["max_uses_exceeded"]);
  assert.equal(res.accepted.length, 0);                  // ingen søketreff å verifisere mot
});

test("runCity: refusal gir tydelig feil", async () => {
  const client = fakeClient([{ stop_reason: "refusal", usage: usage(0), content: [] }]);
  await assert.rejects(
    runCity({ client, city: CITY, model: "m", today: TODAY, horizonDays: 90, maxSearches: 6 }),
    /avviste/,
  );
});

// ── Lagring og fletting ────────────────────────────────────────

async function withDataDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), "agent-test-"));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

const result = (accepted) => ({
  accepted, rejected: [], notes: "", searchErrors: [], sourceUrls: [],
  usage: { requests: 1, inputTokens: 1, outputTokens: 1, searches: 1 },
});

test("fletting: Ticketmaster vinner duplikater, gamle agent-funn erstattes, andre kilder beholdes", async () => {
  await withDataDir(async (dir) => {
    await writeFile(join(dir, "events-voss.json"), JSON.stringify({
      events: [
        { id: "tm-1", title: "Konsert med Voss Spelemannslag", date: "2026-11-14", time: "19:30", source: "ticketmaster" },
        { id: "sc-1", title: "Bygdedag", date: "2026-11-02", time: null, source: "scrape" },
        { id: "ag-old", title: "Gammelt agent-funn", date: "2026-11-05", time: null, source: "agent" },
        { id: "sc-past", title: "Passert", date: "2026-10-01", time: null, source: "scrape" },
      ],
      meta: { city: "voss", count: 4, sources: { ticketmaster: 1, scrape: 2 } },
    }));

    const { accepted } = validateEvents([
      good(),                                                  // duplikat av TM-arrangementet
      good({ title: "Nytt agent-funn", date: "2026-11-21" }),
    ], CTX);

    const cache = await writeAgentCache({ dataDir: dir, city: CITY, today: TODAY, result: result(accepted), model: "m" });
    const out   = await mergeIntoCityFile({ dataDir: dir, city: CITY, today: TODAY, agentEvents: cache.events });

    const saved  = JSON.parse(await readFile(join(dir, "events-voss.json"), "utf-8"));
    const titles = saved.events.map((e) => `${e.source}:${e.title}`);

    assert.deepEqual(titles, [
      "scrape:Bygdedag",
      "ticketmaster:Konsert med Voss Spelemannslag",
      "agent:Nytt agent-funn",
    ]);
    assert.equal(out.total, 3);
    assert.equal(out.fromAgent, 1);
    assert.equal(saved.meta.count, 3);
    assert.equal(saved.meta.sources.agent, 1);
    assert.equal(saved.meta.sources.ticketmaster, 1);         // øvrig metadata beholdes
  });
});

test("tom kjøring beholder tidligere agent-funn som fortsatt er kommende", async () => {
  await withDataDir(async (dir) => {
    await mkdir(join(dir, "agent"), { recursive: true });
    await writeFile(join(dir, "agent", "events-voss.json"), JSON.stringify({
      events: [
        { id: "a1", title: "Kommende", date: "2026-11-10", time: null, source: "agent" },
        { id: "a2", title: "Passert", date: "2026-10-10", time: null, source: "agent" },
      ],
    }));
    const cache = await writeAgentCache({ dataDir: dir, city: CITY, today: TODAY, result: result([]), model: "m" });
    assert.equal(cache.keptPrevious, 1);
    assert.deepEqual(cache.events.map((e) => e.title), ["Kommende"]);
  });
});

test("fletting oppretter byfilen når den ikke finnes", async () => {
  await withDataDir(async (dir) => {
    const { accepted } = validateEvents([good()], CTX);
    const out = await mergeIntoCityFile({ dataDir: dir, city: CITY, today: TODAY, agentEvents: accepted });
    assert.equal(out.total, 1);
    const saved = JSON.parse(await readFile(join(dir, "events-voss.json"), "utf-8"));
    assert.equal(saved.meta.city, "voss");
    assert.equal(saved.meta.count, 1);
  });
});
