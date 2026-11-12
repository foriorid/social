"use client";

// Client-facing Photo Delivery page (no login). Same flow as the Workspace gallery:
// pick Edit (and RAW) photos with notes → wait for editing → review / ask revision → download finals.
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Download, Globe, Heart, Images, Loader2, MessageSquare, Phone, Plus, Send, Sparkles, X } from "lucide-react";
import { supabase } from "./lib/cloud";
import { PhaseTracker, PHASE_CLASS, fmtDate } from "./delivery";
import { ADDON_PACKAGES, PHASE_SHORT, groupBySection, type ClientAction, type Gallery, type Photo } from "../supabase/functions/gallery/delivery";

const FORIOR = { website: "www.forior.id", phone: "081542048268", tagline: "Interior Photo Services" };
const rupiah = (n: number) => "Rp " + n.toLocaleString("id-ID");
const isPast = (d?: string) => !!d && new Date() > new Date(d);
const FALLBACK = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="#efeaf7"/><text x="50%" y="50%" font-family="sans-serif" font-size="16" fill="#9a90a8" text-anchor="middle" dominant-baseline="middle">Foto tidak tersedia</text></svg>');

function SafeImg({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [err, setErr] = useState(false);
  return <img src={err ? FALLBACK : src} alt={alt} className={className} onError={() => setErr(true)} loading="lazy" referrerPolicy="no-referrer" />;
}

async function call(slug: string, body: Record<string, unknown>): Promise<Gallery> {
  const { data, error } = await supabase.functions.invoke("gallery", { body: { slug, ...body } });
  if (error) {
    let detail: { error?: string } = {};
    try { detail = await (error as { context?: Response }).context?.json(); } catch { /* not JSON */ }
    throw new Error(detail.error ?? "Koneksi bermasalah. Coba lagi.");
  }
  return data as Gallery;
}

/** Reads the slug from /gallery/<slug> (Vercel rewrite) or ?g=<slug>. */
export function slugFromLocation() {
  const q = new URLSearchParams(window.location.search).get("g");
  if (q) return q;
  const m = /\/gallery\/([^/?#]+)/.exec(window.location.pathname);
  return m ? decodeURIComponent(m[1]) : "";
}

export function PublicGalleryPage() {
  const [slug, setSlug] = useState("");
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [toast, setToast] = useState("");
  useEffect(() => {
    const s = slugFromLocation(); setSlug(s);
    if (!s) { setState("missing"); return; }
    call(s, { action: "get" }).then(g => { setGallery(g); setState("ready"); document.title = `${g.title} — FORIOR Photo Delivery`; }).catch(() => setState("missing"));
  }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3200); return () => clearTimeout(t); }, [toast]);
  const act = useCallback(async (body: ClientAction) => {
    try { setGallery(await call(slug, body as unknown as Record<string, unknown>)); return true; }
    catch (e) { setToast(e instanceof Error ? e.message : String(e)); return false; }
  }, [slug]);

  if (state === "loading") return <main className="gv-page gv-center"><Loader2 className="gv-spin" size={28} /><p>Memuat galeri…</p></main>;
  if (state === "missing" || !gallery) return <main className="gv-page gv-center"><Images size={32} /><h1>Galeri tidak ditemukan</h1><p>Periksa kembali link dari FORIOR, atau hubungi kami di {FORIOR.phone}.</p></main>;
  return <><PublicGallery g={gallery} act={act} notify={setToast} />{toast && <div className="gv-toast" role="status">{toast}</div>}</>;
}

type Lb = { photos: Photo[]; index: number; mode?: "edit" | "raw" } | null;

export function PublicGallery({ g, act, notify }: { g: Gallery; act: (a: ClientAction) => Promise<boolean>; notify: (m: string) => void }) {
  const [lb, setLb] = useState<Lb>(null);
  const [modal, setModal] = useState<"" | "submit" | "submit-raw" | "approve" | "revision" | "addon" | "limit">("");
  const [revText, setRevText] = useState("");
  const [addon, setAddon] = useState<{ photos?: number; price?: number; custom?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const phase = g.phase;
  const submitted = !!g.previewSubmittedAt, rawSubmitted = !!g.rawSubmittedAt;
  const picked = g.previewPhotos.filter(p => p.selected), rawPicked = g.previewPhotos.filter(p => p.rawSelected);
  const limit = Number(g.selectionLimit) || 0, rawLimit = Number(g.rawSelectionLimit) || 0;
  const atLimit = limit > 0 && picked.length >= limit, rawAtLimit = rawLimit > 0 && rawPicked.length >= rawLimit;
  const step = !submitted ? "edit" : rawLimit > 0 && !rawSubmitted ? "raw" : "done";
  const reviewSet = phase === "Revision" ? g.revisionPhotos : g.draftPhotos;
  const reviewNoted = reviewSet.filter(p => p.note).length;
  const finals = g.finalPhotos.length ? g.finalPhotos : g.revisionPhotos.length ? g.revisionPhotos : g.draftPhotos;
  const openRev = g.revisions.filter(r => r.status === "Open");

  // Tell the client once when they reach their package limit.
  const wasAtLimit = useRef(atLimit);
  useEffect(() => { if (atLimit && !wasAtLimit.current && phase === "Preview" && !submitted) setModal("limit"); wasAtLimit.current = atLimit; }, [atLimit, phase, submitted]);

  const run = async (fn: () => Promise<boolean>, ok: string) => { setBusy(true); const done = await fn(); setBusy(false); if (done) { notify(ok); setModal(""); } };
  const history = <><HistoryBlock title="Foto untuk Edit" tone="gv-blue" photos={picked} onOpen={i => setLb({ photos: picked, index: i })} />{rawPicked.length > 0 && <HistoryBlock title="Foto RAW" tone="gv-red" photos={rawPicked} onOpen={i => setLb({ photos: rawPicked, index: i })} />}</>;
  const grid = (photos: Photo[], render: (p: Photo) => React.ReactNode, cols = "") => <div className="gv-sections">{groupBySection(photos).map(group => <section key={group.section ?? "all"}>{group.section && <h3 className="gv-section-title">{group.section}<small>{group.items.length} foto</small></h3>}<div className={`gv-grid ${cols}`}>{group.items.map(render)}</div></section>)}</div>;

  return <main className="gv-page">
    <header className="gv-header"><div className="gv-brand"><span className="gv-logo" /><div><b>FORIOR</b><small>{FORIOR.tagline}</small></div></div><em className={`dl-phase ${PHASE_CLASS[phase]}`}>{PHASE_SHORT[phase]}</em></header>
    <div className="gv-wrap">
      <section className="gv-hero"><small>PHOTO DELIVERY</small><h1>{g.title}</h1><p>{[g.client?.company, g.client?.contact].filter(Boolean).join(" · ")}</p></section>
      <section className="gv-card"><PhaseTracker phase={phase} /></section>

      {phase === "Preview" && step === "edit" && <>
        <Info icon={<Sparkles size={18} />} title="Cara memilih foto Anda">Klik <b>Pilih</b> pada foto yang ingin diedit dan tambahkan catatan bila perlu. {limit > 0 && <>Paket Anda mencakup <b>{limit} foto</b>. </>}Jika sudah selesai, klik <b>Kirim Pilihan</b>.</Info>
        <div className="gv-deadlines"><Deadline icon={<Heart size={16} />} label="Pilih foto sebelum" date={g.selectByDate} /><Deadline icon={<MessageSquare size={16} />} label="Masukan / revisi sebelum" date={g.feedbackByDate} /><Deadline icon={<Download size={16} />} label="Unduhan tersedia hingga" date={g.downloadExpiry} /></div>
        <div className="gv-bar"><span><b className={atLimit ? "gv-green" : ""}>{picked.length}</b> {limit > 0 ? `dari ${limit} foto dipilih` : `dari ${g.previewPhotos.length} foto dipilih`}</span><button className="primary-button" disabled={!picked.length} onClick={() => setModal("submit")}><Send size={15} /> Kirim Pilihan</button></div>
        {atLimit && <div className="gv-limit"><Sparkles size={18} /><div><b>Batas paket {limit} foto tercapai.</b><p>Ingin memilih lebih banyak? Tambah kuota edit — pembayaran di akhir setelah foto selesai.</p></div><button className="primary-button" onClick={() => { setAddon(null); setModal("addon"); }}><Plus size={15} /> Tambah kuota</button></div>}
        {g.previewPhotos.length ? grid(g.previewPhotos, p => <PickCard key={p.id} photo={p} mode="edit" locked={submitted} atLimit={atLimit} act={act} onOpen={() => setLb({ photos: g.previewPhotos, index: g.previewPhotos.indexOf(p), mode: "edit" })} />) : <Empty text="Foto sedang disiapkan. Silakan cek kembali nanti." />}
      </>}

      {phase === "Preview" && step === "raw" && <>
        <Info tone="gv-info-red" icon={<Images size={18} />} title="Tahap 2 — Pilih foto RAW">Pilihan foto Edit sudah tersimpan. Sekarang pilih foto RAW (file mentah tanpa editing). {rawLimit > 0 && <>Paket RAW Anda mencakup <b>{rawLimit} foto</b>. </>}Foto yang sudah dipilih untuk Edit tidak bisa dipilih sebagai RAW.</Info>
        <div className="gv-bar"><span><b className="gv-red">{rawPicked.length}</b> {rawLimit > 0 ? `dari ${rawLimit} foto RAW dipilih` : "foto RAW dipilih"} · {picked.length} foto Edit</span><button className="primary-button gv-btn-red" disabled={!rawPicked.length} onClick={() => setModal("submit-raw")}><Send size={15} /> Kirim Pilihan RAW</button></div>
        {grid(g.previewPhotos, p => <PickCard key={p.id} photo={p} mode="raw" locked={rawSubmitted} atLimit={rawAtLimit} act={act} onOpen={() => setLb({ photos: g.previewPhotos, index: g.previewPhotos.indexOf(p), mode: "raw" })} />)}
      </>}

      {((phase === "Preview" && step === "done") || phase === "Client Selection") && <><Done title={phase === "Preview" ? "Terima kasih! Semua pilihan Anda sudah kami terima" : "Terima kasih! Pilihan Anda sudah kami terima"} text="Foto pilihan Anda akan masuk ke proses editing. Kami akan memberi tahu Anda ketika hasil editan siap direview. Berikut ringkasan pilihan Anda:" />{history}</>}

      {phase === "Editing Progress" && <><Wait tone="gv-amber" icon={<Sparkles size={26} />} title="Foto Anda sedang diedit" text="Editor kami sedang mengerjakan foto pilihan Anda. Anda akan diberi tahu ketika hasil editan siap direview." />{history}</>}

      {(phase === "Client Review" || (phase === "Revision" && g.revisionPhotos.length > 0)) && <>
        <Info tone={phase === "Revision" ? "gv-info-orange" : "gv-info-blue"} icon={<Sparkles size={18} />} title={phase === "Revision" ? "Hasil revisi siap direview" : "Hasil editan siap direview"}>Jika sudah sesuai, klik <b>Setujui</b>. Jika ada yang ingin diubah, isi catatan pada foto terkait lalu klik <b>{phase === "Revision" ? "Minta Revisi Lagi" : "Minta Revisi"}</b>.</Info>
        <div className="gv-bar"><span>{reviewSet.length} foto {phase === "Revision" ? "hasil revisi" : "hasil editan"}{reviewNoted > 0 && <b className="gv-orange"> · {reviewNoted} diberi catatan</b>}</span><div className="x-row"><button className="outline-button" onClick={() => setModal("revision")}><MessageSquare size={15} /> {phase === "Revision" ? "Minta Revisi Lagi" : "Minta Revisi"}</button><button className="primary-button" onClick={() => setModal("approve")}><CheckCircle2 size={15} /> Setujui</button></div></div>
        {reviewSet.length ? grid(reviewSet, p => <ReviewCard key={p.id} photo={p} onNote={note => act({ action: phase === "Revision" ? "revision-note" : "draft-note", photoId: p.id, note })} onOpen={() => setLb({ photos: reviewSet, index: reviewSet.indexOf(p) })} />) : <Empty text="Foto hasil editan sedang disiapkan." />}
        {phase === "Revision" && <HistoryBlock title="Foto draft sebelumnya" tone="gv-sky" photos={g.draftPhotos} onOpen={i => setLb({ photos: g.draftPhotos, index: i })} />}
        {history}
      </>}

      {phase === "Revision" && !g.revisionPhotos.length && <>
        <Wait tone="gv-orange-bg" icon={<MessageSquare size={26} />} title="Revisi sedang dikerjakan" text="Terima kasih atas masukan Anda. Hasil revisi akan tersedia di sini untuk Anda review kembali." />
        {openRev.length > 0 && <section className="gv-card"><h3 className="gv-h3">Catatan revisi yang Anda kirim</h3>{openRev.map(r => <div key={r.id} className="gv-rev">{r.text && <p><MessageSquare size={14} /> {r.text}</p>}{r.photoNotes.map((n, i) => <p key={i} className="gv-pnote"><b>{n.name}:</b> {n.note}</p>)}</div>)}</section>}
        <HistoryBlock title="Foto draft sebelumnya" tone="gv-sky" photos={g.draftPhotos} onOpen={i => setLb({ photos: g.draftPhotos, index: i })} />{history}
      </>}

      {phase === "Done" && <>
        <section className="gv-card gv-done"><span className="gv-done-icon"><CheckCircle2 size={28} /></span><h2>Foto final Anda sudah siap!</h2><p>Terima kasih telah bekerja sama dengan FORIOR. Unduh foto final resolusi tinggi di bawah ini.</p>
          {g.finalFolderUrl ? <a className="primary-button gv-big" href={g.finalFolderUrl} target="_blank" rel="noreferrer"><Download size={18} /> Unduh Foto Final</a> : <p className="gv-soon"><Clock size={15} /> Foto final akan segera tersedia di sini.</p>}
          {isPast(g.downloadExpiry) ? <small className="gv-red">Masa unduh berakhir {fmtDate(g.downloadExpiry)}. Hubungi kami bila masih membutuhkan file.</small> : <small>Tersedia hingga {fmtDate(g.downloadExpiry)}</small>}</section>
        {finals.length > 0 && grid(finals, p => <button key={p.id} className="gv-final" onClick={() => setLb({ photos: finals, index: finals.indexOf(p) })}><SafeImg src={p.thumbnailUrl} alt={p.name} /></button>, "gv-grid-4")}
      </>}

      <footer className="gv-foot"><span><Globe size={14} /> {FORIOR.website}</span><span><Phone size={14} /> {FORIOR.phone}</span></footer>
    </div>

    {phase === "Preview" && !submitted && atLimit && <button className="gv-float" onClick={() => { setAddon(null); setModal("addon"); }}><Plus size={18} /> Tambah kuota foto — pilih lebih banyak</button>}

    {lb && <Lightbox lb={lb} g={g} setLb={setLb} act={act} atLimit={lb.mode === "raw" ? rawAtLimit : atLimit} locked={lb.mode === "raw" ? rawSubmitted : submitted} onAddon={() => { setLb(null); setAddon(null); setModal("addon"); }} />}

    {modal === "limit" && <Dialog onClose={() => setModal("")} title="Batas paket foto tercapai"><p>Anda sudah memilih <b>{limit} foto</b> sesuai paket. Tambah kuota edit sekarang — <b>pembayaran di akhir</b> setelah foto selesai diedit.</p><div className="cp-modal-actions"><button className="outline-button" onClick={() => setModal("")}>Nanti saja</button><button className="primary-button" onClick={() => { setAddon(null); setModal("addon"); }}><Plus size={15} /> Tambah kuota</button></div></Dialog>}
    {modal === "addon" && <Dialog onClose={() => !busy && setModal("")} title="Tambah kuota foto"><p>Pilih paket tambahan foto edit. Anda bisa langsung memilih foto setelah ini — <b>pembayaran di akhir</b>.</p>
      <div className="gv-packages">{ADDON_PACKAGES.map(p => <button key={p.photos} className={addon?.photos === p.photos ? "active" : ""} onClick={() => setAddon(p)}><b>+{p.photos} foto edit</b><span>{rupiah(p.price)}</span></button>)}<button className={`gv-custom ${addon?.custom ? "active" : ""}`} onClick={() => setAddon({ custom: true })}><b><Sparkles size={15} /> Bebas pilih</b><span>Tanya admin</span></button></div>
      {addon && <p className="gv-note">{addon.custom ? "Anda bisa memilih foto sebebasnya. Jumlah dan harga dikonfirmasi admin, ditagih di akhir." : `Kuota baru: ${limit} + ${addon.photos} = ${limit + (addon.photos ?? 0)} foto. Tagihan tambahan ${rupiah(addon.price ?? 0)} di akhir.`}</p>}
      <div className="cp-modal-actions"><button className="outline-button" disabled={busy} onClick={() => setModal("")}>Batal</button><button className="primary-button" disabled={!addon || busy} onClick={() => run(() => act(addon!.custom ? { action: "addon", custom: true } : { action: "addon", photos: addon!.photos }), addon!.custom ? "Mode bebas pilih aktif." : `Kuota bertambah +${addon!.photos} foto.`)}>{busy ? "Memproses…" : addon ? (addon.custom ? "Ambil bebas pilih" : `Ambil +${addon.photos} foto`) : "Pilih paket"}</button></div></Dialog>}
    {modal === "submit" && <Dialog onClose={() => setModal("")} title="Kirim pilihan foto Edit?"><p>Anda memilih <b>{picked.length}</b> foto untuk diedit. Setelah dikirim, pilihan tidak dapat diubah.{rawLimit > 0 ? " Selanjutnya Anda memilih foto RAW." : " Editor kami akan mulai mengedit."}</p><div className="cp-modal-actions"><button className="outline-button" onClick={() => setModal("")}>Batal</button><button className="primary-button" disabled={busy} onClick={() => run(() => act({ action: "submit" }), rawLimit > 0 ? "Pilihan Edit terkirim — silakan pilih foto RAW." : "Pilihan terkirim. Terima kasih!")}>Ya, kirim</button></div></Dialog>}
    {modal === "submit-raw" && <Dialog onClose={() => setModal("")} title="Kirim pilihan foto RAW?"><p>Anda memilih <b>{rawPicked.length}</b> foto RAW dan <b>{picked.length}</b> foto Edit. Setelah dikirim, pilihan RAW tidak dapat diubah.</p><div className="cp-modal-actions"><button className="outline-button" onClick={() => setModal("")}>Batal</button><button className="primary-button gv-btn-red" disabled={busy} onClick={() => run(() => act({ action: "submit-raw" }), "Pilihan RAW terkirim.")}>Ya, kirim</button></div></Dialog>}
    {modal === "approve" && <Dialog onClose={() => setModal("")} title={`Setujui hasil ${phase === "Revision" ? "revisi" : "editan"}?`}><p>Dengan menyetujui, Anda mengonfirmasi hasilnya sudah sesuai. Kami akan menyiapkan foto final resolusi tinggi.</p><div className="cp-modal-actions"><button className="outline-button" onClick={() => setModal("")}>Batal</button><button className="primary-button" disabled={busy} onClick={() => run(() => act({ action: "approve" }), "Disetujui — terima kasih!")}>Ya, setujui</button></div></Dialog>}
    {modal === "revision" && <Dialog onClose={() => setModal("")} title="Minta revisi"><p>{reviewNoted > 0 && <>Anda memberi catatan pada <b>{reviewNoted}</b> foto. </>}Tambahkan catatan umum (opsional), lalu kirim.</p><textarea className="gv-textarea" rows={4} value={revText} onChange={e => setRevText(e.target.value)} placeholder="mis. cerahkan ruang tamu, tone lebih hangat untuk foto rooftop…" /><div className="cp-modal-actions"><button className="outline-button" onClick={() => setModal("")}>Batal</button><button className="primary-button" disabled={busy || (!revText.trim() && !reviewNoted)} onClick={() => run(async () => { const ok = await act({ action: "revision", text: revText }); if (ok) setRevText(""); return ok; }, "Permintaan revisi terkirim.")}>Kirim permintaan</button></div></Dialog>}
  </main>;
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop gv-modal-backdrop" onClick={onClose}><div className="quick-modal gv-dialog" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Tutup"><X size={18} /></button><h2>{title}</h2>{children}</div></div>;
}
function Info({ icon, title, children, tone = "" }: { icon: React.ReactNode; title: string; children: React.ReactNode; tone?: string }) { return <div className={`gv-info ${tone}`}>{icon}<div><b>{title}</b><p>{children}</p></div></div>; }
function Deadline({ icon, label, date }: { icon: React.ReactNode; label: string; date?: string }) { return <div className={`gv-deadline ${isPast(date) ? "past" : ""}`}>{icon}<div><small>{label}</small><b>{fmtDate(date)}</b></div></div>; }
function Done({ title, text }: { title: string; text: string }) { return <section className="gv-card gv-done gv-done-green"><span className="gv-done-icon"><CheckCircle2 size={28} /></span><h2>{title}</h2><p>{text}</p></section>; }
function Wait({ icon, title, text, tone }: { icon: React.ReactNode; title: string; text: string; tone: string }) { return <section className={`gv-card gv-done ${tone}`}><span className="gv-done-icon">{icon}</span><h2>{title}</h2><p>{text}</p></section>; }
function Empty({ text }: { text: string }) { return <section className="gv-card gv-empty"><Images size={26} /><p>{text}</p></section>; }

function HistoryBlock({ title, photos, tone, onOpen }: { title: string; photos: Photo[]; tone: string; onOpen: (i: number) => void }) {
  if (!photos.length) return null;
  return <section className="gv-card"><h3 className={`gv-h3 ${tone}`}><Heart size={16} /> {title} <small>{photos.length} foto</small></h3><div className="gv-mini">{photos.map((p, i) => <button key={p.id} onClick={() => onOpen(i)} title={p.note || p.name}><SafeImg src={p.thumbnailUrl} alt={p.name} />{p.note && <span><MessageSquare size={11} /></span>}</button>)}</div></section>;
}

function NoteInput({ value, onSave, disabled, placeholder }: { value: string; onSave: (v: string) => void; disabled?: boolean; placeholder: string }) {
  const [note, setNote] = useState(value);
  useEffect(() => setNote(value), [value]);
  return <input className="gv-note-input" value={note} disabled={disabled} placeholder={placeholder} onChange={e => setNote(e.target.value)} onBlur={() => { if (note !== value) onSave(note); }} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />;
}

function PickCard({ photo, mode, locked, atLimit, act, onOpen }: { photo: Photo; mode: "edit" | "raw"; locked: boolean; atLimit: boolean; act: (a: ClientAction) => Promise<boolean>; onOpen: () => void }) {
  const raw = mode === "raw", active = raw ? !!photo.rawSelected : !!photo.selected, editLocked = raw && !!photo.selected;
  const disabled = locked || editLocked || (atLimit && !active);
  const label = editLocked ? "Foto Edit" : active ? (raw ? "Dipilih RAW" : "Dipilih") : raw ? "Pilih RAW" : "Pilih";
  return <article className={`gv-pick ${active ? (raw ? "on-raw" : "on") : ""} ${editLocked ? "edit-locked" : ""}`}>
    <button className="gv-pick-img" onClick={onOpen} aria-label={`Perbesar ${photo.name}`}><SafeImg src={photo.thumbnailUrl} alt={photo.name} />{(photo.selected || photo.rawSelected) && <em className={photo.rawSelected ? "raw" : ""}><Heart size={12} /> {photo.rawSelected ? "RAW" : raw ? "Foto Edit" : "Dipilih"}</em>}</button>
    <div className="gv-pick-body"><div><span>{photo.name}</span><button className={`gv-heart ${active ? (raw ? "on-raw" : "on") : ""}`} disabled={disabled} onClick={() => !editLocked && act(raw ? { action: "photo", photoId: photo.id, rawSelected: !active } : { action: "photo", photoId: photo.id, selected: !active })} title={atLimit && !active ? "Batas pemilihan tercapai" : label}><Heart size={15} /> {label}</button></div>
      {!raw && <NoteInput value={photo.note ?? ""} disabled={locked} placeholder="Tambahkan catatan untuk foto ini…" onSave={note => act({ action: "photo", photoId: photo.id, note })} />}</div>
  </article>;
}

function ReviewCard({ photo, onNote, onOpen }: { photo: Photo; onNote: (note: string) => void; onOpen: () => void }) {
  return <article className={`gv-pick ${photo.note ? "noted" : ""}`}><button className="gv-pick-img" onClick={onOpen} aria-label={`Perbesar ${photo.name}`}><SafeImg src={photo.thumbnailUrl} alt={photo.name} />{photo.note && <em className="note"><MessageSquare size={12} /> Catatan</em>}</button>
    <div className="gv-pick-body"><div><span>{photo.name}</span></div><NoteInput value={photo.note ?? ""} placeholder="Catatan revisi untuk foto ini (opsional)…" onSave={onNote} /></div></article>;
}

function Lightbox({ lb, g, setLb, act, atLimit, locked, onAddon }: { lb: NonNullable<Lb>; g: Gallery; setLb: (l: Lb) => void; act: (a: ClientAction) => Promise<boolean>; atLimit: boolean; locked: boolean; onAddon: () => void }) {
  const { photos, index, mode } = lb;
  // Read the live photo from the gallery so picks made here show immediately.
  const p = g.previewPhotos.find(x => x.id === photos[index]?.id) ?? photos[index];
  const go = (d: number) => setLb({ ...lb, index: (index + d + photos.length) % photos.length });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLb(null); if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); };
    document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey);
  });
  if (!p) return null;
  const raw = mode === "raw", active = raw ? !!p.rawSelected : !!p.selected, editLocked = raw && !!p.selected;
  return <div className="gv-lb" onClick={() => setLb(null)}>
    <div className="gv-lb-top" onClick={e => e.stopPropagation()}><span>{p.name} <small>· {index + 1}/{photos.length}</small></span><button onClick={() => setLb(null)} aria-label="Tutup"><X size={20} /></button></div>
    <div className="gv-lb-stage" onClick={e => e.stopPropagation()}>
      <button className="gv-lb-nav" onClick={() => go(-1)} aria-label="Sebelumnya"><ChevronLeft size={24} /></button>
      <img key={p.id} src={p.url} alt={p.name} referrerPolicy="no-referrer" />
      <button className="gv-lb-nav right" onClick={() => go(1)} aria-label="Berikutnya"><ChevronRight size={24} /></button>
    </div>
    {mode && <div className="gv-lb-bottom" onClick={e => e.stopPropagation()}>
      {!locked && !active && atLimit && !raw && <button className="primary-button gv-lb-addon" onClick={onAddon}><Plus size={15} /> Batas tercapai — tambah kuota foto</button>}
      <div className="gv-lb-row"><button className={`gv-heart big ${active ? (raw ? "on-raw" : "on") : ""}`} disabled={locked || editLocked || (!active && atLimit)} onClick={() => act(raw ? { action: "photo", photoId: p.id, rawSelected: !active } : { action: "photo", photoId: p.id, selected: !active })}><Heart size={16} /> {editLocked ? "Sudah dipilih untuk Edit" : active ? (raw ? "Dipilih RAW" : "Dipilih") : raw ? "Pilih RAW" : "Pilih"}</button>
        {!raw && <NoteInput value={p.note ?? ""} disabled={locked} placeholder="Tambahkan catatan…" onSave={note => act({ action: "photo", photoId: p.id, note })} />}</div>
    </div>}
  </div>;
}
