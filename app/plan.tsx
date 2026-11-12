"use client";

import { useState } from "react";
import { ArrowRight, BarChart3, CalendarDays, Check, CheckCircle2, Clapperboard, Code2, Columns3, FileText, Layers3, List, MoreHorizontal, PenLine, Pencil, Play, Plus, Printer, Search, Send, Share2, Sparkles, Trash2, Users, X, Zap } from "lucide-react";
import { DriveBrowser } from "./assets";
import { enqueue, enqueueCampaign } from "./agents";
import { KIND_LABEL, PIPELINE, STAGES, STAGE_LABEL, isVideo, nextStep, stageOf, type Stage } from "./lib/flow";
import { addApproval, useIdeas, useSettings, useTasks, writeStored, type Task } from "./lib/store";
import { notify, useAiReady } from "./modules";
import { campaignHtml, defaultKind, patchCampaign, patchItem, usePlan, type CampaignContent, type CampaignData, type CampaignKind, type Scene } from "./plan-data";
import { ImageTile } from "./ui";
const dropTasks = (match: (t: Task) => boolean) => writeStored<Task[]>("tasks", old => old.filter(t => !match(t)), []);

const pad = (n: number) => String(n).padStart(2, "0");
const FORMATS: CampaignContent["format"][] = ["Reels", "Carousel", "Feed"];

function Field({ label, value, onChange, rows = 2, placeholder }: { label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  const id = "f-" + label.replace(/\W+/g, "-").toLowerCase();
  return <div className="f-field"><label htmlFor={id}>{label}</label><textarea id={id} rows={rows} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} /></div>;
}

