"use client";

// Content Plan: pick a client and a batch, see its content as a calendar, timeline or list, and open one
// content item into Brief / Storyboard / Desain. Clients are plan.accounts and batches are plan.campaigns.
import { useState } from "react";
import { ArrowLeft, Palette, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clapperboard, Clock, Code2, Copy, FileText, Film, Image as ImageIcon, Layers3, List, MoreHorizontal, Pencil, Play, Plus, Printer, Search, Send, Share2, Sparkles, Trash2, Users, X, Zap } from "lucide-react";
import { DriveBrowser } from "./assets";
import { enqueue, enqueueCampaign } from "./agents";
import { KIND_LABEL, PIPELINE, STAGES, clock, dateOf, isVideo, monthGrid, nextStep, sceneTimes, secOf, stageKey, stageOf, type Stage } from "./lib/flow";
import { addApproval, useIdeas, useStored, useTasks, writeStored, type Task } from "./lib/store";
import { notify, useAiReady } from "./modules";
import { campaignHtml, defaultKind, patchCampaign, patchItem, storyboardHtml, usePlan, type CampaignContent, type CampaignData, type CampaignKind, type Scene } from "./plan-data";
import { BrandKitCard, BrandKitModal } from "./brandkit";
import { CLIENT_LABEL, ClientFeedback, ReviewPanel, clientStatusOf, useReviewLink } from "./review";
import { StudioPage } from "./studio";
import { ImageTile } from "./ui";

