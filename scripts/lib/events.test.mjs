import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTitle, deduplicate, sortEvents, todayStr } from "./events.mjs";

test("normalizeTitle ignorerer store bokstaver, tegnsetting og mellomrom – men ikke æøå", () => {
  assert.equal(normalizeTitle("  Bo Kaspers Orkester! "), "bo kaspers orkester");
  assert.equal(normalizeTitle("Bø – Kultur"), "bø kultur");
  assert.notEqual(normalizeTitle("Bø"), normalizeTitle("Bo"));
});

test("deduplicate: høyest prioriterte kilde vinner uansett rekkefølge", () => {
  const out = deduplicate([
    { title: "Konsert!", date: "2026-11-01", source: "scrape" },
    { title: "konsert",  date: "2026-11-01", source: "agent" },
    { title: "Konsert",  date: "2026-11-01", source: "ticketmaster" },
    { title: "Konsert",  date: "2026-11-02", source: "scrape" },
  ]);
  assert.deepEqual(out.map((e) => `${e.date}:${e.source}`), ["2026-11-01:ticketmaster", "2026-11-02:scrape"]);
});

test("sortEvents: sponsede først, ukjent klokkeslett som midnatt", () => {
  const out = sortEvents([
    { title: "c", date: "2026-11-02", time: "18:00" },
    { title: "b", date: "2026-11-02", time: null },
    { title: "a", date: "2026-11-05", time: "12:00", sponsored: true },
  ]);
  assert.deepEqual(out.map((e) => e.title), ["a", "b", "c"]);
});

test("todayStr bruker norsk tid, ikke UTC", () => {
  // 23:30 UTC 31. desember er allerede 1. januar i Oslo
  assert.equal(todayStr(new Date("2026-12-31T23:30:00Z")), "2027-01-01");
});