/** Full brief + storyboard for one content item. Opens as a side panel on desktop and a full screen sheet on phones. */
function ContentSheet({ campaign, item, onClose, onOpenStudio, onDelete }: { campaign: CampaignData; item: CampaignContent; onClose: () => void; onOpenStudio: () => void; onDelete: () => void }) {
  const [tasks] = useTasks();
  const [ideas, setIdeas] = useIdeas();
  const [picking, setPicking] = useState(false);
  const set = (patch: Partial<CampaignContent>) => patchItem(campaign.id, item.day, patch);
  const board = item.board ?? [];
  const setBoard = (next: Scene[]) => set({ board: next, scenes: next.map(s => `${s.label}: ${s.visual}`) });
  const editScene = (i: number, patch: Partial<Scene>) => setBoard(board.map((s, n) => (n === i ? { ...s, ...patch } : s)));
  const video = isVideo(item.format);
  const step = nextStep(item);
  const mine = tasks.filter(t => t.campaignId === campaign.id && t.day === item.day);
  const active = mine.find(t => t.status === "queued" || t.status === "running");
  const failed = mine.find(t => t.status === "failed");
  const stepInfo = step ? PIPELINE.find(s => s.kind === step) : null;
  return <div className="f-sheet-backdrop" onClick={onClose}><aside className="f-sheet wide" role="dialog" aria-label={`Brief konten ${item.day}`} onClick={e => e.stopPropagation()}>
    <div className="f-sheet-head"><div><span className="f-eyebrow">KONTEN {pad(item.day)} · {campaign.name} · {campaign.account}</span><input className="f-title" aria-label="Judul konten" value={item.title} onChange={e => set({ title: e.target.value })} /></div><button className="modal-close" onClick={onClose} aria-label="Tutup"><X size={18} /></button></div>
    <div className="f-meta-row">
      <div><label htmlFor="s-format">FORMAT</label><select id="s-format" value={item.format} onChange={e => set({ format: e.target.value as CampaignContent["format"] })}>{FORMATS.map(f => <option key={f}>{f}</option>)}</select></div>
      <div><label htmlFor="s-status">STATUS</label><select id="s-status" value={stageOf(item.status)} onChange={e => set({ status: e.target.value })}>{STAGES.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</select></div>
      <div><label htmlFor="s-date">TANGGAL TAYANG</label><input id="s-date" value={item.publishDate || item.date} onChange={e => set({ publishDate: e.target.value })} /></div>
      <div><label htmlFor="s-pillar">PILAR</label><input id="s-pillar" value={item.pillar} onChange={e => set({ pillar: e.target.value })} /></div>
    </div>

    <section className="f-agentbar">
      <div><b>{active ? `${active.agent} — ${active.status === "running" ? "sedang mengerjakan" : "dalam antrean"}` : stepInfo ? `Langkah berikut: ${stepInfo.output}` : "Semua langkah agen selesai"}</b><small>{active ? "Hasil akan muncul di halaman ini secara otomatis." : stepInfo ? `${stepInfo.agent} · ${stepInfo.job}` : "Periksa hasilnya, lalu ajukan atau setujui di Approval."}</small></div>
      {!active && step && <div className="x-row"><button className="primary-button" onClick={() => enqueue(campaign.id, item.day, true)}><Play size={15} /> Jalankan sampai approval</button><button className="outline-button" onClick={() => enqueue(campaign.id, item.day, false)}>Hanya langkah ini</button></div>}
      {failed && !active && <p className="x-error">{failed.error} Coba lagi dari tombol di atas atau dari halaman AI Agent.</p>}
    </section>

    <h4 className="f-h">Brief</h4>
    <div className="f-grid2">
      <Field label="Tujuan konten" value={item.goal} onChange={v => set({ goal: v })} />
      <Field label="Pesan utama" value={item.message ?? ""} onChange={v => set({ message: v })} placeholder="Satu kalimat yang harus diingat audiens" />
      <Field label="Hook pembuka" value={item.hook} onChange={v => set({ hook: v })} />
      <Field label="Ajakan (CTA)" value={item.cta} onChange={v => set({ cta: v })} />
      <Field label="Arah visual" value={item.visualDirection} onChange={v => set({ visualDirection: v })} rows={3} />
      <Field label="Kebutuhan aset" value={item.assetNeeds ?? ""} onChange={v => set({ assetNeeds: v })} rows={3} placeholder="Foto atau footage yang perlu disiapkan" />
    </div>
    <Field label="Caption" value={item.caption} onChange={v => set({ caption: v })} rows={4} />
    <Field label="Hashtag" value={item.hashtags ?? ""} onChange={v => set({ hashtags: v })} rows={1} placeholder="#fotointerior #propertijakarta" />

    <div className="f-h-row"><h4 className="f-h">Storyboard · {video ? "scene video" : "slide"}</h4><button className="outline-button" onClick={() => setBoard([...board, { label: video ? `Scene ${board.length + 1}` : `Slide ${board.length + 1}`, visual: "", text: "", audio: "" }])}><Plus size={14} /> Tambah {video ? "scene" : "slide"}</button></div>
    {!board.length && <p className="x-empty">Belum ada storyboard. Jalankan agen di atas, atau tambahkan {video ? "scene" : "slide"} secara manual.</p>}
    <ol className="f-board-rows">{board.map((s, i) => <li key={i}>
      <div className="f-scene-head"><span className="f-step-no">{i + 1}</span><input aria-label={`Label ${i + 1}`} value={s.label} onChange={e => editScene(i, { label: e.target.value })} /><button className="outline-button x-danger" aria-label={`Hapus ${s.label}`} onClick={() => setBoard(board.filter((_, n) => n !== i))}><Trash2 size={14} /></button></div>
      <Field label={`${video ? "Visual / arahan shot" : "Foto / komposisi"} ${i + 1}`} value={s.visual} onChange={v => editScene(i, { visual: v })} />
      <Field label={`${video ? "Teks layar / narasi" : "Teks pada slide"} ${i + 1}`} value={s.text} onChange={v => editScene(i, { text: v })} />
      {video && <Field label={`Audio ${i + 1}`} value={s.audio} onChange={v => editScene(i, { audio: v })} rows={1} />}
    </li>)}</ol>

    {item.production && <><h4 className="f-h">Paket produksi</h4><pre className="x-output">{item.production}</pre></>}
    {item.schedule && <><h4 className="f-h">Usulan jadwal</h4><p className="x-quote">{item.schedule}</p></>}

    <div className="f-h-row"><h4 className="f-h">Aset dari Google Drive</h4><button className="outline-button" onClick={() => setPicking(!picking)}>{picking ? "Tutup pemilih" : "Pilih dari Drive"}</button></div>
    {!!item.assets?.length && <div className="f-linked">{item.assets.map(a => <div key={a.id}><a href={a.url} target="_blank" rel="noreferrer"><img src={a.thumb} alt={a.name} referrerPolicy="no-referrer" /></a><button aria-label={`Lepas ${a.name}`} onClick={() => set({ assets: item.assets!.filter(x => x.id !== a.id) })}><X size={14} /></button></div>)}</div>}
    {picking && <DriveBrowser pickLabel="Tautkan" onPick={ref => { set({ assets: [...(item.assets ?? []).filter(a => a.id !== ref.id), ref] }); notify(`${ref.name} ditautkan.`); }} />}

    {ideas.length > 0 && <div className="x-ideas"><label>INBOX IDE — pakai sebagai judul konten ini</label>{ideas.slice(0, 5).map(idea => <div key={idea}><span>{idea}</span><button className="outline-button" onClick={() => { set({ title: idea, board: [], production: "", schedule: "", status: "Brief" }); setIdeas(old => old.filter(x => x !== idea)); }}>Pakai</button></div>)}</div>}

    <div className="f-sheet-actions"><button className="outline-button x-danger f-delete" onClick={onDelete}><Trash2 size={15} /> Hapus konten</button><button className="primary-button" onClick={onOpenStudio}>Buka di Production Studio <ArrowRight size={15} /></button><button className="outline-button" onClick={() => { addApproval({ ref: { campaignId: campaign.id, day: item.day }, title: `${item.format} — ${item.title}`, by: "Content Plan", type: `${campaign.account} · diajukan manual`, body: `Hook: ${item.hook}\n\nStoryboard:\n${board.map(s => `• ${s.label} — ${s.visual}${s.text ? ` | "${s.text}"` : ""}`).join("\n")}\n\nCaption:\n${item.caption}\n\n${item.hashtags ?? ""}` }); set({ status: "Draft" }); notify("Draft masuk ke antrean approval."); }}><Check size={15} /> Ajukan sebagai draft</button></div>
  </aside></div>;
}


const GOALS = ["Awareness & engagement", "Lead generation", "Bookings", "Sales conversion"];
type View = "Campaign" | "Kalender" | "Daftar Konten";
type Tab = "Papan Produksi" | "Brief Campaign" | "Analitik";
const STAGE_ICON = { Brief: FileText, Produksi: Clapperboard, Draft: PenLine, Publish: Send } as const;
const coverOf = (c: CampaignData) => c.items.flatMap(x => x.assets ?? []).find(a => a.kind === "Foto")?.thumb ?? c.cover;
const targetOf = (c: CampaignData) => c.target ?? 30;
const blankForm = { account: "", name: "", period: "", goal: GOALS[0], kind: "" as CampaignKind | "", brief: "", target: 30 };

/** One page for campaigns and their content: campaign list on the left, the selected campaign's production board on the right. */
export function ContentPlanPage({ onOpenStudio, onShare }: { onOpenStudio: (campaignId: string, day: number) => void; onShare: (data: CampaignData) => void }) {
  const [plan, setPlan] = usePlan();
  const [settings] = useSettings();
  const [tasks] = useTasks();
  const ready = useAiReady();
  const [view, setView] = useState<View>("Campaign");
  const [tab, setTab] = useState<Tab>("Papan Produksi");
  const [accountFilter, setAccountFilter] = useState("Semua akun");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openRef, setOpenRef] = useState<{ campaignId: string; day: number } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [modal, setModal] = useState<"" | "campaign" | "content" | "account" | "manage">("");
  const [form, setForm] = useState(blankForm);
  const [draft, setDraft] = useState({ title: "", format: "Reels", stage: "Brief" as Stage, date: "" });
  const [briefForm, setBriefForm] = useState<typeof blankForm | null>(null);
  const [stageFilter, setStageFilter] = useState("Semua");

  const visible = plan.campaigns.filter(c => (accountFilter === "Semua akun" || c.account === accountFilter) && c.name.toLowerCase().includes(query.toLowerCase()));
  const campaign = plan.campaigns.find(c => c.id === selectedId) ?? visible[0] ?? null;
  const openCampaign = plan.campaigns.find(c => c.id === openRef?.campaignId);
  const openItem = openCampaign?.items.find(x => x.day === openRef?.day) ?? null;
  const busy = new Set(tasks.filter(t => t.status === "queued" || t.status === "running").map(t => `${t.campaignId}:${t.day}`));
  const kindOf = (c: CampaignData) => c.kind ?? defaultKind(c.account);
  const stageItems = (c: CampaignData, s: Stage) => c.items.filter(x => stageOf(x.status) === s);

  const select = (c: CampaignData) => { setSelectedId(c.id); setBriefForm(null); setMenu(null); };
  const openNewCampaign = () => { setForm({ ...blankForm, account: accountFilter === "Semua akun" ? plan.accounts[0] : accountFilter, period: new Date().toLocaleDateString("id-ID", { month: "short", year: "numeric" }) }); setModal("campaign"); };
  const createCampaign = () => {
    if (!form.name.trim() || !form.brief.trim()) return notify("Isi nama campaign dan deskripsinya.");
    const id = "c" + Date.now();
    setPlan(o => ({ ...o, campaigns: [{ id, account: form.account, name: form.name.trim(), period: form.period.trim() || "-", goal: form.goal, cover: "living", kind: form.kind || defaultKind(form.account), brief: form.brief.trim(), target: Math.max(1, form.target), items: [] }, ...o.campaigns] }));
    setSelectedId(id); setTab("Papan Produksi"); setModal(""); notify("Campaign dibuat. Tambahkan konten lewat “Tambah konten”.");
  };
  const deleteCampaign = (c: CampaignData) => {
    if (!window.confirm(`Hapus campaign “${c.name}” beserta ${c.items.length} kontennya? Tindakan ini tidak bisa dibatalkan.`)) return;
    setPlan(o => ({ ...o, campaigns: o.campaigns.filter(x => x.id !== c.id) })); dropTasks(t => t.campaignId === c.id);
    if (selectedId === c.id) setSelectedId(null); setMenu(null); setBriefForm(null); notify("Campaign dihapus.");
  };
  const editBrief = (c: CampaignData) => { select(c); setBriefForm({ account: c.account, name: c.name, period: c.period, goal: c.goal, kind: kindOf(c), brief: c.brief ?? "", target: targetOf(c) }); setTab("Brief Campaign"); };
  const saveBrief = () => { if (!campaign || !briefForm || !briefForm.name.trim()) return; patchCampaign(campaign.id, c => ({ ...c, account: briefForm.account, name: briefForm.name.trim(), period: briefForm.period, goal: briefForm.goal, kind: briefForm.kind || defaultKind(briefForm.account), brief: briefForm.brief.trim(), target: Math.max(1, briefForm.target) })); notify("Brief campaign disimpan."); };
  const addContent = () => {
    if (!campaign || !draft.title.trim()) return;
    const day = Math.max(0, ...campaign.items.map(x => x.day)) + 1;
    patchCampaign(campaign.id, c => ({ ...c, items: [...c.items, { day, date: draft.date || "Belum dijadwalkan", publishDate: draft.date, title: draft.title.trim(), format: draft.format as CampaignContent["format"], pillar: "", status: draft.stage, goal: c.goal, hook: "", caption: "", visualDirection: "", cta: "", scenes: [] }] }));
    setModal(""); setOpenRef({ campaignId: campaign.id, day });
  };
  const suggestTitles = (c: CampaignData, n = 5) => {
    if (!ready) return notify("Isi API key di Settings → AI & Models dulu.");
    const start = Math.max(0, ...c.items.map(x => x.day));
    patchCampaign(c.id, x => ({ ...x, items: [...x.items, ...Array.from({ length: n }, (_, i) => ({ day: start + i + 1, date: "Belum dijadwalkan", publishDate: "", title: `Konten ${start + i + 1} — menunggu judul`, untitled: true, format: "Reels" as const, pillar: "", status: "Brief", goal: x.goal, hook: "", caption: "", visualDirection: "", cta: "", scenes: [] }))] }));
    enqueue(c.id, 0, false, "plan"); setMenu(null); notify(`Strategist mengusulkan ${n} judul (±Rp 5). Edit atau hapus yang tidak cocok.`);
  };
  const download = (d: CampaignData) => { const url = URL.createObjectURL(new Blob([campaignHtml(d)], { type: "text/html;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-content-plan.html"; a.click(); URL.revokeObjectURL(url); };
  const print = (d: CampaignData) => { const w = window.open("", "_blank"); if (!w) return notify("Izinkan pop-up untuk mencetak PDF."); w.document.open(); w.document.write(campaignHtml(d)); w.document.close(); w.onload = () => w.print(); };
  const addAccount = () => { const n = form.account.trim(); if (!n || plan.accounts.includes(n)) return; setPlan(o => ({ ...o, accounts: [...o.accounts, n] })); setAccountFilter(n); setModal(""); };
  const renameAccount = (from: string, to: string) => { const name = to.trim(); if (!name || name === from) return setModal(""); if (plan.accounts.includes(name)) return notify("Nama akun itu sudah ada."); setPlan(o => ({ accounts: o.accounts.map(a => (a === from ? name : a)), campaigns: o.campaigns.map(c => (c.account === from ? { ...c, account: name } : c)) })); setAccountFilter(name); setModal(""); };
  const deleteAccount = (name: string) => { const owned = plan.campaigns.filter(c => c.account === name); if (!window.confirm(owned.length ? `Hapus akun “${name}” beserta ${owned.length} campaign di dalamnya?` : `Hapus akun “${name}”?`)) return; const ids = new Set(owned.map(c => c.id)); setPlan(o => ({ accounts: o.accounts.filter(a => a !== name), campaigns: o.campaigns.filter(c => c.account !== name) })); dropTasks(t => ids.has(t.campaignId)); setAccountFilter("Semua akun"); setModal(""); };

  const all = plan.campaigns.filter(c => accountFilter === "Semua akun" || c.account === accountFilter).flatMap(c => c.items.map(x => ({ c, x })));
  const Card = ({ c, x }: { c: CampaignData; x: CampaignContent }) => <button className="cp-card" onClick={() => setOpenRef({ campaignId: c.id, day: x.day })}><b>{pad(x.day)}</b><span><em className={`f-fmt f-${x.format.toLowerCase()}`}>{x.format}</em>{busy.has(`${c.id}:${x.day}`) && <em className="f-fmt f-busy">Agen bekerja</em>}<strong className={x.untitled ? "f-untitled" : ""}>{x.title}</strong></span></button>;

  return <div className="module-page cp">
    <div className="cp-views" role="tablist">{([["Campaign", Layers3], ["Kalender", CalendarDays], ["Daftar Konten", List]] as const).map(([v, Icon]) => <button key={v} role="tab" aria-selected={view === v} className={view === v ? "active" : ""} onClick={() => setView(v)}><Icon size={16} /> {v}</button>)}</div>

    {view === "Campaign" && <div className="cp-layout">
      <aside className="panel cp-side">
        <div className="cp-side-head"><h3>Campaign</h3><span className="muted-chip">{visible.length} campaign</span></div>
        <div className="search-field cp-search"><Search size={15} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari campaign…" aria-label="Cari campaign" /></div>
        <div className="f-chips cp-accounts" aria-label="Filter akun">{["Semua akun", ...plan.accounts].map(a => <button key={a} className={accountFilter === a ? "active" : ""} onClick={() => { setAccountFilter(a); setSelectedId(null); }}>{a}</button>)}<button aria-label="Akun baru" title="Akun baru" onClick={() => { setForm({ ...blankForm }); setModal("account"); }}><Plus size={15} /></button>{accountFilter !== "Semua akun" && <button aria-label="Kelola akun" title="Kelola akun" onClick={() => { setForm({ ...blankForm, account: accountFilter }); setModal("manage"); }}><Pencil size={14} /></button>}</div>
        <div className="cp-list">{visible.map(c => { const done = Math.min(c.items.length, targetOf(c)); return <article key={c.id} className={`cp-campaign ${campaign?.id === c.id ? "active" : ""}`}>
          <button className="cp-campaign-open" onClick={() => select(c)}><ImageTile kind={coverOf(c)} className="cp-thumb" /><span className="cp-campaign-text"><b>{c.name}</b><small>{c.account} · {c.period}</small><span className="cp-progress"><i><em style={{ width: `${(done / targetOf(c)) * 100}%` }} /></i><small>{c.items.length} / {targetOf(c)}</small>{c.items.length >= targetOf(c) && <CheckCircle2 size={16} className="cp-full" />}</span></span></button>
          <button className="cp-more" aria-label={`Menu ${c.name}`} aria-expanded={menu === c.id} onClick={() => setMenu(menu === c.id ? null : c.id)}><MoreHorizontal size={18} /></button>
          {menu === c.id && <div className="floating-menu cp-menu"><button onClick={() => editBrief(c)}>Edit brief campaign<Pencil size={14} /></button><button onClick={() => { patchCampaign(c.id, old => ({ ...old, archived: !old.archived })); setMenu(null); notify(c.archived ? "Campaign diaktifkan lagi." : "Campaign diarsipkan."); }}>{c.archived ? "Aktifkan lagi" : "Arsipkan"}<Layers3 size={14} /></button><button className="x-danger" onClick={() => deleteCampaign(c)}>Hapus campaign<Trash2 size={14} /></button></div>}
        </article>; })}{!visible.length && <p className="x-empty">Belum ada campaign.</p>}</div>
        <button className="primary-button cp-add" onClick={openNewCampaign}><Plus size={16} /> Tambahkan Campaign</button>
      </aside>

      {campaign ? <section className="cp-main">
        <div className="cp-hero"><ImageTile kind={coverOf(campaign)} className="cp-hero-img" /><div className="cp-hero-shade" />
          <div className="cp-hero-text"><span className="f-eyebrow">{campaign.account} · {campaign.period}</span><h2>{campaign.name}</h2><p>{KIND_LABEL[kindOf(campaign)]} · {campaign.goal} · {campaign.items.length} konten</p></div>
          <div className="cp-hero-stat"><b>{campaign.items.length} / {targetOf(campaign)}</b><small>Konten direncanakan</small><i><em style={{ width: `${Math.min(100, (campaign.items.length / targetOf(campaign)) * 100)}%` }} /></i></div></div>
        <div className="cp-tabbar"><div className="cp-tabs" role="tablist">{([["Papan Produksi", Columns3], ["Brief Campaign", FileText], ["Analitik", BarChart3]] as const).map(([t, Icon]) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} onClick={() => { setTab(t); if (t === "Brief Campaign" && !briefForm) editBrief(campaign); }}><Icon size={16} /> {t}</button>)}</div>
          <div className="cp-actions"><button className="outline-button" onClick={() => onShare(campaign)}><Share2 size={15} /> Bagikan</button><button className="outline-button" onClick={() => print(campaign)}><Printer size={15} /> PDF</button><button className="outline-button" onClick={() => download(campaign)}><Code2 size={15} /> HTML</button>
            <div className="dropdown-wrap"><button className="outline-button" aria-label="Aksi AI" aria-expanded={menu === "hero"} onClick={() => setMenu(menu === "hero" ? null : "hero")}><MoreHorizontal size={16} /></button>{menu === "hero" && <div className="floating-menu cp-menu cp-menu-right">
              <button onClick={() => suggestTitles(campaign)}>Usulkan 5 judul dengan AI<Sparkles size={14} /></button>
              <button onClick={() => { const n = enqueueCampaign(campaign.id, 5); setMenu(null); notify(n ? `${n} konten di tahap Brief digarap agen (±Rp 9 per konten).` : "Tidak ada konten Brief yang perlu digarap."); }}>Tulis brief AI untuk 5 konten<Play size={14} /></button>
              <button onClick={() => { patchCampaign(campaign.id, c => ({ ...c, auto: !c.auto })); setMenu(null); }}>Agen otomatis: {campaign.auto ? "nyala" : "mati"}<Zap size={14} /></button>
            </div>}</div></div></div>

        {tab === "Papan Produksi" && <div className="cp-board">{STAGES.map(s => { const Icon = STAGE_ICON[s]; const list = stageItems(campaign, s); return <section key={s} className={`cp-col cp-${s.toLowerCase()}`}>
          <header><Icon size={17} /><b>{s}</b><span>{list.length}</span></header>
          <div className="cp-col-body">{list.map(x => <Card key={x.day} c={campaign} x={x} />)}{!list.length && <p className="x-empty">Kosong</p>}</div>
          <button className="cp-add-content" onClick={() => { setDraft({ title: "", format: "Reels", stage: s, date: "" }); setModal("content"); }}><Plus size={15} /> Tambah konten</button>
        </section>; })}</div>}

        {tab === "Brief Campaign" && briefForm && <section className="panel cp-brief">
          <div className="cp-form">
            <div className="settings-field"><label htmlFor="b-acc">AKUN / BRAND</label><select id="b-acc" value={briefForm.account} onChange={e => setBriefForm({ ...briefForm, account: e.target.value })}>{plan.accounts.map(a => <option key={a}>{a}</option>)}</select></div>
            <div className="settings-field"><label htmlFor="b-name">NAMA CAMPAIGN</label><input id="b-name" value={briefForm.name} onChange={e => setBriefForm({ ...briefForm, name: e.target.value })} /></div>
            <div className="settings-field"><label htmlFor="b-period">PERIODE</label><input id="b-period" value={briefForm.period} onChange={e => setBriefForm({ ...briefForm, period: e.target.value })} /></div>
            <div className="settings-field"><label htmlFor="b-goal">TARGET / OBJECTIVE</label><select id="b-goal" value={briefForm.goal} onChange={e => setBriefForm({ ...briefForm, goal: e.target.value })}>{GOALS.map(g => <option key={g}>{g}</option>)}</select></div>
            <div className="settings-field"><label htmlFor="b-kind">JENIS CAMPAIGN</label><select id="b-kind" value={briefForm.kind || defaultKind(briefForm.account)} onChange={e => setBriefForm({ ...briefForm, kind: e.target.value as CampaignKind })}>{(Object.keys(KIND_LABEL) as CampaignKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></div>
            <div className="settings-field"><label htmlFor="b-target">TARGET JUMLAH KONTEN</label><input id="b-target" type="number" min={1} max={200} value={briefForm.target} onChange={e => setBriefForm({ ...briefForm, target: Number(e.target.value) || 1 })} /></div>
            <div className="settings-field cp-wide"><label htmlFor="b-brief">DESKRIPSI CAMPAIGN</label><textarea id="b-brief" rows={4} maxLength={500} value={briefForm.brief} onChange={e => setBriefForm({ ...briefForm, brief: e.target.value })} placeholder="Properti, lokasi, keunggulan, target audiens, CTA. Dipakai agen saat menulis judul dan brief." /><small>{briefForm.brief.length} / 500</small></div>
          </div>
          <div className="x-row"><button className="primary-button" onClick={saveBrief}><Check size={15} /> Simpan brief campaign</button><button className="outline-button x-danger" onClick={() => deleteCampaign(campaign)}><Trash2 size={15} /> Hapus campaign</button></div>
        </section>}

        {tab === "Analitik" && <section className="cp-analytics">
          <div className="x-kpis">{STAGES.map(s => <div className="agent-overview-card" key={s}><span>{s}</span><b>{stageItems(campaign, s).length}</b><small>konten</small></div>)}</div>
          <div className="panel"><h3 className="f-h">Komposisi format</h3>{FORMATS.map(f => { const n = campaign.items.filter(x => x.format === f).length; return <div className="r-bar" key={f}><div><span>{f}</span><b>{n}</b></div><i><em style={{ width: `${campaign.items.length ? (n / campaign.items.length) * 100 : 0}%` }} /></i></div>; })}
            <p className="f-help">{campaign.items.filter(x => x.board?.length).length} dari {campaign.items.length} konten sudah punya storyboard · target {targetOf(campaign)} konten.</p></div>
          <div className="panel"><h3 className="f-h">Jadwal terdekat</h3>{campaign.items.filter(x => x.publishDate).slice(0, 8).map(x => <div className="cp-sched" key={x.day}><b>{x.publishDate}</b><span>{x.title}</span><em className="f-fmt">{stageOf(x.status)}</em></div>)}{!campaign.items.some(x => x.publishDate) && <p className="x-empty">Belum ada tanggal tayang. Isi di brief konten.</p>}</div>
        </section>}
      </section> : <section className="panel cp-main cp-empty"><h3>Belum ada campaign</h3><p>Buat campaign pertama, lalu tambahkan konten satu per satu.</p><button className="primary-button" onClick={openNewCampaign}><Plus size={16} /> Tambahkan Campaign</button></section>}
    </div>}

    {view === "Kalender" && <section className="panel"><div className="agent-section-heading"><div><h3>Kalender konten</h3><p>Semua konten {accountFilter === "Semua akun" ? "dari semua akun" : `akun ${accountFilter}`}, urut tanggal tayang.</p></div></div>
      <div className="x-cal">{[...all].sort((a, b) => (a.x.publishDate || "~").localeCompare(b.x.publishDate || "~")).map(({ c, x }) => <button key={c.id + x.day} className={stageOf(x.status) === "Publish" ? "ok" : ""} onClick={() => setOpenRef({ campaignId: c.id, day: x.day })}><b>{x.publishDate || "Belum dijadwalkan"}</b><span>{c.name} · {x.format} · {stageOf(x.status)}</span><small>{x.title}</small></button>)}</div>
      {!all.length && <p className="x-empty">Belum ada konten.</p>}</section>}

    {view === "Daftar Konten" && <section className="panel"><div className="agent-section-heading"><div><h3>Daftar konten</h3><p>{all.length} konten di semua campaign.</p></div><div className="f-chips">{["Semua", ...STAGES].map(s => <button key={s} className={stageFilter === s ? "active" : ""} onClick={() => setStageFilter(s)}>{s}</button>)}</div></div>
      <div className="scroll"><table className="f-cost-table"><thead><tr><th>#</th><th>Judul</th><th>Campaign</th><th>Format</th><th>Tahap</th><th>Tayang</th></tr></thead><tbody>
        {all.filter(({ x }) => stageFilter === "Semua" || stageOf(x.status) === stageFilter).map(({ c, x }) => <tr key={c.id + x.day} className="cp-row" onClick={() => setOpenRef({ campaignId: c.id, day: x.day })}><td>{pad(x.day)}</td><td><button className="cp-link" onClick={() => setOpenRef({ campaignId: c.id, day: x.day })}>{x.title}</button></td><td>{c.name}</td><td>{x.format}</td><td>{stageOf(x.status)}</td><td>{x.publishDate || "—"}</td></tr>)}
      </tbody></table></div></section>}

    {openCampaign && openItem && <ContentSheet campaign={openCampaign} item={openItem} onClose={() => setOpenRef(null)} onOpenStudio={() => onOpenStudio(openCampaign.id, openItem.day)} onDelete={() => { if (!window.confirm(`Hapus konten “${openItem.title}”? Brief dan storyboard-nya ikut terhapus.`)) return; patchCampaign(openCampaign.id, c => ({ ...c, items: c.items.filter(x => x.day !== openItem.day) })); dropTasks(t => t.campaignId === openCampaign.id && t.day === openItem.day); setOpenRef(null); notify("Konten dihapus."); }} />}

    {modal && <div className="modal-backdrop" onClick={() => setModal("")}><div className={`quick-modal ${modal === "campaign" ? "cp-modal" : "plan-v2-modal"}`} role="dialog" aria-label={modal === "campaign" ? "Tambahkan Campaign" : "Form"} onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setModal("")} aria-label="Tutup"><X size={18} /></button>
      {modal === "campaign" && <>
        <div className="cp-modal-head"><span className="modal-icon"><Layers3 size={21} /></span><div><h2>Tambahkan Campaign</h2><p>Buat campaign baru untuk menyusun rencana konten dan brief produksinya. Konten ditambahkan manual setelahnya.</p></div></div>
        <div className="cp-form">
          <div className="settings-field"><label htmlFor="n-acc">AKUN / BRAND *</label><select id="n-acc" value={form.account} onChange={e => setForm({ ...form, account: e.target.value, kind: "" })}>{plan.accounts.map(a => <option key={a}>{a}</option>)}</select></div>
          <div className="settings-field"><label htmlFor="n-name">NAMA CAMPAIGN *</label><input id="n-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Contoh: SPLENDID 2.0" /></div>
          <div className="settings-field"><label htmlFor="n-period">PERIODE CAMPAIGN *</label><input id="n-period" value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} placeholder="Des 2026 – Jan 2027" /></div>
          <div className="settings-field"><label htmlFor="n-goal">TARGET / OBJECTIVE</label><select id="n-goal" value={form.goal} onChange={e => setForm({ ...form, goal: e.target.value })}>{GOALS.map(g => <option key={g}>{g}</option>)}</select></div>
          <div className="settings-field"><label htmlFor="n-kind">JENIS CAMPAIGN</label><select id="n-kind" value={form.kind || defaultKind(form.account)} onChange={e => setForm({ ...form, kind: e.target.value as CampaignKind })}>{(Object.keys(KIND_LABEL) as CampaignKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></div>
          <div className="settings-field"><label htmlFor="n-target">TARGET JUMLAH KONTEN</label><input id="n-target" type="number" min={1} max={200} value={form.target} onChange={e => setForm({ ...form, target: Number(e.target.value) || 1 })} /></div>
          <div className="settings-field cp-wide"><label htmlFor="n-brief">DESKRIPSI CAMPAIGN *</label><textarea id="n-brief" rows={3} maxLength={250} value={form.brief} onChange={e => setForm({ ...form, brief: e.target.value })} placeholder="Campaign promosi unit properti di area Sudirman & SCBD, dengan pendekatan storytelling dan highlight keunggulan lokasi." /><small>{form.brief.length} / 250</small></div>
        </div>
        <div className="cp-modal-actions"><button className="outline-button" onClick={() => setModal("")}>Batal</button><button className="primary-button" onClick={createCampaign}>Buat Campaign</button></div>
      </>}
      {modal === "content" && campaign && <><span className="modal-icon"><FileText size={21} /></span><h2>Tambah konten</h2><p>{campaign.name} · tahap {draft.stage}</p><label htmlFor="c-title">JUDUL</label><input id="c-title" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} onKeyDown={e => { if (e.key === "Enter") addContent(); }} /><label htmlFor="c-format">FORMAT</label><select id="c-format" value={draft.format} onChange={e => setDraft({ ...draft, format: e.target.value })}>{FORMATS.map(f => <option key={f}>{f}</option>)}</select><label htmlFor="c-date">TANGGAL TAYANG (opsional)</label><input id="c-date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} placeholder="mis. 12 Des 2026" /><button className="primary-button" onClick={addContent}>Tambah konten</button></>}
      {modal === "account" && <><span className="modal-icon"><Users size={21} /></span><h2>Akun baru</h2><p>Tambahkan brand atau klien.</p><label htmlFor="m-acc">NAMA AKUN</label><input id="m-acc" value={form.account} onChange={e => setForm({ ...form, account: e.target.value })} placeholder="Contoh: Pawon Cabin" /><button className="primary-button" onClick={addAccount}>Simpan akun</button></>}
      {modal === "manage" && <><span className="modal-icon"><Pencil size={21} /></span><h2>Kelola akun</h2><p>Ganti nama berlaku untuk semua campaign di akun ini.</p><label htmlFor="m-rename">NAMA AKUN</label><input id="m-rename" value={form.account} onChange={e => setForm({ ...form, account: e.target.value })} /><button className="primary-button" onClick={() => renameAccount(accountFilter, form.account)}>Simpan nama</button><button className="outline-button x-danger f-delete-wide" onClick={() => deleteAccount(accountFilter)}><Trash2 size={15} /> Hapus akun</button></>}
    </div></div>}
  </div>;
}
