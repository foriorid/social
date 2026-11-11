import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPlan, applyStep, driveFolderId, stepPrompt, extractJson, nextStep, parsePlan, toBoard, toSrt } from "./flow.ts";

const item = { day: 1, date: "Dec 01", title: "T", format: "Reels" as const, pillar: "P", status: "Planned", goal: "G", hook: "h", caption: "c", visualDirection: "v", cta: "x", publishDate: "", scenes: [] };

test("extractJson tolerates fences and prose", () => {
  assert.deepEqual(extractJson('Berikut:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('[{"title":"x"}] selesai'), [{ title: "x" }]);
  assert.throws(() => extractJson("tidak ada json"));
  assert.throws(() => extractJson("{rusak}"));
});

test("nextStep plans untitled slots first", () => {
  assert.equal(nextStep({ ...item, untitled: true }), "plan");
});

test("nextStep walks brief -> production -> publish -> human", () => {
  assert.equal(nextStep(item), "brief");
  const withBoard = { ...item, board: [{ label: "0-3 dtk", visual: "wide", text: "", audio: "" }] };
  assert.equal(nextStep(withBoard), "production");
  assert.equal(nextStep({ ...withBoard, production: "shot list" }), "publish");
  assert.equal(nextStep({ ...withBoard, production: "shot list", schedule: "Rab 19.00" }), null);
});

test("applyStep(brief) fills the storyboard and advances status", () => {
  const patch = applyStep("brief", item, '{"hook":"H","message":"M","board":[{"visual":"wide shot","text":"Halo"},{"visual":"","text":""}]}');
  assert.equal(patch.status, "Brief ready");
  assert.equal(patch.hook, "H");
  assert.deepEqual(patch.board, [{ label: "Scene 1", visual: "wide shot", text: "Halo", audio: "" }]);
  assert.throws(() => applyStep("brief", item, '{"hook":"H","board":[]}'));
});

test("applyStep(publish) requires a caption", () => {
  assert.equal(applyStep("publish", item, '{"caption":"C","hashtags":"#a #b","schedule":"Rab 19.00"}').status, "In review");
  assert.throws(() => applyStep("publish", item, '{"hashtags":"#a"}'));
});

test("toBoard labels carousel slides", () => {
  assert.equal(toBoard([{ text: "Judul" }], "Carousel")[0].label, "Slide 1");
  assert.deepEqual(toBoard("bukan array", "Reels"), []);
});

test("parsePlan normalises formats and caps the count", () => {
  const rows = parsePlan('[{"title":"A","format":"carousel"},{"title":"B","format":"Video"},{"title":"C","format":"FEED"},{"title":"D"}]', 3);
  assert.deepEqual(rows.map(r => r.format), ["Carousel", "Reels", "Feed"]);
  assert.throws(() => parsePlan('[{"title":"A"}]', 30));
});

test("driveFolderId reads folder links", () => {
  assert.equal(driveFolderId("https://drive.google.com/drive/folders/1AbC_dEfGhIjKlMn?usp=sharing"), "1AbC_dEfGhIjKlMn");
  assert.equal(driveFolderId("https://drive.google.com/drive/u/0/folders/1AbC_dEfGhIjKlMn"), "1AbC_dEfGhIjKlMn");
  assert.equal(driveFolderId("https://example.com/folders/abc"), null);
});

test("toSrt uses label timings and falls back to 3s blocks", () => {
  const srt = toSrt([{ label: "0-3 dtk", visual: "", text: "Halo", audio: "" }, { label: "Scene 2", visual: "", text: "", audio: "" }, { label: "Scene 3", visual: "", text: "Dua", audio: "" }]);
  assert.equal(srt, "1\n00:00:00,000 --> 00:00:03,000\nHalo\n\n2\n00:00:03,000 --> 00:00:06,000\nDua\n");
});

test("applyPlan titles only slots without a storyboard and clears template text", () => {
  const worked = { ...item, day: 1, title: "Sudah digarap", board: [{ label: "0-3 dtk", visual: "v", text: "", audio: "" }] };
  const blank = { ...item, day: 2, title: "Konten 2 — menunggu judul", untitled: true, hook: "lama" };
  const out = applyPlan([worked, blank], [{ title: "Tur kamar utama Villa Syllo", format: "Reels", pillar: "Kamar" }]);
  assert.equal(out[0].title, "Sudah digarap");
  assert.equal(out[1].title, "Tur kamar utama Villa Syllo");
  assert.equal(out[1].untitled, false);
  assert.equal(out[1].hook, "");
});

test("property campaigns forbid photography tips in the planning prompt", () => {
  const c = { id: "c", account: "FORIOR", name: "Villa Syllo Bandung", period: "Jan 2027", goal: "Bookings", cover: "", kind: "property" as const, brief: "Villa 4 kamar di Lembang", items: [item] };
  const p = stepPrompt("plan", c, item);
  assert.match(p, /JANGAN membuat konten tips/);
  assert.match(p, /Brief campaign: Villa 4 kamar di Lembang/);
  assert.doesNotMatch(stepPrompt("plan", { ...c, kind: "personal" }, item), /JANGAN/);
});
