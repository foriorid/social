"use client";

import { useEffect, useState } from "react";
import { PublicGalleryPage } from "./gallery-view";
import { PublicReviewPage } from "./review-view";

/**
 * Static hosts (Vercel, GitHub Pages) serve this page for any unknown path. Client gallery links
 * look like /gallery/<slug> and review links /review/<token>, so render those instead of relying on host rewrites.
 */
export default function NotFound() {
  const [kind, setKind] = useState<"wait" | "gallery" | "review" | "missing">("wait");
  useEffect(() => { const p = window.location.pathname; setKind(/\/gallery\/[^/?#]+/.test(p) ? "gallery" : /\/review\/[^/?#]+/.test(p) ? "review" : "missing"); }, []);
  if (kind === "gallery") return <PublicGalleryPage />;
  if (kind === "review") return <PublicReviewPage />;
  if (kind === "wait") return <main className="gv-page gv-center" />;
  return <main className="gv-page gv-center"><h1>Halaman tidak ditemukan</h1><p>Periksa kembali alamatnya.</p></main>;
}
