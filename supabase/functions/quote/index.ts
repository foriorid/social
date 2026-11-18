// TEMPORARY routing probe (PR-1). Replaced wholesale in PR-2 by the real quote page.
// Its only job: prove that a Vercel rewrite reaches this function, with no apikey and no
// Authorization header, and that the response is not cached on the way back.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/** Slug is the last path segment: Vercel proxies /quote/<slug> to /functions/v1/quote/<slug>. */
const slugOf = (url: string) => {
  const m = /\/quote\/([^/?#]+)/.exec(new URL(url).pathname);
  return m ? decodeURIComponent(m[1]) : "";
};

Deno.serve(req => {
  const slug = slugOf(req.url);
  const body = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>QUOTE_PROBE_OK</title></head>`
    + `<body><h1>QUOTE_PROBE_OK</h1><p>slug=${slug}</p><p>method=${req.method}</p></body></html>`;
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
  });
});
