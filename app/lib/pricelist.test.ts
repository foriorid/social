import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PRICELIST, needsTransport, packageSections, parsePackages, withTransport } from "./pricelist.ts";
import { newQuote, publicSnapshot, renderQuoteHtml, totals } from "./quote.ts";

test("a picked package becomes one section: a row per unit at the pricelist price, add-ons as rows", () => {
  const [pro, video] = packageSections([{ id: "pro", qty: 3 }, { id: "cinematic", qty: 1, addons: ["drone-video", "bogus"] }], DEFAULT_PRICELIST);
  assert.equal(pro.title, "Foto Interior · Pro");
  assert.deepEqual(pro.items.map(i => [i.name, i.price, i.list, i.qty]), [["Unit 1", 2_500_000, 2_500_000, 15], ["Unit 2", 2_500_000, 2_500_000, 15], ["Unit 3", 2_500_000, 2_500_000, 15]]);
  assert.ok(pro.includes!.includes("5 foto original (tanpa edit)"));
  assert.deepEqual(video.items.map(i => [i.name, i.price]), [["Cinematic Video", 3_500_000], ["Add-on: Drone Video", 2_000_000]]);
  assert.deepEqual(packageSections([{ id: "nope", qty: 1 }], DEFAULT_PRICELIST), []);
});

test("transport: included in Jakarta, a line to fill in elsewhere, never twice", () => {
  assert.equal(needsTransport("Jakarta Selatan"), false);
  assert.equal(needsTransport(""), false);
  assert.equal(needsTransport("Sentul, Bogor"), true);
  const ops = withTransport([], "Sentul, Bogor");
  assert.deepEqual(ops.map(r => [r.name, r.price]), [["Transport luar kota", null]]);
  assert.equal(withTransport(ops, "Sentul, Bogor").length, 1);
  assert.equal(withTransport([], "Jakarta Pusat").length, 0);
});

test("discount: percent or amount off the services, operational costs untouched; shown on the client page", () => {
  const q = { ...newQuote(), sections: packageSections([{ id: "pro", qty: 2 }], DEFAULT_PRICELIST), operational: [{ id: "o", name: "Transport", price: 500_000 }] };
  assert.equal(totals({ ...q, discount: { type: "pct", value: 10 } }).grand, 5_000_000 - 500_000 + 500_000);
  assert.equal(totals({ ...q, discount: { type: "idr", value: 9_999_999 } }).discount, 5_000_000);
  assert.equal(totals(q).discount, 0);
  const html = renderQuoteHtml(publicSnapshot({ ...q, discount: { type: "pct", value: 5 } }));
  assert.match(html, /Diskon 5%/);
  assert.match(html, /Termasuk/);
});

test("the pricelist price behind a special price never reaches the public copy", () => {
  const q = { ...newQuote(), sections: packageSections([{ id: "pro", qty: 1 }], DEFAULT_PRICELIST) };
  q.sections[0].items[0].price = 2_000_000;
  assert.equal(JSON.stringify(publicSnapshot(q)).includes("2500000"), false);
});

test("AI package picks keep only real packages and add-ons", () => {
  assert.deepEqual(parsePackages([{ id: "pro", qty: "3", addons: [] }, { id: "x", qty: 1 }, { id: "cinematic", qty: 1, addons: ["drone-video", "zz"], note: "minta drone" }], DEFAULT_PRICELIST),
    [{ id: "pro", qty: 3, addons: [], note: undefined }, { id: "cinematic", qty: 1, addons: ["drone-video"], note: "minta drone" }]);
  assert.deepEqual(parsePackages("nope", DEFAULT_PRICELIST), []);
});

test("a client's pricelist choice round-trips through the approval title, with its total", async () => {
  const { choiceTitle, parseChoice, choiceTotal } = await import("./pricelist.ts");
  const picks = [{ id: "pro", qty: 3, addons: [] }, { id: "cinematic", qty: 1, addons: ["drone-video"] }];
  const title = choiceTitle(picks, DEFAULT_PRICELIST);
  assert.equal(title, "Pro × 3; Cinematic Video + Drone Video");
  assert.deepEqual(parseChoice(title, DEFAULT_PRICELIST), picks);
  assert.equal(choiceTotal(picks, DEFAULT_PRICELIST), 13_000_000);
  assert.deepEqual(parseChoice("Unknown × 2", DEFAULT_PRICELIST), []);
});

test("pricelist link page: package cards with ticks for the client; after choosing, the choice instead of the form", async () => {
  const { newQuote, renderQuoteHtml } = await import("./quote.ts");
  const q = { ...newQuote(), kind: "pricelist" as const, client: { name: "Rina — MytePro", location: "Sentul" }, intro: "Halo Bu Rina", packages: DEFAULT_PRICELIST.slice(0, 2), sections: [] };
  const open = renderQuoteHtml(q);
  assert.match(open, /Disiapkan khusus untuk/);
  assert.match(open, /name="p_pro" value="1"/);
  assert.match(open, /name="q_basic"/);
  assert.match(open, /Halo Bu Rina/);
  assert.doesNotMatch(open, /class="total"/);
  const done = renderQuoteHtml(q, { approval: { name: "Rina", at: "2026-11-23T03:00:00Z", title: "Pro × 3", total: 7_500_000 } });
  assert.match(done, /Pilihan Anda: Pro × 3/);
  assert.doesNotMatch(done, /name="p_pro"/);
});
