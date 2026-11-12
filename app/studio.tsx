"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Copy, Download, Film, Layers3, Play, Plus, Trash2 } from "lucide-react";
import { DriveBrowser } from "./assets";
import { enqueue } from "./agents";
import { askAI } from "./lib/ai";
import { guidebookName, isVideo, toSrt, videoGuidebook } from "./lib/flow";
import { parseLines } from "./lib/logic";
import { addApproval, useSettings, useStored, useTasks } from "./lib/store";
import { AiButton, AiError, notify, useAI } from "./modules";
import { patchItem, usePlan, type CampaignContent, type Scene } from "./plan-data";
import { SAMPLE_PHOTOS } from "./ui";

type Look = { template: "dark" | "light" | "bold"; ratio: "4:5" | "1:1" };
const TEMPLATES: { id: Look["template"]; name: string }[] = [{ id: "dark", name: "Editorial gelap" }, { id: "light", name: "Minimal terang" }, { id: "bold", name: "Bold ungu" }];
const SAMPLES = Object.values(SAMPLE_PHOTOS);
const copy = (text: string, what: string) => { navigator.clipboard?.writeText(text); notify(`${what} disalin.`); };
const saveFile = (blob: Blob, name: string) => { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); };
/** Drive thumbnails have no CORS headers; this host serves the same file with them, which canvas export needs. */
const exportUrl = (url: string) => { const m = /drive\.google\.com\/thumbnail\?id=([^&]+)/.exec(url); return m ? `https://lh3.googleusercontent.com/d/${m[1]}=w1600` : url; };

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => { const img = new Image(); img.crossOrigin = "anonymous"; img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = exportUrl(url); });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []; let line = "";
  for (const word of text.split(/\s+/)) { const next = line ? line + " " + word : word; if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = word; } else line = next; }
  if (line) lines.push(line);
  return lines;
}

/** Renders one slide to a 1080px-wide PNG. Returns false in `photoMissing` when the photo could not be loaded. */
async function renderSlide(scene: Scene, index: number, total: number, look: Look, handle: string): Promise<{ blob: Blob; photoMissing: boolean }> {
  const W = 1080, H = look.ratio === "1:1" ? 1080 : 1350;
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const img = await loadImage(scene.image || SAMPLES[index % SAMPLES.length]);
  ctx.fillStyle = look.template === "light" ? "#EDE9F5" : "#1B1235"; ctx.fillRect(0, 0, W, H);
  if (img) { const s = Math.max(W / img.width, H / img.height); ctx.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s); }
  const g = ctx.createLinearGradient(0, 0, 0, H);
  const [top, mid, bottom] = look.template === "light" ? ["rgba(255,255,255,.92)", "rgba(255,255,255,.15)", "rgba(255,255,255,.94)"] : look.template === "bold" ? ["rgba(106,63,208,.88)", "rgba(106,63,208,.2)", "rgba(60,30,140,.94)"] : ["rgba(20,12,45,.6)", "rgba(20,12,45,.05)", "rgba(20,12,45,.9)"];
  g.addColorStop(0, top); g.addColorStop(0.45, mid); g.addColorStop(1, bottom); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = look.template === "light" ? "#1D1733" : "#FFFFFF"; ctx.textBaseline = "top";
  ctx.font = "700 34px 'DM Sans', Arial, sans-serif"; ctx.fillText("FORIOR", 72, 72);
  ctx.font = "500 30px 'DM Sans', Arial, sans-serif"; const count = `${index + 1} / ${total}`; ctx.fillText(count, W - 72 - ctx.measureText(count).width, 74);
  ctx.font = `700 ${look.template === "bold" ? 84 : 76}px 'DM Sans', Arial, sans-serif`;
  const lines = wrap(ctx, scene.text || scene.label, W - 144).slice(0, 6), lh = look.template === "bold" ? 96 : 88;
  let y = H - 150 - lines.length * lh; for (const l of lines) { ctx.fillText(l, 72, y); y += lh; }
  ctx.font = "500 30px 'DM Sans', Arial, sans-serif"; ctx.fillText(handle + (index < total - 1 ? "  ·  geser →" : ""), 72, H - 104);
  try { const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/png")); if (blob) return { blob, photoMissing: !img }; } catch { /* tainted canvas: fall through and redraw without the photo */ }
  return renderSlide({ ...scene, image: "data:," }, index, total, look, handle);
}

