"use client";

// Campaign stock UI: link one Google Drive folder per campaign, index it, and pick or auto-fill scene pictures.
import { useState } from "react";
import { FolderOpen, Loader2, RefreshCw, Sparkles, Unlink } from "lucide-react";
import { driveThumb, indexStock } from "./assets";
import { driveFolderId } from "./lib/flow";
import { autoFill, rankFor, topTags, usageOf } from "./lib/stock";
import { notify } from "./modules";
import { patchCampaign, patchItem, type CampaignContent, type CampaignData, type Scene } from "./plan-data";

const when = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Side panel card: link / re-index the campaign's Drive stock folder. */
export function StockCard({ campaign }: { campaign: CampaignData }) {
  const stock = campaign.stock;
  const [url, setUrl] = useState(stock?.url ?? "");
  const [busy, setBusy] = useState<number | null>(null);
  const run = async (link: string) => {
    const id = driveFolderId(link);
    if (!id) return notify("Tempel link folder Google Drive, contoh: https://drive.google.com/drive/folders/…");
    setBusy(0);
    try {
      const files = await indexStock(id, n => setBusy(n));
      patchCampaign(campaign.id, c => ({ ...c, stock: { folderId: id, url: link.trim(), files, indexedAt: new Date().toISOString() } }));
      notify(files.length ? `${files.length} file stok terindeks.` : "Folder terbaca, tapi belum ada foto/video/audio di dalamnya.");
    } catch (e) { notify(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };
  const count = (k: string) => stock?.files.filter(f => f.kind === k).length ?? 0;
  return <div className="sk-card">
    <h4><FolderOpen size={16} /> Stok materi {stock && <button className="cx-link" onClick={() => run(stock.url)} disabled={busy !== null} aria-label="Indeks ulang"><RefreshCw size={13} /> Perbarui</button>}</h4>
    {busy !== null ? <p className="cx-hint"><Loader2 size={14} className="lg-spin" /> Membaca folder… {busy} file</p>
      : stock ? <>
        <div className="sk-counts"><span><b>{count("Foto")}</b> foto</span><span><b>{count("Video")}</b> video</span><span><b>{count("Audio")}</b> audio</span></div>
        <div className="bk-pills">{topTags(stock.files, 8).map(t => <em key={t.tag}>{t.tag} · {t.count}</em>)}</div>
        <p className="cx-hint">Diindeks {when(stock.indexedAt)} · <a href={stock.url} target="_blank" rel="noreferrer">Buka folder</a> · <button className="cx-link" onClick={() => { if (window.confirm("Lepas folder stok dari campaign ini? Gambar yang sudah dipakai di storyboard tetap ada.")) patchCampaign(campaign.id, c => ({ ...c, stock: undefined })); }}><Unlink size={12} /> Lepas</button></p>
      </>
      : <>
        <p className="cx-hint">Tautkan satu folder Drive berisi foto, video, dan audio campaign ini. Subfolder (mis. <i>Pool</i>, <i>Kitchen</i>, <i>Bedroom</i>) dipakai sebagai tag untuk mengisi storyboard otomatis.</p>
        <div className="sk-link"><input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" aria-label="Link folder Drive" /><button className="primary-button" onClick={() => run(url)}>Indeks</button></div>
      </>}
  </div>;
}

/** Fill every scene without a picture from the campaign stock. Returns how many were filled. */
export function fillFromStock(campaign: CampaignData, item: CampaignContent, force = false): number {
  const files = campaign.stock?.files ?? [];
  if (!files.length || !item.board?.length) return 0;
  const used = usageOf(campaign.items.filter(x => x.day !== item.day));
  const { board, filled } = autoFill(item.board, files, item.format === "Reels", id => driveThumb(id, 800), used, force);
  if (filled) patchItem(campaign.id, item.day, { board, scenes: board.map(s => `${s.label}: ${s.visual}`) });
  return filled;
}

/** Scene picture dropdown: best stock matches first, then the content's linked references. */
export function ScenePicker({ campaign, item, scene, onPick }: { campaign: CampaignData; item: CampaignContent; scene: Scene; onPick: (image: string | undefined, assetId: string | undefined) => void }) {
  const files = campaign.stock?.files ?? [];
  const refs = (item.assets ?? []).filter(a => a.kind === "Foto");
  if (!files.length && !refs.length) return null;
  const ranked = rankFor(scene, files, item.format === "Reels", usageOf(campaign.items)).slice(0, 15);
  const value = scene.assetId ? `s:${scene.assetId}` : scene.image ? `u:${scene.image}` : "";
  return <select aria-label={`Gambar ${scene.label}`} value={value} onChange={e => { const v = e.target.value; if (!v) return onPick(undefined, undefined); if (v.startsWith("s:")) { const id = v.slice(2); onPick(driveThumb(id, 800), id); } else onPick(v.slice(2), undefined); }}>
    <option value="">Tanpa gambar</option>
    {ranked.length > 0 && <optgroup label="Stok campaign (paling cocok)">{ranked.map(f => <option key={f.id} value={`s:${f.id}`}>{f.kind === "Video" ? "▶ " : ""}{f.path ? `${f.path} / ` : ""}{f.name}</option>)}</optgroup>}
    {refs.length > 0 && <optgroup label="Referensi konten">{refs.map(a => <option key={a.id} value={`u:${a.thumb}`}>{a.name}</option>)}</optgroup>}
    {value.startsWith("u:") && !refs.some(a => `u:${a.thumb}` === value) && <option value={value}>Gambar saat ini</option>}
  </select>;
}

export function FillButton({ campaign, item }: { campaign: CampaignData; item: CampaignContent }) {
  if (!item.board?.length) return null;
  if (!campaign.stock?.files.length) return <span className="cx-hint">Tautkan folder stok di panel campaign untuk isi gambar otomatis.</span>;
  const empty = item.board.filter(s => !s.image).length;
  return <button className="outline-button" onClick={() => {
    if (!empty && !window.confirm("Semua scene sudah bergambar. Pilih ulang semuanya dari stok?")) return;
    const n = fillFromStock(campaign, item, !empty);
    notify(n ? `${n} scene diisi dari stok.` : "Tidak ada stok yang cocok. Coba tambah subfolder atau tag di nama file.");
  }}><Sparkles size={14} /> {empty ? `Isi ${empty} scene dari stok` : "Pilih ulang dari stok"}</button>;
}
