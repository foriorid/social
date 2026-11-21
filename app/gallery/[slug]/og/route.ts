// Link-preview image for /gallery/<slug>/: the gallery's cover photo from Google Drive, served from this domain
// (previewers handle a plain image URL here more reliably than Drive's redirecting thumbnail links).
import { coverIdOf, galleryFor } from "../meta";

export const revalidate = 3600;

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const fallback = () => Response.redirect(new URL("/stock/japanese-restaurant.jpg", req.url), 302);
  const g = await galleryFor(slug);
  const id = g && coverIdOf(g);
  if (!id || !/^[A-Za-z0-9_-]{10,}$/.test(id)) return fallback();
  try {
    const r = await fetch(`https://drive.google.com/thumbnail?id=${id}&sz=w1200`, { redirect: "follow", signal: AbortSignal.timeout(5000) });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !type.startsWith("image/") || !r.body) return fallback();
    return new Response(r.body, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
  } catch { return fallback(); }
}
