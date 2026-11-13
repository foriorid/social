"use client";

// Photo Delivery (admin): client galleries fed from Google Drive folders. Copied from the FORIOR Workspace
// module with the same workflow and data shape; stored in Supabase `galleries` (owner-only via RLS).
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpDown, Building2, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Copy, Download, ExternalLink, FileText, FolderOpen, Heart, History, Images, LayoutGrid, Link2, List, Mail, MessageCircle, MessageSquare, MoreHorizontal, Pencil, Plus, RefreshCw, RotateCcw, Search, Trash2, User, X } from "lucide-react";
import { listDriveFolder } from "./assets";
import { driveFolderId } from "./lib/flow";
import { callServer, supabase } from "./lib/cloud";
import { notify, useCloud } from "./modules";
import { PHASES, PHASE_LABEL, PHASE_SHORT, fromWorkspace, newGallery, setPhase, slugify, uniqueSlug, withFolder, type FolderType, type Gallery, type Phase, type Photo } from "../supabase/functions/gallery/delivery";

type Row = { id: string; slug: string; data: Gallery; updated_at: string };
const FOLDER_MIME = "application/vnd.google-apps.folder";
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true });
export const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const PHASE_CLASS: Record<Phase, string> = { Preview: "dl-p-preview", "Client Selection": "dl-p-selection", "Editing Progress": "dl-p-editing", "Client Review": "dl-p-review", Revision: "dl-p-revision", Done: "dl-p-done" };

/** Public link for the client. Vercel rewrites /gallery/<slug>; other hosts use ?g=. */
export function galleryLink(slug: string) {
  if (typeof window === "undefined") return "";
  const root = window.location.pathname.replace(/\/(gallery\/.*)?$/, "");
  return window.location.hostname.endsWith("github.io") ? `${window.location.origin}${root}/gallery/?g=${slug}` : `${window.location.origin}${root}/gallery/${slug}`;
}

/** Lists a Drive folder like the Workspace did: one level of sub-folders becomes photo sections. */
async function listSectioned(folderUrl: string) {
  const id = driveFolderId(folderUrl);
  if (!id) throw new Error("Link bukan folder Google Drive. Tempel link folder lengkap.");
  const files = await listDriveFolder(id);
  const subs = files.filter(f => f.mimeType === FOLDER_MIME).sort(byName);
  const images = (list: typeof files) => list.filter(f => f.mimeType.startsWith("image/")).sort(byName);
  if (!subs.length) return images(files).map(f => ({ id: f.id, name: f.name, section: null }));
  const out: { id: string; name: string; section: string }[] = [];
  for (const s of subs) for (const f of images(await listDriveFolder(s.id))) out.push({ id: f.id, name: f.name, section: s.name });
  return out;
}

/** Workflow steps. With onPick (admin), each step is a button that moves the gallery to that phase. */
export function PhaseTracker({ phase, onPick }: { phase: Phase; onPick?: (p: Phase) => void }) {
  const at = PHASES.indexOf(phase);
  return <ol className={`dl-tracker ${onPick ? "pickable" : ""}`}>{PHASES.map((p, i) => {
    const inner = <><span>{i < at ? <Check size={14} /> : i + 1}</span><small>{PHASE_SHORT[p]}</small></>;
    return <li key={p} className={i < at ? "done" : i === at ? "now" : ""}>{onPick ? <button onClick={() => p !== phase && onPick(p)} title={PHASE_LABEL[p]} aria-current={p === phase ? "step" : undefined}>{inner}</button> : inner}</li>;
  })}</ol>;
}

