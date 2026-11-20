import assert from "node:assert/strict";
import { test } from "node:test";
import { isSlug, newQuote, parseBrief, publicSnapshot, renderQuoteHtml, slugify, stats, totals, type Quote } from "./quote.ts";

const sample = (): Quote => ({
  ...newQuote(new Date("2026-11-18T00:00:00Z")),
  slug: "sentul-mytepro-1", title: "Show Units <b>&</b> Surroundings", eyebrow: "Option 1", client: { name: "Andrew — MytePro", location: "Sentul" },
  cover: "https://x.supabase.co/storage/v1/object/public/quotes/img/a.jpg",
  sections: [
    { id: "a", title: "Show Unit", layout: "cards", items: [{ id: "1", name: "1BR", qty: 8, unit: "foto", price: 2_400_000 }, { id: "2", name: "2BR", qty: 8, unit: "foto", price: 2_400_000, image: "javascript:alert(1)" }] },
    { id: "b", title: "Drone", layout: "media", items: [{ id: "3", name: "Drone", qty: 3, unit: "menit", price: 4_500_000, lines: ["Fasad"] }] },
    { id: "c", title: "Revisit", layout: "media", optional: true, items: [{ id: "4", name: "Hari tambahan", price: null }] }
  ],
  operational: [{ id: "o", name: "Crew & transport", price: 4_500_000 }, { id: "p", name: "Izin lokasi", price: null }],
  brief: { files: [{ name: "shotlist.pdf", size: 1, type: "application/pdf" }], summary: { points: ["rahasia"], questions: [], at: "", model: "" } }
});

test("totals skip optional sections and to-be-confirmed prices; DP from percent", () => {
  const t = totals(sample());
  assert.equal(t.services, 9_300_000);
  assert.equal(t.operational, 4_500_000);
  assert.equal(t.grand, 13_800_000);
  assert.equal(t.dp, 6_900_000);
  assert.equal(t.sections.find(s => s.id === "c")?.optional, true);
});

test("stats sum the main unit per section", () => {
  assert.deepEqual(stats(sample()), [{ value: 16, unit: "foto", label: "Show Unit" }, { value: 3, unit: "menit", label: "Drone" }]);
});

test("slug helpers", () => {
  assert.equal(slugify("Sentul MytePro — Option 1"), "sentul-mytepro-option-1");
  assert.ok(isSlug("mytepro")); assert.ok(!isSlug("a--b")); assert.ok(!isSlug("Ab"));
});

test("public snapshot drops the brief; page escapes text, keeps only https images, has OG tags", () => {
  const snap = publicSnapshot(sample());
  assert.equal("brief" in snap, false);
  const html = renderQuoteHtml(snap, { pageUrl: "https://hub.forior.id/quote/sentul-mytepro-1/" });
  assert.ok(html.includes("Show Units &lt;b&gt;&amp;&lt;/b&gt; Surroundings"));
  assert.ok(!html.includes("javascript:alert"));
  assert.ok(html.includes('property="og:image" content="https://x.supabase.co/'));
  assert.ok(html.includes("Rp 13.800.000"));
  assert.ok(!html.includes("rahasia"));
  assert.ok(html.includes("<script>"));
  assert.ok(!renderQuoteHtml(snap, { preview: true }).includes("<script>"));
});

test("parseBrief reads fenced JSON into price-less sections", () => {
  const d = parseBrief('Berikut:\n```json\n{"points":["3 show unit"],"questions":["Izin lokasi?"],"title":"Show Units","sections":[{"title":"Show Unit","layout":"cards","items":[{"name":"1BR","qty":"8","unit":"foto","tag":"1BR"}]},{"title":"X","layout":"weird","items":[]}]}\n```');
  assert.deepEqual(d.points, ["3 show unit"]);
  assert.equal(d.sections[0].items[0].qty, 8);
  assert.equal(d.sections[0].items[0].price, 0);
  assert.equal(d.sections[1].layout, "cards");
  assert.throws(() => parseBrief("tidak ada json"));
});
