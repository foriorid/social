// TEMPORARY probe (PR-1). Replaced in PR-2 by the real quote page.
// Its only job: prove Hub itself can serve /quote/<slug> with headers that are wholly ours.
// Supabase cannot do this: its gateway rewrites HTML responses to text/plain and injects
// `default-src 'none'; sandbox`. See docs/superpowers/specs/2026-11-18-share-penawaran-design.md §4-A.

/** No scripts at all: an LLM-authored quotation shares this origin with the Hub session. */
const CSP = [
  "default-src 'none'",
  "img-src https: data:",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "connect-src 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'"
].join("; ");

const headers = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow"
};

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const body = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>QUOTE_PROBE_OK</title></head>`
    + `<body><h1>QUOTE_PROBE_OK</h1><p>slug=${slug}</p></body></html>`;
  return new Response(body, { status: 200, headers });
}