function useGalleries() {
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const { data, error } = await supabase.from("galleries").select("id, slug, data, updated_at").order("created_at", { ascending: false });
    if (error) { setError(error.message); setState("error"); } else { setRows((data ?? []) as Row[]); setState("ready"); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return { rows, setRows, state, error, load };
}

export function DeliveryPage() {
  const [cloud] = useCloud();
  if (!cloud.email) return <div className="module-page"><section className="panel dl-empty"><Images size={28} /><h3>Masuk dulu untuk memakai Photo Delivery</h3><p>Galeri klien disimpan di database akun Anda. Buka Settings → Akun, masuk, lalu kembali ke sini.</p></section></div>;
  return <DeliveryInner />;
}

function DeliveryInner() {
  const { rows, setRows, state, error, load } = useGalleries();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState(""), [phase, setPhaseFilter] = useState<"" | Phase>("");
  const open = rows.find(r => r.id === openId);

  const save = async (row: Row, data: Gallery) => {
    const prev = rows;
    setRows(rs => rs.map(r => (r.id === row.id ? { ...r, slug: data.slug, data } : r)));
    const { error } = await supabase.from("galleries").update({ slug: data.slug, data, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (error) { setRows(prev); notify(error.message.includes("duplicate") ? "Permalink sudah dipakai galeri lain." : `Gagal menyimpan: ${error.message}`); return false; }
    return true;
  };
  const remove = async (row: Row) => {
    if (!window.confirm(`Hapus galeri “${row.data.title}”? Link klien akan berhenti bekerja. Foto di Google Drive tidak terhapus.`)) return;
    const { error } = await supabase.from("galleries").delete().eq("id", row.id);
    if (error) return notify(`Gagal menghapus: ${error.message}`);
    setRows(rs => rs.filter(r => r.id !== row.id)); setOpenId(null); notify("Galeri dihapus.");
  };

  if (open) return <GalleryManage row={open} onBack={() => setOpenId(null)} onSave={data => save(open, data)} onDelete={() => remove(open)} />;
  const shown = rows.filter(r => (!phase || r.data.phase === phase) && `${r.data.title} ${r.data.client?.company ?? ""} ${r.data.client?.contact ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const count = (p: Phase[]) => rows.filter(r => p.includes(r.data.phase)).length;

  return <div className="module-page dl-page">
    <section className="dl-stats">
      <article className="panel"><small>Total galeri</small><b>{rows.length}</b></article>
      <article className="panel"><small>Menunggu klien</small><b>{count(["Preview", "Client Review"])}</b></article>
      <article className="panel"><small>Sedang dikerjakan</small><b>{count(["Client Selection", "Editing Progress", "Revision"])}</b></article>
      <article className="panel"><small>Selesai</small><b>{count(["Done"])}</b></article>
    </section>
    <section className="panel dl-list-panel">
      <div className="dl-toolbar">
        <div className="search-field"><Search size={15} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari galeri atau klien…" aria-label="Cari galeri" /></div>
        <div className="f-chips">{(["", ...PHASES] as const).map(p => <button key={p || "all"} className={phase === p ? "active" : ""} onClick={() => setPhaseFilter(p)}>{p ? PHASE_SHORT[p] : "Semua"}</button>)}</div>
        <button className="outline-button" onClick={load} aria-label="Muat ulang"><RefreshCw size={15} /></button>
        <button className="outline-button" onClick={() => setImporting(true)}><Download size={15} /> Impor dari Workspace</button>
        <button className="primary-button" onClick={() => setCreating(true)}><Plus size={15} /> Galeri baru</button>
      </div>
      {state === "loading" && <p className="x-empty">Memuat galeri…</p>}
      {state === "error" && <p className="x-error">{error}</p>}
      {state === "ready" && !rows.length && <div className="dl-empty"><Images size={28} /><h3>Belum ada galeri</h3><p>Buat galeri, tempel link folder Google Drive berisi foto preview, lalu kirim link-nya ke klien untuk memilih foto.</p><button className="primary-button" onClick={() => setCreating(true)}><Plus size={15} /> Galeri baru</button></div>}
      <div className="dl-grid">{shown.map(r => { const g = r.data, picked = g.previewPhotos.filter(p => p.selected).length, cover = (g.finalPhotos[0] ?? g.draftPhotos[0] ?? g.previewPhotos[0])?.thumbnailUrl;
        return <button key={r.id} className="dl-card" onClick={() => setOpenId(r.id)}>
          <span className="dl-cover">{cover ? <img src={cover} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <Images size={26} />}<em className={`dl-phase ${PHASE_CLASS[g.phase]}`}>{PHASE_SHORT[g.phase]}</em></span>
          <span className="dl-card-body"><b>{g.title}</b><small>{[g.client?.company, g.client?.contact].filter(Boolean).join(" · ") || "Tanpa klien"}</small>
            <span className="dl-card-meta"><span><Images size={13} /> {g.previewPhotos.length} foto</span><span><Heart size={13} /> {picked}{g.selectionLimit ? ` / ${g.selectionLimit}` : ""} dipilih</span>{g.revisions.some(x => x.status === "Open") && <span className="dl-warn"><MessageSquare size={13} /> revisi</span>}</span></span>
        </button>; })}</div>
      {state === "ready" && rows.length > 0 && !shown.length && <p className="x-empty">Tidak ada galeri yang cocok.</p>}
    </section>
    {importing && <ImportModal rows={rows} onClose={() => setImporting(false)} onDone={load} />}
    {creating && <NewGalleryModal taken={rows.map(r => r.slug)} onClose={() => setCreating(false)} onCreated={row => { setRows(rs => [row, ...rs]); setCreating(false); setOpenId(row.id); }} />}
  </div>;
}

type WsGallery = Record<string, unknown> & { id?: string; slug?: string; title?: string; phase?: string; createdAt?: string; client?: { company?: string; contact?: string }; previewPhotos?: unknown[] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Copies galleries from the Workspace app (app.forior.id). Read-only on the Workspace side; the password is used once. */
function ImportModal({ rows, onClose, onDone }: { rows: Row[]; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [list, setList] = useState<WsGallery[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const existing = new Map(rows.map(r => [r.id, r]));
  const fetchList = async () => {
    setBusy(true); setError("");
    try {
      const { galleries } = await callServer<{ galleries: WsGallery[] }>("workspace.galleries", { email, password });
      const sorted = [...galleries].sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
      setList(sorted); setPassword("");
      setChosen(new Set(sorted.filter(g => !existing.has(String(g.id))).slice(0, 5).map(g => String(g.id))));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const toggle = (id: string) => setChosen(old => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const run = async () => {
    if (!list) return;
    setBusy(true); setError("");
    const taken = new Set(rows.map(r => r.slug));
    let added = 0, updated = 0;
    try {
      for (const doc of list.filter(g => chosen.has(String(g.id)))) {
        const old = existing.get(String(doc.id));
        const id = old?.id ?? (UUID.test(String(doc.id)) ? String(doc.id) : crypto.randomUUID());
        const slug = old?.slug ?? uniqueSlug(slugify(String(doc.slug || doc.projectName || doc.title || "galeri")), taken);
        taken.add(slug);
        const data = { ...fromWorkspace({ ...doc, id }, slug), importedFrom: "app.forior.id", importedAt: new Date().toISOString() };
        const { error } = old ? await supabase.from("galleries").update({ data, updated_at: new Date().toISOString() }).eq("id", id) : await supabase.from("galleries").insert({ id, slug, data });
        if (error) throw new Error(`${doc.title}: ${error.message}`);
        if (old) updated++; else added++;
      }
      notify(`${added} galeri disalin${updated ? `, ${updated} diperbarui` : ""} dari Workspace.`);
      onDone(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); onDone(); } finally { setBusy(false); }
  };
  return <div className="modal-backdrop" onClick={() => !busy && onClose()}><div className="quick-modal cp-modal" role="dialog" aria-label="Impor dari Workspace" onClick={e => e.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Tutup"><X size={18} /></button>
    <div className="cp-modal-head"><span className="modal-icon"><Download size={21} /></span><div><h2>Impor dari Workspace</h2><p>Salin galeri Photo Delivery dari app.forior.id ke sini. Galeri di Workspace tidak diubah atau dihapus.</p></div></div>
    {!list ? <>
      <div className="cp-form">
        <div className="settings-field full"><label htmlFor="ws-email">Email Workspace</label><input id="ws-email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div className="settings-field full"><label htmlFor="ws-pass">Kata sandi Workspace</label><input id="ws-pass" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && email && password) fetchList(); }} /><small className="dl-hint">Hanya dipakai sekali untuk membaca daftar galeri. Tidak disimpan.</small></div>
      </div>
      {error && <p className="x-error">{error}</p>}
      <div className="cp-modal-actions"><button className="outline-button" onClick={onClose}>Batal</button><button className="primary-button" disabled={busy || !email || !password} onClick={fetchList}>{busy ? "Membaca…" : "Lihat galeri Workspace"}</button></div>
    </> : <>
      <p className="dl-hint">{list.length} galeri di Workspace, terbaru di atas. 5 terbaru yang belum ada di sini sudah dicentang.</p>
      <div className="dl-import-list">{list.map(g => { const id = String(g.id), have = existing.has(id), photos = Array.isArray(g.previewPhotos) ? g.previewPhotos.length : 0;
        return <label key={id} className={`dl-import-row ${chosen.has(id) ? "on" : ""}`}><input type="checkbox" checked={chosen.has(id)} onChange={() => toggle(id)} />
          <span><b>{g.title || "Tanpa judul"}</b><small>{[g.client?.company, g.client?.contact].filter(Boolean).join(" · ") || "Tanpa klien"} · {photos} foto · {fmtDate(g.createdAt)}</small></span>
          <em className={`dl-phase ${PHASE_CLASS[(PHASES as readonly string[]).includes(String(g.phase)) ? (g.phase as Phase) : "Preview"]}`}>{PHASE_SHORT[(PHASES as readonly string[]).includes(String(g.phase)) ? (g.phase as Phase) : "Preview"]}</em>
          {have && <i className="dl-badge green">{chosen.has(id) ? "Sudah ada · akan diperbarui" : "Sudah ada di sini"}</i>}</label>; })}</div>
      {error && <p className="x-error">{error}</p>}
      <div className="cp-modal-actions"><button className="outline-button" onClick={() => setList(null)} disabled={busy}>Kembali</button><button className="primary-button" disabled={busy || !chosen.size} onClick={run}>{busy ? "Menyalin…" : `Salin ${chosen.size} galeri`}</button></div>
    </>}
  </div></div>;
}

function NewGalleryModal({ taken, onClose, onCreated }: { taken: string[]; onClose: () => void; onCreated: (row: Row) => void }) {
  const [form, setForm] = useState({ title: "", company: "", contact: "", whatsapp: "", email: "", selectionLimit: "", rawSelectionLimit: "", previewFolderUrl: "" });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  const create = async () => {
    if (!form.title.trim()) return setError("Isi judul galeri.");
    setBusy(true); setError("");
    try {
      const id = crypto.randomUUID();
      let g = newGallery({ id, slug: uniqueSlug(slugify(form.title), taken), title: form.title.trim(), client: { company: form.company, contact: form.contact, whatsapp: form.whatsapp, email: form.email }, selectionLimit: Number(form.selectionLimit), rawSelectionLimit: Number(form.rawSelectionLimit), previewFolderUrl: form.previewFolderUrl.trim() });
      let warning = "";
      if (g.previewFolderUrl) { try { g = withFolder(g, "preview", g.previewFolderUrl, await listSectioned(g.previewFolderUrl)); } catch (e) { warning = e instanceof Error ? e.message : String(e); } }
      const { data, error } = await supabase.from("galleries").insert({ id, slug: g.slug, data: g }).select("id, slug, data, updated_at").single();
      if (error) throw new Error(error.message);
      notify(warning ? `Galeri dibuat, tapi foto belum termuat: ${warning}` : `Galeri dibuat${g.previewPhotos.length ? ` dengan ${g.previewPhotos.length} foto` : ""}.`);
      onCreated(data as Row);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return <div className="modal-backdrop" onClick={onClose}><div className="quick-modal cp-modal" role="dialog" aria-label="Galeri baru" onClick={e => e.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Tutup"><X size={18} /></button>
    <div className="cp-modal-head"><span className="modal-icon"><Images size={21} /></span><div><h2>Galeri Photo Delivery baru</h2><p>Klien membuka link galeri, memilih foto, lalu me-review hasil edit. Foto tetap di Google Drive.</p></div></div>
    <div className="cp-form">
      <div className="settings-field full"><label htmlFor="g-title">Judul galeri *</label><input id="g-title" value={form.title} onChange={set("title")} placeholder="mis. Villa Ubud" /></div>
      <div className="settings-field"><label htmlFor="g-company">Perusahaan klien</label><input id="g-company" value={form.company} onChange={set("company")} /></div>
      <div className="settings-field"><label htmlFor="g-contact">Nama PIC</label><input id="g-contact" value={form.contact} onChange={set("contact")} /></div>
      <div className="settings-field"><label htmlFor="g-wa">WhatsApp</label><input id="g-wa" value={form.whatsapp} onChange={set("whatsapp")} placeholder="+62 …" /></div>
      <div className="settings-field"><label htmlFor="g-email">Email</label><input id="g-email" value={form.email} onChange={set("email")} /></div>
      <div className="settings-field"><label htmlFor="g-limit">Kuota foto Edit</label><input id="g-limit" type="number" min="0" value={form.selectionLimit} onChange={set("selectionLimit")} placeholder="mis. 30 (0 = tanpa batas)" /></div>
      <div className="settings-field"><label htmlFor="g-raw">Kuota foto RAW</label><input id="g-raw" type="number" min="0" value={form.rawSelectionLimit} onChange={set("rawSelectionLimit")} placeholder="0 = tanpa tahap RAW" /></div>
      <div className="settings-field full"><label htmlFor="g-folder">Folder Google Drive — foto preview</label><input id="g-folder" value={form.previewFolderUrl} onChange={set("previewFolderUrl")} placeholder="https://drive.google.com/drive/folders/…" /><small className="dl-hint">Bagikan folder sebagai “Siapa saja yang memiliki link”. Sub-folder (mis. “Kamar 1”, “Lobby”) tampil sebagai bagian. Bisa juga diisi nanti.</small></div>
    </div>
    {error && <p className="x-error">{error}</p>}
    <div className="cp-modal-actions"><button className="outline-button" onClick={onClose}>Batal</button><button className="primary-button" onClick={create} disabled={busy}>{busy ? "Membuat…" : "Buat galeri"}</button></div>
  </div></div>;
}


const FOLDERS: Record<FolderType, { label: string; hint: string; key: "previewFolderUrl" | "draftFolderUrl" | "revisionFolderUrl" | "finalFolderUrl" }> = {
  preview: { label: "Foto preview", key: "previewFolderUrl", hint: "Foto yang dipilih klien. Sub-folder tampil sebagai bagian. Memuat ulang tidak menghapus pilihan dan catatan klien." },
  draft: { label: "Draft (hasil edit)", key: "draftFolderUrl", hint: "Hasil edit foto pilihan, untuk di-review klien." },
  revision: { label: "Hasil revisi", key: "revisionFolderUrl", hint: "Foto setelah revisi, agar klien bisa me-review lagi." },
  final: { label: "Foto final (resolusi tinggi)", key: "finalFolderUrl", hint: "Foto final yang ditampilkan dan diunduh klien di tahap Selesai." }
};
const SET_LABEL: Record<FolderType, string> = { preview: "Preview", draft: "Draft", revision: "Revisi", final: "Final" };
const photosOf = (g: Gallery, t: FolderType) => (t === "preview" ? g.previewPhotos : t === "draft" ? g.draftPhotos : t === "revision" ? g.revisionPhotos : g.finalPhotos);
/** The photo set that matches the phase (what the client is looking at), falling back to the newest set that exists. */
function stageSet(g: Gallery): FolderType {
  const order: FolderType[] = g.phase === "Done" ? ["final", "revision", "draft"] : g.phase === "Revision" ? ["revision", "draft"] : g.phase === "Client Review" || g.phase === "Editing Progress" ? ["draft"] : ["preview"];
  return order.find(t => photosOf(g, t).length) ?? order[0];
}
/** The deadline that matters for the current phase. */
function dueOf(g: Gallery): { label: string; date: string } {
  if (g.phase === "Preview" || g.phase === "Client Selection") return { label: "Pilih sebelum", date: g.selectByDate };
  if (g.phase === "Done") return { label: "Unduhan sampai", date: g.downloadExpiry };
  return { label: "Feedback sebelum", date: g.feedbackByDate };
}

function FolderModal({ type, initial, onLoad, onClose }: { type: FolderType; initial: string; onLoad: (url: string) => Promise<boolean>; onClose: () => void }) {
  const [url, setUrl] = useState(initial), [busy, setBusy] = useState(false);
  const info = FOLDERS[type];
  return <div className="modal-backdrop" onClick={() => !busy && onClose()}><div className="quick-modal cp-modal dl-small-modal" role="dialog" aria-label={`Muat ${info.label}`} onClick={e => e.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Tutup"><X size={18} /></button>
    <div className="cp-modal-head"><span className="modal-icon"><FolderOpen size={21} /></span><div><h2>{info.label}</h2><p>{info.hint}</p></div></div>
    <div className="settings-field full"><label htmlFor="fm-url">Link folder Google Drive</label><input id="fm-url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" autoFocus /><small className="dl-hint">Bagikan folder sebagai “Siapa saja yang memiliki link”.</small></div>
    <div className="cp-modal-actions">{initial && <a className="outline-button" href={initial} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Buka folder</a>}<button className="outline-button" onClick={onClose} disabled={busy}>Batal</button><button className="primary-button" disabled={busy || !url.trim()} onClick={async () => { setBusy(true); const ok = await onLoad(url.trim()); setBusy(false); if (ok) onClose(); }}><RefreshCw size={15} /> {busy ? "Memuat…" : "Muat foto"}</button></div>
  </div></div>;
}

function EditDetailsModal({ g, link, onSave, onClose }: { g: Gallery; link: string; onSave: (g: Gallery) => Promise<boolean>; onClose: () => void }) {
  const [form, setForm] = useState(() => toForm(g)), [busy, setBusy] = useState(false);
  const f = (k: keyof typeof form, label: string, type = "text") => <div className="settings-field"><label htmlFor={`e-${k}`}>{label}</label><input id={`e-${k}`} type={type} value={form[k]} onChange={e => setForm(x => ({ ...x, [k]: e.target.value }))} /></div>;
  const save = async () => {
    setBusy(true);
    const next: Gallery = { ...g, title: form.title.trim() || g.title, slug: slugify(form.slug || form.title), client: { company: form.company, contact: form.contact, whatsapp: form.whatsapp, email: form.email }, selectionLimit: Math.max(0, Number(form.selectionLimit) || 0), rawSelectionLimit: Math.max(0, Number(form.rawSelectionLimit) || 0), selectByDate: form.selectByDate, feedbackByDate: form.feedbackByDate, downloadExpiry: form.downloadExpiry };
    const ok = await onSave(next); setBusy(false);
    if (ok) { notify("Detail galeri disimpan."); onClose(); }
  };
  return <div className="modal-backdrop" onClick={() => !busy && onClose()}><div className="quick-modal cp-modal" role="dialog" aria-label="Edit detail galeri" onClick={e => e.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Tutup"><X size={18} /></button>
    <div className="cp-modal-head"><span className="modal-icon"><Pencil size={20} /></span><div><h2>Edit detail galeri</h2><p>Perubahan langsung terlihat di halaman klien.</p></div></div>
    <div className="cp-form dl-form">
      <div className="settings-field full"><label htmlFor="e-title">Judul</label><input id="e-title" value={form.title} onChange={e => setForm(x => ({ ...x, title: e.target.value }))} /></div>
      <div className="settings-field full"><label htmlFor="e-slug">Permalink</label><div className="dl-slug"><span>{link.replace(/^https?:\/\//, "").replace(/[^/=]*$/, "")}</span><input id="e-slug" value={form.slug} onChange={e => setForm(x => ({ ...x, slug: e.target.value }))} placeholder="nama-proyek" /></div></div>
      {f("company", "Klien / perusahaan")}{f("contact", "Nama PIC")}{f("whatsapp", "WhatsApp")}{f("email", "Email")}
      {f("selectionLimit", "Kuota Edit (0 = tanpa batas)", "number")}{f("rawSelectionLimit", "Kuota RAW (0 = nonaktif)", "number")}
      {f("selectByDate", "Pilih foto sebelum", "date")}{f("feedbackByDate", "Feedback sebelum", "date")}{f("downloadExpiry", "Unduhan sampai", "date")}
    </div>
    <div className="cp-modal-actions"><button className="outline-button" onClick={onClose} disabled={busy}>Batal</button><button className="primary-button" onClick={save} disabled={busy}><Check size={15} /> {busy ? "Menyimpan…" : "Simpan"}</button></div>
  </div></div>;
}

function AdminLightbox({ photos, index, setIndex }: { photos: Photo[]; index: number; setIndex: (i: number | null) => void }) {
  const p = photos[index];
  const go = (d: number) => setIndex((index + d + photos.length) % photos.length);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIndex(null); if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); };
    document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey);
  });
  if (!p) return null;
  return <div className="gv-lb" onClick={() => setIndex(null)}>
    <div className="gv-lb-top" onClick={e => e.stopPropagation()}><span>{p.name} <small>· {index + 1}/{photos.length}{p.section ? ` · ${p.section}` : ""}</small></span><button onClick={() => setIndex(null)} aria-label="Tutup"><X size={20} /></button></div>
    <div className="gv-lb-stage" onClick={e => e.stopPropagation()}><button className="gv-lb-nav" onClick={() => go(-1)} aria-label="Sebelumnya"><ChevronLeft size={24} /></button><img key={p.id} src={p.url} alt={p.name} referrerPolicy="no-referrer" /><button className="gv-lb-nav right" onClick={() => go(1)} aria-label="Berikutnya"><ChevronRight size={24} /></button></div>
    <div className="gv-lb-bottom dl-lb-info" onClick={e => e.stopPropagation()}>{p.selected && <span className="dl-tag edit">Dipilih untuk Edit</span>}{p.rawSelected && <span className="dl-tag raw">Dipilih RAW</span>}{p.note ? <p><MessageSquare size={14} /> {p.note}</p> : <p className="dl-muted">Tidak ada catatan klien.</p>}<a href={`https://drive.google.com/file/d/${p.id}/view`} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Buka di Drive</a></div>
  </div>;
}

const PER_PAGE = [12, 24, 48];
function pages(current: number, total: number): (number | "…")[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, current - 1, current, current + 1].filter(n => n >= 1 && n <= total));
  const list = [...set].sort((a, b) => a - b), out: (number | "…")[] = [];
  list.forEach((n, i) => { if (i && n - list[i - 1] > 1) out.push("…"); out.push(n); });
  return out;
}

function GalleryManage({ row, onBack, onSave, onDelete }: { row: Row; onBack: () => void; onSave: (g: Gallery) => Promise<boolean>; onDelete: () => void }) {
  const g = row.data;
  const link = galleryLink(g.slug);
  const [tab, setTab] = useState<"galeri" | "revisi" | "catatan" | "aktivitas">("galeri");
  const [set, setSet] = useState<FolderType>(() => stageSet(g));
  const [filter, setFilter] = useState(g.phase === "Client Selection" ? "edit" : "all");
  const [sort, setSort] = useState<"az" | "za">("az");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [perPage, setPerPage] = useState(12), [page, setPage] = useState(1);
  const [menu, setMenu] = useState<"" | "more" | "add">("");
  const [modal, setModal] = useState<"" | "edit" | FolderType>("");
  const [lb, setLb] = useState<number | null>(null);
  const [notes, setNotes] = useState(g.notes ?? "");
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setSlot(document.getElementById("page-heading-slot")); }, []);
  useEffect(() => { setSet(stageSet(g)); setFilter(g.phase === "Client Selection" ? "edit" : "all"); }, [g.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setNotes(g.notes ?? ""), [g.notes]);
  useEffect(() => setPage(1), [set, filter, sort, perPage]);

  const copy = () => { navigator.clipboard?.writeText(link); notify("Link klien disalin."); };
  const sendWA = () => {
    const num = String(g.client?.whatsapp || "").replace(/[^0-9]/g, "").replace(/^0/, "62");
    if (!num) return notify("Nomor WhatsApp klien belum diisi. Isi lewat Edit detail.");
    const action = g.phase === "Client Review" || g.phase === "Revision" ? "me-review hasil editan" : g.phase === "Done" ? "mengunduh foto final Anda" : "memilih foto favorit Anda";
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(`Halo ${g.client?.contact || ""}, galeri foto FORIOR "${g.title}" sudah siap. Silakan buka tautan ini untuk ${action}: ${link}`)}`, "_blank", "noopener");
  };
  const load = (type: FolderType) => async (url: string) => {
    try {
      const files = await listSectioned(url);
      if (!(await onSave(withFolder(g, type, url, files)))) return false;
      notify(`${files.length} foto ${SET_LABEL[type].toLowerCase()} dimuat dari Google Drive.`); setSet(type); setFilter("all"); setTab("galeri");
      return true;
    } catch (e) { notify(e instanceof Error ? e.message : String(e)); return false; }
  };
  const changePhase = (p: string) => {
    if (p === "Preview" && g.previewSubmittedAt && !window.confirm("Buka kembali pemilihan? Klien bisa mengubah pilihan lalu mengirim ulang. Pilihan dan catatan yang ada tetap tersimpan.")) return;
    onSave(setPhase(g, p)).then(ok => ok && notify(`Tahap diubah ke ${PHASE_SHORT[p as Phase] ?? p}.`));
  };
  const resolve = (id: string, status: "Open" | "Resolved") => onSave({ ...g, revisions: g.revisions.map(r => (r.id === id ? { ...r, status } : r)) });

  const picked = g.previewPhotos.filter(p => p.selected), raw = g.previewPhotos.filter(p => p.rawSelected);
  const openRev = g.revisions.filter(r => r.status === "Open").length;
  const due = dueOf(g);
  const available = (Object.keys(SET_LABEL) as FolderType[]).filter(t => photosOf(g, t).length || t === set);
  const all = photosOf(g, set);
  const shown = useMemo(() => {
    const list = all.filter(p => filter === "all" ? true : filter === "edit" ? p.selected : filter === "raw" ? p.rawSelected : filter === "none" ? !p.selected && !p.rawSelected : !!p.note);
    return [...list].sort((a, b) => (sort === "az" ? byName(a, b) : byName(b, a)));
  }, [all, filter, sort]);
  const pageCount = Math.max(1, Math.ceil(shown.length / perPage));
  const current = Math.min(page, pageCount);
  const visible = shown.slice((current - 1) * perPage, current * perPage);
  const filters: [string, string][] = set === "preview" ? [["all", "Semua status"], ["edit", "Dipilih Edit"], ["raw", "Dipilih RAW"], ["none", "Belum dipilih"], ["note", "Ada catatan"]] : [["all", "Semua foto"], ["note", "Ada catatan klien"]];
  const clientNotes = [...g.previewPhotos.filter(p => p.note).map(p => ({ p, set: "Preview" })), ...g.draftPhotos.filter(p => p.note).map(p => ({ p, set: "Draft" })), ...g.revisionPhotos.filter(p => p.note).map(p => ({ p, set: "Revisi" }))];
  const activity = [
    { at: g.createdAt, text: g.importedFrom ? "Galeri dibuat (disalin dari Workspace)" : "Galeri dibuat", icon: <Plus size={14} /> },
    { at: g.previewSubmittedAt, text: `Klien mengirim pilihan Edit (${picked.length} foto)`, icon: <Heart size={14} /> },
    { at: g.rawSubmittedAt, text: `Klien mengirim pilihan RAW (${raw.length} foto)`, icon: <Heart size={14} /> },
    ...(g.quotaAddons ?? []).map(a => ({ at: a.at, text: a.custom ? "Klien memilih paket bebas pilih" : `Klien menambah kuota +${a.photos} foto`, icon: <Plus size={14} /> })),
    ...g.revisions.map(r => ({ at: r.createdAt, text: `Klien minta revisi${r.photoNotes.length ? ` (${r.photoNotes.length} catatan foto)` : ""}`, icon: <MessageSquare size={14} /> })),
    { at: g.draftApprovedAt, text: "Klien menyetujui hasil edit", icon: <Check size={14} /> },
    { at: g.importedAt, text: "Data diperbarui dari Workspace", icon: <RefreshCw size={14} /> }
  ].filter((x): x is { at: string; text: string; icon: React.ReactElement } => !!x.at).sort((a, b) => b.at.localeCompare(a.at));

  const header = <div className="dl-top">
    <div className="dl-top-main">
      <nav className="dl-crumb" aria-label="Breadcrumb"><span>Workspace</span><ChevronRight size={13} /><button onClick={onBack}>Photo Delivery</button><ChevronRight size={13} /><b>{g.title}</b></nav>
      <h1>{g.title}</h1>
      <div className="dl-top-chips">{g.client?.company && <span className="dl-chip"><Building2 size={13} /> {g.client.company}</span>}<span className={`dl-phase ${PHASE_CLASS[g.phase]}`}><Check size={12} /> {PHASE_SHORT[g.phase]}</span>{due.date && <span className="dl-due"><Clock size={13} /> {due.label}: {fmtDate(due.date)}</span>}</div>
    </div>
    <div className="dl-top-actions">
      <div className="dropdown-wrap"><button className="outline-button dl-icon-btn" aria-label="Aksi lain" aria-expanded={menu === "more"} onClick={() => setMenu(menu === "more" ? "" : "more")}><MoreHorizontal size={17} /></button>
        {menu === "more" && <div className="floating-menu dl-menu" onMouseLeave={() => setMenu("")}>
          <button onClick={() => { setModal("edit"); setMenu(""); }}><Pencil size={14} /> Edit detail</button>
          {g.previewSubmittedAt && <button onClick={() => { changePhase("Preview"); setMenu(""); }}><RotateCcw size={14} /> Buka kembali pemilihan</button>}
          <button onClick={() => { onBack(); setMenu(""); }}><ChevronLeft size={14} /> Kembali ke daftar</button>
          <button className="x-danger" onClick={() => { setMenu(""); onDelete(); }}><Trash2 size={14} /> Hapus galeri</button>
        </div>}
      </div>
      <button className="outline-button" onClick={copy}><Link2 size={15} /> Salin link</button>
      <a className="outline-button" href={link} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Buka</a>
      <button className="outline-button dl-wa" onClick={sendWA}><MessageCircle size={15} /> Kirim WA</button>
    </div>
  </div>;

  return <div className="module-page dl-page dl-detail">
    {slot ? createPortal(header, slot) : header}

    <section className="panel dl-phase-panel">
      <PhaseTracker phase={g.phase} onPick={changePhase} />
      {(g.previewSubmittedAt || g.rawSubmittedAt || g.draftApprovedAt) && <div className="dl-flags">{g.previewSubmittedAt && <span className="dl-badge blue">Pilihan Edit terkirim · {fmtDate(g.previewSubmittedAt)}</span>}{g.rawSubmittedAt && <span className="dl-badge red">Pilihan RAW terkirim</span>}{g.draftApprovedAt && <span className="dl-badge green">Disetujui klien · {fmtDate(g.draftApprovedAt)}</span>}<small>Klik tahap di atas untuk memindahkan galeri.</small></div>}
    </section>

    <div className="dl-layout">
      <section className="panel dl-main">
        <div className="dl-tabs" role="tablist">
          {([["galeri", "Galeri Foto", <Images key="i" size={16} />, 0], ["revisi", "Permintaan Revisi", <MessageSquare key="m" size={16} />, openRev], ["catatan", "Catatan", <FileText key="f" size={16} />, 0], ["aktivitas", "Aktivitas", <History key="h" size={16} />, 0]] as const).map(([k, label, icon, count]) =>
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{icon} {label}{k === "revisi" && <em className={count ? "hot" : ""}>{count}</em>}</button>)}
        </div>

        {tab === "galeri" && <>
          <div className="dl-gtool">
            <div className="dl-gcount">{set === "preview" ? <><b>{picked.length} foto dipilih</b> / {all.length} total{raw.length > 0 && <span className="dl-raw-count"> · {raw.length} RAW</span>}</> : <><b>{all.length} foto {SET_LABEL[set].toLowerCase()}</b>{all.some(p => p.note) && <> · {all.filter(p => p.note).length} dengan catatan</>}</>}</div>
            <div className="dl-gcontrols">
              <div className="dl-seg dl-view" role="group" aria-label="Tampilan"><button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label="Grid"><LayoutGrid size={16} /></button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-label="Daftar"><List size={16} /></button></div>
              <label className="dl-select"><select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter status">{filters.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><ChevronDown size={15} /></label>
              <button className="outline-button dl-sort" title="Urutkan menurut nama file" onClick={() => setSort(sort === "az" ? "za" : "az")}>Nama {sort === "az" ? "A–Z" : "Z–A"} <ArrowUpDown size={14} /></button>
              <div className="dropdown-wrap"><button className="primary-button dl-add" aria-expanded={menu === "add"} onClick={() => setMenu(menu === "add" ? "" : "add")}><Plus size={15} /> Tambah Foto <ChevronDown size={15} /></button>
                {menu === "add" && <div className="floating-menu dl-menu right" onMouseLeave={() => setMenu("")}>{(Object.keys(FOLDERS) as FolderType[]).map(t => <button key={t} onClick={() => { setModal(t); setMenu(""); }}><FolderOpen size={14} /> {g[FOLDERS[t].key] ? "Muat ulang" : "Muat"} {FOLDERS[t].label.toLowerCase()}{photosOf(g, t).length > 0 && <small>{photosOf(g, t).length}</small>}</button>)}</div>}
              </div>
            </div>
          </div>
          {available.length > 1 && <div className="dl-sets"><span>Set foto</span><div className="dl-seg" role="group" aria-label="Set foto">{available.map(t => <button key={t} className={set === t ? "active" : ""} onClick={() => { setSet(t); setFilter("all"); }}>{SET_LABEL[t]}<small>{photosOf(g, t).length}</small>{t === stageSet(g) && <i className="dl-now">tahap ini</i>}</button>)}</div></div>}

          {!all.length ? <div className="dl-empty dl-empty-tab"><FolderOpen size={26} /><h3>Belum ada foto {SET_LABEL[set].toLowerCase()}</h3><p>{FOLDERS[set].hint}</p><button className="primary-button" onClick={() => setModal(set)}><FolderOpen size={15} /> Muat folder {SET_LABEL[set].toLowerCase()}</button></div>
          : !shown.length ? <p className="x-empty">Tidak ada foto dengan filter ini.</p>
          : view === "grid" ? <div className="dl-pgrid">{visible.map(p => { const i = shown.indexOf(p); return <button key={p.id} className={`dl-pcard ${p.selected ? "on" : ""} ${p.rawSelected ? "raw" : ""}`} onClick={() => setLb(i)} title={p.note || p.name}>
              <span className="dl-pimg"><img src={p.thumbnailUrl} alt={p.name} loading="lazy" referrerPolicy="no-referrer" />{set === "preview" && <i className={`dl-check ${p.selected ? "on" : ""}`}>{p.selected && <Check size={13} />}</i>}{p.note && <i className="dl-note-dot"><MessageSquare size={12} /></i>}</span>
              <span className="dl-pmeta"><span>{p.name}</span>{p.selected ? <em className="dl-tag edit">Edit</em> : p.rawSelected ? <em className="dl-tag raw">Raw</em> : p.note ? <em className="dl-tag note">Catatan</em> : null}</span>
            </button>; })}</div>
          : <div className="dl-plist">{visible.map(p => { const i = shown.indexOf(p); return <button key={p.id} className="dl-prow" onClick={() => setLb(i)}><img src={p.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /><span className="dl-prow-name"><b>{p.name}</b>{p.section && <small>{p.section}</small>}</span><span className="dl-prow-note">{p.note || <span className="dl-muted">—</span>}</span>{p.selected ? <em className="dl-tag edit">Edit</em> : p.rawSelected ? <em className="dl-tag raw">Raw</em> : <em className="dl-tag none">—</em>}</button>; })}</div>}

          {shown.length > 0 && <div className="dl-pager">
            <label className="dl-perpage">Tampilkan <span className="dl-select"><select value={perPage} onChange={e => setPerPage(Number(e.target.value))} aria-label="Foto per halaman">{PER_PAGE.map(n => <option key={n} value={n}>{n} per halaman</option>)}</select><ChevronDown size={15} /></span></label>
            {pageCount > 1 && <div className="dl-pages"><button onClick={() => setPage(current - 1)} disabled={current === 1} aria-label="Halaman sebelumnya"><ChevronLeft size={16} /></button>{pages(current, pageCount).map((n, i) => n === "…" ? <span key={`e${i}`}>…</span> : <button key={n} className={n === current ? "active" : ""} onClick={() => setPage(n)}>{n}</button>)}<button onClick={() => setPage(current + 1)} disabled={current === pageCount} aria-label="Halaman berikutnya"><ChevronRight size={16} /></button></div>}
          </div>}
        </>}

        {tab === "revisi" && (g.revisions.length ? <div className="dl-revs">{[...g.revisions].reverse().map(r => <article key={r.id} className={r.status === "Open" ? "open" : ""}>
          <div><b>{fmtDate(r.createdAt)}</b><span className={`dl-badge ${r.status === "Open" ? "orange" : "green"}`}>{r.status === "Open" ? "Terbuka" : "Selesai"}</span></div>
          {r.text && <p>{r.text}</p>}{r.photoNotes.map((n, i) => <p key={i} className="dl-pnote"><b>{n.name}:</b> {n.note}</p>)}
          <button className="outline-button" onClick={() => resolve(r.id, r.status === "Open" ? "Resolved" : "Open")}>{r.status === "Open" ? <><Check size={14} /> Tandai selesai</> : "Buka lagi"}</button>
        </article>)}</div> : <div className="dl-empty dl-empty-tab"><MessageSquare size={26} /><h3>Belum ada permintaan revisi</h3><p>Permintaan revisi dari klien akan muncul di sini.</p></div>)}

        {tab === "catatan" && <div className="dl-notes">
          <div className="settings-field full"><label htmlFor="g-notes">Catatan internal (tidak terlihat klien)</label><textarea id="g-notes" rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder="mis. klien minta tone hangat, kirim final paling lambat Jumat…" /></div>
          <div className="x-row"><button className="primary-button" disabled={notes === (g.notes ?? "")} onClick={() => onSave({ ...g, notes }).then(ok => ok && notify("Catatan disimpan."))}><Check size={15} /> Simpan catatan</button></div>
          <h3 className="dl-subhead">Catatan klien per foto <small>{clientNotes.length}</small></h3>
          {clientNotes.length ? <div className="dl-cnotes">{clientNotes.map(({ p, set: s }) => <div key={`${s}-${p.id}`} className="dl-cnote"><img src={p.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /><div><b>{p.name}</b><small>{s}</small><p>{p.note}</p></div></div>)}</div> : <p className="x-empty">Klien belum memberi catatan pada foto.</p>}
        </div>}

        {tab === "aktivitas" && (activity.length ? <ol className="dl-timeline">{activity.map((a, i) => <li key={i}><span className="dl-tl-icon">{a.icon}</span><div><b>{a.text}</b><small>{new Date(a.at).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</small></div></li>)}</ol> : <p className="x-empty">Belum ada aktivitas.</p>)}
      </section>

      <aside className="dl-side">
        <section className="panel dl-card-side">
          <div className="dl-side-head"><h3>Detail Project</h3><button className="outline-button" onClick={() => setModal("edit")}><Pencil size={14} /> Edit</button></div>
          <dl className="dl-kv">
            <div><dt><Building2 size={15} /> Klien</dt><dd>{g.client?.company || "—"}</dd></div>
            <div><dt><User size={15} /> PIC</dt><dd>{g.client?.contact || "—"}</dd></div>
            <div><dt><MessageCircle size={15} /> WhatsApp</dt><dd>{g.client?.whatsapp || "—"}</dd></div>
            <div><dt><Mail size={15} /> Email</dt><dd>{g.client?.email || "—"}</dd></div>
            <hr />
            <div><dt><CalendarDays size={15} /> Pilih sebelum</dt><dd>{fmtDate(g.selectByDate)}</dd></div>
            <div><dt><CalendarDays size={15} /> Feedback sebelum</dt><dd>{fmtDate(g.feedbackByDate)}</dd></div>
            <div><dt><Download size={15} /> Unduhan sampai</dt><dd>{fmtDate(g.downloadExpiry)}</dd></div>
            <div><dt><Heart size={15} /> Kuota</dt><dd>{g.selectionLimit ? `${g.selectionLimit} edit` : "Edit bebas"}{g.rawSelectionLimit ? ` · ${g.rawSelectionLimit} RAW` : ""}</dd></div>
          </dl>
        </section>
        <section className="panel dl-card-side">
          <div className="dl-side-head"><h3>Statistik Delivery</h3></div>
          <div className="dl-stat4">
            <button onClick={() => { setTab("galeri"); setSet("preview"); setFilter("all"); }}><Images size={18} /><b>{g.previewPhotos.length}</b><small>Total foto</small></button>
            <button className="green" onClick={() => { setTab("galeri"); setSet("preview"); setFilter("edit"); }}><Check size={18} /><b>{picked.length}{g.selectionLimit ? <i>/{g.selectionLimit}</i> : null}</b><small>Dipilih klien</small></button>
            <button onClick={() => { setTab("galeri"); setSet("draft"); setFilter("all"); }}><Pencil size={18} /><b>{g.draftPhotos.length}</b><small>Draft (edit)</small></button>
            <button className={openRev ? "orange" : ""} onClick={() => setTab("revisi")}><RefreshCw size={18} /><b>{openRev}</b><small>Revisi terbuka</small></button>
          </div>
        </section>
        <section className="panel dl-card-side">
          <div className="dl-side-head"><h3>Link Galeri</h3><a className="dl-icon" href={link} target="_blank" rel="noreferrer" aria-label="Buka halaman klien"><ExternalLink size={16} /></a></div>
          <div className="dl-linkbox"><input readOnly value={link} aria-label="Link galeri klien" onFocus={e => e.currentTarget.select()} /><button onClick={copy} aria-label="Salin link"><Copy size={15} /></button></div>
        </section>
        {(g.quotaAddons?.length ?? 0) > 0 && <section className="panel dl-card-side"><div className="dl-side-head"><h3>Tambahan kuota</h3></div><ul className="dl-addons">{g.quotaAddons!.map(a => <li key={a.id}><span>{fmtDate(a.at)}</span><b>{a.custom ? "Bebas pilih" : `+${a.photos} foto`}</b><em>{a.price ? `Rp ${a.price.toLocaleString("id-ID")}` : "Konfirmasi"}</em></li>)}</ul></section>}
      </aside>
    </div>

    {lb !== null && <AdminLightbox photos={shown} index={lb} setIndex={setLb} />}
    {modal === "edit" && <EditDetailsModal g={g} link={link} onSave={onSave} onClose={() => setModal("")} />}
    {modal && modal !== "edit" && <FolderModal type={modal} initial={g[FOLDERS[modal].key]} onLoad={load(modal)} onClose={() => setModal("")} />}
  </div>;
}

function toForm(g: Gallery) {
  return { title: g.title, slug: g.slug, company: g.client?.company ?? "", contact: g.client?.contact ?? "", whatsapp: g.client?.whatsapp ?? "", email: g.client?.email ?? "", selectionLimit: String(g.selectionLimit || ""), rawSelectionLimit: String(g.rawSelectionLimit || ""), selectByDate: g.selectByDate?.slice(0, 10) ?? "", feedbackByDate: g.feedbackByDate?.slice(0, 10) ?? "", downloadExpiry: g.downloadExpiry?.slice(0, 10) ?? "" };
}
