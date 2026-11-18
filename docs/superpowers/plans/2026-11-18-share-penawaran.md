# Share Penawaran Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload a self-made standalone HTML quotation from the Hub dashboard and share it as `hub.forior.id/quote/<slug>/`, with a server-side count of how many times the client opened it.

**Architecture:** Hub serves the page itself. `output: "export"` is dropped and a Next route handler at `app/quote/[slug]/route.ts` returns the stored HTML with injected OG tags, its own script-free CSP, and `no-store`. The Supabase Edge Function becomes a JSON API behind a shared secret: it owns DB access and open-counting. Base64 images are stripped out in the browser at upload time into a public Storage bucket — proven to serve `image/jpeg` with immutable caching — so the served HTML stays ~37 KB and can be sent uncached.

**Revision 2.** The original architecture (Vercel rewrite → Supabase function serving HTML) was proven impossible in the Task 1 spike; see spec §4-A for the evidence. Tasks 1 and 4 are rewritten; Tasks 2, 3, 5 and 6 are unchanged.

**Tech Stack:** Next.js 15 static export (`output: "export"`), React 19, Supabase (Postgres + Edge Functions on Deno + Storage), Vercel, `node --test` with Node type-stripping.

**Spec:** `docs/superpowers/specs/2026-11-18-share-penawaran-design.md`

## Global Constraints

- Public URL shape: `https<host>/quote/<slug>/` **with** trailing slash; links are built from `window.location.origin`, never a hardcoded domain (spec §5.1, §5.8).
- No `vercel.json` and no rewrite. The page is a Next route handler (spec §5.1).
- The HTML document is never served from `*.supabase.co` — Supabase neutralises it. Images are, and that is verified (spec §4-A).
- Slug pattern, exactly: `^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$` and no `--`. 3–63 chars. `mytepro` must pass; `my`, `My-Tepro`, `a--b` must fail (spec §5.3).
- HTML response headers, exactly: `Cache-Control: no-store`, `Content-Type: text/html; charset=utf-8`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`, and the CSP in spec §5.7 verbatim (no `script-src` directive at all).
- Only `GET` and `HEAD` are served; anything else → 405 (spec §5.4).
- The edge function requires header `X-Quote-Key`; Hub sends it from a Vercel env var. Both hold the same secret, which never appears in the repo or in chat (spec §5.4).
- Owner/Admin only, for read *and* write, via `public.has_workspace_role(workspace_id, 'admin')` (spec §6.2).
- Image Storage path: `<workspace_id>/<slug>/<upload_id>/<n>.<ext>`; OG image at `<workspace_id>/<slug>/<upload_id>/og.jpg` (spec §5.2).
- UI copy is Indonesian; code comments are English (repo convention).
- No new runtime dependency may be added to `package.json`.
- Two PRs: Task 1 ships and is verified alone; Tasks 2–6 ship together. Task 1 is now verifiable on a preview deployment, so it no longer needs a production merge to prove itself.

## Review Focus

Five things the spec implies, that a reasonable person would hit, and that no task's happy path would catch. Each has its test placed in the task that owns the code.

1. **Slug is a global primary key, so two workspaces cannot both use `mytepro`.** A collision must surface as a readable Indonesian message, not a raw Postgres unique-violation. → Task 6, Step 9.
2. **A quotation with no images at all** leaves `og_image` null; the function must still return valid OG tags and the page must still render. → Task 2 (`injectMeta` with null image) and Task 4.
3. **HTML with no `</head>`** (hand-edited or truncated file) must not be corrupted by meta injection. → Task 2, Step 1.
4. **A Storage upload that fails halfway** must not leave a quote row pointing at images that were never uploaded; the row is written last, after every image lands. → Task 5, Step 5.
5. **`?preview=1` on a revoked or unknown slug** must still 404, not leak a page or crash the no-count path. → Task 4, Step 7.

---

### Task 1: Foundation — Hub serves the page, and nothing existing breaks (PR-1)

Its own pull request. The risk here is **not** the new route; it is the hosting-mode
change underneath every existing page. The deliverable is proof that nothing regressed.

**Files:**
- Modify: `next.config.ts` (remove `output: "export"`)
- Delete: `vercel.json` (committed during the failed spike; no rewrite is needed now)
- Modify: `.github/workflows/deploy.yml` (drop the `push` trigger, keep `workflow_dispatch`)
- Create: `app/quote/[slug]/route.ts` (temporary: fixed HTML, no database)

**Interfaces:**
- Consumes: nothing.
- Produces: a real `GET /quote/<slug>/` route whose headers are entirely ours.

- [ ] **Step 1: Drop `output: "export"` and delete `vercel.json`**

Keep `trailingSlash: true` and the `basePath` line as they are.

- [ ] **Step 2: Stop GitHub Pages from auto-deploying**

Remove the `on: push` trigger, keep `workflow_dispatch`. With `out/` no longer produced,
that workflow would fail on every merge to `main` (spec §5.10). Nothing is deleted.

- [ ] **Step 3: Write the temporary route handler**

`app/quote/[slug]/route.ts`, exporting `GET`. Returns status 200, a body containing the
literal `QUOTE_PROBE_OK` and the slug from the route params, and these headers:
`Content-Type: text/html; charset=utf-8`, `Cache-Control: no-store`, and the CSP from
spec §5.7 verbatim.

- [ ] **Step 4: Build locally and verify the build mode changed**

Run: `npm run build`
Expected: succeeds, and `out/` is NOT produced (static export is off). `npm test` still passes.

- [ ] **Step 5: Commit and push**

```bash
git add next.config.ts .github/workflows/deploy.yml app/quote
git rm vercel.json
git commit -m "Hub menyajikan /quote sendiri: lepas static export"
```

- [ ] **Step 6: Verify on the preview deployment — this is the gate**

Fetch each with Vercel's authenticated fetch (previews are SSO-locked):

| Request | Expected |
|---|---|
| `/quote/zz-probe/` | 200, `content-type: text/html; charset=utf-8`, our CSP, `cache-control: no-store`, body has `QUOTE_PROBE_OK` and slug `zz-probe` |
| `/review/zz-nonexistent-token/` | still reaches `app/not-found.tsx` and renders the review view client-side, exactly as before |
| `/gallery/zz-nonexistent-slug/` | same, for the gallery view |
| `/` | the dashboard still loads |

- [ ] **Step 7: If an existing route regressed, stop**

A broken `/review/<token>` kills links already sent to clients — far more expensive than
this feature. Revert and report rather than carrying on.

### Task 2: Pure logic module and its tests

**Files:**
- Create: `supabase/functions/quote/quote.ts`
- Test: `app/lib/quote.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, all pure and browser/Deno-agnostic:

