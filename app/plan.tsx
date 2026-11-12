"use client";

import { useState } from "react";
import { ArrowRight, CalendarDays, Check, ChevronRight, Download, FileText, Pencil, Play, Plus, Printer, Share2, Sparkles, Trash2, Users, X, Zap } from "lucide-react";
import { DriveBrowser } from "./assets";
import { enqueue, enqueueCampaign } from "./agents";
import { KIND_LABEL, PIPELINE, STAGES, STAGE_LABEL, isVideo, nextStep } from "./lib/flow";
import { addApproval, useIdeas, useSettings, useTasks, writeStored, type Task } from "./lib/store";
import { notify, useAiReady } from "./modules";
import { campaignHtml, defaultKind, makeBlankItems, patchCampaign, patchItem, usePlan, type CampaignContent, type CampaignData, type CampaignKind, type Scene } from "./plan-data";
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
    <div className="f-sheet-head"><div><span className="f-eyebrow">KONTEN {pad(item.day)} / {campaign.items.length} · {campaign.account}</span><input className="f-title" aria-label="Judul konten" value={item.title} onChange={e => set({ title: e.target.value })} /></div><button className="modal-close" onClick={onClose} aria-label="Tutup"><X size={18} /></button></div>
    <div className="f-meta-row">
      <div><label htmlFor="s-format">FORMAT</label><select id="s-format" value={item.format} onChange={e => set({ format: e.target.value as CampaignContent["format"] })}>{FORMATS.map(f => <option key={f}>{f}</option>)}</select></div>
      <div><label htmlFor="s-status">STATUS</label><select id="s-status" value={item.status} onChange={e => set({ status: e.target.value })}>{STAGES.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</select></div>
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

    {ideas.length > 0 && <div className="x-ideas"><label>INBOX IDE — pakai sebagai judul konten ini</label>{ideas.slice(0, 5).map(idea => <div key={idea}><span>{idea}</span><button className="outline-button" onClick={() => { set({ title: idea, board: [], production: "", schedule: "", status: "Planned" }); setIdeas(old => old.filter(x => x !== idea)); }}>Pakai</button></div>)}</div>}

    <div className="f-sheet-actions"><button className="outline-button x-danger f-delete" onClick={onDelete}><Trash2 size={15} /> Hapus konten</button><button className="primary-button" onClick={onOpenStudio}>Buka di Production Studio <ArrowRight size={15} /></button><button className="outline-button" onClick={() => { addApproval({ title: `${item.format} — ${item.title}`, by: "Content Plan", type: `${campaign.account} · diajukan manual`, body: `Hook: ${item.hook}\n\nStoryboard:\n${board.map(s => `• ${s.label} — ${s.visual}${s.text ? ` | "${s.text}"` : ""}`).join("\n")}\n\nCaption:\n${item.caption}\n\n${item.hashtags ?? ""}` }); set({ status: "In review" }); notify("Konten masuk ke antrean approval."); }}><Check size={15} /> Ajukan approval</button></div>
  </aside></div>;
}