export function StudioPage({ target, onOpenPlan }: { target: { campaignId: string; day: number } | null; onOpenPlan: () => void }) {
  const [plan] = usePlan();
  const [settings] = useSettings();
  const [tasks] = useTasks();
  const [campaignId, setCampaignId] = useState(target?.campaignId ?? plan.campaigns[0]?.id ?? "");
  const [day, setDay] = useState(target?.day ?? 1);
  useEffect(() => { if (target) { setCampaignId(target.campaignId); setDay(target.day); } }, [target]);
  const campaign = plan.campaigns.find(c => c.id === campaignId) ?? plan.campaigns[0];
  const item = campaign?.items.find(x => x.day === day) ?? campaign?.items[0];
  const [look, setLook] = useStored<Look>(`look:${campaign?.id}:${item?.day}`, { template: "dark", ratio: "4:5" });
  const [index, setIndex] = useState(0);
  const [tab, setTab] = useState("Isi");
  const [picking, setPicking] = useState(false);
  const [exporting, setExporting] = useState(false);
  const ai = useAI();
  if (!campaign || !item) return <div className="module-page f-page"><p className="x-empty">Belum ada campaign. Buat di Content Plan.</p></div>;

  const board = item.board ?? [];
  const video = isVideo(item.format);
  const set = (patch: Partial<CampaignContent>) => patchItem(campaign.id, item.day, patch);
  const setBoard = (next: Scene[]) => set({ board: next, scenes: next.map(s => `${s.label}: ${s.visual}`) });
  const i = Math.min(index, Math.max(0, board.length - 1));
  const scene = board[i];
  const edit = (patch: Partial<Scene>) => setBoard(board.map((s, n) => (n === i ? { ...s, ...patch } : s)));
  const working = tasks.some(t => t.campaignId === campaign.id && t.day === item.day && (t.status === "queued" || t.status === "running"));
  const photos = [...(item.assets ?? []).filter(a => a.kind === "Foto").map(a => a.thumb), ...SAMPLES];
  const photoOf = (s: Scene, n: number) => s.image || photos[n % photos.length];
  const submit = () => { addApproval({ ref: { campaignId: campaign.id, day: item.day }, title: `${item.format} — ${item.title}`, by: video ? "Video Editor" : "Graphic Designer", type: `${campaign.account} · hasil produksi`, body: `${board.map(s => `• ${s.label} — ${s.text || s.visual}`).join("\n")}\n\nCaption:\n${item.caption}\n\n${item.hashtags ?? ""}` }); set({ status: "Draft" }); notify("Hasil produksi masuk ke antrean approval."); };
  const exportSlides = async (all: boolean) => {
    setExporting(true); let missing = 0;
    try { for (const n of all ? board.map((_, k) => k) : [i]) { const { blob, photoMissing } = await renderSlide({ ...board[n], image: photoOf(board[n], n) }, n, board.length, look, settings.handle); if (photoMissing) missing++; saveFile(blob, `${item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${String(n + 1).padStart(2, "0")}.png`); } }
    finally { setExporting(false); }
    notify(missing ? `${missing} slide diekspor tanpa foto karena foto tidak bisa dimuat untuk ekspor. Unduh fotonya dari Drive lalu tempel manual.` : all ? "Semua slide diekspor sebagai PNG." : "Slide diekspor sebagai PNG.");
  };
  const rewrite = () => ai.run("slide", async () => { const t = await askAI({ tier: "light", role: "Content Writer", label: "Pertajam teks slide", maxTokens: 200, prompt: `Konten: ${item.title}. Hook: ${item.hook}\nTulis ulang teks untuk ${scene.label} agar lebih tajam, maksimal 12 kata. Teks sekarang: "${scene.text}". Konteks visual: ${scene.visual}. Balas hanya teksnya.` }); edit({ text: parseLines(t)[0] || scene.text }); });
  const tabs = video ? ["Isi", "Naskah", "Paket produksi", "Claude Code", "Caption"] : ["Isi", "Desain", "Caption"];
  const guidebook = () => videoGuidebook(campaign, item, { name: settings.brandName, handle: settings.handle });
  const overlay = look.template === "light" ? "linear-gradient(180deg,rgba(255,255,255,.92),rgba(255,255,255,.15) 45%,rgba(255,255,255,.94))" : look.template === "bold" ? "linear-gradient(180deg,rgba(106,63,208,.88),rgba(106,63,208,.2) 45%,rgba(60,30,140,.94))" : "linear-gradient(180deg,rgba(20,12,45,.6),rgba(20,12,45,.05) 45%,rgba(20,12,45,.9))";

  return <div className="module-page f-page">
    <section className="panel f-project">
      <div className="settings-field"><label htmlFor="st-camp">CAMPAIGN</label><select id="st-camp" value={campaign.id} onChange={e => { setCampaignId(e.target.value); setDay(1); setIndex(0); }}>{plan.campaigns.map(c => <option key={c.id} value={c.id}>{c.account} — {c.name}</option>)}</select></div>
      <div className="settings-field"><label htmlFor="st-item">KONTEN</label><select id="st-item" value={item.day} onChange={e => { setDay(Number(e.target.value)); setIndex(0); }}>{campaign.items.map(x => <option key={x.day} value={x.day}>{String(x.day).padStart(2, "0")} · {x.format} · {x.title}</option>)}</select></div>
      <div className="x-row"><span className="muted-chip">{video ? <Film size={14} /> : <Layers3 size={14} />} {item.format} · {board.length} {video ? "scene" : "slide"}</span><button className="outline-button" onClick={onOpenPlan}>Buka brief</button><button className="primary-button" onClick={submit} disabled={!board.length}><Check size={15} /> Ajukan approval</button></div>
    </section>

    {!board.length ? <section className="panel f-emptyboard"><h3>Konten ini belum punya storyboard</h3><p>Studio bekerja dari storyboard di brief. Minta agen menulisnya, atau mulai dari {video ? "scene" : "slide"} kosong.</p><div className="x-row"><button className="primary-button" onClick={() => enqueue(campaign.id, item.day, false, "brief")} disabled={working}><Play size={15} /> {working ? "Agen sedang menulis…" : "Minta agen menulis brief + storyboard"}</button><button className="outline-button" onClick={() => setBoard([{ label: video ? "0-3 dtk" : "Slide 1", visual: "", text: item.title, audio: "" }])}><Plus size={15} /> Mulai manual</button></div></section>
    : <div className="f-studio">
      <aside className="panel f-slides" aria-label={video ? "Daftar scene" : "Daftar slide"}>{board.map((s, n) => <button key={n} className={n === i ? "active" : ""} onClick={() => setIndex(n)}>{!video && <span className="f-slide-thumb" style={{ backgroundImage: `url("${photoOf(s, n)}")` }} />}<span><b>{s.label}</b><small>{s.text || s.visual || "—"}</small></span></button>)}<button className="f-add" onClick={() => { setBoard([...board, { label: video ? `Scene ${board.length + 1}` : `Slide ${board.length + 1}`, visual: "", text: "", audio: "" }]); setIndex(board.length); }}><Plus size={15} /> Tambah</button></aside>

      <section className="panel f-stage">
        {video ? <div className="f-phone"><div className="f-phone-screen" style={{ backgroundImage: `url("${photoOf(scene, i)}")` }}><div style={{ background: overlay }}><b>FORIOR</b><div><strong>{scene.text || "Teks layar"}</strong><small>{scene.label}</small></div></div></div></div>
        : <div className={`f-canvas ${look.ratio === "1:1" ? "square" : ""} ${look.template}`} style={{ backgroundImage: `url("${photoOf(scene, i)}")` }}><div style={{ background: overlay }}><div className="f-canvas-top"><b>FORIOR</b><span>{i + 1} / {board.length}</span></div><div><strong>{scene.text || scene.label}</strong><small>{settings.handle}{i < board.length - 1 ? " · geser →" : ""}</small></div></div></div>}
        <div className="f-stage-nav"><button className="outline-button" onClick={() => setIndex(Math.max(0, i - 1))} disabled={i === 0} aria-label="Sebelumnya"><ArrowLeft size={16} /></button><span>{i + 1} / {board.length}</span><button className="outline-button" onClick={() => setIndex(Math.min(board.length - 1, i + 1))} disabled={i === board.length - 1} aria-label="Berikutnya"><ArrowRight size={16} /></button></div>
        {!video && <div className="x-row f-center"><button className="outline-button" onClick={() => exportSlides(false)} disabled={exporting}><Download size={15} /> PNG slide ini</button><button className="primary-button" onClick={() => exportSlides(true)} disabled={exporting}><Download size={15} /> {exporting ? "Mengekspor…" : "PNG semua slide"}</button></div>}
        {video && <p className="x-empty f-center-text">Pratinjau storyboard. Render video dikerjakan di aplikasi edit Anda dengan paket produksi di samping.</p>}
      </section>

      <aside className="panel f-inspector">
        <div className="f-chips" role="tablist">{tabs.map(t => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>)}</div>
        {tab === "Isi" && <>
          <div className="f-field"><label htmlFor="sc-label">{video ? "DURASI / LABEL" : "LABEL"}</label><input id="sc-label" value={scene.label} onChange={e => edit({ label: e.target.value })} /></div>
          <div className="f-field"><label htmlFor="sc-text">{video ? "TEKS LAYAR / NARASI" : "TEKS PADA SLIDE"}</label><textarea id="sc-text" rows={3} value={scene.text} onChange={e => edit({ text: e.target.value })} /></div>
          <div className="f-field"><label htmlFor="sc-visual">{video ? "ARAHAN SHOT" : "FOTO / KOMPOSISI"}</label><textarea id="sc-visual" rows={2} value={scene.visual} onChange={e => edit({ visual: e.target.value })} /></div>
          {video && <div className="f-field"><label htmlFor="sc-audio">AUDIO</label><input id="sc-audio" value={scene.audio} onChange={e => edit({ audio: e.target.value })} /></div>}
          <div className="x-row"><AiButton className="outline-button" label="Pertajam teks" busy={ai.busy === "slide"} onClick={rewrite} /><button className="outline-button x-danger" onClick={() => { setBoard(board.filter((_, n) => n !== i)); setIndex(Math.max(0, i - 1)); }} disabled={board.length < 2}><Trash2 size={14} /> Hapus</button></div><AiError message={ai.error} />
          <label className="f-label">FOTO {video ? "REFERENSI" : "SLIDE"}</label>
          <div className="f-photos">{photos.slice(0, 8).map(p => <button key={p} className={photoOf(scene, i) === p ? "active" : ""} style={{ backgroundImage: `url("${p}")` }} aria-label="Pakai foto ini" onClick={() => edit({ image: p })} />)}</div>
          <button className="outline-button" onClick={() => setPicking(!picking)}>{picking ? "Tutup Google Drive" : "Ambil dari Google Drive"}</button>
          {picking && <DriveBrowser pickLabel="Pakai" onPick={ref => { edit({ image: ref.thumb }); set({ assets: [...(item.assets ?? []).filter(a => a.id !== ref.id), ref] }); }} />}
        </>}
        {tab === "Desain" && <>
          <label className="f-label">TEMPLATE</label><div className="f-options">{TEMPLATES.map(t => <button key={t.id} className={look.template === t.id ? "active" : ""} onClick={() => setLook(o => ({ ...o, template: t.id }))}>{t.name}</button>)}</div>
          <label className="f-label">RASIO</label><div className="f-options">{(["4:5", "1:1"] as const).map(r => <button key={r} className={look.ratio === r ? "active" : ""} onClick={() => setLook(o => ({ ...o, ratio: r }))}>{r === "4:5" ? "4:5 · 1080×1350" : "1:1 · 1080×1080"}</button>)}</div>
          <p className="x-empty">Foto Anda dipakai apa adanya. Template hanya mengatur lapisan warna dan teks.</p>
        </>}
        {tab === "Claude Code" && <>
          <p className="f-help">Render video di komputer Anda dengan <b>Claude Code + Remotion</b>, memakai langganan Claude Pro (tanpa token API aplikasi ini).</p>
          <ol className="f-steps"><li>Unduh guidebook di bawah dan simpan sebagai <code>guidebook.md</code> di folder proyek.</li><li>Taruh klip di <code>footage/</code>, foto di <code>photos/</code>, musik/voice-over di <code>audio/</code>. Urutkan nama file sesuai scene (01-, 02-, …).</li><li>Buka folder itu di Claude Code, lalu ketik: <i>“Ikuti guidebook.md dan buat videonya dengan Remotion.”</i></li><li>Hasil MP4 ada di <code>out/</code>. Lanjutkan ke Ajukan approval.</li></ol>
          {!board.length && <p className="x-error">Storyboard masih kosong. Isi dulu agar guidebook lengkap.</p>}
          <div className="x-row"><button className="primary-button" onClick={() => saveFile(new Blob([guidebook()], { type: "text/markdown" }), guidebookName(item))}><Download size={14} /> Unduh guidebook.md</button><button className="outline-button" onClick={() => copy(guidebook(), "Guidebook")}><Copy size={14} /> Salin isi</button></div>
          {!item.production && <p className="x-empty">Tips: minta “Paket produksi” dulu agar guidebook berisi shot list dan urutan edit.</p>}
        </>}
        {tab === "Naskah" && <>
          <pre className="x-output">{board.map(s => `[${s.label}] ${s.text}`).join("\n")}</pre>
          <div className="x-row"><button className="outline-button" onClick={() => copy(board.map(s => s.text).filter(Boolean).join("\n"), "Naskah")}><Copy size={14} /> Salin naskah</button><button className="outline-button" onClick={() => saveFile(new Blob([toSrt(board)], { type: "text/plain" }), "subtitle.srt")}><Download size={14} /> Subtitle .srt</button></div>
        </>}
        {tab === "Paket produksi" && <>
          {item.production ? <pre className="x-output">{item.production}</pre> : <p className="x-empty">Belum ada. Minta Video Editor menyusun shot list, urutan edit, dan saran audio.</p>}
          <div className="x-row"><button className="primary-button" disabled={working} onClick={() => { set({ production: "" }); enqueue(campaign.id, item.day, false, "production"); }}><Play size={15} /> {working ? "Agen bekerja…" : item.production ? "Susun ulang" : "Minta paket produksi"}</button>{item.production && <button className="outline-button" onClick={() => copy(item.production!, "Paket produksi")}><Copy size={14} /> Salin</button>}</div>
        </>}
        {tab === "Caption" && <>
          <div className="f-field"><label htmlFor="st-cap">CAPTION</label><textarea id="st-cap" rows={6} value={item.caption} onChange={e => set({ caption: e.target.value })} /></div>
          <div className="f-field"><label htmlFor="st-tags">HASHTAG</label><textarea id="st-tags" rows={2} value={item.hashtags ?? ""} onChange={e => set({ hashtags: e.target.value })} /></div>
          {item.schedule && <p className="x-quote">Usulan jadwal: {item.schedule}</p>}
          <div className="x-row"><button className="outline-button" onClick={() => copy(`${item.caption}\n\n${item.hashtags ?? ""}`.trim(), "Caption")}><Copy size={14} /> Salin caption + hashtag</button><button className="outline-button" disabled={working} onClick={() => { set({ schedule: "" }); enqueue(campaign.id, item.day, false, "publish"); }}><Play size={14} /> Minta SMM merapikan</button></div>
        </>}
      </aside>
    </div>}
  </div>;
}
