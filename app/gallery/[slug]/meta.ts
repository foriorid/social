// Server-side look-up of a client gallery for link previews (WhatsApp, Discord, Telegram…), which never run the page's JavaScript.
import type { Gallery } from "../../../supabase/functions/gallery/delivery";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ojfezodyjvlzexxqbgak.supabase.co";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_UVGsfzjQRv9mbBPdOOgAnQ_RhQdbL0R";
export const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

/** The public copy of the gallery (same call the client page makes), or null. Never throws. */
export async function galleryFor(slug: string): Promise<Omit<Gallery, "notes"> | null> {
  if (!SLUG.test(slug)) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/gallery`, {
      method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ slug, action: "get" }), signal: AbortSignal.timeout(3000), next: { revalidate: 300 }
    });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

/** The photo that represents the gallery best at this stage: a final, else a draft, else a preview. */
export const coverIdOf = (g: Omit<Gallery, "notes">) => (g.finalPhotos?.[0] ?? g.draftPhotos?.[0] ?? g.previewPhotos?.[0])?.id ?? null;

const LINE: Record<string, string> = {
  "Preview": "Silakan pilih foto favorit Anda.",
  "Client Selection": "Foto pilihan Anda sedang kami siapkan untuk diedit.",
  "Editing Progress": "Foto pilihan Anda sedang diedit.",
  "Client Review": "Hasil edit siap direview.",
  "Revision": "Revisi foto sedang dikerjakan.",
  "Done": "Foto final siap diunduh."
};
export const descriptionOf = (g: Omit<Gallery, "notes">) =>
  [g.client?.company && `Galeri foto ${g.client.company} dari FORIOR.`, LINE[g.phase] ?? ""].filter(Boolean).join(" ") || "Galeri foto dari FORIOR.";
