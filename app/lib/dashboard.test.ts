import assert from "node:assert/strict";
import { test } from "node:test";
import { focusItems, greeting, mergeAgenda, type AgendaItem } from "./dashboard.ts";

test("greeting by hour", () => {
  assert.equal(greeting(8), "Selamat pagi"); assert.equal(greeting(12), "Selamat siang"); assert.equal(greeting(16), "Selamat sore"); assert.equal(greeting(20), "Selamat malam");
});

const now = new Date("2026-11-20T09:00:00");
const proj = (start: string, title: string): AgendaItem => ({ key: title, start, title, color: "#6a3fd0", source: "project", galleryId: title });
const ev = (start: string, title: string, allDay = false): AgendaItem => ({ key: "g" + title, start, title, color: "#16a36a", source: "google", allDay });

test("agenda merges, drops past/far items and Google copies of project shoots", () => {
  const a = mergeAgenda([proj("2026-11-21T08:00", "Fatmawati"), proj("2026-11-19T08:00", "Kemarin")], [ev("2026-11-21T08:00:00+07:00", "Shoot Fatmawati"), ev("2026-11-24", "Meeting", true), ev("2026-12-30T10:00:00+07:00", "Jauh")], now);
  assert.deepEqual(a.map(x => x.title), ["Fatmawati", "Meeting"]);
});

test("focus: urgent deliveries, shoot tomorrow, answered quote; max three", () => {
  const f = focusItems({
    actions: [{ id: "g1", title: "Fatmawati", text: "Klien memilih 25 foto", rank: 0 }, { id: "g2", title: "Nikumaru", text: "Draft siap", rank: 1 }, { id: "g3", title: "Villa", text: "Menunggu", rank: 6 }],
    agenda: [proj("2026-11-21T08:00", "Fatmawati")],
    quotes: [{ title: "Phalosaa", answers: 1 }], now
  });
  assert.equal(f.length, 3);
  assert.deepEqual(f.map(x => x.tone), ["warn", "warn", "info"]);
  assert.ok(f[2].text.startsWith("Shoot besok 08:00"));
  const g = focusItems({ actions: [], agenda: [], quotes: [{ title: "MytePro", answers: 0, lastOpen: "2026-11-20T08:00:00" }], now });
  assert.deepEqual(g.map(x => x.text), ["Penawaran MytePro baru dibuka"]);
});
