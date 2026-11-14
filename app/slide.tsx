"use client";

// Carousel slide renderer. One draw function feeds both the on-screen preview and the PNG export,
// so what the editor shows is exactly what gets exported.
import { useEffect, useRef, useState } from "react";
import type { BrandKit, Scene } from "./plan-data";

export type Template = "cover" | "top" | "split" | "minimal";
export type Look = { template: Template; ratio: "4:5" | "1:1" | "9:16"; tone: "dark" | "light" | "brand"; font: "serif" | "sans"; align: "left" | "center"; scale: number };
export type Brand = { name: string; handle: string; accent: string; dark: string; light: string; font?: "serif" | "sans" };
export const TEMPLATES: { id: Template; name: string; hint: string }[] = [
  { id: "cover", name: "Cover besar", hint: "Judul besar di bawah, foto penuh" },
  { id: "top", name: "Judul atas", hint: "Teks di atas, foto tetap lega" },
  { id: "split", name: "Split panel", hint: "Foto atas, panel warna brand" },
  { id: "minimal", name: "Kartu minimal", hint: "Kotak teks kecil di sudut" }
];
export const DEFAULT_LOOK: Look = { template: "cover", ratio: "4:5", tone: "dark", font: "serif", align: "left", scale: 1 };
const RATIO_H = { "4:5": 1350, "1:1": 1080, "9:16": 1920 } as const;
export const sizeOf = (ratio: Look["ratio"]) => ({ W: 1080, H: RATIO_H[ratio] ?? 1350 });

/** Looks saved by the older studio (template dark/light/bold) keep working. */
export function normalizeLook(raw: (Omit<Partial<Look>, "template"> & { template?: string }) | undefined, brand?: Brand): Look {
  const r = raw ?? {};
  const legacy = r.template === "dark" ? { template: "cover", tone: "dark" } : r.template === "light" ? { template: "minimal", tone: "light" } : r.template === "bold" ? { template: "cover", tone: "brand" } : {};
  const look = { ...DEFAULT_LOOK, font: brand?.font ?? DEFAULT_LOOK.font, ...r, ...legacy } as Look;
  return { ...look, template: TEMPLATES.some(t => t.id === look.template) ? look.template : "cover", ratio: look.ratio in RATIO_H ? look.ratio : "4:5", scale: Math.min(1.4, Math.max(0.7, Number(look.scale) || 1)) };
}

export function brandOf(account: string, kit: BrandKit | undefined, fallback: { brandName: string; handle: string }): Brand {
  return { name: (kit?.name || account || fallback.brandName).toUpperCase(), handle: kit?.handle || fallback.handle, accent: kit?.accent || "#7c4de2", dark: kit?.dark || "#1b1235", light: kit?.light || "#f4f0ea", font: kit?.font };
}

const rgba = (hex: string, a: number) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()); const n = m ? parseInt(m[1], 16) : 0x1b1235; return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []; let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) { const next = line ? line + " " + word : word; if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = word; } else line = next; }
  if (line) lines.push(line);
  return lines;
}
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s); ctx.restore();
}

export type SlideInput = { scene: Scene; index: number; total: number; look: Look; brand: Brand; img: HTMLImageElement | null };

