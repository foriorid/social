"use client";

export const SAMPLE_PHOTOS: Record<string, string> = {
  villa: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1000&q=85",
  living: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=85",
  bedroom: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=800&q=85",
  camera: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=800&q=85"
};

export function ImageTile({ kind, className = "" }: { kind: string; className?: string }) {
  return <div className={`image-tile ${className}`} style={{ backgroundImage: `url("${SAMPLE_PHOTOS[kind] || (kind.startsWith("http") ? kind : SAMPLE_PHOTOS.villa)}")` }} />;
}
