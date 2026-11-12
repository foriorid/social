"use client";

// Photo Delivery (admin): client galleries fed from Google Drive folders. Copied from the FORIOR Workspace
// module with the same workflow and data shape; stored in Supabase `galleries` (owner-only via RLS).
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, Copy, Download, ExternalLink, FolderOpen, Heart, Images, Link2, MessageCircle, MessageSquare, Pencil, Plus, RefreshCw, RotateCcw, Search, Send, Trash2, X } from "lucide-react";
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

export function PhaseTracker({ phase }: { phase: Phase }) {
  const at = PHASES.indexOf(phase);
  return <ol className="dl-tracker">{PHASES.map((p, i) => <li key={p} className={i < at ? "done" : i === at ? "now" : ""}><span>{i < at ? <Check size={14} /> : i + 1}</span><small>{PHASE_SHORT[p]}</small></li>)}</ol>;
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

function FolderLoader({ label, hint, initial, onLoad, tone = "" }: { label: string; hint: string; initial: string; onLoad: (url: string) => Promise<void>; tone?: string }) {
  const [url, setUrl] = useState(initial), [busy, setBusy] = useState(false);
  useEffect(() => setUrl(initial), [initial]);
  return <section className={`panel dl-folder ${tone}`}>
    <label><FolderOpen size={16} /> {label}</label>
    <div className="dl-folder-row"><input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" aria-label={label} /><button className="primary-button" disabled={busy || !url.trim()} onClick={async () => { setBusy(true); try { await onLoad(url.trim()); } finally { setBusy(false); } }}><RefreshCw size={15} /> {busy ? "Memuat…" : "Muat"}</button></div>
    <small>{hint}</small>
  </section>;
}

function PhotoStrip({ title, photos, tone = "" }: { title: string; photos: Photo[]; tone?: string }) {
  if (!photos.length) return null;
  return <section className="panel"><div className="dl-section-head"><h3 className={tone}>{title}</h3><span className="muted-chip">{photos.length} foto</span></div>
    <div className="dl-thumbs">{photos.map(p => <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="dl-thumb"><img src={p.thumbnailUrl} alt={p.name} loading="lazy" referrerPolicy="no-referrer" /><span>{p.name}</span>{p.note && <em><MessageSquare size={12} /> {p.note}</em>}</a>)}</div>
  </section>;
}

function GalleryManage({ row, onBack, onSave, onDelete }: { row: Row; onBack: () => void; onSave: (g: Gallery) => Promise<boolean>; onDelete: () => void }) {
  const g = row.data;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => toForm(g));
  useEffect(() => setForm(toForm(g)), [g]);
  const link = galleryLink(g.slug);
  const copy = () => { navigator.clipboard?.writeText(link); notify("Link klien disalin."); };
  const sendWA = () => {
    const num = String(g.client?.whatsapp || "").replace(/[^0-9]/g, "").replace(/^0/, "62");
    if (!num) return notify("Nomor WhatsApp klien belum diisi.");
    const action = g.phase === "Client Review" || g.phase === "Revision" ? "me-review hasil editan" : g.phase === "Done" ? "mengunduh foto final Anda" : "memilih foto favorit Anda";
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(`Halo ${g.client?.contact || ""}, galeri foto FORIOR "${g.title}" sudah siap. Silakan buka tautan ini untuk ${action}: ${link}`)}`, "_blank", "noopener");
  };
  const load = (type: FolderType) => async (url: string) => {
    try { const files = await listSectioned(url); if (await onSave(withFolder(g, type, url, files))) notify(`${files.length} foto dimuat dari Google Drive.`); }
    catch (e) { notify(e instanceof Error ? e.message : String(e)); }
  };
  const changePhase = (p: string) => {
    if (p === "Preview" && g.previewSubmittedAt && !window.confirm("Buka kembali pemilihan? Klien bisa mengubah pilihan lalu mengirim ulang. Pilihan dan catatan yang ada tetap tersimpan.")) return;
    onSave(setPhase(g, p));
  };
  const saveDetails = async () => {
    const slug = slugify(form.slug || form.title);
    const next: Gallery = { ...g, title: form.title.trim() || g.title, slug, client: { company: form.company, contact: form.contact, whatsapp: form.whatsapp, email: form.email }, selectionLimit: Math.max(0, Number(form.selectionLimit) || 0), rawSelectionLimit: Math.max(0, Number(form.rawSelectionLimit) || 0), selectByDate: form.selectByDate, feedbackByDate: form.feedbackByDate, downloadExpiry: form.downloadExpiry, notes: form.notes };
    if (await onSave(next)) { setEditing(false); notify("Detail galeri disimpan."); }
  };
  const resolve = (id: string, status: "Open" | "Resolved") => onSave({ ...g, revisions: g.revisions.map(r => (r.id === id ? { ...r, status } : r)) });
  const picked = g.previewPhotos.filter(p => p.selected), raw = g.previewPhotos.filter(p => p.rawSelected);
  const draftStage = ["Editing Progress", "Client Review", "Revision", "Done"].includes(g.phase);
  const openRev = g.revisions.filter(r => r.status === "Open").length;
  const f = (k: keyof typeof form, label: string, type = "text") => <div className="settings-field"><label htmlFor={`e-${k}`}>{label}</label><input id={`e-${k}`} type={type} value={form[k]} onChange={e => setForm(x => ({ ...x, [k]: e.target.value }))} /></div>;

  return <div className="module-page dl-page">
    <section className="panel dl-head">
      <button className="outline-button" onClick={onBack} aria-label="Kembali ke daftar galeri"><ArrowLeft size={16} /></button>
      <div className="dl-head-title"><h2>{g.title}</h2><small>{[g.client?.company, g.client?.contact].filter(Boolean).join(" · ") || "Tanpa klien"} <em className={`dl-phase ${PHASE_CLASS[g.phase]}`}>{PHASE_SHORT[g.phase]}</em></small></div>
      <div className="dl-head-actions"><button className="outline-button" onClick={copy}><Link2 size={15} /> Salin link</button><a className="outline-button" href={link} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Buka</a><button className="outline-button dl-wa" onClick={sendWA}><MessageCircle size={15} /> Kirim WA</button><button className="outline-button x-danger" onClick={onDelete} aria-label="Hapus galeri"><Trash2 size={15} /></button></div>
    </section>

    <section className="panel dl-phase-panel">
      <PhaseTracker phase={g.phase} />
      <div className="dl-phase-row"><label htmlFor="g-phase">Tahap delivery</label><select id="g-phase" value={g.phase} onChange={e => changePhase(e.target.value)}>{PHASES.map(p => <option key={p} value={p}>{PHASE_LABEL[p]}</option>)}</select>
        {g.previewSubmittedAt && <span className="dl-badge blue">Pilihan Edit terkirim</span>}{g.rawSubmittedAt && <span className="dl-badge red">Pilihan RAW terkirim</span>}{g.draftApprovedAt && <span className="dl-badge green">Klien sudah menyetujui</span>}</div>
      {g.previewSubmittedAt && <div className="dl-reopen"><RotateCcw size={16} /><p>Klien sudah mengirim pilihan. Izinkan klien mengganti pilihan? Pilihan dan catatan tetap tersimpan.</p><button className="outline-button" onClick={() => changePhase("Preview")}>Buka kembali pemilihan</button></div>}
    </section>

    <section className="dl-stats">
      <article className="panel"><small>Foto preview</small><b>{g.previewPhotos.length}</b></article>
      <article className="panel"><small>Dipilih klien</small><b>{picked.length}{g.selectionLimit ? <i> / {g.selectionLimit}</i> : null}</b></article>
      <article className="panel"><small>Draft (hasil edit)</small><b>{g.draftPhotos.length}</b></article>
      <article className="panel"><small>Revisi terbuka</small><b>{openRev}</b></article>
    </section>

    <section className="panel">
      <div className="dl-section-head"><h3>Detail galeri</h3>{editing ? <div className="x-row"><button className="outline-button" onClick={() => { setEditing(false); setForm(toForm(g)); }}>Batal</button><button className="primary-button" onClick={saveDetails}><Check size={15} /> Simpan</button></div> : <button className="outline-button" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</button>}</div>
      {editing ? <div className="cp-form dl-form">
        <div className="settings-field full"><label htmlFor="e-title">Judul</label><input id="e-title" value={form.title} onChange={e => setForm(x => ({ ...x, title: e.target.value }))} /></div>
        <div className="settings-field full"><label htmlFor="e-slug">Permalink</label><div className="dl-slug"><span>{link.replace(/^https?:\/\//, "").replace(/[^/=]*$/, "")}</span><input id="e-slug" value={form.slug} onChange={e => setForm(x => ({ ...x, slug: e.target.value }))} placeholder="nama-proyek" /></div></div>
        {f("company", "Perusahaan")}{f("contact", "Nama PIC")}{f("whatsapp", "WhatsApp")}{f("email", "Email")}
        {f("selectionLimit", "Kuota Edit (0 = tanpa batas)", "number")}{f("rawSelectionLimit", "Kuota RAW (0 = nonaktif)", "number")}
        {f("selectByDate", "Pilih foto sebelum", "date")}{f("feedbackByDate", "Feedback sebelum", "date")}{f("downloadExpiry", "Unduhan sampai", "date")}
        <div className="settings-field full"><label htmlFor="e-notes">Catatan internal (tidak terlihat klien)</label><textarea id="e-notes" rows={2} value={form.notes} onChange={e => setForm(x => ({ ...x, notes: e.target.value }))} /></div>
      </div> : <dl className="dl-details">
        {[["Perusahaan", g.client?.company], ["PIC", g.client?.contact], ["WhatsApp", g.client?.whatsapp], ["Email", g.client?.email], ["Kuota Edit", g.selectionLimit ? `${g.selectionLimit} foto` : "Tanpa batas"], ["Kuota RAW", g.rawSelectionLimit ? `${g.rawSelectionLimit} foto` : "Nonaktif"], ["Pilih sebelum", fmtDate(g.selectByDate)], ["Feedback sebelum", fmtDate(g.feedbackByDate)], ["Unduhan sampai", fmtDate(g.downloadExpiry)]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || "—"}</dd></div>)}
        <div className="full"><dt>Link klien</dt><dd><a href={link} target="_blank" rel="noreferrer">{link}</a> <button className="dl-icon" onClick={copy} aria-label="Salin link"><Copy size={14} /></button></dd></div>
        {g.notes && <div className="full"><dt>Catatan internal</dt><dd>{g.notes}</dd></div>}
      </dl>}
    </section>

    <FolderLoader label="Foto preview — folder Drive" initial={g.previewFolderUrl} onLoad={load("preview")} hint="Foto yang dipilih klien. Sub-folder tampil sebagai bagian. Memuat ulang tidak menghapus pilihan dan catatan klien." />
    {draftStage && <FolderLoader label="Draft (hasil edit) — folder Drive" initial={g.draftFolderUrl} onLoad={load("draft")} hint="Unggah hasil edit foto pilihan ke folder terpisah, lalu muat di sini untuk di-review klien." />}
    {g.phase === "Revision" && <FolderLoader tone="dl-orange" label="Hasil revisi — folder Drive" initial={g.revisionFolderUrl} onLoad={load("revision")} hint="Setelah revisi selesai, muat folder hasil revisi agar klien bisa me-review lagi." />}
    {g.phase === "Done" && <FolderLoader tone="dl-green" label="Foto final — folder Drive (resolusi tinggi)" initial={g.finalFolderUrl} onLoad={load("final")} hint="Foto final yang ditampilkan dan diunduh klien di tahap Selesai." />}

    {g.revisions.length > 0 && <section className="panel"><div className="dl-section-head"><h3>Permintaan revisi</h3><span className="muted-chip">{openRev} terbuka</span></div>
      <div className="dl-revs">{[...g.revisions].reverse().map(r => <article key={r.id} className={r.status === "Open" ? "open" : ""}>
        <div><b>{fmtDate(r.createdAt)}</b><span className={`dl-badge ${r.status === "Open" ? "orange" : "green"}`}>{r.status === "Open" ? "Terbuka" : "Selesai"}</span></div>
        {r.text && <p>{r.text}</p>}{r.photoNotes.map((n, i) => <p key={i} className="dl-pnote"><b>{n.name}:</b> {n.note}</p>)}
        <button className="outline-button" onClick={() => resolve(r.id, r.status === "Open" ? "Resolved" : "Open")}>{r.status === "Open" ? <><Check size={14} /> Tandai selesai</> : "Buka lagi"}</button>
      </article>)}</div></section>}

    {(g.quotaAddons?.length ?? 0) > 0 && <section className="panel"><div className="dl-section-head"><h3>Tambahan kuota dari klien</h3></div><ul className="dl-addons">{g.quotaAddons!.map(a => <li key={a.id}><span>{fmtDate(a.at)}</span><b>{a.custom ? "Bebas pilih (harga konfirmasi admin)" : `+${a.photos} foto edit`}</b><em>{a.price ? `Rp ${a.price.toLocaleString("id-ID")}` : "—"}</em></li>)}</ul></section>}

    <PhotoStrip title="Foto pilihan untuk Edit" tone="dl-blue" photos={picked} />
    <PhotoStrip title="Foto pilihan RAW" tone="dl-red" photos={raw} />
    <PhotoStrip title="Catatan klien di hasil edit" photos={[...g.draftPhotos, ...g.revisionPhotos].filter(p => p.note)} />
    {!picked.length && g.previewPhotos.length > 0 && <section className="panel dl-wait"><Send size={18} /><p>Klien belum memilih foto. Kirim link galeri lewat WhatsApp atau salin link-nya.</p></section>}
  </div>;
}

function toForm(g: Gallery) {
  return { title: g.title, slug: g.slug, company: g.client?.company ?? "", contact: g.client?.contact ?? "", whatsapp: g.client?.whatsapp ?? "", email: g.client?.email ?? "", selectionLimit: String(g.selectionLimit || ""), rawSelectionLimit: String(g.rawSelectionLimit || ""), selectByDate: g.selectByDate?.slice(0, 10) ?? "", feedbackByDate: g.feedbackByDate?.slice(0, 10) ?? "", downloadExpiry: g.downloadExpiry?.slice(0, 10) ?? "", notes: g.notes ?? "" };
}
