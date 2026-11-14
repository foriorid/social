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

test("nextStep needs one brief call, then the human", () => {
  assert.equal(nextStep(item), "brief");
  const withBoard = { ...item, board: [{ label: "0-3 dtk", visual: "wide", text: "", audio: "" }] };
  assert.equal(nextStep(withBoard), null);
});

test("applyStep(brief) fills the storyboard and advances status", () => {
  const patch = applyStep("brief", item, '{"hook":"H","message":"M","hashtags":"#a #b","schedule":"Rab 19.00","board":[{"visual":"wide shot","text":"Halo"},{"visual":"","text":""}]}');
  assert.equal(patch.status, "Brief Siap");
  assert.equal(patch.hook, "H");
  assert.equal(patch.hashtags, "#a #b");
  assert.equal(patch.schedule, "Rab 19.00");
  assert.deepEqual(patch.board, [{ label: "Scene 1", visual: "wide shot", text: "Halo", audio: "" }]);
  assert.throws(() => applyStep("brief", item, '{"hook":"H","board":[]}'));
});

test("applyStep(publish) requires a caption", () => {
  assert.equal(applyStep("publish", item, '{"caption":"C","hashtags":"#a #b","schedule":"Rab 19.00"}').caption, "C");
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

test("toSrt keeps silent scenes in the timeline", () => {
  const srt = toSrt([{ label: "0-3 dtk", visual: "", text: "Halo", audio: "" }, { label: "Scene 2", visual: "", text: "", audio: "" }, { label: "Scene 3", visual: "", text: "Dua", audio: "" }]);
  assert.equal(srt, "1\n00:00:00,000 --> 00:00:03,000\nHalo\n\n2\n00:00:06,000 --> 00:00:09,000\nDua\n");
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

test("parseAudit fills defaults and clamps format shares", async () => {
  const { parseAudit } = await import("./flow.ts");
  const a = parseAudit('```json\n{"summary":"S","dataQuality":"aneh","profile":{"formats":[{"name":"Reels","share":140},{"name":"Foto","share":0}]},"ideas":[{"title":"Ide 1"}]}\n```');
  assert.equal(a.dataQuality, "terbatas");
  assert.deepEqual(a.profile.formats, [{ name: "Reels", share: 100 }]);
  assert.deepEqual(a.ideas, [{ format: "Reels", title: "Ide 1", angle: "" }]);
  assert.deepEqual(a.highlights, []);
});

test("videoGuidebook carries the storyboard, assets and render target", async () => {
  const { videoGuidebook, guidebookName } = await import("./flow.ts");
  const c = { id: "c", account: "SPLENDID", name: "Portofolio", period: "Jan 2027", goal: "Awareness", cover: "", items: [] };
  const it = { ...item, title: "Tur Office Space 2.000 m²", board: [{ label: "0-3 dtk", visual: "Wide | lobby", text: "2.000 m²", audio: "musik" }], assets: [{ id: "f1", name: "lobby.mp4", url: "https://drive.google.com/file/d/f1/view", thumb: "", kind: "Video" }] };
  const md = videoGuidebook(c, it, { name: "Alvian", handle: "@alvian.indonesia" });
  assert.match(md, /\| 1 \| 0-3 dtk \| Wide \/ lobby \| 2\.000 m² \| musik \|/);
  assert.match(md, /Video: lobby\.mp4 — https:\/\/drive\.google\.com\/file\/d\/f1\/view/);
  assert.match(md, /\.\/out\/tur-office-space-2-000-m2\.mp4/);
  assert.match(md, /00:00:00,000 --> 00:00:03,000\n2\.000 m²/);
  assert.equal(guidebookName(it), "guidebook-01-tur-office-space-2-000-m2.md");
});

test("stageOf maps older statuses onto the six stages", async () => {
  const { stageOf } = await import("./flow.ts");
  assert.deepEqual(["Planned", "Brief", "Brief ready", "In production", "In review", "Publish", "Scheduled", "Published", "Review", "aneh"].map(stageOf), ["Draft", "Draft", "Brief Siap", "Produksi", "Review", "Terjadwal", "Terjadwal", "Dipublish", "Review", "Draft"]);
});

test("sceneTimes uses sec, then label ranges, then 3 seconds", async () => {
  const { sceneTimes, toSrt } = await import("./flow.ts");
  const board = [{ label: "Establishing", sec: 4, visual: "", text: "Halo", audio: "" }, { label: "3-8 dtk", visual: "", text: "", audio: "" }, { label: "Closing", visual: "", text: "Bye", audio: "" }];
  assert.deepEqual(sceneTimes(board), [{ start: 0, end: 4 }, { start: 4, end: 9 }, { start: 9, end: 12 }]);
  assert.match(toSrt(board), /00:00:09,000 --> 00:00:12,000\nBye/);
});

test("dateOf prefers the picker date and parses free text", async () => {
  const { dateOf } = await import("./flow.ts");
  assert.equal(dateOf({ publishOn: "2026-11-05", publishDate: "x" }), "2026-11-05");
  assert.equal(dateOf({ publishDate: "Nov 07, 2026" }), "2026-11-07");
  assert.equal(dateOf({ publishDate: "Belum dijadwalkan" }), null);
});

test("monthGrid starts on Monday and pads to whole weeks", async () => {
  const { monthGrid } = await import("./flow.ts");
  const g = monthGrid(2026, 10); // November 2026 starts on a Sunday
  assert.equal(g.length % 7, 0);
  assert.equal(g.indexOf("2026-11-01"), 6);
  assert.equal(g.filter(Boolean).length, 30);
});

test("brand kit lines reach the prompt only when filled", async () => {
  const { kitLines, stepPrompt } = await import("./flow.ts");
  assert.equal(kitLines(undefined), "");
  assert.equal(kitLines({ tone: "  ", accent: "#fff" }), "");
  const kit = { tone: "Hangat, premium", donts: "Jangan clickbait\nJangan harga coret" };
  const c = { id: "c", account: "Villa", name: "Nov", period: "Nov", goal: "Bookings", cover: "", items: [item] };
  const p = stepPrompt("brief", c, item, kit);
  assert.match(p, /Tone of voice: Hangat, premium/);
  assert.match(p, /Hindari: Jangan clickbait; Jangan harga coret/);
  assert.doesNotMatch(stepPrompt("brief", c, item), /Brand Kit/);
});
