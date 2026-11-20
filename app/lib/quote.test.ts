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
  const d = parseBrief('Berikut:\n```json\n{"points":["3 show unit"],"questions":["Izin lokasi?"],"client":"Andrew — MytePro","title":"Show Units","sections":[{"title":"Show Unit","layout":"cards","items":[{"name":"1BR","qty":"8","unit":"foto","tag":"1BR"}]},{"title":"X","layout":"weird","items":[]}]}\n```');
  assert.deepEqual(d.points, ["3 show unit"]); assert.equal(d.client, "Andrew — MytePro");
  assert.equal(d.sections[0].items[0].qty, 8);
  assert.equal(d.sections[0].items[0].price, 0);
  assert.equal(d.sections[1].layout, "cards");
  assert.throws(() => parseBrief("tidak ada json"));
});

test("parseBrief also reads requests, notes, operational (no price) and terms", () => {
  const d = parseBrief(JSON.stringify({ points: [], requests: ["Portfolio"], notes: [{ title: "Hak penggunaan", text: "Website, OTA, iklan" }], operational: [{ name: "Transportasi & akomodasi", note: "Jakarta–Yogyakarta", price: 9 }], terms: { production: "3 hari", delivery: 5 }, sections: [{ title: "Villa", optional: true, items: [{ name: "Hunterwood", lines: ["Private jacuzzi", ""] }] }] }));
  assert.deepEqual(d.requests, ["Portfolio"]);
  assert.equal(d.notes[0].title, "Hak penggunaan");
  assert.equal(d.operational[0].price, null);
  assert.deepEqual(d.terms, { production: "3 hari" }); assert.equal(d.sections[0].optional, true);
  const html = renderQuoteHtml({ ...newQuote(), sections: d.sections });
  assert.ok(html.includes("<li>Private jacuzzi</li>") && !html.includes("<li></li>"));
});

test("portfolio cards link out; questions become a form (disabled in preview, thank-you after sending)", () => {
  const q = { ...newQuote(), portfolio: [{ id: "p", title: "Wemori Villa", location: "Bandung", image: "https://x/img.jpg", url: "https://showcase.forior.id/p/wemori-villa" }], questions: [{ id: "1", text: "Tanggal shooting?" }, { id: "2", text: "  " }] };
  const html = renderQuoteHtml(q);
  assert.ok(html.includes('href="https://showcase.forior.id/p/wemori-villa"') && html.includes("Wemori Villa"));
  assert.ok(html.includes('method="post"') && html.includes('name="a0"') && !html.includes('name="a1"'));
  assert.ok(renderQuoteHtml(q, { preview: true }).includes("disabled"));
  const sent = renderQuoteHtml(q, { sent: true });
  assert.ok(sent.includes("jawaban Anda sudah terkirim") && !sent.includes('method="post"'));
  assert.ok(!renderQuoteHtml(newQuote()).includes('method="post"'));
});

test("per-section pricing: one package price, item prices ignored and hidden", () => {
  const q = { ...newQuote(), sections: [{ id: "a", title: "Villa", layout: "cards" as const, pricing: "section" as const, price: 18_000_000, items: [{ id: "1", name: "Palmspring", qty: 15, unit: "foto", price: 999 }, { id: "2", name: "Homewood", qty: 15, unit: "foto", price: null }] }] };
  assert.equal(totals(q).grand, 18_000_000);
  const html = renderQuoteHtml(q);
  assert.ok(html.includes("Harga paket A — 30 foto") && html.includes("Rp 18.000.000") && !html.includes("Rp 999") && !html.includes("Dikonfirmasi kemudian"));
  assert.ok(renderQuoteHtml({ ...q, sections: [{ ...q.sections[0], price: null }] }).includes("Dikonfirmasi kemudian"));
});

test("info-only sections: no price anywhere, no letter, out of totals; package price shows in the section header", () => {
  const q = { ...newQuote(), operational: [], sections: [
    { id: "v", title: "Video", layout: "media" as const, pricing: "section" as const, price: 6_500_000, items: [{ id: "1", name: "Per villa", qty: 6, unit: "video", price: 0 }] },
    { id: "d", title: "Deliverables", layout: "list" as const, pricing: "none" as const, items: [{ id: "2", name: "File high-res", price: 0 }] }] };
  const html = renderQuoteHtml(q);
  assert.equal(totals(q).grand, 6_500_000);
  assert.ok(html.includes('class="sec-price">Rp 6.500.000<small>Harga paket</small>'));
  assert.ok(html.includes("Termasuk paket"));
  assert.ok(!html.includes("Harga paket B") && !html.includes("Rp 0") && !html.includes("Deliverables (B)"));
  assert.deepEqual(stats(q).map(s => s.label), ["Video"]);
});

test("a package priced at Rp 0 shows no price at all", () => {
  const q = { ...newQuote(), operational: [], sections: [{ id: "d", title: "Deliverables", layout: "list" as const, pricing: "section" as const, price: 0, items: [{ id: "1", name: "File", price: 0 }] }] };
  const html = renderQuoteHtml(q);
  assert.ok(!html.includes("Rp 0<small>") && !html.includes("Harga paket A") && !html.includes("Termasuk paket"));
});
