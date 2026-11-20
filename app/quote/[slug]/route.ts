// Public quotation link /quote/<slug>/. Two kinds live in the Storage bucket `quotes`:
//  - <slug>.html: a file uploaded as-is (Penawaran › HTML), shown exactly as it is, no scripts.
//  - <slug>.json: a quotation made in the builder (Penawaran › Builder), rendered here by app/lib/quote.ts.
// Hub serves both itself: Supabase sends HTML files as text/plain, so the browser would show source code.
import { createHash } from "node:crypto";
import { PRINT_SCRIPT, renderQuoteHtml, type Quote } from "../../lib/quote";

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
const BUILT = { ...BASE, "Content-Security-Policy": `default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'sha256-${createHash("sha256").update(PRINT_SCRIPT).digest("base64")}'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'` };

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
  return new Response(renderQuoteHtml(q, { pageUrl }), { status: 200, headers: BUILT });
}
