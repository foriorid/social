import type { Metadata } from "next";
import { PublicGalleryPage } from "../../gallery-view";
import { descriptionOf, galleryFor } from "./meta";

// Always look the gallery up fresh: a cached miss (new gallery, or a slow first call) would show the generic preview.
export const dynamic = "force-dynamic";

// The page itself is the same client gallery; this server wrapper only adds the link-preview tags.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const g = await galleryFor(slug);
  if (!g) return { title: "FORIOR — Galeri foto", robots: { index: false } };
  const title = `${g.title} — FORIOR`, description = descriptionOf(g), image = `/gallery/${slug}/og/`;
  return {
    title, description, robots: { index: false, follow: false },
    openGraph: { type: "website", siteName: "FORIOR", title, description, url: `/gallery/${slug}/`, images: [{ url: image, width: 1200, height: 800, alt: g.title }] },
    twitter: { card: "summary_large_image", title, description, images: [image] }
  };
}

export default function GallerySlugPage() {
  return <PublicGalleryPage />;
}