export function ContentPlanPage({ onOpenStudio, onShare }: { onOpenStudio: (campaignId: string, day: number) => void; onShare: (data: CampaignData) => void }) {
  const [plan, setPlan] = usePlan();
  const [settings] = useSettings();
  const [tasks] = useTasks();
  const [accountFilter, setAccountFilter] = useState("Semua akun");
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [view, setView] = useState<"Papan" | "Daftar" | "Kalender">("Papan");
  const [format, setFormat] = useState("Semua");
  const [modal, setModal] = useState<"" | "account" | "manage" | "campaign" | "edit" | "content">("");
  const [form, setForm] = useState({ account: "", name: "", period: "Jan 2027", goal: "Awareness & engagement", title: "", format: "Reels", kind: "" as CampaignKind | "", brief: "", campaignAccount: "" });
  const ready = useAiReady();
  const campaign = plan.campaigns.find(c => c.id === campaignId) ?? null;
  const item = campaign?.items.find(x => x.day === openDay) ?? null;
  const visible = plan.campaigns.filter(c => accountFilter === "Semua akun" || c.account === accountFilter);
  const items = campaign ? campaign.items.filter(x => format === "Semua" || x.format === format) : [];
  const busyDays = new Set(tasks.filter(t => t.campaignId === campaignId && (t.status === "queued" || t.status === "running")).map(t => t.day));
  const stageCount = (c: CampaignData, s: string) => c.items.filter(x => x.status === s).length;
  const download = (d: CampaignData) => { const url = URL.createObjectURL(new Blob([campaignHtml(d)], { type: "text/html;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-content-plan.html"; a.click(); URL.revokeObjectURL(url); };
  const print = (d: CampaignData) => { const w = window.open("", "_blank"); if (!w) return notify("Izinkan pop-up untuk mencetak PDF."); w.document.open(); w.document.write(campaignHtml(d)); w.document.close(); w.onload = () => w.print(); };
  const addAccount = () => { const n = form.account.trim(); if (!n || plan.accounts.includes(n)) return; setPlan(o => ({ ...o, accounts: [...o.accounts, n] })); setForm(f => ({ ...f, account: "" })); setModal(""); };
  const newAccount = form.campaignAccount || (accountFilter === "Semua akun" ? plan.accounts[0] : accountFilter);
  const planTitles = (id: string) => { if (!ready) return notify("Isi API key di Settings → AI & Models, lalu tekan “Susun judul AI”."); notify(enqueue(id, 0, false, "plan") ? "Strategist menyusun judul dari brief campaign. Judul muncul di papan dalam beberapa detik." : "Penyusunan judul untuk campaign ini masih berjalan."); };
  const addCampaign = () => {
    if (!form.name.trim()) return;
    const id = "c" + Date.now();
    setPlan(o => ({ ...o, campaigns: [...o.campaigns, { id, account: newAccount, name: form.name.trim(), period: form.period, goal: form.goal, cover: "living", kind: form.kind || defaultKind(newAccount), brief: form.brief.trim(), auto: settings.autoRun, items: makeBlankItems(30, form.period, form.goal) }] }));
    setCampaignId(id); setModal(""); setForm(f => ({ ...f, name: "", brief: "", kind: "", campaignAccount: "" }));
    planTitles(id);
  };
  const [editId, setEditId] = useState<string | null>(null);
  const editing = plan.campaigns.find(c => c.id === editId) ?? campaign;
  const formAccount = form.campaignAccount || (modal === "edit" && editing ? editing.account : newAccount);
  const openEdit = (c: CampaignData) => { setForm(f => ({ ...f, campaignAccount: c.account, name: c.name, period: c.period, goal: c.goal, kind: c.kind ?? defaultKind(c.account), brief: c.brief ?? "" })); setEditId(c.id); setModal("edit"); };
  const deleteCampaign = (c: CampaignData) => {
    if (!window.confirm(`Hapus campaign “${c.name}” beserta ${c.items.length} kontennya? Tindakan ini tidak bisa dibatalkan.`)) return;
    setPlan(o => ({ ...o, campaigns: o.campaigns.filter(x => x.id !== c.id) })); dropTasks(t => t.campaignId === c.id);
    setModal(""); setEditId(null); if (campaignId === c.id) setCampaignId(null); notify("Campaign dihapus.");
  };
  const renameAccount = (from: string, to: string) => {
    const name = to.trim(); if (!name || name === from) return setModal("");
    if (plan.accounts.includes(name)) return notify("Nama akun itu sudah ada.");
    setPlan(o => ({ accounts: o.accounts.map(a => (a === from ? name : a)), campaigns: o.campaigns.map(c => (c.account === from ? { ...c, account: name } : c)) }));
    setAccountFilter(name); setModal("");
  };
  const deleteAccount = (name: string) => {
    const owned = plan.campaigns.filter(c => c.account === name);
    if (!window.confirm(owned.length ? `Hapus akun “${name}” beserta ${owned.length} campaign di dalamnya?` : `Hapus akun “${name}”?`)) return;
    const ids = new Set(owned.map(c => c.id));
    setPlan(o => ({ accounts: o.accounts.filter(a => a !== name), campaigns: o.campaigns.filter(c => c.account !== name) })); dropTasks(t => ids.has(t.campaignId));
    setAccountFilter("Semua akun"); setCampaignId(null); setModal(""); notify("Akun dihapus.");
  };
  const saveEdit = () => { if (!editing || !form.name.trim()) return; patchCampaign(editing.id, c => ({ ...c, account: form.campaignAccount || c.account, name: form.name.trim(), period: form.period, goal: form.goal, kind: form.kind || defaultKind(c.account), brief: form.brief.trim() })); setModal(""); };
  const addContent = () => { if (!campaign || !form.title.trim()) return; const day = Math.max(0, ...campaign.items.map(x => x.day)) + 1; patchCampaign(campaign.id, c => ({ ...c, items: [...c.items, { day, date: "Belum dijadwalkan", title: form.title.trim(), format: form.format as CampaignContent["format"], pillar: "Brand story", status: "Planned", goal: c.goal, hook: "", caption: "", visualDirection: "", cta: "", publishDate: "", scenes: [] }] })); setForm(f => ({ ...f, title: "" })); setModal(""); setOpenDay(day); };
  const Card = ({ x }: { x: CampaignContent }) => <button className="f-card" onClick={() => setOpenDay(x.day)}><span className="f-card-top"><b>{pad(x.day)}</b><em className={`f-fmt f-${x.format.toLowerCase()}`}>{x.format}</em>{busyDays.has(x.day) && <em className="f-fmt f-busy">Agen bekerja</em>}</span><strong className={x.untitled ? "f-untitled" : ""}>{x.title}</strong><small>{x.board?.length ? `${x.board.length} ${isVideo(x.format) ? "scene" : "slide"} · ` : "Belum ada storyboard · "}{x.publishDate || x.date}</small></button>;

  return <div className="module-page f-page">
    <div className="f-plan-toolbar"><div className="f-account-filter"><div className="f-toolbar-label"><span>WORKSPACE</span><b>Pilih akun</b></div><div className="f-chips" aria-label="Filter akun">{["Semua akun", ...plan.accounts].map(a => <button key={a} className={accountFilter === a ? "active" : ""} onClick={() => { setAccountFilter(a); setCampaignId(null); }}>{a}</button>)}</div></div><div className="f-plan-actions">{accountFilter !== "Semua akun" && <button className="outline-button" onClick={() => { setForm(f => ({ ...f, account: accountFilter })); setModal("manage"); }}><Pencil size={14} /> Kelola akun</button>}<button className="outline-button" onClick={() => setModal("account")}><Users size={14} /> Akun baru</button><button className="primary-button" onClick={() => { setForm(f => ({ ...f, campaignAccount: accountFilter === "Semua akun" ? plan.accounts[0] : accountFilter, kind: "" })); setModal("campaign"); }}><Plus size={15} /> Tambahkan Campaign</button></div></div>

    {!campaign ? <>
      {!visible.length && <p className="x-empty">Belum ada campaign untuk akun ini. Buat campaign pertama.</p>}
      <div className="f-overview-heading"><div><span className="f-eyebrow">CONTENT WORKSPACE</span><h2>{accountFilter === "Semua akun" ? "Semua campaign" : `Campaign ${accountFilter}`}</h2><p>Kelola campaign dan pantau progres produksi konten dari satu tempat.</p></div><span className="f-campaign-count">{visible.length} campaign</span></div><div className="f-campaigns">{visible.map(c => <article key={c.id} className="f-campaign">
        <div className="f-campaign-actions"><button aria-label={`Edit campaign ${c.name}`} title="Edit campaign" onClick={() => openEdit(c)}><Pencil size={16} /></button><button aria-label={`Hapus campaign ${c.name}`} title="Hapus campaign" className="x-danger" onClick={() => deleteCampaign(c)}><Trash2 size={16} /></button></div>
        <button className="f-campaign-open" onClick={() => { setCampaignId(c.id); setFormat("Semua"); }}>
        <ImageTile kind={c.cover} className="f-cover" />
        <div className="f-campaign-body"><span className="f-eyebrow">{c.account} · {c.period}{c.auto ? " · agen otomatis" : ""}</span><h3>{c.name}</h3><p>{c.goal} · {c.items.length} konten</p>
          <div className="f-progress" role="img" aria-label={STAGES.map(s => `${STAGE_LABEL[s]} ${stageCount(c, s)}`).join(", ")}>{STAGES.map(s => stageCount(c, s) > 0 && <i key={s} className={`st-${s.replace(/\s/g, "")}`} style={{ flexGrow: stageCount(c, s) }} />)}</div>
          <div className="f-legend">{STAGES.map(s => <span key={s}><b>{stageCount(c, s)}</b> {STAGE_LABEL[s]}</span>)}</div></div>
      </button></article>)}</div>
    </> : <>
      <div className="f-trail"><button onClick={() => setCampaignId(null)}>Semua campaign</button><ChevronRight size={14} /><b>{campaign.name}</b></div>
      <section className="f-hero"><div><span className="f-eyebrow">{campaign.account} · {campaign.period}</span><h2>{campaign.name}</h2><p>{KIND_LABEL[campaign.kind ?? defaultKind(campaign.account)]} · {campaign.goal} · {campaign.items.length} konten · {campaign.items.filter(x => x.board?.length).length} sudah punya storyboard</p>{!campaign.brief && <p className="f-hero-hint">Belum ada brief campaign. Isi lewat “Brief campaign” agar judul dan storyboard dari agen relevan.</p>}</div>
        <div className="f-hero-actions"><button onClick={() => { if (campaign.items.some(x => x.untitled)) return planTitles(campaign.id); const n = enqueueCampaign(campaign.id, 5); notify(n ? `${n} konten masuk antrean agen.` : "Semua konten sudah digarap atau sedang antre."); }}><Sparkles size={15} /> {campaign.items.some(x => x.untitled) ? "Susun judul AI" : "Garap 5 konten berikutnya"}</button><button onClick={() => openEdit(campaign)}><FileText size={15} /> Brief campaign</button>{!campaign.items.some(x => x.untitled) && <button onClick={() => planTitles(campaign.id)}><Sparkles size={15} /> Susun ulang judul</button>}<button aria-pressed={!!campaign.auto} onClick={() => patchCampaign(campaign.id, c => ({ ...c, auto: !c.auto }))}><Zap size={15} /> {campaign.auto ? "Otomatis: nyala" : "Otomatis: mati"}</button><button onClick={() => onShare(campaign)}><Share2 size={15} /> Bagikan</button><button onClick={() => download(campaign)}><Download size={15} /> HTML</button><button onClick={() => print(campaign)}><Printer size={15} /> PDF</button></div>
      </section>
      <div className="f-board-toolbar"><div className="f-view-filter"><span>TAMPILAN</span><div className="f-chips" role="tablist">{(["Papan", "Daftar", "Kalender"] as const).map(v => <button key={v} role="tab" aria-selected={view === v} className={view === v ? "active" : ""} onClick={() => setView(v)}>{v}</button>)}</div></div><div className="f-format-filter"><span>FORMAT</span><div className="f-chips">{["Semua", ...FORMATS].map(f => <button key={f} className={format === f ? "active" : ""} onClick={() => setFormat(f)}>{f}</button>)}</div></div><button className="primary-button f-add-content" onClick={() => setModal("content")}><Plus size={15} /> Tambah konten</button></div>
      {view === "Papan" && <div className="f-kanban">{STAGES.map(s => <section key={s} className={`f-col st-${s.replace(/\s/g, "")}`}><header><b>{STAGE_LABEL[s]}</b><span>{items.filter(x => x.status === s).length}</span></header>{items.filter(x => x.status === s).map(x => <Card key={x.day} x={x} />)}{!items.some(x => x.status === s) && <p className="x-empty">Kosong</p>}</section>)}</div>}
      {view === "Daftar" && <div className="f-list">{items.map(x => <button key={x.day} className="f-row" onClick={() => setOpenDay(x.day)}><b>{pad(x.day)}</b><span><strong>{x.title}</strong><small>{x.format} · {x.pillar} · {x.publishDate || x.date}</small></span><em className={`x-status st-${x.status.replace(/\s/g, "")}`}>{STAGE_LABEL[x.status] ?? x.status}</em><ChevronRight size={16} /></button>)}</div>}
      {view === "Kalender" && <div className="x-cal">{items.map(x => <button key={x.day} className={x.status === "Published" || x.status === "Scheduled" ? "ok" : ""} onClick={() => setOpenDay(x.day)}><b>{x.publishDate || x.date}</b><span>{x.format} · {STAGE_LABEL[x.status] ?? x.status}</span><small>{x.title}</small></button>)}</div>}
    </>}

    {campaign && item && <ContentSheet campaign={campaign} item={item} onClose={() => setOpenDay(null)} onOpenStudio={() => onOpenStudio(campaign.id, item.day)} onDelete={() => { if (!window.confirm(`Hapus konten “${item.title}”? Brief dan storyboard-nya ikut terhapus.`)) return; patchCampaign(campaign.id, c => ({ ...c, items: c.items.filter(x => x.day !== item.day) })); dropTasks(t => t.campaignId === campaign.id && t.day === item.day); setOpenDay(null); notify("Konten dihapus."); }} />}

    {modal && <div className="modal-backdrop" onClick={() => setModal("")}><div className={`quick-modal plan-v2-modal ${modal === "campaign" ? "f-campaign-modal" : ""}`} onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setModal("")} aria-label="Tutup"><X size={18} /></button>
      {modal === "manage" && <><span className="modal-icon"><Pencil size={21} /></span><h2>Kelola akun</h2><p>Ganti nama berlaku untuk semua campaign di akun ini.</p><label htmlFor="m-rename">NAMA AKUN</label><input id="m-rename" value={form.account} onChange={e => setForm(f => ({ ...f, account: e.target.value }))} /><button className="primary-button" onClick={() => renameAccount(accountFilter, form.account)}>Simpan nama</button><button className="outline-button x-danger f-delete-wide" onClick={() => deleteAccount(accountFilter)}><Trash2 size={15} /> Hapus akun</button></>}
      {modal === "account" && <><span className="modal-icon"><Users size={21} /></span><h2>Akun baru</h2><p>Tambahkan brand atau klien.</p><label htmlFor="m-acc">NAMA AKUN</label><input id="m-acc" value={form.account} onChange={e => setForm(f => ({ ...f, account: e.target.value }))} placeholder="Contoh: Pawon Cabin" /><button className="primary-button" onClick={addAccount}>Simpan akun</button></>}
      {modal === "campaign" && <><div className="f-modal-intro"><span className="modal-icon"><CalendarDays size={21} /></span><div><span className="f-eyebrow">CONTENT PLANNER</span><h2>Tambahkan Campaign</h2><p>Buat ruang kerja campaign baru. Setiap campaign menyiapkan 30 slot konten yang bisa dikembangkan menjadi brief dan storyboard.</p></div></div><div className="f-modal-fields"><div className="f-modal-field"><label htmlFor="m-acc2">AKUN / BRAND</label><select id="m-acc2" value={formAccount} onChange={e => setForm(f => ({ ...f, campaignAccount: e.target.value, kind: "" }))}>{plan.accounts.map(a => <option key={a}>{a}</option>)}</select></div><div className="f-modal-field"><label htmlFor="m-name">NAMA CAMPAIGN</label><input id="m-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Contoh: Christmas & New Year 2026" autoFocus /></div><div className="f-modal-field"><label htmlFor="m-kind">JENIS CAMPAIGN</label><select id="m-kind" value={form.kind || defaultKind(formAccount)} onChange={e => setForm(f => ({ ...f, kind: e.target.value as CampaignKind }))}>{(Object.keys(KIND_LABEL) as CampaignKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></div><div className="f-modal-field"><label htmlFor="m-period">PERIODE</label><input id="m-period" value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} placeholder="Contoh: Des 2026 – Jan 2027" /></div><div className="f-modal-field f-modal-wide"><label htmlFor="m-brief">BRIEF CAMPAIGN</label><textarea id="m-brief" rows={4} value={form.brief} onChange={e => setForm(f => ({ ...f, brief: e.target.value }))} placeholder="Jelaskan produk atau layanan, target audiens, pesan utama, penawaran, dan CTA campaign..." /><small>Brief ini menjadi konteks utama untuk AI Strategist saat menyusun 30 ide konten.</small></div><div className="f-modal-field f-modal-wide"><label htmlFor="m-goal">TUJUAN CAMPAIGN</label><select id="m-goal" value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))}>{["Awareness & engagement", "Lead generation", "Bookings", "Sales conversion"].map(g => <option key={g}>{g}</option>)}</select></div></div><div className="f-modal-footer"><span>30 content slots · Bisa diedit kapan saja</span><button className="primary-button" onClick={addCampaign} disabled={!form.name.trim()}><Plus size={15}/> Buat campaign</button></div></>}
      {modal === "edit" && <><span className="modal-icon"><FileText size={21} /></span><h2>Brief campaign</h2><p>Dipakai agen untuk menyusun judul, brief, dan storyboard. Setelah disimpan, tekan “Susun ulang judul” bila judul lama tidak relevan.</p><label htmlFor="m-acc2">AKUN</label><select id="m-acc2" value={formAccount} onChange={e => setForm(f => ({ ...f, campaignAccount: e.target.value, kind: "" }))}>{plan.accounts.map(a => <option key={a}>{a}</option>)}</select><label htmlFor="m-name">NAMA CAMPAIGN</label><input id="m-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /><label htmlFor="m-kind">JENIS CAMPAIGN</label><select id="m-kind" value={form.kind || defaultKind(formAccount)} onChange={e => setForm(f => ({ ...f, kind: e.target.value as CampaignKind }))}>{(Object.keys(KIND_LABEL) as CampaignKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select><label htmlFor="m-brief">BRIEF CAMPAIGN</label><textarea id="m-brief" rows={4} value={form.brief} onChange={e => setForm(f => ({ ...f, brief: e.target.value }))} placeholder="Contoh: Villa Syllo, villa 4 kamar di Lembang, Bandung. Kolam renang privat, view pegunungan, cocok untuk keluarga dan gathering 15 orang. Target: keluarga Jakarta–Bandung. CTA: booking via WhatsApp." /><label htmlFor="m-period">PERIODE</label><input id="m-period" value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} /><label htmlFor="m-goal">TUJUAN</label><select id="m-goal" value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))}>{["Awareness & engagement", "Lead generation", "Bookings", "Sales conversion"].map(g => <option key={g}>{g}</option>)}</select><button className="primary-button" onClick={saveEdit}>Simpan brief</button>{editing && <button className="outline-button x-danger f-delete-wide" onClick={() => deleteCampaign(editing)}><Trash2 size={15} /> Hapus campaign</button>}</>}
      {modal === "content" && <><span className="modal-icon"><FileText size={21} /></span><h2>Konten baru</h2><p>Cukup judul dan format. Brief dan storyboard bisa diisi agen.</p><label htmlFor="m-title">JUDUL</label><input id="m-title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /><label htmlFor="m-format">FORMAT</label><select id="m-format" value={form.format} onChange={e => setForm(f => ({ ...f, format: e.target.value }))}>{FORMATS.map(f => <option key={f}>{f}</option>)}</select><button className="primary-button" onClick={addContent}>Tambah konten</button></>}
    </div></div>}
  </div>;
}
