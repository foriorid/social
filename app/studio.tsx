"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Download, ChevronLeft, ChevronRight, Copy, FileText, Film, GripVertical, Layers3, Music, Play, Plus, Search, Sparkles, Trash2, Upload, X } from "lucide-react";

import { DriveBrowser } from "./assets";
import { enqueue } from "./agents";
import { askAI } from "./lib/ai";
import { STAGES, guidebookName, isVideo, stageOf, toSrt, videoGuidebook } from "./lib/flow";
import { parseLines } from "./lib/logic";
import { addApproval, useSettings, useStored, useTasks } from "./lib/store";
import { AiButton, AiError, notify, useAI } from "./modules";
import { patchItem, usePlan, type AssetRef, type CampaignContent, type CampaignData, type Scene } from "./plan-data";
import { ImageTile, SAMPLE_PHOTOS } from "./ui";
import { SlideCanvas, TEMPLATES, brandOf, normalizeLook, renderPng, type Look } from "./slide";

const SAMPLES = Object.values(SAMPLE_PHOTOS);
const copy = (text: string, what: string) => { navigator.clipboard?.writeText(text); notify(`${what} disalin.`); };
const saveFile = (blob: Blob, name: string) => { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); };

const coverOf = (c: CampaignData) => c.items.flatMap(x => x.assets ?? []).find(a => a.kind === "Foto")?.thumb ?? c.cover;
const progressOf = (c: CampaignData) => Math.round((c.items.filter(x => ["Terjadwal", "Dipublish"].includes(stageOf(x.status))).length / (c.target ?? 30)) * 100);
const pad = (n: number) => String(n).padStart(2, "0");
const STAGE_CLASS: Record<string, string> = { Brief: "cp-brief", Produksi: "cp-produksi", Draft: "cp-draft", Publish: "cp-publish" };

