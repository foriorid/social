// Public quotation link /quote/<slug>/. Two kinds live in the Storage bucket `quotes`:
//  - <slug>.html: a file uploaded as-is (Penawaran › HTML), shown exactly as it is, no scripts.
//  - <slug>.json: a quotation made in the builder (Penawaran › Builder), rendered here by app/lib/quote.ts.
// Hub serves both itself: Supabase sends HTML files as text/plain, so the browser would show source code.
import { createHash } from "node:crypto";
import { PRINT_SCRIPT, renderQuoteHtml, totals, type Quote, type QuoteApproval } from "../../lib/quote";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ojfezodyjvlzexxqbgak.supabase.co";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_UVGsfzjQRv9mbBPdOOgAnQ_RhQdbL0R";
const SLUG = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
// Link previews (WhatsApp, Facebook, Telegram…) fetch the page too; they are not the client opening it.
const BOT = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|twitter|skype|curl|wget|headless/i;

const BASE = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" };
// Uploaded HTML shares this domain with the logged-in Hub, so it must not run any code here.
const UPLOADED = { ...BASE, "Content-Security-Policy": "default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; form-action 'none'; frame-ancestors 'none'; base-uri 'none'" };
// Builder pages: Hub's own template; the only script allowed is the PDF button, pinned by its hash.
const BUILT = { ...BASE, "Content-Security-Policy": `default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'sha256-${createHash("sha256").update(PRINT_SCRIPT).digest("base64")}'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'` };

const page = (status: number, title: string, line: string) => new Response(
  `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>`
  + `<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;color:#222}div{text-align:center;padding:24px}</style></head>`
  + `<body><div><h1>${title}</h1><p>${line}</p></div></body></html>`,
  { status, headers: UPLOADED }
);
const notFound = () => page(404, "Penawaran tidak ditemukan", "Periksa kembali tautannya, atau hubungi FORIOR.");
const unavailable = () => page(502, "Penawaran sedang tidak bisa dibuka", "Coba lagi sebentar lagi, atau hubungi FORIOR.");
const file = (slug: string, ext: string) => fetch(`${SUPABASE_URL}/storage/v1/object/public/quotes/${slug}.${ext}`, { cache: "no-store" });

/** Records that the client opened the link (shown as "Dibuka 3×" in Hub). Never blocks or breaks the page. */
async function logOpen(slug: string, ua: string) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/log_quote_open`, {
      method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_slug: slug, p_ua: ua.slice(0, 300) }), signal: AbortSignal.timeout(1500)
    });
  } catch { /* tracking is best effort */ }
}

const rpc = (fn: string, body: unknown, ms: number) => fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
  method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify(body), signal: AbortSignal.timeout(ms), cache: "no-store"
});

/** Who approved the quotation and when, or null. A failed lookup shows the form, which the database still guards. */
async function approvalOf(slug: string): Promise<QuoteApproval | null> {
  try { const r = await rpc("quote_approval", { p_slug: slug }, 2000); const rows = r.ok ? await r.json() : []; return Array.isArray(rows) && rows[0]?.name ? { name: rows[0].name, at: rows[0].at } : null; }
  catch { return null; }
}

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!SLUG.test(slug) || slug.includes("--")) return notFound();
  let html: Response, json: Response;
  try {
    html = await file(slug, "html");
    if (html.ok && html.body) return new Response(html.body, { status: 200, headers: UPLOADED }); // streamed: files can be several MB
    json = await file(slug, "json");
  } catch {
    return unavailable(); // storage unreachable: a readable page instead of a bare 500
  }
  if (!json.ok) return notFound();
  let q: Omit<Quote, "brief">;
  try { q = await json.json(); } catch { return unavailable(); }
  const url = new URL(req.url);
  const ua = req.headers.get("user-agent") ?? "";
  if (!url.searchParams.has("preview") && !BOT.test(ua)) await logOpen(slug, ua);
  const pageUrl = `https://${req.headers.get("x-forwarded-host") ?? url.host}/quote/${slug}/`;
  const approval = await approvalOf(slug);
  return new Response(renderQuoteHtml(q, { pageUrl, sent: url.searchParams.has("terkirim"), approval }), { status: 200, headers: BUILT });
}

/** The client answers the questions on the page (a plain form, no script). Saved for Hub; then back to the page. */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!SLUG.test(slug) || slug.includes("--")) return notFound();
  let q: Omit<Quote, "brief">, form: FormData;
  try {
    const json = await file(slug, "json");
    if (!json.ok) return notFound();
    q = await json.json();
    form = await req.formData();
  } catch { return unavailable(); }
  const back = `/quote/${slug}/`;
  if (form.get("act") === "approve") {
    // Approval: the name and the terms checkbox are required; title and total come from the published quotation.
    const name = String(form.get("name") ?? "").trim().slice(0, 80), phone = String(form.get("phone") ?? "").replace(/[^\d+ ()-]/g, "").trim().slice(0, 30);
    if (!name || form.get("agree") !== "1") return new Response(null, { status: 303, headers: { Location: `${back}#setuju` } });
    try {
      const r = await rpc("approve_quote", { p_slug: slug, p_name: name, p_phone: phone, p_title: [q.eyebrow, q.title].filter(Boolean).join(" — ").slice(0, 300), p_total: Math.round(totals(q as Quote).grand) }, 4000);
      if (!r.ok) return unavailable();
    } catch { return unavailable(); }
    return new Response(null, { status: 303, headers: { Location: `${back}?disetujui=1#setuju` } });
  }
  // Question texts come from the published quotation, not from the form, so only real questions are stored.
  const answers = (q.questions ?? []).filter(x => x.text.trim()).slice(0, 10)
    .map((x, i) => ({ q: x.text.slice(0, 300), a: String(form.get(`a${i}`) ?? "").trim().slice(0, 1000) })).filter(x => x.a);
  if (!answers.length) return new Response(null, { status: 303, headers: { Location: `${back}#tanya` } });
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_quote_answers`, {
      method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_slug: slug, p_name: String(form.get("name") ?? "").trim().slice(0, 80), p_answers: answers }), signal: AbortSignal.timeout(4000)
    });
    if (!r.ok) return unavailable();
  } catch { return unavailable(); }
  return new Response(null, { status: 303, headers: { Location: `${back}?terkirim=1#tanya` } });
}
