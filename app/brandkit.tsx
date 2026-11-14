"use client";

// Brand Kit per client: identity, colors and voice. Saved in the plan (per workspace), used by the AI prompts
// (flow.ts kitLines) and by the carousel editor (slide.tsx brandOf).
import { useState } from "react";
import { Palette, Pencil, X } from "lucide-react";
import { useSettings } from "./lib/store";
import type { BrandKit } from "./plan-data";
import { SlideCanvas, brandOf, normalizeLook } from "./slide";
import { SAMPLE_PHOTOS } from "./ui";

const filled = (k?: BrandKit) => !!k && Object.values(k).some(v => typeof v === "string" && v.trim());
const COLOR = /^#[0-9a-f]{6}$/i;

export function BrandKitModal({ account, kit, onSave, onClose }: { account: string; kit?: BrandKit; onSave: (k: BrandKit) => void; onClose: () => void }) {
  const [settings] = useSettings();
  const [d, setD] = useState<BrandKit>({ font: "serif", ...kit });
  const set = (patch: Partial<BrandKit>) => setD(o => ({ ...o, ...patch }));
  const brand = brandOf(account, d, settings);
  const text = (key: keyof BrandKit, label: string, placeholder: string, rows = 2) => <div className="settings-field cp-wide"><label htmlFor={`bk-${key}`}>{label}</label><textarea id={`bk-${key}`} rows={rows} maxLength={400} value={(d[key] as string) ?? ""} onChange={e => set({ [key]: e.target.value })} placeholder={placeholder} /></div>;
  const color = (key: "accent" | "dark" | "light", label: string, def: string) => <label className="bk-color"><input type="color" value={COLOR.test(d[key] ?? "") ? d[key] : def} onChange={e => set({ [key]: e.target.value })} aria-label={label} /><span><b>{label}</b><small>{(d[key] || def).toUpperCase()}</small></span></label>;
  const save = () => { const clean: BrandKit = {}; for (const [k, v] of Object.entries(d)) if (typeof v === "string" && v.trim()) (clean as Record<string, string>)[k] = v.trim(); onSave(clean); };
  return <div className="modal-backdrop" onClick={onClose}><div className="quick-modal cp-modal bk-modal" role="dialog" aria-label={`Brand Kit ${account}`} onClick={e => e.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Tutup"><X size={18} /></button>
    <div className="cp-modal-head"><span className="modal-icon"><Palette size={21} /></span><div><h2>Brand Kit · {account}</h2><p>Dipakai AI saat menulis judul, brief, dan caption, dan oleh editor carousel untuk warna dan nama brand.</p></div></div>
    <div className="bk-body">
      <div className="cp-form">
        <div className="settings-field"><label htmlFor="bk-name">NAMA DI DESAIN</label><input id="bk-name" value={d.name ?? ""} maxLength={40} onChange={e => set({ name: e.target.value })} placeholder={account} /></div>
        <div className="settings-field"><label htmlFor="bk-handle">AKUN SOSMED</label><input id="bk-handle" value={d.handle ?? ""} maxLength={40} onChange={e => set({ handle: e.target.value })} placeholder="@intragamavilla" /></div>
        <div className="settings-field cp-wide"><label>WARNA</label><div className="bk-colors">{color("accent", "Aksen", "#7c4de2")}{color("dark", "Gelap", "#1b1235")}{color("light", "Terang", "#f4f0ea")}</div></div>
        <div className="settings-field cp-wide"><label>FONT JUDUL</label><div className="f-options">{(["serif", "sans"] as const).map(f => <button key={f} className={d.font === f ? "active" : ""} onClick={() => set({ font: f })} style={{ fontFamily: f === "serif" ? "Georgia, serif" : "inherit" }}>{f === "serif" ? "Serif elegan" : "Sans modern"}</button>)}</div></div>
        {text("tone", "TONE OF VOICE", "Hangat, premium, santai. Pakai “kamu”.")}
        {text("audience", "TARGET AUDIENS", "Keluarga muda Jakarta 28–45, suka staycation akhir pekan.")}
        {text("pillars", "PILAR KONTEN", "Room tour, fasilitas, staycation, lifestyle, promo")}
        {text("references", "REFERENSI VISUAL", "Natural light, warna hangat, golden hour, komposisi lega.")}
        {text("dos", "LAKUKAN", "Tampilkan view dan suasana; CTA ke WhatsApp.")}
        {text("donts", "HINDARI", "Clickbait, harga coret, foto gelap.")}
      </div>
      <aside className="bk-preview"><label>PRATINJAU</label>
        <SlideCanvas className="bk-canvas" input={{ scene: { label: "", visual: "", audio: "", text: "5 Fasilitas Favorit", sub: "Bikin staycation bareng keluarga makin seru." }, index: 0, total: 5, look: normalizeLook({ tone: "dark" }, brand), brand }} photo={SAMPLE_PHOTOS.villa} />
        <SlideCanvas className="bk-canvas" input={{ scene: { label: "", visual: "", audio: "", text: "Private pool", sub: "Kolam renang pribadi dengan view gunung." }, index: 1, total: 5, look: normalizeLook({ template: "split", tone: "brand" }, brand), brand }} photo={SAMPLE_PHOTOS.living} />
      </aside>
    </div>
    <div className="cp-modal-actions"><button className="outline-button" onClick={onClose}>Batal</button><button className="primary-button" onClick={save}>Simpan Brand Kit</button></div>
  </div></div>;
}

/** Compact summary in the Content Plan side panel. */
export function BrandKitCard({ account, kit, onEdit }: { account: string; kit?: BrandKit; onEdit: () => void }) {
  const pillars = (kit?.pillars ?? "").split(/[,\n]/).map(p => p.trim()).filter(Boolean).slice(0, 6);
  return <section className="panel cx-batch bk-card">
    <h4><Palette size={16} /> Brand Kit · {account}<button className="cx-link" onClick={onEdit}><Pencil size={12} /> {filled(kit) ? "Edit" : "Isi"}</button></h4>
    {filled(kit) ? <>
      <div className="bk-swatches">{[kit?.accent ?? "#7c4de2", kit?.dark ?? "#1b1235", kit?.light ?? "#f4f0ea"].map((c, i) => <i key={i} style={{ background: c }} />)}<span>{kit?.font === "sans" ? "Sans modern" : "Serif elegan"}{kit?.handle ? ` · ${kit.handle}` : ""}</span></div>
      {kit?.tone && <p className="cx-note">{kit.tone}</p>}
      {pillars.length > 0 && <div className="bk-pills">{pillars.map(p => <em key={p}>{p}</em>)}</div>}
    </> : <p className="cx-hint">Belum diisi. Isi tone, pilar, warna, dan do&apos;s &amp; don&apos;ts supaya hasil AI dan desain konsisten untuk {account}.</p>}
  </section>;
}