/** Modal for choosing the campaign to produce: search, account chips, active/archived tabs. */
function CampaignPicker({ campaigns, accounts, current, onPick, onClose }: { campaigns: CampaignData[]; accounts: string[]; current: string; onPick: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState(""), [account, setAccount] = useState(""), [archived, setArchived] = useState(false), [chosen, setChosen] = useState(current);
  const inTab = campaigns.filter(c => !!c.archived === archived);
  const shown = inTab.filter(c => (!account || c.account === account) && `${c.account} ${c.name}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="modal-backdrop" onClick={onClose}><div className="quick-modal st-picker" role="dialog" aria-label="Pilih Campaign" onClick={e => e.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Tutup"><X size={18} /></button>
    <div className="cp-modal-head"><span className="modal-icon"><Layers3 size={21} /></span><div><h2>Pilih Campaign</h2><p>Pilih campaign yang ingin diproduksi.</p></div></div>
    <div className="search-field"><Search size={15} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari campaign…" aria-label="Cari campaign" /></div>
    <div className="f-chips st-accounts">{["", ...accounts].map(a => <button key={a || "all"} className={account === a ? "active" : ""} onClick={() => setAccount(a)}>{a || "Semua akun"}</button>)}</div>
    <div className="st-tabs" role="tablist">{[false, true].map(a => <button key={String(a)} role="tab" aria-selected={archived === a} className={archived === a ? "active" : ""} onClick={() => setArchived(a)}>{a ? "Arsip" : "Aktif"} ({campaigns.filter(c => !!c.archived === a).length})</button>)}</div>
    <div className="st-list">{shown.map(c => { const pct = progressOf(c); return <button key={c.id} className={`st-camp ${chosen === c.id ? "active" : ""}`} onClick={() => setChosen(c.id)} onDoubleClick={() => onPick(c.id)}>
      <ImageTile kind={coverOf(c)} className="st-thumb" /><span className="st-camp-text"><b>{c.account} — {c.name}</b><small>{c.period} · {c.items.length} konten</small></span>
      <span className="st-bar"><i><em style={{ width: `${Math.min(100, pct)}%` }} /></i><small>{pct}%</small></span>
      <span className={`st-radio ${chosen === c.id ? "on" : ""} ${pct >= 100 ? "done" : ""}`}>{(chosen === c.id || pct >= 100) && <Check size={13} />}</span></button>; })}
      {!shown.length && <p className="x-empty">{archived ? "Belum ada campaign yang diarsipkan. Arsipkan lewat menu … di Content Plan." : "Tidak ada campaign yang cocok."}</p>}</div>
    <div className="cp-modal-actions"><button className="outline-button" onClick={onClose}>Batal</button><button className="primary-button" disabled={!campaigns.some(c => c.id === chosen)} onClick={() => onPick(chosen)}>Pilih Campaign</button></div>
  </div></div>;
}

/** Modal for choosing a content item, grouped by the four production stages. */
function ContentPicker({ campaign, current, onPick, onClose }: { campaign: CampaignData; current: number; onPick: (day: number) => void; onClose: () => void }) {
  const [query, setQuery] = useState(""), [format, setFormat] = useState(""), [stage, setStage] = useState(""), [chosen, setChosen] = useState(current);
  const shown = campaign.items.filter(x => (!format || x.format === format) && (!stage || stageOf(x.status) === stage) && x.title.toLowerCase().includes(query.toLowerCase()));
  return <div className="modal-backdrop" onClick={onClose}><div className="quick-modal st-picker st-picker-wide" role="dialog" aria-label="Pilih Konten" onClick={e => e.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Tutup"><X size={18} /></button>
    <div className="cp-modal-head"><span className="modal-icon"><Play size={21} /></span><div><h2>Pilih Konten</h2><p>Pilih konten dari campaign {campaign.account} — {campaign.name}.</p></div></div>
    <div className="st-filters"><div className="search-field"><Search size={15} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari judul konten…" aria-label="Cari judul konten" /></div>
      <select aria-label="Format" value={format} onChange={e => setFormat(e.target.value)}><option value="">Semua format</option>{["Reels", "Carousel", "Feed"].map(f => <option key={f}>{f}</option>)}</select>
      <select aria-label="Status" value={stage} onChange={e => setStage(e.target.value)}><option value="">Semua status</option>{STAGES.map(s => <option key={s}>{s}</option>)}</select></div>
    <div className="st-list st-groups">{STAGES.map(s => { const rows = shown.filter(x => stageOf(x.status) === s); return !rows.length ? null : <section key={s} className={STAGE_CLASS[s]}>
      <h3>{s} ({rows.length})</h3>
      {rows.map(x => <button key={x.day} className={`st-row ${chosen === x.day ? "active" : ""}`} onClick={() => setChosen(x.day)} onDoubleClick={() => onPick(x.day)}><span className="st-row-title">{pad(x.day)} · {x.title || "Tanpa judul"}</span><span className="st-tag">{x.format}</span><span className="st-tag st-stage">{s}</span><span className={`st-radio ${chosen === x.day ? "on" : ""}`}>{chosen === x.day && <Check size={13} />}</span></button>)}
    </section>; })}
      {!shown.length && <p className="x-empty">{campaign.items.length ? "Tidak ada konten yang cocok." : "Campaign ini belum punya konten. Tambahkan di Content Plan."}</p>}</div>
    <div className="cp-modal-actions"><button className="outline-button" onClick={onClose}>Batal</button><button className="primary-button" disabled={!campaign.items.some(x => x.day === chosen)} onClick={() => onPick(chosen)}>Pilih Konten</button></div>
  </div></div>;
}

export function StudioPage({ target, onOpenPlan, embedded }: { target: { campaignId: string; day: number } | null; onOpenPlan: (ref?: { campaignId: string; day: number }) => void; embedded?: boolean }) {
  const [plan] = usePlan();
  const [settings] = useSettings();
  const [tasks] = useTasks();
  const [folders] = useStored<{ id: string }[]>("driveFolders", []);
  const [campaignId, setCampaignId] = useState(target?.campaignId ?? plan.campaigns.find(c => !c.archived)?.id ?? plan.campaigns[0]?.id ?? "");
  const [day, setDay] = useState(target?.day ?? 1);
  useEffect(() => { if (target) { setCampaignId(target.campaignId); setDay(target.day); } }, [target]);
  const campaign = plan.campaigns.find(c => c.id === campaignId) ?? plan.campaigns[0];
  const item = campaign?.items.find(x => x.day === day) ?? campaign?.items[0];
  const [rawLook, setRawLook] = useStored<Partial<Look>>(`look:${campaign?.id}:${item?.day}`, {});
  const brand = brandOf(campaign?.account ?? "", plan.brandKits?.[campaign?.account ?? ""], settings);
  const look = normalizeLook(rawLook, brand);
  const setLook = (fn: (o: Look) => Look) => setRawLook(fn(look));
  const [index, setIndex] = useState(0);
  const [tab, setTab] = useState("Isi");
  const [picker, setPicker] = useState<"" | "campaign" | "content" | "drive">("");
  const [assetType, setAssetType] = useState("Semua"), [assetQuery, setAssetQuery] = useState("");
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const ai = useAI();
  const pickers = campaign && <>
    {picker === "campaign" && <CampaignPicker campaigns={plan.campaigns} accounts={plan.accounts} current={campaign.id} onClose={() => setPicker("")} onPick={id => { setCampaignId(id); setDay(plan.campaigns.find(c => c.id === id)?.items[0]?.day ?? 1); setIndex(0); setPicker("content"); }} />}
    {picker === "content" && <ContentPicker campaign={campaign} current={item?.day ?? 0} onClose={() => setPicker("")} onPick={d => { setDay(d); setIndex(0); setPicker(""); }} />}
  </>;
  if (!campaign) return <div className="module-page f-page"><p className="x-empty">Belum ada campaign. Buat di Content Plan.</p></div>;
  const pct = progressOf(campaign);
  const campaignButton = <button className="st-select st-select-camp" onClick={() => setPicker("campaign")} aria-label="Pilih batch"><ImageTile kind={coverOf(campaign)} className="st-select-thumb" /><span><b>{campaign.account} — {campaign.name}</b><small>{campaign.period} · {campaign.items.length} konten</small></span><em className="st-pct">{pct}%</em><ChevronDown size={18} /></button>;
  if (!item) return <div className="module-page f-page"><section className="panel st-top"><label>Batch</label>{campaignButton}</section><section className="panel f-emptyboard"><h3>Campaign ini belum punya konten</h3><p>Tambahkan konten di Content Plan, lalu kembali ke sini untuk produksi.</p><button className="primary-button" onClick={() => onOpenPlan()}>Buka Content Plan</button></section>{pickers}</div>;

  const board = item.board ?? [];
  const video = isVideo(item.format);
  const unit = video ? "scene" : "slide";
  const set = (patch: Partial<CampaignContent>) => patchItem(campaign.id, item.day, patch);
  const setBoard = (next: Scene[]) => set({ board: next, scenes: next.map(s => `${s.label}: ${s.visual}`) });
  const i = Math.min(index, Math.max(0, board.length - 1));
  const scene = board[i];
  const edit = (patch: Partial<Scene>) => setBoard(board.map((s, n) => (n === i ? { ...s, ...patch } : s)));
  const move = (from: number, to: number) => { if (from === to) return; const next = [...board]; const [s] = next.splice(from, 1); next.splice(to, 0, s); setBoard(next); setIndex(to); };
  const working = tasks.some(t => t.campaignId === campaign.id && t.day === item.day && (t.status === "queued" || t.status === "running"));
  const linked = item.assets ?? [];
  const samples: AssetRef[] = linked.some(a => a.kind === "Foto") ? [] : SAMPLES.map((u, n) => ({ id: `sample-${n}`, name: `Contoh ${n + 1}`, url: u, thumb: u, kind: "Foto" }));
  const photos = [...linked.filter(a => a.kind === "Foto").map(a => a.thumb), ...SAMPLES];
  const photoOf = (s: Scene, n: number) => s.image || photos[n % photos.length];
  const submit = () => { addApproval({ ref: { campaignId: campaign.id, day: item.day }, title: `${item.format} — ${item.title}`, by: video ? "Video Editor" : "Graphic Designer", type: `${campaign.account} · hasil produksi`, body: `${board.map(s => `• ${s.label} — ${s.text || s.visual}`).join("\n")}\n\nCaption:\n${item.caption}\n\n${item.hashtags ?? ""}` }); set({ status: "Review" }); notify("Hasil produksi masuk ke antrean approval."); };
  const exportSlides = async (all: boolean) => {
    setExporting(true); let missing = 0;
    try { for (const n of all ? board.map((_, k) => k) : [i]) { const { blob, photoMissing } = await renderPng({ scene: board[n], index: n, total: board.length, look, brand }, photoOf(board[n], n)); if (photoMissing) missing++; saveFile(blob, `${item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${pad(n + 1)}.png`); } }
    finally { setExporting(false); }
    notify(missing ? `${missing} slide diekspor tanpa foto karena foto tidak bisa dimuat untuk ekspor. Unduh fotonya dari Drive lalu tempel manual.` : all ? "Semua slide diekspor sebagai PNG." : "Slide diekspor sebagai PNG.");
  };
  const rewrite = () => ai.run("slide", async () => { const t = await askAI({ tier: "light", role: "Content Writer", label: "Pertajam teks slide", maxTokens: 200, prompt: `Konten: ${item.title}. Hook: ${item.hook}\nTulis ulang teks untuk ${scene.label} agar lebih tajam, maksimal 12 kata. Teks sekarang: "${scene.text}". Konteks visual: ${scene.visual}. Balas hanya teksnya.` }); edit({ text: parseLines(t)[0] || scene.text }); });
  const tabs = video ? ["Isi", "Naskah", "Paket Produksi", "AI Assist"] : ["Isi", "Desain", "Naskah", "AI Assist"];
  const activeTab = tabs.includes(tab) ? tab : "Isi";
  const tabIcon: Record<string, React.ReactNode> = { Isi: <Sparkles size={15} />, Naskah: <FileText size={15} />, "Paket Produksi": <Film size={15} />, Desain: <Layers3 size={15} />, "AI Assist": <Sparkles size={15} /> };
  const guidebook = () => videoGuidebook(campaign, item, { name: settings.brandName, handle: settings.handle });
  const overlay = look.tone === "light" ? "linear-gradient(180deg,rgba(255,255,255,.92),rgba(255,255,255,.15) 45%,rgba(255,255,255,.94))" : look.tone === "brand" ? "linear-gradient(180deg,rgba(106,63,208,.88),rgba(106,63,208,.2) 45%,rgba(60,30,140,.94))" : "linear-gradient(180deg,rgba(20,12,45,.6),rgba(20,12,45,.05) 45%,rgba(20,12,45,.9))";
  const link = (ref: AssetRef) => set({ assets: [...linked.filter(a => a.id !== ref.id), ref] });
  const useAsset = (a: AssetRef) => {
    if (!scene) return notify(`Buat ${unit} dulu, lalu pilih aset untuknya.`);
    if (a.kind === "Audio") edit({ audio: a.name }); else edit({ image: a.thumb });
    notify(`${a.name} dipakai di ${scene.label}.`);
  };
  const allAssets = [...linked, ...samples];
  const shownAssets = assetType === "Template" ? [] : allAssets.filter(a => (assetType === "Semua" || a.kind === assetType) && a.name.toLowerCase().includes(assetQuery.toLowerCase()));
  const uploadUrl = folders[0] ? `https://drive.google.com/drive/folders/${folders[0].id}` : "https://drive.google.com/drive/my-drive";

  return <div className={`module-page f-page st-page ${embedded ? "st-embedded" : ""}`}>
    {!embedded && <section className="panel st-top">
      <label>Batch</label>{campaignButton}
      <label>Konten</label>
      <button className="st-select" onClick={() => setPicker("content")} aria-label="Pilih konten"><span className="st-select-icon"><Play size={16} /></span><span><b>{pad(item.day)} · {item.title || "Tanpa judul"}</b><small>{item.format} · {board.length} {unit}</small></span><ChevronDown size={18} /></button>
      <div className="st-top-actions"><button className="outline-button" onClick={() => onOpenPlan({ campaignId: campaign.id, day: item.day })}><FileText size={15} /> Buka brief</button><button className="primary-button" onClick={submit} disabled={!board.length}><Check size={15} /> Ajukan approval</button></div>
    </section>}

    {!board.length ? <section className="panel f-emptyboard"><h3>Konten ini belum punya storyboard</h3><p>Studio bekerja dari storyboard di brief. Minta agen menulisnya, atau mulai dari {unit} kosong.</p><div className="x-row"><button className="primary-button" onClick={() => enqueue(campaign.id, item.day, false, "brief")} disabled={working}><Play size={15} /> {working ? "Agen sedang menulis…" : "Minta agen menulis brief + storyboard"}</button><button className="outline-button" onClick={() => setBoard([{ label: video ? "0-3 dtk" : "Slide 1", visual: "", text: item.title, audio: "" }])}><Plus size={15} /> Mulai manual</button></div></section>
    : <div className="st-grid">
      <aside className="panel st-scenes" aria-label={video ? "Daftar scene" : "Daftar slide"}>
        <div className="st-panel-head"><h3>{video ? "Scene / Segmen" : "Slide"}</h3><span className="muted-chip">{board.length} {unit}</span></div>
        <div className="st-scene-list">{board.map((s, n) => <div key={n} className={`st-scene ${n === i ? "active" : ""} ${dragFrom === n ? "dragging" : ""}`} draggable onDragStart={() => setDragFrom(n)} onDragEnd={() => setDragFrom(null)} onDragOver={e => e.preventDefault()} onDrop={() => { if (dragFrom !== null) move(dragFrom, n); setDragFrom(null); }}>
          <button className="st-scene-open" onClick={() => setIndex(n)}><span className="st-scene-thumb" style={{ backgroundImage: `url("${photoOf(s, n)}")` }} /><span className="st-scene-text"><b>{n + 1}. {s.visual ? s.visual.split(/[.,:;]/)[0].slice(0, 32) : s.label}</b><small>{s.label}{s.text ? ` · ${s.text}` : ""}</small></span></button>
          <span className="st-grip" title="Seret untuk mengurutkan"><GripVertical size={16} /></span>
        </div>)}</div>
        <button className="st-add" onClick={() => { setBoard([...board, { label: video ? `Scene ${board.length + 1}` : `Slide ${board.length + 1}`, visual: "", text: "", audio: "" }]); setIndex(board.length); }}><Plus size={16} /> Tambah {unit}</button>
      </aside>

      <section className="panel st-preview">
        <button className="st-nav" onClick={() => setIndex(Math.max(0, i - 1))} disabled={i === 0} aria-label="Sebelumnya"><ChevronLeft size={18} /></button>
        <div className="st-preview-body">
          {video ? <div className="f-phone"><div className="f-phone-screen" style={{ backgroundImage: `url("${photoOf(scene, i)}")` }}><div style={{ background: overlay }}><b>FORIOR</b><div><strong>{scene.text || "Teks layar"}</strong><small>{scene.label}</small><span className="st-progress"><i style={{ width: `${((i + 1) / board.length) * 100}%` }} /></span><small>{i + 1} / {board.length}</small></div></div></div></div>
          : <SlideCanvas className="st-slide" input={{ scene, index: i, total: board.length, look, brand }} photo={photoOf(scene, i)} />}
          {!video && <div className="x-row f-center"><button className="outline-button" onClick={() => exportSlides(false)} disabled={exporting}><Download size={15} /> PNG slide ini</button><button className="primary-button" onClick={() => exportSlides(true)} disabled={exporting}><Download size={15} /> {exporting ? "Mengekspor…" : "PNG semua"}</button></div>}
        </div>
        <button className="st-nav" onClick={() => setIndex(Math.min(board.length - 1, i + 1))} disabled={i === board.length - 1} aria-label="Berikutnya"><ChevronRight size={18} /></button>
      </section>

      <aside className="panel st-inspector">
        <div className="st-itabs" role="tablist">{tabs.map(t => <button key={t} role="tab" aria-selected={activeTab === t} className={activeTab === t ? "active" : ""} onClick={() => setTab(t)}>{tabIcon[t]} {t}</button>)}</div>
        {activeTab === "Isi" && <>
          <div className="f-field"><label htmlFor="sc-label">{video ? "Durasi / Label" : "Label"}</label><input id="sc-label" value={scene.label} onChange={e => edit({ label: e.target.value })} /></div>
          <div className="f-field"><label htmlFor="sc-text">{video ? "Teks Layar / Narasi" : "Teks pada slide"}</label><textarea id="sc-text" rows={2} value={scene.text} onChange={e => edit({ text: e.target.value })} /></div>
          {!video && <div className="f-field"><label htmlFor="sc-sub">Subjudul</label><textarea id="sc-sub" rows={2} value={scene.sub ?? ""} onChange={e => edit({ sub: e.target.value })} placeholder="Kalimat pendukung di bawah judul" /></div>}
          <div className="f-field"><label htmlFor="sc-visual">{video ? "Arahan Shot" : "Foto / Komposisi"}</label><textarea id="sc-visual" rows={2} value={scene.visual} onChange={e => edit({ visual: e.target.value })} /></div>
          {video && <div className="f-field"><label htmlFor="sc-audio">Audio</label><input id="sc-audio" value={scene.audio} onChange={e => edit({ audio: e.target.value })} /></div>}
          <div className="x-row"><AiButton className="outline-button st-ai" label="Pertajam teks" busy={ai.busy === "slide"} onClick={rewrite} /><button className="outline-button x-danger" onClick={() => { setBoard(board.filter((_, n) => n !== i)); setIndex(Math.max(0, i - 1)); }} disabled={board.length < 2}><Trash2 size={14} /> Hapus {unit}</button></div><AiError message={ai.error} />
        </>}
        {activeTab === "Desain" && <div className="st-design">
          <label className="f-label">TEMPLATE</label>
          <div className="st-tpls">{TEMPLATES.map(t => <button key={t.id} className={look.template === t.id ? "active" : ""} onClick={() => setLook(o => ({ ...o, template: t.id }))} title={t.hint}><SlideCanvas className="st-tpl-canvas" input={{ scene, index: i, total: board.length, look: { ...look, template: t.id, ratio: "4:5" }, brand }} photo={photoOf(scene, i)} /><span>{t.name}</span></button>)}</div>
          <label className="f-label">RASIO</label>
          <div className="f-options">{(["4:5", "1:1", "9:16"] as const).map(r => <button key={r} className={look.ratio === r ? "active" : ""} onClick={() => setLook(o => ({ ...o, ratio: r }))}>{r === "4:5" ? "4:5 Feed" : r === "1:1" ? "1:1 Square" : "9:16 Story"}</button>)}</div>
          <label className="f-label">WARNA</label>
          <div className="st-swatches">{([["dark", "Gelap", brand.dark], ["light", "Terang", brand.light], ["brand", "Brand", brand.accent]] as const).map(([v, l, c]) => <button key={v} className={look.tone === v ? "active" : ""} onClick={() => setLook(o => ({ ...o, tone: v }))}><i style={{ background: c }} />{l}</button>)}</div>
          <div className="st-two"><div><label className="f-label">FONT JUDUL</label><div className="f-options">{(["serif", "sans"] as const).map(f => <button key={f} className={look.font === f ? "active" : ""} onClick={() => setLook(o => ({ ...o, font: f }))} style={{ fontFamily: f === "serif" ? "Georgia, serif" : "inherit" }}>{f === "serif" ? "Serif" : "Sans"}</button>)}</div></div>
            <div><label className="f-label">PERATAAN</label><div className="f-options">{(["left", "center"] as const).map(a2 => <button key={a2} className={look.align === a2 ? "active" : ""} onClick={() => setLook(o => ({ ...o, align: a2 }))}>{a2 === "left" ? "Kiri" : "Tengah"}</button>)}</div></div></div>
          <label className="f-label" htmlFor="st-scale">UKURAN TEKS · {Math.round(look.scale * 100)}%</label>
          <input id="st-scale" type="range" min={0.7} max={1.4} step={0.05} value={look.scale} onChange={e => setLook(o => ({ ...o, scale: Number(e.target.value) }))} />
          <p className="x-empty">Warna dan nama brand diambil dari Brand Kit {campaign.account}. Ubah di Content Plan → klien → Brand Kit.</p>
        </div>}
        {activeTab === "Naskah" && <>
          <pre className="x-output">{board.map(s => `[${s.label}] ${s.text}`).join("\n")}</pre>
          <div className="x-row"><button className="outline-button" onClick={() => copy(board.map(s => s.text).filter(Boolean).join("\n"), "Naskah")}><Copy size={14} /> Salin naskah</button>{video && <button className="outline-button" onClick={() => saveFile(new Blob([toSrt(board)], { type: "text/plain" }), "subtitle.srt")}><Download size={14} /> Subtitle .srt</button>}</div>
          <div className="f-field"><label htmlFor="st-cap">Caption</label><textarea id="st-cap" rows={5} value={item.caption} onChange={e => set({ caption: e.target.value })} /></div>
          <div className="f-field"><label htmlFor="st-tags">Hashtag</label><textarea id="st-tags" rows={2} value={item.hashtags ?? ""} onChange={e => set({ hashtags: e.target.value })} /></div>
          {item.schedule && <p className="x-quote">Usulan jadwal: {item.schedule}</p>}
          <button className="outline-button" onClick={() => copy(`${item.caption}\n\n${item.hashtags ?? ""}`.trim(), "Caption")}><Copy size={14} /> Salin caption + hashtag</button>
        </>}
        {activeTab === "Paket Produksi" && <>
          {item.production ? <pre className="x-output">{item.production}</pre> : <p className="x-empty">Belum ada. Minta Video Editor menyusun shot list, urutan edit, dan saran audio (menu AI Assist).</p>}
          {item.production && <button className="outline-button" onClick={() => copy(item.production!, "Paket produksi")}><Copy size={14} /> Salin paket</button>}
          <label className="f-label">RENDER DENGAN CLAUDE CODE</label>
          <ol className="f-steps"><li>Unduh <code>guidebook.md</code> ke folder proyek.</li><li>Taruh klip di <code>footage/</code>, foto di <code>photos/</code>, audio di <code>audio/</code> (01-, 02-, … sesuai scene).</li><li>Di Claude Code ketik: <i>“Ikuti guidebook.md dan buat videonya dengan Remotion.”</i></li><li>Hasil MP4 di <code>out/</code>, lalu Ajukan approval.</li></ol>
          <div className="x-row"><button className="primary-button" onClick={() => saveFile(new Blob([guidebook()], { type: "text/markdown" }), guidebookName(item))}><Download size={14} /> Unduh guidebook.md</button><button className="outline-button" onClick={() => copy(guidebook(), "Guidebook")}><Copy size={14} /> Salin isi</button></div>
        </>}
        {activeTab === "AI Assist" && <div className="st-assist">
          <p className="f-help">Semua aksi AI hanya berjalan saat Anda klik, memakai mode hemat.</p>
          <button className="outline-button" disabled={ai.busy === "slide"} onClick={rewrite}><Sparkles size={15} /> Pertajam teks {scene.label} <small>±Rp 2</small></button>
          <button className="outline-button" disabled={working} onClick={() => enqueue(campaign.id, item.day, false, "brief")}><FileText size={15} /> Tulis ulang brief + storyboard <small>±Rp 9</small></button>
          {video && <button className="outline-button" disabled={working} onClick={() => { set({ production: "" }); enqueue(campaign.id, item.day, false, "production"); setTab("Paket Produksi"); }}><Film size={15} /> {item.production ? "Susun ulang" : "Minta"} paket produksi <small>±Rp 6</small></button>}
          <button className="outline-button" disabled={working} onClick={() => { set({ schedule: "" }); enqueue(campaign.id, item.day, false, "publish"); }}><Copy size={15} /> Rapikan caption + hashtag <small>±Rp 3</small></button>
          {working && <p className="x-empty">Agen sedang bekerja pada konten ini…</p>}<AiError message={ai.error} />
        </div>}
      </aside>
    </div>}

    <section className="panel st-assets">
      <div className="st-assets-head">
        <div><h3>Aset Produksi</h3><p>Pilih dan gunakan aset untuk {scene ? `${unit} “${scene.label}”` : `${unit} ini`}.</p></div>
        <div className="f-chips">{["Semua", "Foto", "Video", "Audio", ...(video ? [] : ["Template"])].map(t => <button key={t} className={assetType === t ? "active" : ""} onClick={() => setAssetType(t)}>{t}</button>)}</div>
        <div className="st-assets-tools"><div className="search-field"><Search size={15} /><input value={assetQuery} onChange={e => setAssetQuery(e.target.value)} placeholder="Cari aset…" aria-label="Cari aset" /></div><button className="outline-button" onClick={() => setPicker("drive")}><FolderIcon /> Drive</button><a className="primary-button" href={uploadUrl} target="_blank" rel="noreferrer" title="Unggah file ke folder Google Drive Anda"><Upload size={15} /> Upload</a></div>
      </div>
      <div className="st-asset-row">
        <button className="st-asset st-asset-add" onClick={() => setPicker("drive")}><Plus size={24} /><b>Tambah aset</b></button>
        {assetType === "Template" ? TEMPLATES.map(t => <button key={t.id} className={`st-asset st-template ${look.template === t.id ? "active" : ""}`} onClick={() => setLook(o => ({ ...o, template: t.id }))}><SlideCanvas className="st-tpl-canvas" input={{ scene: scene ?? { label: t.name, visual: "", text: t.name, audio: "" }, index: 0, total: Math.max(1, board.length), look: { ...look, template: t.id, ratio: "4:5" }, brand }} photo={scene ? photoOf(scene, i) : SAMPLES[0]} /><span>{t.name}</span></button>)
        : shownAssets.map(a => { const inUse = scene && (scene.image === a.thumb || scene.audio === a.name); return <div key={a.id} className={`st-asset ${inUse ? "active" : ""}`}>
          <button className="st-asset-use" onClick={() => useAsset(a)} title={`Pakai ${a.name}`}>{a.kind === "Audio" ? <span className="st-asset-audio"><Music size={26} /></span> : <img src={a.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />}<span className="st-asset-name">{a.kind === "Video" && <Film size={12} />} {a.name}</span></button>
          {!a.id.startsWith("sample-") && <button className="st-asset-x" aria-label={`Lepas ${a.name}`} onClick={() => set({ assets: linked.filter(x => x.id !== a.id) })}><X size={13} /></button>}
        </div>; })}
        {assetType !== "Template" && !shownAssets.length && <p className="x-empty">Belum ada aset {assetType === "Semua" ? "" : assetType.toLowerCase() + " "}untuk konten ini. Klik Tambah aset untuk memilih dari Google Drive.</p>}
      </div>
    </section>

    {pickers}
    {picker === "drive" && <div className="modal-backdrop" onClick={() => setPicker("")}><div className="quick-modal st-picker st-picker-wide" role="dialog" aria-label="Ambil dari Google Drive" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setPicker("")} aria-label="Tutup"><X size={18} /></button>
      <div className="cp-modal-head"><span className="modal-icon"><Upload size={21} /></span><div><h2>Ambil dari Google Drive</h2><p>Aset ditautkan ke konten ini{scene ? ` dan langsung dipakai di ${scene.label}` : ""}.</p></div></div>
      <DriveBrowser pickLabel="Pakai" onPick={ref => { link(ref); if (scene) useAsset(ref); }} />
    </div></div>}
  </div>;
}

function FolderIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="#0F9D58" d="M8 3h8l7 12h-8z" /><path fill="#4285F4" d="M23 15l-4 7H5l4-7z" /><path fill="#F4B400" d="M8 3L1 15l4 7 7-12z" /></svg>; }
