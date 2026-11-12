"use client";

import { useEffect, useState } from "react";
import { PublicGalleryPage } from "./gallery-view";

/**
 * Static hosts (Vercel, GitHub Pages) serve this page for any unknown path. Client gallery links
 * look like /gallery/<slug>, so render the gallery for those instead of relying on host rewrites.
 */
export default function NotFound() {
  const [kind, setKind] = useState<"wait" | "gallery" | "missing">("wait");
  useEffect(() => { setKind(/\/gallery\/[^/?#]+/.test(window.location.pathname) ? "gallery" : "missing"); }, []);
  if (kind === "gallery") return <PublicGalleryPage />;
  if (kind === "wait") return <main className="gv-page gv-center" />;
  return <main className="gv-page gv-center"><h1>Halaman tidak ditemukan</h1><p>Periksa kembali alamatnya.</p></main>;
}
