// Public quotation link: /quote/<slug>/ shows the HTML file uploaded in the dashboard (Penawaran),
// exactly as it is. The file lives in the Supabase Storage bucket `quotes` as <slug>.html.
// Hub has to serve it itself: Supabase sends HTML files as text/plain, so the browser would show
// source code instead of the page.

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ojfezodyjvlzexxqbgak.supabase.co";
const SLUG = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

// No scripts: the uploaded file shares this domain with the logged-in Hub, so it must not be
// able to run code here. Styles, Google Fonts and images still work.
const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow"
};

const notFound = () => new Response(
  `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Penawaran tidak ditemukan</title>`
  + `<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;color:#222}div{text-align:center;padding:24px}</style></head>`
  + `<body><div><h1>Penawaran tidak ditemukan</h1><p>Periksa kembali tautannya, atau hubungi FORIOR.</p></div></body></html>`,
  { status: 404, headers: HEADERS }
);

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!SLUG.test(slug) || slug.includes("--")) return notFound();
  const file = await fetch(`${SUPABASE_URL}/storage/v1/object/public/quotes/${slug}.html`, { cache: "no-store" });
  if (!file.ok || !file.body) return notFound();
  // Streamed straight through, so a large file (the sample quotation is 5.3 MB) is never held in memory.
  return new Response(file.body, { status: 200, headers: HEADERS });
}