const dropTasks = (match: (t: Task) => boolean) => writeStored<Task[]>("tasks", old => old.filter(t => !match(t)), []);
const pad = (n: number) => String(n).padStart(2, "0");
const FORMATS: CampaignContent["format"][] = ["Reels", "Carousel", "Feed"];
const FORMAT_ICON = { Reels: Play, Carousel: Layers3, Feed: ImageIcon } as const;
const GOALS = ["Awareness & engagement", "Lead generation", "Bookings", "Sales conversion"];
/** Ready-made carousel structures (label, title, subtitle); text is a starting point to edit. */
const SLIDE_PRESETS: { name: string; hint: string; slides: [string, string, string][] }[] = [
  { name: "Facilities Highlight", hint: "fitur unggulan berurutan", slides: [["Cover", "5 Fasilitas Favorit", "Yang bikin tamu betah"], ["Fasilitas 1", "Private Pool", "Kolam renang pribadi"], ["Fasilitas 2", "Ruang Keluarga", "Luas untuk kumpul"], ["Fasilitas 3", "Dapur Lengkap", "Siap masak bersama"], ["Fasilitas 4", "Playroom", "Anak-anak senang"], ["Penutup", "Cek tanggal tersedia", "DM atau klik link di bio"]] },
  { name: "Room Tour", hint: "tur ruang demi ruang", slides: [["Cover", "Room Tour", "Lihat setiap sudutnya"], ["Living", "Living Room", ""], ["Dining", "Dining Area", ""], ["Kamar", "Master Bedroom", ""], ["Kamar mandi", "Bathroom", ""], ["Outdoor", "Outdoor & View", ""], ["Penutup", "Siap menginap?", "Booking sekarang"]] },
  { name: "Tips & Insight", hint: "edukasi bernomor", slides: [["Cover", "4 Tips Staycation Hemat", "Simpan untuk liburan berikutnya"], ["Tip 1", "Pilih hari kerja", ""], ["Tip 2", "Ajak rombongan", ""], ["Tip 3", "Masak sendiri", ""], ["Tip 4", "Booking jauh hari", ""], ["Penutup", "Mau coba?", "Tanya tanggal kosong"]] },
  { name: "Promo & Offer", hint: "penawaran + CTA", slides: [["Cover", "Promo Akhir Tahun", "Terbatas"], ["Penawaran", "Diskon menginap", "Syarat berlaku"], ["Benefit", "Gratis sarapan", ""], ["Penutup", "Klaim sekarang", "DM kami"]] },
  { name: "Lifestyle & Experience", hint: "suasana & momen", slides: [["Cover", "Slow Morning", "Satu hari di villa"], ["Pagi", "Kopi dengan view", ""], ["Siang", "Berenang santai", ""], ["Malam", "BBQ bersama", ""], ["Penutup", "Rencanakan momenmu", ""]] }
];
const DAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const targetOf = (c: CampaignData) => c.target ?? 30;
const thumbOf = (x: CampaignContent, c: CampaignData) => x.assets?.find(a => a.kind === "Foto")?.thumb ?? x.board?.find(s => s.image)?.image ?? c.cover;
const coverOf = (c: CampaignData) => c.items.flatMap(x => x.assets ?? []).find(a => a.kind === "Foto")?.thumb ?? c.cover;
const shortDate = (iso: string | null) => { if (!iso) return "Belum dijadwalkan"; const d = new Date(iso + "T00:00:00"); return `${DAYS[(d.getDay() + 6) % 7]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const longDate = (iso?: string) => { if (!iso) return ""; const d = new Date(iso + "T00:00:00"); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const periodOf = (start?: string, end?: string, fallback = "") => (start && end ? `${longDate(start)} – ${longDate(end)}` : fallback);
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

type Ref = { campaignId: string; day: number };
type Row = { c: CampaignData; x: CampaignContent };

function Fmt({ f }: { f: CampaignContent["format"] }) { const I = FORMAT_ICON[f]; return <em className={`cx-fmt cx-f-${f.toLowerCase()}`}><I size={13} /> {f}</em>; }
function StagePill({ s }: { s: Stage }) { return <em className={`cx-stage cx-s-${stageKey(s)}`}>{s}</em>; }

function Field({ label, value, onChange, rows = 2, placeholder }: { label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  const id = "f-" + label.replace(/\W+/g, "-").toLowerCase();
  return <div className="cx-field"><label htmlFor={id}>{label}</label><textarea id={id} rows={rows} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} /></div>;
}

/** Popover dropdown with a search box; used for client and batch. */
function Picker({ label, icon, children, open, onToggle, wide }: { label: React.ReactNode; icon?: React.ReactNode; children: React.ReactNode; open: boolean; onToggle: () => void; wide?: boolean }) {
  return <div className="cx-picker">
    <button className={`cx-picker-btn ${wide ? "wide" : ""}`} aria-expanded={open} onClick={onToggle}>{icon}<span>{label}</span><ChevronDown size={16} /></button>
    {open && <><div className="cx-scrim" onClick={onToggle} /><div className="cx-pop">{children}</div></>}
  </div>;
}

/** Brief, storyboard and design for one content item, as a full page. */
function ContentDetail({ campaign, item, onBack, onOpenStudio }: { campaign: CampaignData; item: CampaignContent; onBack: () => void; onOpenStudio: () => void }) {
  const [tab, setTab] = useStored<"Brief" | "Storyboard" | "Desain">("cxTab", "Brief");
  const [tasks] = useTasks();
  const [ideas, setIdeas] = useIdeas();
  const [picking, setPicking] = useState(false);
  const [mode, setMode] = useState<"ai" | "manual">(item.board?.length ? "manual" : "ai");
  const [menu, setMenu] = useState<number | "head" | null>(null);
  const ready = useAiReady();
  const review = useReviewLink(campaign.id);
  const set = (patch: Partial<CampaignContent>) => patchItem(campaign.id, item.day, patch);
  const board = item.board ?? [];
  const setBoard = (next: Scene[]) => set({ board: next, scenes: next.map(s => `${s.label}: ${s.visual}`) });
  const editScene = (i: number, patch: Partial<Scene>) => setBoard(board.map((s, n) => (n === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= board.length) return; const next = [...board]; [next[i], next[j]] = [next[j], next[i]]; setBoard(next); setMenu(null); };
  const video = isVideo(item.format);
  const unit = video ? "scene" : "slide";
  const times = sceneTimes(board);
  const total = times.at(-1)?.end ?? 0;
  const mine = tasks.filter(t => t.campaignId === campaign.id && t.day === item.day);
  const active = mine.find(t => t.status === "queued" || t.status === "running");
  const failed = mine.find(t => t.status === "failed");
  const step = nextStep(item);
  const stepInfo = step ? PIPELINE.find(s => s.kind === step) : null;
  const photos = (item.assets ?? []).filter(a => a.kind === "Foto");
  const stage = stageOf(item.status);

  const generate = () => {
    if (!ready) return notify("Isi API key di Settings → AI & Models dulu.");
    if (board.length && !window.confirm("Storyboard, hook, dan caption yang sekarang akan diganti hasil AI. Lanjutkan?")) return;
    if (!enqueue(campaign.id, item.day, false, "brief")) return notify("Agen sedang mengerjakan konten ini.");
    notify("Agen menulis brief + storyboard (±Rp 9). Hasilnya muncul di sini.");
  };
  const addScene = () => setBoard([...board, { label: video ? `Scene ${board.length + 1}` : board.length ? `Slide ${board.length + 1}` : "Cover", visual: "", text: "", audio: "", ...(video ? { sec: 4 } : {}) }]);
  const shotlist = () => board.map((s, i) => `${pad(i + 1)}. ${s.label}${video ? ` (${clock(times[i].start)}–${clock(times[i].end)})` : ""} — ${s.visual}${s.text ? ` | Teks: ${s.text}` : ""}${s.audio ? ` | ${s.audio}` : ""}`).join("\n");
  const copy = (text: string, what: string) => navigator.clipboard?.writeText(text).then(() => notify(`${what} disalin.`), () => notify("Browser menolak menyalin. Salin manual."));
  const print = () => { const w = window.open("", "_blank"); if (!w) return notify("Izinkan pop-up untuk mencetak PDF."); w.document.open(); w.document.write(storyboardHtml(campaign, item)); w.document.close(); w.onload = () => w.print(); };
  const submit = () => {
    addApproval({ ref: { campaignId: campaign.id, day: item.day }, title: `${item.format} — ${item.title}`, by: "Content Plan", type: `${campaign.account} · diajukan untuk review`, body: `Hook: ${item.hook}\n\nStoryboard:\n${shotlist()}\n\nCaption:\n${item.caption}\n\n${item.hashtags ?? ""}` });
    set({ status: "Review" }); notify("Konten diajukan ke Approval.");
  };

  return <div className="cx-detail">
    <nav className="cx-crumbs"><button onClick={onBack}><ArrowLeft size={16} /> Content Plan</button><ChevronRight size={14} /><span>{campaign.account}</span><ChevronRight size={14} /><span>{campaign.name}</span></nav>
    <header className="panel cx-dhead">
      <ImageTile kind={thumbOf(item, campaign)} className="cx-dthumb" />
      <div className="cx-dtitle">
        <div className="cx-row"><Fmt f={item.format} /><span className="cx-num">#{pad(item.day)}</span></div>
        <input aria-label="Judul konten" value={item.title} onChange={e => set({ title: e.target.value, untitled: false })} />
        <div className="cx-meta">
          <label><CalendarDays size={15} /><input type="date" aria-label="Tanggal tayang" value={dateOf(item) ?? ""} onChange={e => set({ publishOn: e.target.value, publishDate: e.target.value ? longDate(e.target.value) : "" })} /></label>
          <span><Users size={15} /> {campaign.account}</span>
          <span><Layers3 size={15} /> {campaign.name}</span>
          {video && total > 0 && <span><Clock size={15} /> ± {total} detik</span>}
        </div>
      </div>
      <div className="cx-dactions">
        <select className={`cx-stage-select cx-s-${stageKey(stage)}`} aria-label="Status" value={stage} onChange={e => set({ status: e.target.value })}>{STAGES.map(s => <option key={s}>{s}</option>)}</select>
        <button className="primary-button" onClick={submit} disabled={stage === "Review"}><Send size={15} /> {stage === "Review" ? "Menunggu review" : "Ajukan review"}</button>
        <div className="cx-menu-wrap"><button className="outline-button" aria-label="Aksi lain" onClick={() => setMenu(menu === "head" ? null : "head")}><MoreHorizontal size={16} /></button>
          {menu === "head" && <div className="floating-menu cx-menu"><button onClick={() => { setMenu(null); copy(`${item.caption}\n\n${item.hashtags ?? ""}`.trim(), "Caption"); }}>Salin caption + hashtag<Copy size={14} /></button><button className="x-danger" onClick={() => { if (!window.confirm(`Hapus konten “${item.title}”? Brief dan storyboard-nya ikut terhapus.`)) return; patchCampaign(campaign.id, c => ({ ...c, items: c.items.filter(x => x.day !== item.day) })); dropTasks(t => t.campaignId === campaign.id && t.day === item.day); onBack(); }}>Hapus konten<Trash2 size={14} /></button></div>}</div>
      </div>
    </header>

    <div className="cx-tabs" role="tablist">{(["Brief", "Storyboard", "Desain"] as const).map(t => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t === "Brief" ? <FileText size={15} /> : t === "Storyboard" ? <Clapperboard size={15} /> : <Pencil size={15} />} {t}{t === "Storyboard" && board.length ? <small>{board.length}</small> : null}</button>)}</div>

    {(active || failed || (stepInfo && tab === "Brief")) && <section className={`cx-agent ${failed && !active ? "bad" : ""}`}>
      <Sparkles size={18} /><div><b>{active ? `${active.agent} — ${active.status === "running" ? "sedang mengerjakan" : "dalam antrean"}` : failed ? "Agen gagal" : `Langkah berikut: ${stepInfo!.output}`}</b><small>{active ? "Hasil muncul di halaman ini otomatis." : failed ? failed.error : stepInfo!.job}</small></div>
      {!active && step && <button className="outline-button" onClick={() => (step === "brief" ? generate() : enqueue(campaign.id, item.day, true))}><Play size={14} /> Jalankan agen</button>}
    </section>}

    {tab === "Brief" && <div className="cx-brief">
      <section className="panel cx-card">
        <div className="cx-card-head"><h3><FileText size={18} /> Detail Brief</h3><select aria-label="Format" value={item.format} onChange={e => set({ format: e.target.value as CampaignContent["format"] })}>{FORMATS.map(f => <option key={f}>{f}</option>)}</select></div>
        <div className="cx-grid2">
          <Field label="Tujuan" value={item.goal} onChange={v => set({ goal: v })} />
          <Field label="Pesan utama" value={item.message ?? ""} onChange={v => set({ message: v })} placeholder="Satu kalimat yang harus diingat audiens" />
          <Field label="Hook pembuka" value={item.hook} onChange={v => set({ hook: v })} />
          <Field label="Ajakan (CTA)" value={item.cta} onChange={v => set({ cta: v })} />
        </div>
        <Field label="Arah visual" value={item.visualDirection} onChange={v => set({ visualDirection: v })} rows={3} />
        <Field label="Caption" value={item.caption} onChange={v => set({ caption: v })} rows={5} />
        <div className="cx-grid2"><Field label="Hashtag" value={item.hashtags ?? ""} onChange={v => set({ hashtags: v })} rows={2} placeholder="#fotointerior #propertijakarta" /><Field label="Pilar konten" value={item.pillar} onChange={v => set({ pillar: v })} rows={2} /></div>
      </section>
      <aside className="cx-side-stack">
        <ClientFeedback day={item.day} review={review} boardLabels={board.map(s => s.label)} extra={clientStatusOf(review.row, item.day) === "approved" && !["Terjadwal", "Dipublish"].includes(stage) ? <button className="outline-button" onClick={() => set({ status: "Terjadwal" })}><Check size={14} /> Tandai Terjadwal</button> : null} />
        <section className="panel cx-card">
          <div className="cx-card-head"><h3><ImageIcon size={18} /> Referensi</h3><button className="outline-button" onClick={() => setPicking(!picking)}>{picking ? "Tutup" : <><Plus size={14} /> Drive</>}</button></div>
          {item.assets?.length ? <div className="cx-refs">{item.assets.map(a => <div key={a.id}><a href={a.url} target="_blank" rel="noreferrer"><img src={a.thumb} alt={a.name} referrerPolicy="no-referrer" /></a><button aria-label={`Lepas ${a.name}`} onClick={() => set({ assets: item.assets!.filter(x => x.id !== a.id) })}><X size={13} /></button></div>)}</div> : <p className="x-empty">Belum ada foto referensi. Tautkan dari Google Drive.</p>}
          {picking && <DriveBrowser pickLabel="Tautkan" onPick={ref => { set({ assets: [...(item.assets ?? []).filter(a => a.id !== ref.id), ref] }); notify(`${ref.name} ditautkan.`); }} />}
        </section>
        <section className="panel cx-card cx-notes">
          <div className="cx-card-head"><h3><Clapperboard size={18} /> Catatan Produksi</h3></div>
          <Field label="Kebutuhan aset" value={item.assetNeeds ?? ""} onChange={v => set({ assetNeeds: v })} rows={2} placeholder="Foto / footage yang perlu disiapkan" />
          <Field label="Catatan untuk tim" value={item.production ?? ""} onChange={v => set({ production: v })} rows={4} placeholder="Gimbal, golden hour, teks maks 4 kata per scene…" />
          {item.schedule && <p className="cx-hint"><Clock size={14} /> Usulan jadwal: {item.schedule}</p>}
        </section>
        {ideas.length > 0 && <section className="panel cx-card"><div className="cx-card-head"><h3><Sparkles size={18} /> Inbox ide</h3></div>{ideas.slice(0, 4).map(idea => <div className="cx-idea" key={idea}><span>{idea}</span><button className="outline-button" onClick={() => { set({ title: idea, untitled: false, board: [], production: "", schedule: "", status: "Draft" }); setIdeas(old => old.filter(x => x !== idea)); }}>Pakai</button></div>)}</section>}
      </aside>
    </div>}

    {tab === "Storyboard" && <div className="cx-sb">
      <aside className="panel cx-card cx-sb-maker">
        <h3><Sparkles size={18} /> Buat Storyboard</h3>
        <div className="cx-seg" role="group" aria-label="Cara membuat"><button className={mode === "ai" ? "active" : ""} onClick={() => setMode("ai")}>Generate by AI</button><button className={mode === "manual" ? "active" : ""} onClick={() => setMode("manual")}>Buat Manual</button></div>
        {mode === "ai" ? <>
          <div className="cx-field"><label htmlFor="sb-concept">Deskripsikan {video ? "video" : "konten"} yang diinginkan</label><textarea id="sb-concept" rows={5} maxLength={500} value={item.concept ?? ""} onChange={e => set({ concept: e.target.value })} placeholder={video ? "Room tour villa, fokus living & pool, gaya cinematic, untuk staycation keluarga." : "5 fasilitas favorit villa: pool, billiard, sauna, playroom, dapur."} /><small>{(item.concept ?? "").length} / 500</small></div>
          <div className="cx-sb-settings">
            <label>Format<select value={item.format} onChange={e => set({ format: e.target.value as CampaignContent["format"] })}>{FORMATS.map(f => <option key={f}>{f}</option>)}</select></label>
            {video && <label>Durasi<select value={item.duration ?? "± 30 detik"} onChange={e => set({ duration: e.target.value })}>{["± 15 detik", "± 30 detik", "± 45 detik", "± 60 detik"].map(d => <option key={d}>{d}</option>)}</select></label>}
            <label>Gaya<select value={item.style ?? "Cinematic"} onChange={e => set({ style: e.target.value })}>{["Cinematic", "Natural", "Energetic", "Minimalis", "Edukatif"].map(d => <option key={d}>{d}</option>)}</select></label>
          </div>
          {photos.length > 0 && <div className="cx-field"><label>Referensi ({photos.length})</label><div className="cx-refs small">{photos.slice(0, 4).map(a => <img key={a.id} src={a.thumb} alt={a.name} referrerPolicy="no-referrer" />)}</div></div>}
          <button className="primary-button cx-wide" onClick={generate} disabled={!!active}><Sparkles size={16} /> {active ? "Agen sedang menulis…" : board.length ? "Generate ulang" : "Generate Storyboard"}</button>
          <p className="cx-hint">Satu panggilan AI (±Rp 9) menulis brief, {unit}, caption, dan hashtag sekaligus.</p>
        </> : <>
          <p className="cx-hint">Tambah, ubah, dan urutkan {unit} langsung di kartu. {video ? "Durasi tiap scene menyusun timeline otomatis." : "Urutan kartu = urutan slide."}</p>
          <button className="primary-button cx-wide" onClick={addScene}><Plus size={16} /> Tambah {unit}</button>
          {!video && <div className="cx-field"><label>Mulai dari struktur slide</label><div className="cx-presets">{SLIDE_PRESETS.map(pr => <button key={pr.name} onClick={() => { if (board.length && !window.confirm(`Ganti ${board.length} slide yang ada dengan struktur “${pr.name}”?`)) return; setBoard(pr.slides.map(([label, text, sub]) => ({ label, text, sub, visual: "", audio: "" }))); }}><b>{pr.name}</b><small>{pr.slides.length} slide · {pr.hint}</small></button>)}</div></div>}
        </>}
      </aside>

      <section className="cx-sb-main">
        <div className="cx-sb-head"><h3><Clapperboard size={18} /> Storyboard <span>({board.length} {unit})</span></h3><div className="cx-row">{video && total > 0 && <span className="cx-chip">Total ± {total} detik</span>}<button className="outline-button" onClick={addScene}><Plus size={14} /> Tambah {unit}</button></div></div>
        {(review.row?.feedback[String(item.day)]?.comments ?? []).some(c => c.scene !== undefined) && <ClientFeedback day={item.day} review={review} boardLabels={board.map(s => s.label)} />}
        {!board.length ? <div className="panel cx-empty"><Clapperboard size={28} /><h3>Belum ada storyboard</h3><p>Generate dengan AI dari deskripsi di kiri, atau mulai manual.</p></div>
          : <ol className={`cx-scenes ${video ? "v" : "s"}`}>{board.map((s, i) => <li key={i} className="panel cx-scene">
            <div className="cx-scene-img" style={s.image ? { backgroundImage: `url("${s.image}")` } : undefined}>
              <b>{pad(i + 1)}</b>{video && <span><Play size={11} /> {clock(times[i].start)} – {clock(times[i].end)}</span>}
              {photos.length > 0 && <select aria-label={`Foto ${s.label}`} value={s.image ?? ""} onChange={e => editScene(i, { image: e.target.value || undefined })}><option value="">Pilih foto…</option>{photos.map(a => <option key={a.id} value={a.thumb}>{a.name}</option>)}</select>}
            </div>
            <div className="cx-scene-body">
              <div className="cx-scene-top"><input aria-label={`Nama ${unit} ${i + 1}`} value={s.label} onChange={e => editScene(i, { label: e.target.value })} />{video && <label className="cx-sec"><input type="number" min={1} max={60} aria-label={`Durasi ${s.label}`} value={secOf(s)} onChange={e => editScene(i, { sec: Math.max(1, Number(e.target.value) || 1) })} />dtk</label>}
                <div className="cx-menu-wrap"><button className="cx-icon" aria-label={`Menu ${s.label}`} onClick={() => setMenu(menu === i ? null : i)}><MoreHorizontal size={16} /></button>{menu === i && <div className="floating-menu cx-menu"><button onClick={() => move(i, -1)} disabled={i === 0}>Geser ke kiri<ChevronLeft size={14} /></button><button onClick={() => move(i, 1)} disabled={i === board.length - 1}>Geser ke kanan<ChevronRight size={14} /></button><button className="x-danger" onClick={() => { setBoard(board.filter((_, n) => n !== i)); setMenu(null); }}>Hapus {unit}<Trash2 size={14} /></button></div>}</div></div>
              <label className="cx-line"><Film size={14} /><textarea rows={2} aria-label={`Shot ${s.label}`} placeholder={video ? "Shot & gerakan kamera" : "Foto / komposisi"} value={s.visual} onChange={e => editScene(i, { visual: e.target.value })} /></label>
              <label className="cx-line"><b>T</b><textarea rows={2} aria-label={`Teks ${s.label}`} placeholder="Teks di layar" value={s.text} onChange={e => editScene(i, { text: e.target.value })} /></label>
              {!video && <label className="cx-line"><span>Sub</span><textarea rows={2} aria-label={`Subjudul ${s.label}`} placeholder="Subjudul" value={s.sub ?? ""} onChange={e => editScene(i, { sub: e.target.value })} /></label>}
              {video && <label className="cx-line"><span>VO</span><textarea rows={2} aria-label={`VO ${s.label}`} placeholder="Voice over / musik" value={s.audio} onChange={e => editScene(i, { audio: e.target.value })} /></label>}
              <label className="cx-line"><Pencil size={14} /><textarea rows={2} aria-label={`Catatan ${s.label}`} placeholder="Catatan" value={s.note ?? ""} onChange={e => editScene(i, { note: e.target.value })} /></label>
            </div>
          </li>)}</ol>}
        {board.length > 0 && <section className="panel cx-output">
          {video && <div className="cx-flow" aria-label="Alur durasi">{board.map((s, i) => <span key={i} style={{ flexGrow: secOf(s) }} title={s.label}><b>{pad(i + 1)}</b><small>{secOf(s)}s</small></span>)}</div>}
          <div className="cx-row cx-output-actions"><b>Output & lanjutan</b><button className="outline-button" onClick={() => copy(shotlist(), "Shotlist")}><Copy size={14} /> Salin shotlist</button><button className="outline-button" onClick={print}><Printer size={14} /> PDF storyboard</button><button className="primary-button" onClick={() => setTab("Desain")}><Pencil size={14} /> Lanjut ke Desain</button></div>
        </section>}
      </section>
    </div>}

    {tab === "Desain" && <div className="cx-design"><StudioPage target={{ campaignId: campaign.id, day: item.day }} embedded onOpenPlan={() => setTab("Brief")} /><p className="cx-hint">Butuh layar lebih luas? <button className="cx-link" onClick={onOpenStudio}>Buka di Production Studio</button></p></div>}
  </div>;
}

const blankForm = { account: "", name: "", start: "", end: "", goal: GOALS[0], kind: "" as CampaignKind | "", brief: "", target: 15 };

export function ContentPlanPage({ onOpenStudio, onShare }: { onOpenStudio: (campaignId: string, day: number) => void; onShare: (data: CampaignData) => void }) {
  const [plan, setPlan] = usePlan();
  const [tasks] = useTasks();
  const ready = useAiReady();
  const [client, setClient] = useStored("cpClient", "");
  const [batchId, setBatchId] = useStored("cpBatch", "");
  const [view, setView] = useStored<"Kalender" | "Timeline" | "List">("cpView", "Kalender");
  const [open, setOpen] = useState<Ref | null>(null);
  const [pop, setPop] = useState<"" | "client" | "batch" | "ai">("");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<"" | "batch" | "content" | "client" | "rename" | "brand">("");
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(blankForm);
  const [draft, setDraft] = useState({ title: "", format: "Reels" as CampaignContent["format"], date: "", batch: "" });
  const [fmt, setFmt] = useState(""), [stageFilter, setStageFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const now = new Date();
  const [month, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const review = useReviewLink(batchId || undefined);

  const clientValid = !client || plan.accounts.includes(client);
  const activeClient = clientValid ? client : "";
  const batches = plan.campaigns.filter(c => (!activeClient || c.account === activeClient) && (showArchived || !c.archived));
  const batch = batches.find(c => c.id === batchId) ?? null;
  const scope = batch ? [batch] : batches;
  const rows: Row[] = scope.flatMap(c => c.items.map(x => ({ c, x })));
  const shown = rows.filter(({ x }) => (!fmt || x.format === fmt) && (!stageFilter || stageOf(x.status) === stageFilter));
  const busy = new Set(tasks.filter(t => t.status === "queued" || t.status === "running").map(t => `${t.campaignId}:${t.day}`));
  const openCampaign = plan.campaigns.find(c => c.id === open?.campaignId);
  const openItem = openCampaign?.items.find(x => x.day === open?.day);
  const count = (s: Stage, list = rows) => list.filter(r => stageOf(r.x.status) === s).length;
  const done = count("Terjadwal") + count("Dipublish");

  if (openCampaign && openItem) return <div className="module-page cx"><ContentDetail campaign={openCampaign} item={openItem} onBack={() => setOpen(null)} onOpenStudio={() => onOpenStudio(openCampaign.id, openItem.day)} /></div>;

  const pickClient = (a: string) => { setClient(a); setBatchId(""); setPop(""); setQ(""); };
  const pickBatch = (id: string) => { setBatchId(id); setPop(""); setQ(""); const c = plan.campaigns.find(x => x.id === id); const first = c?.start ?? c?.items.map(dateOf).filter(Boolean).sort()[0]; if (first) setMonth({ y: Number(first.slice(0, 4)), m: Number(first.slice(5, 7)) - 1 }); };
  const openNewBatch = () => { setEditing(null); setForm({ ...blankForm, account: activeClient || plan.accounts[0] || "" }); setModal("batch"); setPop(""); };
  const openEditBatch = (c: CampaignData) => { setEditing(c.id); setForm({ account: c.account, name: c.name, start: c.start ?? "", end: c.end ?? "", goal: c.goal, kind: c.kind ?? "", brief: c.brief ?? "", target: targetOf(c) }); setModal("batch"); };
  const saveBatch = () => {
    if (!form.account.trim() || !form.name.trim()) return notify("Isi klien dan nama batch.");
    if (form.start && form.end && form.end < form.start) return notify("Tanggal selesai harus setelah tanggal mulai.");
    const account = form.account.trim();
    const fields = { account, name: form.name.trim(), start: form.start || undefined, end: form.end || undefined, period: periodOf(form.start, form.end, "-"), goal: form.goal, kind: form.kind || defaultKind(account), brief: form.brief.trim(), target: Math.max(1, form.target) };
    if (editing) { patchCampaign(editing, c => ({ ...c, ...fields, period: periodOf(form.start, form.end, c.period) })); notify("Batch disimpan."); }
    else { const id = "c" + Date.now(); setPlan(o => ({ ...o, accounts: o.accounts.includes(account) ? o.accounts : [...o.accounts, account], campaigns: [{ id, cover: "living", items: [], ...fields }, ...o.campaigns] })); setClient(account); setBatchId(id); if (form.start) setMonth({ y: Number(form.start.slice(0, 4)), m: Number(form.start.slice(5, 7)) - 1 }); notify("Batch dibuat. Tambahkan konten atau minta AI mengusulkan judul."); }
    setModal("");
  };
  const deleteBatch = (c: CampaignData) => {
    if (!window.confirm(`Hapus batch “${c.name}” beserta ${c.items.length} kontennya? Tindakan ini tidak bisa dibatalkan.`)) return;
    setPlan(o => ({ ...o, campaigns: o.campaigns.filter(x => x.id !== c.id) })); dropTasks(t => t.campaignId === c.id); setBatchId(""); setModal(""); notify("Batch dihapus.");
  };
  const openNewContent = (date = "") => { if (!scope.length) return openNewBatch(); setDraft({ title: "", format: "Reels", date, batch: batch?.id ?? scope[0].id }); setModal("content"); };
  const addContent = () => {
    const c = plan.campaigns.find(x => x.id === draft.batch);
    if (!c || !draft.title.trim()) return notify("Isi judul konten.");
    const day = Math.max(0, ...c.items.map(x => x.day)) + 1;
    patchCampaign(c.id, old => ({ ...old, items: [...old.items, { day, date: draft.date ? longDate(draft.date) : "Belum dijadwalkan", publishOn: draft.date || undefined, publishDate: draft.date ? longDate(draft.date) : "", title: draft.title.trim(), format: draft.format, pillar: "", status: "Draft", goal: old.goal, hook: "", caption: "", visualDirection: "", cta: "", scenes: [] }] }));
    setModal(""); setOpen({ campaignId: c.id, day });
  };
  const suggestTitles = (c: CampaignData, n = 5) => {
    setPop("");
    if (!ready) return notify("Isi API key di Settings → AI & Models dulu.");
    const start = Math.max(0, ...c.items.map(x => x.day));
    patchCampaign(c.id, x => ({ ...x, items: [...x.items, ...Array.from({ length: n }, (_, i) => ({ day: start + i + 1, date: "Belum dijadwalkan", publishDate: "", title: `Konten ${start + i + 1} — menunggu judul`, untitled: true, format: "Reels" as const, pillar: "", status: "Draft", goal: x.goal, hook: "", caption: "", visualDirection: "", cta: "", scenes: [] }))] }));
    enqueue(c.id, 0, false, "plan"); notify(`Strategist mengusulkan ${n} judul (±Rp 5). Edit atau hapus yang tidak cocok.`);
  };
  const printBatch = (d: CampaignData) => { const w = window.open("", "_blank"); if (!w) return notify("Izinkan pop-up untuk mencetak PDF."); w.document.open(); w.document.write(campaignHtml(d)); w.document.close(); w.onload = () => w.print(); };
  const downloadBatch = (d: CampaignData) => { const url = URL.createObjectURL(new Blob([campaignHtml(d)], { type: "text/html;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-content-plan.html"; a.click(); URL.revokeObjectURL(url); };
  const addClient = () => { const n = form.account.trim(); if (!n) return; if (plan.accounts.includes(n)) return notify("Klien itu sudah ada."); setPlan(o => ({ ...o, accounts: [...o.accounts, n] })); pickClient(n); setModal(""); };
  const renameClient = () => { const from = activeClient, to = form.account.trim(); if (!to || to === from) return setModal(""); if (plan.accounts.includes(to)) return notify("Nama klien itu sudah ada."); setPlan(o => { const kits = { ...o.brandKits }; if (kits[from]) { kits[to] = kits[from]; delete kits[from]; } return { ...o, brandKits: kits, accounts: o.accounts.map(a => (a === from ? to : a)), campaigns: o.campaigns.map(c => (c.account === from ? { ...c, account: to } : c)) }; }); setClient(to); setModal(""); };
  const deleteClient = () => { const name = activeClient, owned = plan.campaigns.filter(c => c.account === name); if (!window.confirm(owned.length ? `Hapus klien “${name}” beserta ${owned.length} batch di dalamnya?` : `Hapus klien “${name}”?`)) return; const ids = new Set(owned.map(c => c.id)); setPlan(o => { const kits = { ...o.brandKits }; delete kits[name]; return { ...o, brandKits: kits, accounts: o.accounts.filter(a => a !== name), campaigns: o.campaigns.filter(c => c.account !== name) }; }); dropTasks(t => ids.has(t.campaignId)); pickClient(""); setModal(""); };

  const byDate = new Map<string, Row[]>();
  shown.forEach(r => { const d = dateOf(r.x); if (d) byDate.set(d, [...(byDate.get(d) ?? []), r]); });
  const unscheduled = shown.filter(r => !dateOf(r.x));
  const today = todayIso();
  const openRow = (r: Row) => setOpen({ campaignId: r.c.id, day: r.x.day });
  const shiftMonth = (d: number) => setMonth(({ y, m }) => { const t = new Date(y, m + d, 1); return { y: t.getFullYear(), m: t.getMonth() }; });
  const matches = (s: string) => s.toLowerCase().includes(q.toLowerCase());

  const table = <section className="panel cx-list">
    <div className="cx-card-head"><h3>Daftar Konten <span>({shown.length})</span></h3><div className="cx-row"><select aria-label="Filter jenis" value={fmt} onChange={e => setFmt(e.target.value)}><option value="">Semua jenis</option>{FORMATS.map(f => <option key={f}>{f}</option>)}</select><select aria-label="Filter status" value={stageFilter} onChange={e => setStageFilter(e.target.value)}><option value="">Semua status</option>{STAGES.map(s => <option key={s}>{s}</option>)}</select></div></div>
    {shown.length ? <div className="cx-table" role="table">
      <div className="cx-tr cx-th" role="row"><span>Konten</span><span>Jenis</span><span>Status</span><span>Jadwal</span></div>
      {[...shown].sort((a, b) => (dateOf(a.x) ?? "9").localeCompare(dateOf(b.x) ?? "9") || a.x.day - b.x.day).map(r => <button key={r.c.id + r.x.day} className="cx-tr" role="row" onClick={() => openRow(r)}>
        <span className="cx-tcontent"><ImageTile kind={thumbOf(r.x, r.c)} className="cx-thumb" /><span><b className={r.x.untitled ? "cx-untitled" : ""}>{r.x.title}</b><small>#{pad(r.x.day)}{!batch ? ` · ${r.c.name}` : ""}{busy.has(`${r.c.id}:${r.x.day}`) ? " · agen bekerja…" : ""}{batch && review.row && !review.row.revoked && clientStatusOf(review.row, r.x.day) ? <em className={`rv-mini rv-${clientStatusOf(review.row, r.x.day)}`}>{CLIENT_LABEL[clientStatusOf(review.row, r.x.day)!]}</em> : null}</small></span></span>
        <span><Fmt f={r.x.format} /></span><span><StagePill s={stageOf(r.x.status)} /></span><span className="cx-tdate">{shortDate(dateOf(r.x))}</span>
      </button>)}
    </div> : <p className="x-empty">{rows.length ? "Tidak ada konten dengan filter ini." : "Belum ada konten di batch ini."}</p>}
  </section>;

  return <div className="module-page cx">
    <div className="cx-bar">
      <Picker open={pop === "client"} onToggle={() => setPop(pop === "client" ? "" : "client")} icon={<span className="cx-avatar">{(activeClient || "S")[0]}</span>} label={<><b>{activeClient || "Semua klien"}</b><small>{activeClient ? `${plan.campaigns.filter(c => c.account === activeClient).length} batch` : `${plan.accounts.length} klien`}</small></>}>
        <h4>Pilih klien</h4><div className="search-field"><Search size={15} /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Cari klien…" aria-label="Cari klien" /></div>
        <div className="cx-opts">{["", ...plan.accounts].filter(a => !a || matches(a)).map(a => <button key={a || "all"} className={activeClient === a ? "active" : ""} onClick={() => pickClient(a)}><span className="cx-avatar">{(a || "S")[0]}</span><span><b>{a || "Semua klien"}</b><small>{a ? `${plan.campaigns.filter(c => c.account === a).length} batch` : "Overview lintas klien"}</small></span>{activeClient === a && <Check size={16} />}</button>)}</div>
        <div className="cx-pop-foot"><button onClick={() => { setForm({ ...blankForm }); setModal("client"); setPop(""); }}><Plus size={15} /> Tambah klien</button>{activeClient && <><button onClick={() => { setModal("brand"); setPop(""); }}><Palette size={14} /> Brand Kit</button><button onClick={() => { setForm({ ...blankForm, account: activeClient }); setModal("rename"); setPop(""); }}><Pencil size={14} /> Kelola</button></>}</div>
      </Picker>
      <Picker wide open={pop === "batch"} onToggle={() => setPop(pop === "batch" ? "" : "batch")} icon={<Layers3 size={17} />} label={<><b>{batch ? batch.name : "Semua batch"}</b><small>{batch ? `${batch.period} · ${batch.items.length} konten` : `${batches.length} batch · ${rows.length} konten`}</small></>}>
        <h4>Pilih batch konten</h4><div className="search-field"><Search size={15} /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Cari batch…" aria-label="Cari batch" /></div>
        <div className="cx-opts">
          <button className={!batch ? "active" : ""} onClick={() => pickBatch("")}><Layers3 size={17} /><span><b>Semua batch</b><small>{batches.length} batch{activeClient ? ` ${activeClient}` : ""}</small></span>{!batch && <Check size={16} />}</button>
          {batches.filter(c => matches(c.name) || matches(c.account)).map(c => <button key={c.id} className={batch?.id === c.id ? "active" : ""} onClick={() => pickBatch(c.id)}><ImageTile kind={coverOf(c)} className="cx-opt-thumb" /><span><b>{c.name}{c.archived ? " · arsip" : ""}</b><small>{!activeClient ? `${c.account} · ` : ""}{c.period} · {c.items.length} konten</small></span>{batch?.id === c.id && <Check size={16} />}</button>)}
        </div>
        <div className="cx-pop-foot"><button onClick={openNewBatch}><Plus size={15} /> Buat batch baru</button><label className="cx-check"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Tampilkan arsip</label></div>
      </Picker>
      <div className="cx-views" role="tablist">{([["Kalender", CalendarDays], ["Timeline", Clock], ["List", List]] as const).map(([v, I]) => <button key={v} role="tab" aria-selected={view === v} className={view === v ? "active" : ""} onClick={() => setView(v)}><I size={15} /> {v}</button>)}</div>
      <button className="primary-button cx-new" onClick={() => openNewContent()}><Plus size={16} /> {scope.length ? "Buat konten" : "Buat batch"}</button>
    </div>

    <div className="cx-stats">
      <div><CalendarDays size={18} /><b>{rows.length}</b><small>Total konten</small></div>
      {FORMATS.map(f => { const I = FORMAT_ICON[f]; return <div key={f}><I size={18} /><b>{rows.filter(r => r.x.format === f).length}</b><small>{f === "Feed" ? "Single image" : f}</small></div>; })}
      <div className="cx-ring" style={{ "--p": `${rows.length ? Math.round((done / rows.length) * 100) : 0}` } as React.CSSProperties}><i /><b>{rows.length ? Math.round((done / rows.length) * 100) : 0}%</b><small>Siap tayang</small></div>
    </div>

    {!plan.campaigns.length ? <section className="panel cx-empty"><Layers3 size={30} /><h3>Belum ada batch konten</h3><p>Batch = satu pesanan konten untuk satu klien (mis. “Intragama Villa · Nov–Des 2026, 15 konten”). Brief, storyboard, dan approval tiap batch terpisah.</p><button className="primary-button" onClick={openNewBatch}><Plus size={16} /> Buat batch pertama</button></section>
    : <div className="cx-layout">
      <div className="cx-main">
        {view === "Kalender" && <><section className="panel cx-cal">
          <div className="cx-card-head"><div className="cx-monthnav"><button className="cx-icon" aria-label="Bulan sebelumnya" onClick={() => shiftMonth(-1)}><ChevronLeft size={18} /></button><h3>{MONTHS[month.m]} {month.y}</h3><button className="cx-icon" aria-label="Bulan berikutnya" onClick={() => shiftMonth(1)}><ChevronRight size={18} /></button></div>{unscheduled.length > 0 && <span className="cx-chip">{unscheduled.length} belum dijadwalkan</span>}</div>
          <div className="cx-grid">{DAYS.map(d => <b key={d} className="cx-dow">{d}</b>)}
            {monthGrid(month.y, month.m).map((d, i) => { const list = d ? byDate.get(d) ?? [] : []; const inBatch = !batch?.start || !d || (d >= batch.start && d <= (batch.end ?? d)); return <div key={i} className={`cx-day ${!d ? "pad" : ""} ${d === today ? "today" : ""} ${inBatch ? "" : "out"}`}>
              {d && <><button className="cx-daynum" aria-label={`Tambah konten ${longDate(d)}`} onClick={() => openNewContent(d)}>{Number(d.slice(8))}<Plus size={12} /></button>
                {list.slice(0, 2).map(r => { const I = FORMAT_ICON[r.x.format]; return <button key={r.c.id + r.x.day} className={`cx-ev cx-f-${r.x.format.toLowerCase()}`} onClick={() => openRow(r)} title={r.x.title}><I size={12} /><span>{r.x.title}</span></button>; })}
                {list.length > 2 && <button className="cx-more" onClick={() => { setView("Timeline"); }}>+{list.length - 2} lagi</button>}</>}
            </div>; })}
          </div>
        </section>{table}</>}

        {view === "Timeline" && <section className="panel cx-timeline">
          <div className="cx-card-head"><h3>Timeline konten</h3><span className="cx-chip">{shown.length} konten</span></div>
          {[...byDate.keys()].sort().map(d => <div key={d} className={`cx-tl-day ${d < today ? "past" : ""} ${d === today ? "today" : ""}`}><div className="cx-tl-date"><b>{Number(d.slice(8))}</b><small>{shortDate(d).split(",")[0]} · {MONTHS[Number(d.slice(5, 7)) - 1]}</small></div>
            <div className="cx-tl-items">{byDate.get(d)!.map(r => <button key={r.c.id + r.x.day} className="cx-tl-item" onClick={() => openRow(r)}><ImageTile kind={thumbOf(r.x, r.c)} className="cx-tl-thumb" /><span><b>{r.x.title}</b><span className="cx-row"><Fmt f={r.x.format} /><small>{r.c.account}{!batch ? ` · ${r.c.name}` : ""}</small></span></span><StagePill s={stageOf(r.x.status)} /></button>)}</div></div>)}
          {unscheduled.length > 0 && <div className="cx-tl-day"><div className="cx-tl-date"><b>—</b><small>Belum dijadwalkan</small></div><div className="cx-tl-items">{unscheduled.map(r => <button key={r.c.id + r.x.day} className="cx-tl-item" onClick={() => openRow(r)}><ImageTile kind={thumbOf(r.x, r.c)} className="cx-tl-thumb" /><span><b className={r.x.untitled ? "cx-untitled" : ""}>{r.x.title}</b><span className="cx-row"><Fmt f={r.x.format} /><small>{r.c.name}</small></span></span><StagePill s={stageOf(r.x.status)} /></button>)}</div></div>}
          {!shown.length && <p className="x-empty">Belum ada konten.</p>}
        </section>}

        {view === "List" && table}
      </div>

      <aside className="cx-side">
        {batch ? <section className="panel cx-batch">
          <div className="cx-batch-head"><ImageTile kind={coverOf(batch)} className="cx-batch-img" /><div><h3>{batch.name}</h3><small><Users size={13} /> {batch.account}</small></div><em className={`cx-badge ${batch.archived ? "off" : ""}`}>{batch.archived ? "Arsip" : "Aktif"}</em>
            <div className="cx-menu-wrap"><button className="cx-icon" aria-label="Menu batch" onClick={() => setPop(pop === "ai" ? "" : "ai")}><MoreHorizontal size={18} /></button>
              {pop === "ai" && <div className="floating-menu cx-menu"><button onClick={() => { setPop(""); openEditBatch(batch); }}>Edit batch<Pencil size={14} /></button><button onClick={() => suggestTitles(batch)}>Usulkan 5 judul (AI)<Sparkles size={14} /></button><button onClick={() => { const n = enqueueCampaign(batch.id, 5); setPop(""); notify(n ? `${n} konten digarap agen (±Rp 9 per konten).` : "Tidak ada konten yang perlu digarap."); }}>Tulis brief AI untuk 5 konten<Play size={14} /></button><button onClick={() => { patchCampaign(batch.id, c => ({ ...c, auto: !c.auto })); setPop(""); }}>Agen otomatis: {(batch as { auto?: boolean }).auto ? "nyala" : "mati"}<Zap size={14} /></button><button onClick={() => { patchCampaign(batch.id, c => ({ ...c, archived: !c.archived })); setPop(""); notify(batch.archived ? "Batch diaktifkan lagi." : "Batch diarsipkan."); }}>{batch.archived ? "Aktifkan lagi" : "Arsipkan"}<Layers3 size={14} /></button></div>}</div></div>
          <h4><Layers3 size={16} /> Informasi batch</h4>
          <dl className="cx-dl"><dt>Periode</dt><dd>{batch.period || "-"}</dd><dt>Total konten</dt><dd>{batch.items.length} / {targetOf(batch)}</dd><dt>Tujuan</dt><dd>{batch.goal}</dd><dt>Jenis</dt><dd>{KIND_LABEL[batch.kind ?? defaultKind(batch.account)]}</dd></dl>
          <h4><Check size={16} /> Progress produksi <span>{rows.length} konten</span></h4>
          <div className="cx-stack">{STAGES.map(s => { const n = count(s); return n ? <i key={s} className={`cx-s-${stageKey(s)}`} style={{ flexGrow: n }} title={`${s}: ${n}`} /> : null; })}{!rows.length && <i className="cx-s-none" style={{ flexGrow: 1 }} />}</div>
          <ul className="cx-legend">{STAGES.map(s => <li key={s}><i className={`cx-s-${stageKey(s)}`} />{s}<b>{count(s)}</b></li>)}</ul>
          <h4><FileText size={16} /> Catatan batch <button className="cx-link" onClick={() => openEditBatch(batch)}>Edit</button></h4>
          <p className="cx-note">{batch.brief || "Belum ada catatan. Tulis fokus, komposisi format, dan target upload — dipakai AI saat menulis judul dan brief."}</p>
          <ReviewPanel campaign={batch} review={review} />
          <div className="cx-batch-actions"><button className="outline-button" onClick={() => onShare(batch)}><Share2 size={14} /> Bagikan</button><button className="outline-button" onClick={() => printBatch(batch)}><Printer size={14} /> PDF</button><button className="outline-button" onClick={() => downloadBatch(batch)}><Code2 size={14} /> HTML</button></div>
        </section>
        : <section className="panel cx-batch">
          <h4><Layers3 size={16} /> Batch {activeClient ? activeClient : "semua klien"}</h4>
          <div className="cx-blist">{batches.map(c => { const n = c.items.filter(x => ["Terjadwal", "Dipublish"].includes(stageOf(x.status))).length; return <button key={c.id} onClick={() => pickBatch(c.id)}><ImageTile kind={coverOf(c)} className="cx-opt-thumb" /><span><b>{c.name}</b><small>{!activeClient ? `${c.account} · ` : ""}{c.period}</small><i className="cx-bar-mini"><em style={{ width: `${c.items.length ? (n / c.items.length) * 100 : 0}%` }} /></i></span><small>{n}/{c.items.length}</small></button>; })}{!batches.length && <p className="x-empty">Belum ada batch untuk klien ini.</p>}</div>
          <button className="outline-button cx-wide" onClick={openNewBatch}><Plus size={15} /> Buat batch baru</button>
        </section>}
        {activeClient && <BrandKitCard account={activeClient} kit={plan.brandKits?.[activeClient]} onEdit={() => setModal("brand")} />}
      </aside>
    </div>}

    {modal === "brand" && activeClient && <BrandKitModal account={activeClient} kit={plan.brandKits?.[activeClient]} onClose={() => setModal("")} onSave={k => { setPlan(o => ({ ...o, brandKits: { ...o.brandKits, [activeClient]: k } })); setModal(""); notify(`Brand Kit ${activeClient} disimpan.`); }} />}
    {modal && modal !== "brand" && <div className="modal-backdrop" onClick={() => setModal("")}><div className={`quick-modal ${modal === "batch" ? "cp-modal" : "plan-v2-modal"}`} role="dialog" aria-label={modal === "batch" ? "Batch" : "Form"} onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setModal("")} aria-label="Tutup"><X size={18} /></button>
      {modal === "batch" && <>
        <div className="cp-modal-head"><span className="modal-icon"><Layers3 size={21} /></span><div><h2>{editing ? "Edit batch" : "Buat batch baru"}</h2><p>Satu batch = satu pesanan konten untuk satu klien. Periode produksi boleh berbeda dari jadwal tayang.</p></div></div>
        <div className="cp-form">
          <div className="settings-field"><label htmlFor="n-acc">KLIEN *</label><input id="n-acc" list="cx-clients" value={form.account} onChange={e => setForm({ ...form, account: e.target.value, kind: "" })} placeholder="Pilih atau ketik klien baru" /><datalist id="cx-clients">{plan.accounts.map(a => <option key={a} value={a} />)}</datalist></div>
          <div className="settings-field"><label htmlFor="n-name">NAMA BATCH *</label><input id="n-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Batch Nov – Des 2026" /></div>
          <div className="settings-field"><label htmlFor="n-start">MULAI</label><input id="n-start" type="date" value={form.start} onChange={e => setForm({ ...form, start: e.target.value })} /></div>
          <div className="settings-field"><label htmlFor="n-end">SELESAI</label><input id="n-end" type="date" value={form.end} min={form.start || undefined} onChange={e => setForm({ ...form, end: e.target.value })} /></div>
          <div className="settings-field"><label htmlFor="n-target">TARGET JUMLAH KONTEN</label><input id="n-target" type="number" min={1} max={200} value={form.target} onChange={e => setForm({ ...form, target: Number(e.target.value) || 1 })} /></div>
          <div className="settings-field"><label htmlFor="n-goal">TUJUAN</label><select id="n-goal" value={form.goal} onChange={e => setForm({ ...form, goal: e.target.value })}>{GOALS.map(g => <option key={g}>{g}</option>)}</select></div>
          <div className="settings-field cp-wide"><label htmlFor="n-kind">JENIS KONTEN</label><select id="n-kind" value={form.kind || defaultKind(form.account)} onChange={e => setForm({ ...form, kind: e.target.value as CampaignKind })}>{(Object.keys(KIND_LABEL) as CampaignKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></div>
          <div className="settings-field cp-wide"><label htmlFor="n-brief">CATATAN BATCH</label><textarea id="n-brief" rows={3} maxLength={500} value={form.brief} onChange={e => setForm({ ...form, brief: e.target.value })} placeholder="Fokus: fasilitas, room tour, suasana. Format: 8 Reels, 5 Carousel, 2 Single. Target upload 3–4 konten per minggu." /><small>{form.brief.length} / 500</small></div>
        </div>
        <div className="cp-modal-actions">{editing && <button className="outline-button x-danger" onClick={() => { const c = plan.campaigns.find(x => x.id === editing); if (c) deleteBatch(c); }}><Trash2 size={15} /> Hapus</button>}<button className="outline-button" onClick={() => setModal("")}>Batal</button><button className="primary-button" onClick={saveBatch}>{editing ? "Simpan" : "Buat batch"}</button></div>
      </>}
      {modal === "content" && <><span className="modal-icon"><FileText size={21} /></span><h2>Buat konten</h2>
        <label htmlFor="c-batch">BATCH</label><select id="c-batch" value={draft.batch} onChange={e => setDraft({ ...draft, batch: e.target.value })}>{scope.map(c => <option key={c.id} value={c.id}>{c.account} · {c.name}</option>)}</select>
        <label htmlFor="c-title">JUDUL</label><input id="c-title" autoFocus value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} onKeyDown={e => { if (e.key === "Enter") addContent(); }} placeholder="Room Tour Villa — Living & Pool Area" />
        <label htmlFor="c-format">FORMAT</label><select id="c-format" value={draft.format} onChange={e => setDraft({ ...draft, format: e.target.value as CampaignContent["format"] })}>{FORMATS.map(f => <option key={f}>{f}</option>)}</select>
        <label htmlFor="c-date">TANGGAL TAYANG</label><input id="c-date" type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} />
        <button className="primary-button" onClick={addContent}>Buat & buka brief</button></>}
      {modal === "client" && <><span className="modal-icon"><Users size={21} /></span><h2>Klien baru</h2><p>Brand atau klien yang kontennya dikelola.</p><label htmlFor="m-acc">NAMA KLIEN</label><input id="m-acc" autoFocus value={form.account} onChange={e => setForm({ ...form, account: e.target.value })} onKeyDown={e => { if (e.key === "Enter") addClient(); }} placeholder="Contoh: Pawon Cabin" /><button className="primary-button" onClick={addClient}>Simpan klien</button></>}
      {modal === "rename" && <><span className="modal-icon"><Pencil size={21} /></span><h2>Kelola klien</h2><p>Ganti nama berlaku untuk semua batch klien ini.</p><label htmlFor="m-rename">NAMA KLIEN</label><input id="m-rename" value={form.account} onChange={e => setForm({ ...form, account: e.target.value })} /><button className="primary-button" onClick={renameClient}>Simpan</button><button className="outline-button x-danger" onClick={deleteClient}><Trash2 size={15} /> Hapus klien</button></>}
    </div></div>}
  </div>;
}