```ts
export function isSlug(s: string): boolean;
export function isCrawler(ua: string | null): boolean;
export function escapeAttr(s: string): string;
export type QuoteMeta = { title: string; description: string; image: string | null; url: string };
export function injectMeta(html: string, meta: QuoteMeta): string;
export type ImagePart = { path: string; mime: string; base64: string };
export type Extraction = { html: string; images: ImagePart[] };
export function extractDataUris(html: string, baseUrl: string, prefix: string): Extraction;
export function titleOf(html: string): string;
export function externalHosts(html: string): string[];
```

`extractDataUris` works on the HTML **string**, not a DOM: `DOMParser` does not
exist in `node --test`, so a DOM-based version could not be tested at all. It must
match data URIs in both `src="data:image/…;base64,…"` and `url(data:image/…;base64,…)`.
Returned `path` values are `` `${prefix}/${n}.${ext}` `` (1-based `n`), and each
match in the returned `html` is replaced with `` `${baseUrl}/${path}` ``.

`externalHosts` returns the distinct hosts of **subresources only** —
`link`/`img`/`script`/`source`/`iframe`/`object`/`embed` plus CSS `@import` and
`url(https://…)`. Plain `<a href>` is navigation, not a subresource, and must not
appear (spec §5.7: the sample file's `wa.me` and `www.forior.id` links must not trip it).

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `supabase/functions/quote/quote.ts`.

- [ ] **Step 3: Implement the module**

Write `supabase/functions/quote/quote.ts` with the signatures in Interfaces above.
Crawler list, verbatim from spec §5.4: `whatsapp`, `facebookexternalhit`,
`facebookcatalog`, `twitterbot`, `telegrambot`, `slackbot`, `linkedinbot`,
`discordbot`, `googlebot`, `bingbot`, `applebot`, `skypeuripreview`, `embedly`,
`quora link preview`, `vkshare`, `redditbot`, `pinterest`, then the fallback
`bot|crawler|spider|preview|fetcher`. Empty or null UA counts as a crawler.
Map mime → extension with `jpeg→jpg`, `png→png`, `webp→webp`, `gif→gif`, `svg+xml→svg`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all of `quote.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/quote/quote.ts app/lib/quote.test.ts
git commit -m "Penawaran: logika murni (slug, crawler, meta, ekstraksi gambar) + tes"
```

---

### Task 3: Migration — tables, RLS, Storage bucket and its policies

**Files:**
- Create: `supabase/migrations/20261118080000_quotes.sql`

**Interfaces:**
- Consumes: `public.workspaces`, `public.has_workspace_role(uuid, text)` from `20261114090000_workspaces.sql`.
- Produces: tables `public.quotes`, `public.quote_opens`; Storage bucket `quotes`.

- [ ] **Step 1: Write the migration**

Tables exactly as spec §5.3, including `option_label text check (length(option_label) <= 40)`,
the index `quotes_ws_client on public.quotes (workspace_id, lower(client_name))`, and
`quote_opens_slug_at`. RLS mirrors `20261114120000_client_review.sql` but at `'admin'`
for **every** verb including `select`. Then `revoke all on table public.quotes from anon;`
and the same for `quote_opens`.

Bucket and Storage policies as spec §5.2: `insert into storage.buckets … public = true`,
plus insert/update/delete policies on `storage.objects` gated by
`has_workspace_role(((storage.foldername(name))[1])::uuid, 'admin')`. Needed because
`20261111094000_creator_os_harden_grants.sql` already revoked default privileges.

- [ ] **Step 2: Apply the migration to the live project**

Expected: succeeds; `quotes` and `quote_opens` appear in the table list.

- [ ] **Step 3: Prove the grants actually bite**

As `anon`, `select * from public.quotes` → permission denied. As an `editor` member of
the workspace, the same select returns **zero rows** (RLS, not an error). This is the
check that spec §6.2 is real and not just a comment.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261118080000_quotes.sql
git commit -m "Penawaran: tabel quotes + quote_opens, RLS admin-only, bucket quotes"
```

---

### Task 4: The real route handler and the JSON API behind it

**Files:**
- Modify: `app/quote/[slug]/route.ts` (replace the Task 1 probe entirely)
- Modify: `supabase/functions/quote/index.ts` (replace the spike probe entirely)

**Interfaces:**
- Consumes: `isSlug`, `isCrawler`, `injectMeta`, `escapeAttr`, `QuoteMeta` from `../../../supabase/functions/quote/quote.ts`; tables from Task 3.
- Produces: the public `GET /quote/<slug>/` behaviour.

- [ ] **Step 1: Create the shared secret in both places**

A random value, set as a Supabase edge-function secret `QUOTE_API_SECRET` and as a Vercel
environment variable of the same name on `forior-creator-os` (all environments). It must
not appear in the repo, in the plan, or in chat.

- [ ] **Step 2: Rewrite the edge function as a JSON API**

`POST` only. Reject unless header `X-Quote-Key` equals `QUOTE_API_SECRET` → 401.
Body `{ slug, count, ua, referer }`. `!isSlug(slug)` → 404. Select
`title, client_name, option_label, html, og_title, og_description, og_image`
from `public.quotes where slug = $1 and not revoked`; no row → 404.
When `count` is true, `update public.quotes set opens = opens + 1, last_opened_at = now()`
and `insert into public.quote_opens (slug, ua, referer)`. A write error is logged and
must not fail the response. Follow `supabase/functions/review/index.ts` for the client
and error shape.

- [ ] **Step 3: Rewrite the route handler**

`GET` and `HEAD` only; else 405. `!isSlug(slug)` → the 404 page from Step 4.
Call the function with `count` false when `isCrawler(req.headers.get("user-agent"))` or
the URL carries `preview=1`, true otherwise (spec §5.4). Build `og:url` from
`X-Forwarded-Host`, falling back to `Host`. Return `injectMeta(html, meta)` with every
header from Global Constraints.

- [ ] **Step 4: Write the 404 page**

A small self-contained Indonesian page, status 404, same security headers: heading
"Penawaran tidak ditemukan", one line "Periksa kembali tautannya, atau hubungi FORIOR."

- [ ] **Step 5: Deploy the function, push, and seed one row by hand**

Insert a row with slug `zz-probe2`, a tiny HTML body, `og_image` null.

- [ ] **Step 6: Verify end to end on the preview deployment**

| Check | Expected |
|---|---|
| `/quote/zz-probe2/` | 200, body is the seeded HTML with OG tags injected |
| `content-type` | `text/html; charset=utf-8` — ours, not `text/plain` |
| CSP header | present, ours, contains no `script-src` |
| `opens` after that GET | 1 |
| `User-Agent: WhatsApp/2.23` | 200 with OG tags, `opens` still 1 |
| `/quote/zz-probe2/?preview=1` | 200, `opens` still 1 |
| `POST /quote/zz-probe2/` | 405 |
| function called without `X-Quote-Key` | 401 |

- [ ] **Step 7: Verify the no-image case** (Review Focus 2)

`zz-probe2` has `og_image` null: the response has `og:title` but no `og:image`, and the
page renders.

- [ ] **Step 8: Verify revoked and unknown slugs** (Review Focus 5)

`revoked = true` → both `/quote/zz-probe2/` and `?preview=1` give the 404 page, and
`/quote/does-not-exist/` likewise. Then delete the probe row.

- [ ] **Step 9: Commit**

```bash
git add app/quote supabase/functions/quote/index.ts
git commit -m "Penawaran: route handler menyajikan halaman, function jadi API JSON"
```

### Task 5: Browser-side upload pipeline

Split across two modules on purpose. `node --test` imports the test file, which would
transitively import `./cloud` — and that pulls `@supabase/supabase-js` and `window`
references into a plain Node process. So everything testable lives in a module that
imports nothing from `cloud`, and only `saveQuote` sits in the module that does.

**Files:**
- Create: `app/lib/quote-files.ts` (pure; imports nothing from `./cloud`)
- Create: `app/lib/quote-upload.ts` (imports `./cloud` and `./quote-files`)
- Test: extends `app/lib/quote.test.ts`

**Interfaces:**

`app/lib/quote-files.ts` — consumes nothing from the app:

```ts
export const BUCKET = "quotes";
export function publicBase(supabaseUrl: string): string;   // `${supabaseUrl}/storage/v1/object/public/${BUCKET}`
export function uploadId(now?: Date): string;              // "20261118-073400", sortable
export function b64ToBlob(base64: string, mime: string): Blob;
export async function shrinkToOg(blob: Blob, maxWidth?: number): Promise<Blob>;  // canvas, 1200px, q 0.8
```

`shrinkToOg` touches `document` only when called, never at import, so this module stays
importable in Node. It follows the canvas approach already in `app/brandkit.tsx`.

`app/lib/quote-upload.ts` — consumes `extractDataUris`, `titleOf`, `externalHosts` from
`../../supabase/functions/quote/quote.ts`; `supabase`, `SUPABASE_URL` from `./cloud`;
all of `./quote-files`:

```ts
export type SaveInput = { workspaceId: string; slug: string; title: string; clientName: string; optionLabel: string; description: string; fileText: string };
export type SaveResult = { warnings: string[] };
export async function saveQuote(input: SaveInput): Promise<SaveResult>;
```

- [ ] **Step 1: Write the failing tests for the pure module**

```ts
import { b64ToBlob, publicBase, uploadId } from "./quote-files.ts";

test("uploadId is compact and sorts chronologically", () => {
  const a = uploadId(new Date("2026-11-18T07:34:00Z"));
  const b = uploadId(new Date("2026-11-19T07:34:00Z"));
  assert.match(a, /^[0-9]{8}-[0-9]{6}$/);
  assert.ok(a < b);
});

test("b64ToBlob round-trips bytes and keeps the mime", async () => {
  const blob = b64ToBlob("SGVsbG8=", "image/jpeg");
  assert.equal(blob.type, "image/jpeg");
  assert.equal(await blob.text(), "Hello");
});

test("publicBase builds the Storage URL for the quotes bucket", () => {
  assert.equal(publicBase("https://x.supabase.co"), "https://x.supabase.co/storage/v1/object/public/quotes");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `./quote-files.ts`.

- [ ] **Step 3: Implement `app/lib/quote-files.ts`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS. The whole suite must still run in plain Node — if it now fails to
import anything, the split above was not kept and `saveQuote` leaked into the pure module.

- [ ] **Step 5: Implement `saveQuote` in `app/lib/quote-upload.ts`, writing the row last**

This order is the requirement, not a suggestion: reject a `fileText` over 15 MB or with
no `<html`; `extractDataUris` with `publicBase(SUPABASE_URL)` and prefix
`` `${workspaceId}/${slug}/${uploadId()}` ``; upload **every** image and the `og.jpg`;
only then `upsert` into `public.quotes`. If any upload rejects, throw and write no row —
a quote must never point at images that are not there. (Review Focus 4.)
`upsert` leaves `opens` and `last_opened_at` untouched, so replacing a file keeps its history.

`og_image` is the `og.jpg` URL, or null when the file had no images at all.
`warnings` is `externalHosts(html)` minus `fonts.googleapis.com` and `fonts.gstatic.com`,
so the UI can say it out loud (spec §5.7).

- [ ] **Step 6: Commit**

```bash
git add app/lib/quote-files.ts app/lib/quote-upload.ts app/lib/quote.test.ts
git commit -m "Penawaran: pipeline upload di browser — pisah gambar, bikin OG, simpan"
```

### Task 6: Dashboard module

**Files:**
- Create: `app/quote.tsx`
- Modify: `app/page.tsx` (nav item in the `PROJECT` group near line 56; module dispatch near line 486)
- Modify: `app/globals.css` (append a `qt-` block)

**Interfaces:**
- Consumes: `saveQuote` from `./lib/quote-upload`, `./lib/quote-files`; `isSlug` from `../supabase/functions/quote/quote.ts`; `readCloud`, `activeWorkspace` from `./lib/cloud`.
- Produces: `export function QuotePage(): JSX.Element`.

- [ ] **Step 1: Add the nav item**

In `navGroupsFor`, business branch only, insert `{ name: "Penawaran", icon: FileText }`
into the `PROJECT` group after `Photo Planner`. Personal workspace is unchanged
(spec §6.7).

- [ ] **Step 2: Build the list, grouped per client**

Group rows by `lower(client_name)`. One block per client; inside it, each option as a
row showing `option_label`, slug, and its own open count **side by side with its
siblings**, so it is visible which option the client keeps returning to (spec §5.8).
Open count reads `"Dibuka 3× · terakhir Sel 14:20"`, or `"Belum dibuka"` when
`opens = 0`.

- [ ] **Step 3: Build the upload form**

Fields: file, slug, client name, option label, description. Next to the slug field a
**"+ akhiran acak"** button appending `-` plus 4 chars from `[a-z0-9]`; not applied
automatically, with one line below explaining why it exists (spec §6.17).
Validate with `isSlug` before submitting and show the rule in Indonesian when it fails.

- [ ] **Step 4: Show the copy-link button, with the trailing slash**

`` `${window.location.origin}/quote/${slug}/` `` — trailing slash included, so no 308
hop (spec §5.1). On `*.github.io` hide the button and show one line instead:
GitHub Pages has no rewrite layer, so the link would be dead (spec §5.10).

- [ ] **Step 5: Surface the upload warnings**

Render `SaveResult.warnings` as a visible notice after a successful upload, naming each
unexpected host, e.g. "Gambar atau font dari `cdn.lain.com` tidak akan tampil."

- [ ] **Step 6: Add replace / revoke / delete**

Replace reuses the same slug and keeps the open history. Delete removes the row and
the `<workspace_id>/<slug>/` folder, and says plainly that images already cached by the
CDN may stay reachable for a while (spec §5.2).

- [ ] **Step 7: Wire the module into `app/page.tsx`**

Add `activeNav === "Penawaran" ? <QuotePage /> :` to the dispatch chain.

- [ ] **Step 8: Add the CSS**

Append a `qt-` prefixed block to `app/globals.css`, reusing `.module-page`, `.panel`
and `.primary-button`.

- [ ] **Step 9: Handle a slug already taken by another workspace**

`slug` is a global primary key, so a second workspace cannot reuse `mytepro`. Catch the
unique violation from `saveQuote` and show "Slug ini sudah dipakai. Coba tambahkan
akhiran acak." — never a raw Postgres error. (Review Focus 1.)

- [ ] **Step 10: Verify the build and the whole suite**

Run: `npm run build && npm test`
Expected: build succeeds, all tests pass.

- [ ] **Step 11: Upload the real Sentul MytePro file and check it end to end**

The actual file, not a stand-in: it is the only thing that proves spec §5.7's CSP and
the extraction pipeline. Confirm 7 images are extracted, the stored HTML is ~37 KB,
no warning is raised (its only external hosts are the two Google Fonts ones), the live
page renders identically to the local file, and the open count moves on a real visit
but not on `?preview=1`.

- [ ] **Step 12: Commit and open PR-2**

```bash
git add app/quote.tsx app/page.tsx app/globals.css
git commit -m "Penawaran: modul dashboard — daftar per klien, upload, hitungan buka"
```