/** Draws one slide at W×H (1080 wide). Pure drawing; no loading. */
export function drawSlide(ctx: CanvasRenderingContext2D, W: number, H: number, { scene, index, total, look, brand, img }: SlideInput) {
  const M = 78, bg = look.tone === "light" ? brand.light : look.tone === "brand" ? brand.accent : brand.dark;
  const ink = look.tone === "light" ? brand.dark : "#ffffff", accent = look.tone === "brand" ? "#ffffff" : brand.accent;
  const serif = look.font === "serif";
  const titleFont = (px: number) => serif ? `600 ${px}px "Playfair Display", Georgia, "Times New Roman", serif` : `800 ${px}px "DM Sans", "Helvetica Neue", Arial, sans-serif`;
  const bodyFont = (px: number, w = 500) => `${w} ${px}px "DM Sans", "Helvetica Neue", Arial, sans-serif`;
  const center = look.align === "center", x0 = center ? W / 2 : M, maxW = W - M * 2;
  const title = (scene.text || scene.label || "").trim(), sub = (scene.sub ?? "").trim();
  ctx.textBaseline = "alphabetic"; ctx.textAlign = center ? "center" : "left";
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  const photoH = look.template === "split" ? Math.round(H * 0.6) : H;
  if (img) cover(ctx, img, 0, 0, W, photoH);
  else { const g = ctx.createLinearGradient(0, 0, W, photoH); g.addColorStop(0, rgba(brand.accent, 0.55)); g.addColorStop(1, rgba(brand.dark, 0.95)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, photoH); }

  const shade = (from: number, to: number, a0: number, a1: number) => { const g = ctx.createLinearGradient(0, from, 0, to); g.addColorStop(0, rgba(bg, a0)); g.addColorStop(1, rgba(bg, a1)); ctx.fillStyle = g; ctx.fillRect(0, Math.min(from, to), W, Math.abs(to - from)); };
  if (look.template === "cover") { shade(0, H * 0.24, 0.6, 0); shade(H * 0.4, H, 0, 0.94); }
  if (look.template === "top") { shade(0, H * 0.58, 0.94, 0); shade(H * 0.78, H, 0, 0.7); }
  if (look.template === "minimal") shade(0, H * 0.18, 0.45, 0);

  // header: brand name + slide count
  const headInk = look.template === "minimal" ? "#ffffff" : ink;
  ctx.fillStyle = headInk; ctx.font = bodyFont(30, 700);
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "6px";
  ctx.textAlign = "left"; ctx.fillText(brand.name.slice(0, 28), M, M + 22);
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px";
  ctx.font = bodyFont(28, 600); ctx.textAlign = "right"; ctx.fillText(`${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, W - M, M + 22);
  ctx.textAlign = center ? "center" : "left";

  const k = look.scale, size = Math.round((look.template === "minimal" ? 70 : look.template === "split" ? 82 : 104) * k), lh = Math.round(size * 1.08);
  ctx.font = titleFont(size); const tl = wrap(ctx, title, maxW - (look.template === "minimal" ? 60 : 0)).slice(0, 5);
  const subSize = Math.round(36 * Math.min(k, 1.15)); ctx.font = bodyFont(subSize); const sl = sub ? wrap(ctx, sub, maxW - (look.template === "minimal" ? 60 : 0)).slice(0, 3) : [];
  const block = tl.length * lh + (sl.length ? 26 + sl.length * subSize * 1.35 : 0);
  const footerY = H - M + 4;

  const drawText = (top: number, color: string, x = x0) => {
    let y = top + size * 0.86;
    ctx.fillStyle = color; ctx.font = titleFont(size); for (const l of tl) { ctx.fillText(l, x, y); y += lh; }
    if (sl.length) { y += 26 - lh + subSize * 1.1; ctx.globalAlpha = 0.9; ctx.font = bodyFont(subSize); for (const l of sl) { ctx.fillText(l, x, y); y += subSize * 1.35; } ctx.globalAlpha = 1; }
  };
  if (look.template === "cover") drawText(footerY - 70 - block, ink);
  if (look.template === "top") drawText(M + 90, ink);
  if (look.template === "split") {
    ctx.fillStyle = accent; ctx.fillRect(center ? W / 2 - 40 : M, photoH + 56, 80, 8);
    drawText(photoH + 100, ink);
  }
  if (look.template === "minimal") {
    const bw = maxW, bh = block + 84, bx = M, by = footerY - 64 - bh;
    ctx.fillStyle = rgba(bg, 0.9); ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 28); ctx.fill();
    drawText(by + 42, ink, center ? W / 2 : bx + 40);
  }

  // footer: progress dashes + next arrow
  const fInk = look.template === "minimal" ? "#ffffff" : ink;
  const dash = 46, gap = 12, n = Math.min(total, 8), dx = center ? W / 2 - (n * (dash + gap) - gap) / 2 : M;
  for (let i = 0; i < n; i++) { ctx.fillStyle = i === Math.min(index, n - 1) ? fInk : rgba(fInk === "#ffffff" ? "#ffffff" : brand.dark, 0.35); ctx.beginPath(); ctx.roundRect(dx + i * (dash + gap), footerY - 6, dash, 7, 4); ctx.fill(); }
  if (index < total - 1 && !center) { ctx.strokeStyle = fInk; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(W - M - 30, footerY - 3, 30, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(W - M - 42, footerY - 3); ctx.lineTo(W - M - 18, footerY - 3); ctx.moveTo(W - M - 28, footerY - 13); ctx.lineTo(W - M - 18, footerY - 3); ctx.lineTo(W - M - 28, footerY + 7); ctx.stroke(); }
  if (index === total - 1 && brand.handle) { ctx.font = bodyFont(28, 600); ctx.fillStyle = fInk; ctx.textAlign = center ? "center" : "right"; ctx.fillText(brand.handle, center ? W / 2 : W - M, center ? footerY - 34 : footerY + 6); }
}

/** Drive thumbnails have no CORS headers; this host serves the same file with them, which export needs. */
const exportUrl = (url: string) => { const m = /drive\.google\.com\/thumbnail\?id=([^&]+)/.exec(url); return m ? `https://lh3.googleusercontent.com/d/${m[1]}=w1600` : url; };
const cache = new Map<string, Promise<HTMLImageElement | null>>();
/** `forExport` asks for a CORS-clean copy so the canvas can be saved; the preview can use any image. */
export function loadImage(url: string, forExport = false): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  const key = (forExport ? "x:" : "p:") + url;
  if (!cache.has(key)) cache.set(key, new Promise(resolve => { const img = new Image(); if (forExport) img.crossOrigin = "anonymous"; else img.referrerPolicy = "no-referrer"; img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = forExport ? exportUrl(url) : url; }));
  return cache.get(key)!;
}

/** PNG at full size. `photoMissing` when the photo could not be loaded CORS-clean (exported without it). */
export async function renderPng(input: Omit<SlideInput, "img">, photo: string): Promise<{ blob: Blob; photoMissing: boolean }> {
  const { W, H } = sizeOf(input.look.ratio);
  const draw = (img: HTMLImageElement | null) => { const c = document.createElement("canvas"); c.width = W; c.height = H; drawSlide(c.getContext("2d")!, W, H, { ...input, img }); return new Promise<Blob | null>(r => { try { c.toBlob(r, "image/png"); } catch { r(null); } }); };
  const img = await loadImage(photo, true);
  const blob = await draw(img);
  if (blob) return { blob, photoMissing: !img };
  return { blob: (await draw(null))!, photoMissing: true };
}

/** Live preview: the same drawSlide, at half resolution for speed. */
export function SlideCanvas({ input, photo, className }: { input: Omit<SlideInput, "img">; photo: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => { let on = true; setImg(null); loadImage(photo).then(i => { if (on) setImg(i); }); return () => { on = false; }; }, [photo]);
  const { W, H } = sizeOf(input.look.ratio);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    c.width = W / 2; c.height = H / 2;
    const ctx = c.getContext("2d")!; ctx.setTransform(0.5, 0, 0, 0.5, 0, 0);
    drawSlide(ctx, W, H, { ...input, img });
  });
  return <canvas ref={ref} className={className} style={{ aspectRatio: `${W} / ${H}` }} aria-label={`Pratinjau slide ${input.index + 1}`} />;
}
