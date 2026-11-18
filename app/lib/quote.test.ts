import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeAttr, extractDataUris, externalHosts, injectMeta, isCrawler, isSlug, titleOf } from "../../supabase/functions/quote/quote.ts";

test("isSlug accepts what Alvian asked for and rejects the rest", () => {
  for (const ok of ["mytepro", "mytepro-k7m2", "a-b", "sentul-mytepro-option-1"]) assert.equal(isSlug(ok), true, ok);
  for (const bad of ["my", "My-Tepro", "a--b", "-mytepro", "mytepro-", "myte pro", "a".repeat(64), ""]) assert.equal(isSlug(bad), false, bad);
});

test("isCrawler spots preview bots but not real phones", () => {
  assert.equal(isCrawler("WhatsApp/2.23.20.0 A"), true);
  assert.equal(isCrawler("facebookexternalhit/1.1"), true);
  assert.equal(isCrawler("Mozilla/5.0 (compatible; Googlebot/2.1)"), true);
  assert.equal(isCrawler(""), true);
  assert.equal(isCrawler(null), true);
  assert.equal(isCrawler("Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36"), false);
  assert.equal(isCrawler("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17.0 Mobile Safari"), false);
});

test("escapeAttr neutralises quote and angle bracket", () => {
  assert.equal(escapeAttr(`Rp "2.400.000" <b>`), "Rp &quot;2.400.000&quot; &lt;b&gt;");
});

test("injectMeta puts tags before </head>", () => {
  const out = injectMeta("<html><head><title>T</title></head><body>x</body></html>",
    { title: "Penawaran", description: "d", image: "https://cdn/og.jpg", url: "https://hub.forior.id/quote/mytepro/" });
  assert.match(out, /<meta property="og:title" content="Penawaran">/);
  assert.match(out, /<meta property="og:image" content="https:\/\/cdn\/og\.jpg">/);
  assert.match(out, /<meta name="robots" content="noindex, nofollow">/);
  assert.ok(out.indexOf("og:title") < out.indexOf("</head>"));
});

test("injectMeta omits og:image when there is no image, and keeps the rest", () => {
  const out = injectMeta("<html><head></head><body></body></html>",
    { title: "T", description: "d", image: null, url: "https://h/quote/a/" });
  assert.equal(/og:image/.test(out), false);
  assert.match(out, /og:title/);
});

test("injectMeta does not corrupt HTML that has no </head>", () => {
  const out = injectMeta("<div>no head at all</div>",
    { title: "T", description: "d", image: null, url: "https://h/quote/a/" });
  assert.match(out, /<div>no head at all<\/div>/);
  assert.match(out, /og:title/);
});

test("extractDataUris pulls images out of src and css url(), and rewrites both", () => {
  const html = `<img src="data:image/jpeg;base64,AAAA"><div style="background:url(data:image/png;base64,BBBB)"></div>`;
  const { html: out, images } = extractDataUris(html, "https://cdn/quotes", "ws/mytepro/u1");
  assert.equal(images.length, 2);
  assert.deepEqual(images.map(i => i.path), ["ws/mytepro/u1/1.jpg", "ws/mytepro/u1/2.png"]);
  assert.deepEqual(images.map(i => i.base64), ["AAAA", "BBBB"]);
  assert.match(out, /src="https:\/\/cdn\/quotes\/ws\/mytepro\/u1\/1\.jpg"/);
  assert.match(out, /url\(https:\/\/cdn\/quotes\/ws\/mytepro\/u1\/2\.png\)/);
  assert.equal(/base64/.test(out), false);
});

test("extractDataUris leaves HTML with no data URIs untouched", () => {
  const html = `<img src="https://cdn/a.jpg">`;
  const r = extractDataUris(html, "https://cdn/quotes", "p");
  assert.equal(r.html, html);
  assert.deepEqual(r.images, []);
});

test("titleOf reads the document title", () => {
  assert.equal(titleOf("<title>FORIOR — Quotation Option 1 | Sentul MytePro</title>"), "FORIOR — Quotation Option 1 | Sentul MytePro");
  assert.equal(titleOf("<html><body>x</body></html>"), "");
});

test("externalHosts reports subresources only, never plain links", () => {
  const html = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?x">
    <a href="https://wa.me/62815">wa</a><a href="https://www.forior.id">site</a>
    <svg><use href="#i-film"></use></svg><img src="https://evil.example/x.png">`;
  const hosts = externalHosts(html);
  assert.deepEqual(hosts.sort(), ["evil.example", "fonts.googleapis.com"]);
});
