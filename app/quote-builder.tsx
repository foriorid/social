"use client";

// Penawaran › Builder: quotations made as data in Hub, published as hub.forior.id/quote/<slug>/.
// Drafts live in the workspace store ("quotes"); publishing writes a client-safe <slug>.json to the public
// Storage bucket `quotes`, with photos under img/<quote id>/. The page itself is rendered by app/lib/quote.ts.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Copy, Eye, MoreHorizontal, Pencil, Search, FileText, Image as ImageIcon, Link2, Loader2, MessageCircle, Plus, RefreshCw, Sparkles, Trash2, Upload, X, ChevronDown, ChevronUp, CopyPlus, ExternalLink, Send, Undo2 } from "lucide-react";
import { supabase } from "./lib/cloud";
import { useStored } from "./lib/store";
import { notify } from "./modules";
import { askAIDocs, AiSetupError, CHEAP_MODEL, type AiDoc } from "./lib/ai";
import { docxText } from "./lib/docx";
import { isSlug, newQuote, parseBrief, publicSnapshot, renderQuoteHtml, rid, shortIdr, slugify, idr, totals, type PortfolioItem, type QItem, type QLayout, type QRow, type QSection, type Quote, type QuoteAnswer } from "./lib/quote";

const BUCKET = "quotes";
const SONNET = "claude-sonnet-5-5";
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const ago = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? "baru saja" : m < 60 ? `${m} mnt lalu` : m < 1440 ? `${Math.round(m / 60)} jam lalu` : `${Math.round(m / 1440)} hari lalu`; };
type Opens = Record<string, { n: number; last: string }>;
type Answers = Record<string, { name: string | null; answers: QuoteAnswer[]; at: string }[]>;

/** Writes the client-safe copy to <slug>.json (replacing an older link name) and returns the updated quotation. */
async function publishQuote(q: Quote, slug: string): Promise<Quote> {
  if (!isSlug(slug)) throw new Error("Nama link hanya huruf kecil, angka, dan tanda minus (3–63 karakter).");
  if (slug !== q.slug) {
    const { data } = await supabase.storage.from(BUCKET).list("", { limit: 1000, search: slug });
    if ((data ?? []).some(f => f.name === `${slug}.json` || f.name === `${slug}.html`)) throw new Error("Nama link ini sudah dipakai penawaran lain. Pakai nama lain.");
  }
  const now = new Date().toISOString();
  const next: Quote = { ...q, slug, status: "sent", publishedAt: now, updatedAt: now };
  const body = new Blob([JSON.stringify(publicSnapshot(next))], { type: "application/json" });
  const { error } = await supabase.storage.from(BUCKET).upload(`${slug}.json`, body, { contentType: "application/json", cacheControl: "0", upsert: true });
  if (error) throw new Error(`Gagal mengirim: ${error.message}`);
  if (q.slug && q.slug !== slug && q.publishedAt) await supabase.storage.from(BUCKET).remove([`${q.slug}.json`]);
  return next;
}
const isDirty = (q: Quote) => !!q.publishedAt && Date.parse(q.updatedAt) > Date.parse(q.publishedAt) + 1500;
const linkOf = (slug: string) => `${typeof window === "undefined" ? "" : window.location.origin}/quote/${slug}/`;
async function copyLink(slug: string) { try { await navigator.clipboard.writeText(linkOf(slug)); notify("Link disalin."); } catch { window.prompt("Salin link ini:", linkOf(slug)); } }

// ---------- files ----------
const readB64 = (blob: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = () => rej(new Error("File tidak bisa dibaca.")); r.readAsDataURL(blob); });
/** Downscales a photo to a JPEG no larger than `max` px on its long side. */
function shrink(file: Blob, max: number, quality = 0.84): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const src = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(src);
      c.toBlob(b => (b ? resolve(b) : reject(new Error("Gagal memproses gambar."))), "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error("Gambar tidak bisa dibuka.")); };
    img.src = src;
  });
}
async function uploadPhoto(quoteId: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Pilih file gambar.");
  const blob = await shrink(file, 1800);
  const path = `img/${quoteId}/${rid()}${rid()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) throw new Error(`Gagal upload foto: ${error.message}`);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
/** A Google Drive share link → a thumbnail URL the client page can show (the file must be shared "anyone with the link"). */
const driveImage = (link: string) => { const id = /\/d\/([\w-]{10,})/.exec(link)?.[1] ?? /[?&]id=([\w-]{10,})/.exec(link)?.[1]; return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1800` : /^https:\/\//.test(link) ? link : ""; };
async function toDoc(file: File): Promise<AiDoc> {
  if (file.type === "application/pdf") { if (file.size > 9e6) throw new Error(`${file.name}: PDF maksimal 9 MB.`); return { name: file.name, kind: "pdf", mediaType: "application/pdf", data: await readB64(file) }; }
  if (file.type.startsWith("image/")) return { name: file.name, kind: "image", mediaType: "image/jpeg", data: await readB64(await shrink(file, 1568, 0.85)) };
  if (/\.docx$/i.test(file.name)) return { name: file.name, kind: "text", mediaType: "text/plain", data: (await docxText(await file.arrayBuffer())).slice(0, 200_000) };
  if (/^text\//.test(file.type) || /\.(txt|md|csv)$/i.test(file.name)) return { name: file.name, kind: "text", mediaType: "text/plain", data: (await file.text()).slice(0, 200_000) };
  throw new Error(`${file.name}: format belum didukung. Pakai PDF, gambar, Word (.docx), atau teks.`);
}

const BRIEF_PROMPT = `Baca pesan klien (biasanya chat WhatsApp) dan lampiran di atas (site plan/layout, foto properti/kawasan, shotlist, dll). Susun bahan penawaran jasa foto/video FORIOR untuk jenis properti apa pun (villa, apartemen, hotel, resort, kantor, restoran, rumah).
Balas HANYA dengan JSON valid, tanpa teks lain:
{"points":["ringkasan kebutuhan, 4-8 poin, sebut jumlah"],
"questions":["hal yang belum jelas dan perlu FORIOR tanyakan ke klien, 0-5"],
"requests":["hal yang klien minta dikirim/dijawab bersama penawaran, mis. portfolio, contoh foto malam, jadwal; 0-6"],
"client":"nama klien/perusahaan","eyebrow":"label pendek mis. Option 1","title":"judul penawaran singkat","subtitle":"1 kalimat cakupan","location":"lokasi project","notice":"1 kalimat catatan penting untuk klien, opsional",
"sections":[{"title":"nama seksi","subtitle":"ringkas, mis. 6 villa · 12-18 foto per villa","layout":"cards|list|media","optional":false,
  "items":[{"name":"nama item","tag":"label pendek ≤12 huruf","desc":"keterangan singkat","qty":18,"unit":"foto|menit|video|klip","lines":["poin detail/sorotan, maks 4"]}]}],
"notes":[{"title":"judul deliverable/catatan","text":"1-2 kalimat"}],
"operational":[{"name":"biaya operasional mis. Transportasi & akomodasi tim","note":"asumsi singkat"}],
"terms":{"production":"mis. 3 hari produksi","delivery":"mis. 10-14 hari kerja","revisions":"mis. 2 kali revisi"}}
Aturan:
- Satu item per unit/villa/kamar/area yang disebut. Pakai nama persis dari pesan atau label di lampiran (mis. nama villa di site plan). Sorotan khusus unit (mis. private jacuzzi) masuk "lines" item itu.
- layout "cards" untuk unit/villa/ruangan yang difoto, "list" untuk kategori/fasilitas umum/lingkungan, "media" untuk video/drone/film.
- Yang diminta sebagai "opsi" atau tambahan jadi seksi terpisah dengan "optional": true.
- Rentang jumlah (mis. 12-18 foto) → qty pakai angka terbesar, rentangnya tulis di desc.
- Format file, orientasi foto, waktu pemotretan (siang/golden hour/malam), hak penggunaan, dan batasan editing masuk "notes".
- Lokasi di luar Jakarta → tambahkan "operational" transportasi & akomodasi.
- JANGAN menulis harga. Jangan mengarang kebutuhan yang tidak ada di pesan/lampiran.`;

// ---------- list ----------
export function QuoteBuilder() {
  const [quotes, setQuotes] = useStored<Quote[]>("quotes", []);
  const [openId, setOpenId] = useState<string | null>(null);
  const [opens, setOpens] = useState<Opens>({});
  const [answers, setAnswers] = useState<Answers>({});
  const [menu, setMenu] = useState<string | null>(null);
  const published = quotes.filter(q => q.publishedAt).map(q => q.slug);
  const key = published.join(",");
  useEffect(() => {
    if (!published.length) return;
    supabase.from("quote_opens").select("slug, at").in("slug", published).order("at", { ascending: false }).limit(2000).then(({ data }) => {
      const o: Opens = {};
      for (const r of data ?? []) { const x = o[r.slug] ?? { n: 0, last: r.at }; x.n++; o[r.slug] = x; }
      setOpens(o);
    });
    supabase.from("quote_answers").select("slug, name, answers, at").in("slug", published).order("at", { ascending: false }).limit(500).then(({ data }) => {
      const a: Answers = {};
      for (const r of data ?? []) (a[r.slug] ??= []).push({ name: r.name, answers: r.answers as QuoteAnswer[], at: r.at });
      setAnswers(a);
    });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (q: Quote) => setQuotes(list => list.map(x => (x.id === q.id ? { ...q, updatedAt: new Date().toISOString() } : x)));
  const create = () => { const q = newQuote(); setQuotes(list => [q, ...list]); setOpenId(q.id); };
  const duplicate = (src: Quote) => { const now = new Date().toISOString(); const copy: Quote = { ...structuredClone(src), id: rid() + rid(), slug: "", status: "draft", publishedAt: undefined, eyebrow: src.eyebrow.replace(/\d+/, d => String(Number(d) + 1)), createdAt: now, updatedAt: now }; setQuotes(list => [copy, ...list]); setOpenId(copy.id); notify("Penawaran diduplikat. Edit sebagai opsi berikutnya."); };
  const remove = async (src: Quote) => {
    if (!window.confirm(`Hapus penawaran "${src.title || "tanpa judul"}"?${src.publishedAt ? " Link-nya juga akan berhenti." : ""}`)) return;
    if (src.publishedAt && src.slug) { const { error } = await supabase.storage.from(BUCKET).remove([`${src.slug}.json`]); if (error) return notify(`Gagal menghapus link: ${error.message}`); }
    setQuotes(list => list.filter(x => x.id !== src.id)); setOpenId(null); notify("Penawaran dihapus.");
  };
  const update = async (src: Quote) => { try { save(await publishQuote(src, src.slug)); notify("Link diperbarui. Klien melihat versi terbaru."); } catch (e) { notify(e instanceof Error ? e.message : String(e)); } };
  const current = quotes.find(q => q.id === openId);
  if (current) return <QuoteEditor key={current.id} quote={current} opens={opens[current.slug]} answers={answers[current.slug]} onChange={save} onBack={() => setOpenId(null)}
    onDuplicate={() => duplicate(current)} onDelete={() => remove(current)} onUpdate={() => update(current)} />;

  return <section className="qb-list">
    {!quotes.length ? <div className="panel qb-empty"><FileText size={26} /><h3>Belum ada penawaran</h3><p>Buat penawaran dari brief klien. Upload shotlist atau dokumen klien, Claude merangkum kebutuhannya, Anda tinggal isi harga dan foto.</p><button className="primary-button" onClick={create}><Plus size={15} /> Penawaran baru</button></div>
      : <div className="qb-cards">{quotes.map(q => {
        const t = totals(q), o = opens[q.slug], cover = q.cover || q.sections.flatMap(s => s.items).find(i => i.image)?.image;
        const ans = answers[q.slug]?.length ?? 0;
        return <div key={q.id} className="qb-card-wrap"><button className="qb-card" onClick={() => setOpenId(q.id)}>
          <span className="qb-thumb">{cover ? <img src={cover} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <FileText size={20} />}</span>
          <span className="qb-info"><b>{[q.client.name, q.title].filter(Boolean).join(" — ") || "Penawaran tanpa judul"}{q.eyebrow ? ` · ${q.eyebrow}` : ""}</b>
            <small>{q.client.location || "—"} · {when(q.updatedAt)}</small>
            <span className="qb-sts">{!q.publishedAt ? <em className="qb-st d">● Draft</em> : o ? <em className="qb-st o">● Dibuka {o.n}× · {ago(o.last)}</em> : <em className="qb-st s">● Terkirim · belum dibuka</em>}{ans > 0 && <em className="qb-st a">● {ans} jawaban</em>}{isDirty(q) && <em className="qb-st w">● Belum diperbarui</em>}</span></span>
          <span className="qb-price">{t.grand ? shortIdr(t.grand) : "—"}</span>
        </button>
        <button className="qb-icon qb-more" aria-label="Opsi penawaran" aria-expanded={menu === q.id} onClick={() => setMenu(menu === q.id ? null : q.id)}><MoreHorizontal size={17} /></button>
        {menu === q.id && <div className="qb-menu qb-menu-r" role="menu" onClick={() => setMenu(null)}>
          <button role="menuitem" onClick={() => setOpenId(q.id)}><Pencil size={15} /> Edit</button>
          {isDirty(q) && <button role="menuitem" onClick={() => update(q)}><RefreshCw size={15} /> Perbarui link</button>}
          {q.publishedAt && <button role="menuitem" onClick={() => copyLink(q.slug)}><Copy size={15} /> Salin link</button>}
          <button role="menuitem" onClick={() => duplicate(q)}><CopyPlus size={15} /> Duplikat</button>
          <button role="menuitem" className="x-danger" onClick={() => remove(q)}><Trash2 size={15} /> Hapus</button>
        </div>}</div>;
      })}</div>}
    {quotes.length > 0 && <button className="qb-fab primary-button" onClick={create}><Plus size={16} /> Penawaran baru</button>}
  </section>;
}

// ---------- editor ----------
function QuoteEditor({ quote: q, opens, answers, onChange, onBack, onDuplicate, onDelete, onUpdate }: { quote: Quote; opens?: { n: number; last: string }; answers?: Answers[string]; onChange: (q: Quote) => void; onBack: () => void; onDuplicate: () => void; onDelete: () => void; onUpdate: () => Promise<void> }) {
  const [tab, setTab] = useState<"brief" | "isi" | "kirim">(q.sections.some(s => s.items.some(i => i.name)) ? "isi" : "brief");
  const [preview, setPreview] = useState(false);
  const [menu, setMenu] = useState(false), [updating, setUpdating] = useState(false);
  const set = (patch: Partial<Quote>) => onChange({ ...q, ...patch });
  const t = useMemo(() => totals(q), [q]);
  const html = useMemo(() => renderQuoteHtml(publicSnapshot(q), { preview: true }), [q]);
  const dirty = isDirty(q);

  return <div className="qb-editor">
    <div className="qb-head">
      <button className="qb-icon" onClick={onBack} aria-label="Kembali ke daftar"><ArrowLeft size={18} /></button>
      <div className="qb-title"><b>{q.title || "Penawaran baru"}</b><small>{q.client.name || "Klien belum diisi"}{q.publishedAt ? (dirty ? " · ada perubahan belum dikirim" : " · terkirim") : " · draft"}</small></div>
      {dirty && <button className="primary-button qb-upd" disabled={updating} onClick={async () => { setUpdating(true); await onUpdate(); setUpdating(false); }}>{updating ? <Loader2 size={15} className="lg-spin" /> : <RefreshCw size={15} />}<span>Perbarui link</span></button>}
      <button className="qb-icon qb-only-mobile" onClick={() => setPreview(true)} aria-label="Pratinjau"><Eye size={18} /></button>
      <span className="qb-more-wrap"><button className="qb-icon" aria-label="Opsi penawaran" aria-expanded={menu} onClick={() => setMenu(m => !m)}><MoreHorizontal size={18} /></button>
        {menu && <div className="qb-menu qb-menu-r" role="menu" onClick={() => setMenu(false)}>
          {q.publishedAt && <button role="menuitem" onClick={() => copyLink(q.slug)}><Copy size={15} /> Salin link</button>}
          <button role="menuitem" onClick={onDuplicate}><CopyPlus size={15} /> Duplikat jadi opsi baru</button>
          <button role="menuitem" className="x-danger" onClick={onDelete}><Trash2 size={15} /> Hapus penawaran</button>
        </div>}</span>
    </div>
    <div className="qb-tabs" role="tablist">{([["brief", "1 · Brief"], ["isi", "2 · Isi"], ["kirim", "3 · Kirim"]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
    <div className="qb-split">
      <div className="qb-form">
        {tab === "brief" && <BriefTab q={q} set={set} onDone={() => setTab("isi")} />}
        {tab === "isi" && <ContentTab q={q} set={set} />}
        {tab === "kirim" && <SendTab q={q} set={set} opens={opens} answers={answers} dirty={dirty} onDuplicate={onDuplicate} onDelete={onDelete} />}
      </div>
      <aside className="qb-preview"><div className="qb-preview-bar"><span>Pratinjau klien</span><b>{shortIdr(t.grand)}</b></div><iframe title="Pratinjau penawaran" srcDoc={html} sandbox="allow-popups" /></aside>
    </div>
    {tab === "isi" && <div className="qb-bottom"><div><small>Grand total{q.terms.dpPercent > 0 && q.terms.dpPercent < 100 ? ` · DP ${q.terms.dpPercent}%` : ""}</small><b>{idr(t.grand)}</b></div><button className="outline-button qb-only-mobile" onClick={() => setPreview(true)}><Eye size={15} /> Pratinjau</button><button className="primary-button" onClick={() => setTab("kirim")}>Kirim <Send size={14} /></button></div>}
    {preview && <div className="qb-sheet" role="dialog" aria-label="Pratinjau penawaran"><div className="qb-sheet-bar"><b>Pratinjau klien</b><button className="qb-icon" onClick={() => setPreview(false)} aria-label="Tutup pratinjau"><X size={18} /></button></div><iframe title="Pratinjau penawaran" srcDoc={html} sandbox="allow-popups" /></div>}
  </div>;
}

// ---------- 1 · Brief ----------
function BriefTab({ q, set, onDone }: { q: Quote; set: (p: Partial<Quote>) => void; onDone: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [chat, setChat] = useState(q.brief?.chat ?? "");
  const [model, setModel] = useState(CHEAP_MODEL);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [draft, setDraft] = useState<ReturnType<typeof parseBrief> | null>(null);
  const summary = q.brief?.summary;
  const add = (list: FileList | null) => { const picked = Array.from(list ?? []); if (!picked.length) return; setFiles(f => [...f, ...picked].slice(0, 8)); setError(""); }; // copy now: the input is cleared right after
  const run = async () => {
    if (!chat.trim() && !files.length) return setError("Tempel pesan klien atau tambahkan dokumen dulu.");
    setBusy(true); setError("");
    try {
      const docs = await Promise.all(files.map(toDoc));
      if (chat.trim()) docs.unshift({ name: "Pesan klien (WhatsApp)", kind: "text", mediaType: "text/plain", data: chat.trim().slice(0, 100_000) });
      if (docs.reduce((a, d) => a + d.data.length, 0) > 13_500_000) throw new Error("Total dokumen terlalu besar. Kurangi jumlah atau ukuran file (maks ±10 MB).");
      const text = await askAIDocs({ docs, prompt: BRIEF_PROMPT, model, label: "Penawaran · analisis brief", maxTokens: model === SONNET ? 4000 : 3000 });
      const d = parseBrief(text);
      setDraft(d);
      const filled = q.sections.some(s => s.items.some(i => i.name || i.price));
      if (!filled && d.sections.length) { applyDraft(d, chat.trim()); return; }
      set({ brief: { chat: chat.trim(), files: files.map(f => ({ name: f.name, size: f.size, type: f.type })), summary: { points: d.points, questions: d.questions, requests: d.requests, at: new Date().toISOString(), model } } });
    } catch (e) { setError(e instanceof AiSetupError || e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  /** Fills the quotation from the analysis; fields already typed in Hub are kept. */
  const applyDraft = (d: NonNullable<typeof draft>, chatText = chat.trim()) => {
    const untouchedNotes = q.notes.every(n => newQuote().notes.some(d0 => d0.title === n.title));
    set({ sections: d.sections.length ? d.sections : q.sections, title: q.title || d.title || "", subtitle: q.subtitle || d.subtitle || "", eyebrow: q.eyebrow || d.eyebrow || "",
      client: { ...q.client, name: q.client.name || d.client || "", location: q.client.location || d.location || "" },
      notice: q.notice || d.notice, questions: q.questions?.length ? q.questions : d.questions.map(text => ({ id: rid(), text })), notes: d.notes.length && untouchedNotes ? d.notes : q.notes, operational: q.operational.length ? q.operational : d.operational, terms: { ...q.terms, ...d.terms },
      brief: { chat: chatText, files: files.map(f => ({ name: f.name, size: f.size, type: f.type })), summary: { points: d.points, questions: d.questions, requests: d.requests, at: new Date().toISOString(), model } } });
    notify("Penawaran terisi dari brief. Tinggal isi harga dan foto."); onDone();
  };
  const apply = () => {
    if (!draft) return;
    if (!window.confirm("Isi penawaran yang sudah ada akan diganti dengan draf dari brief. Lanjutkan?")) return;
    applyDraft(draft);
  };
  return <>
    <div className="panel qb-card-p">
      <label className="qb-f wide"><span className="qb-h">Pesan / kebutuhan klien</span>
        <textarea className="qb-chat" rows={7} value={chat} onChange={e => { setChat(e.target.value); setError(""); }} onBlur={() => { if (chat !== (q.brief?.chat ?? "")) set({ brief: { ...(q.brief ?? { files: [] }), chat } }); }}
          onPaste={e => { const imgs = Array.from(e.clipboardData.files).filter(f => f.type.startsWith("image/")); if (imgs.length) { e.preventDefault(); setFiles(f => [...f, ...imgs].slice(0, 8)); notify(`${imgs.length} gambar ditambahkan sebagai lampiran.`); } }}
          placeholder={"Tempel chat WhatsApp dari klien di sini, mis.:\n\"Halo kak, mau foto 3 unit show unit 1BR, 2BR, 3BR di Sentul, plus foto lingkungan sekitar dan video drone. Shooting minggu depan…\""} /></label>
      <h4 className="qb-h">Lampiran (opsional)</h4>
      {files.length > 0 && <ul className="qb-files">{files.map((f, i) => <li key={i}><span className={`qb-ft ${f.type === "application/pdf" ? "pdf" : f.type.startsWith("image/") ? "img" : "doc"}`}>{f.type === "application/pdf" ? "PDF" : f.type.startsWith("image/") ? "IMG" : "DOC"}</span><span><b>{f.name}</b><small>{(f.size / 1e6).toFixed(1)} MB</small></span><button className="qb-icon" aria-label={`Hapus ${f.name}`} onClick={() => setFiles(x => x.filter((_, j) => j !== i))}><X size={15} /></button></li>)}</ul>}
      <label className="qb-drop"><Upload size={18} /> Tambah lampiran<small>Layout, foto properti/kawasan, shotlist: PDF, gambar, Word, teks · maks 8 file</small><input type="file" multiple hidden accept=".pdf,image/*,.docx,.txt,.md,.csv" onChange={e => { add(e.target.files); e.target.value = ""; }} /></label>
      <div className="qb-seg" role="radiogroup" aria-label="Ketelitian analisis">
        <button role="radio" aria-checked={model === CHEAP_MODEL} className={model === CHEAP_MODEL ? "on" : ""} onClick={() => setModel(CHEAP_MODEL)}><b>Hemat</b><small>Haiku · ±Rp50–150</small></button>
        <button role="radio" aria-checked={model === SONNET} className={model === SONNET ? "on" : ""} onClick={() => setModel(SONNET)}><b>Lebih teliti</b><small>Sonnet · ±Rp500–2.000</small></button>
      </div>
      {error && <p className="x-error" role="alert">{error}</p>}
      <button className="primary-button qb-wide" disabled={busy || (!chat.trim() && !files.length)} onClick={run}>{busy ? <><Loader2 size={15} className="lg-spin" /> Claude sedang membaca…</> : <><Sparkles size={15} /> Analisis dengan Claude</>}</button>
      <p className="qb-hint">Pesan klien disimpan di draf (tidak tampil ke klien). Lampiran hanya dikirim untuk dianalisis, yang disimpan nama file dan ringkasannya. Gambar bisa juga langsung di-paste ke kolom pesan.</p>
    </div>
    {summary && <div className="panel qb-ai">
      <h4><Sparkles size={16} /> Ringkasan kebutuhan</h4>
      <ul>{summary.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
      {summary.questions.length > 0 && <div className="qb-ask"><b>Perlu ditanyakan ke klien</b><ul>{summary.questions.map((p, i) => <li key={i}>{p}</li>)}</ul></div>}
      {!!summary.requests?.length && <div className="qb-ask"><b>Diminta klien bersama penawaran</b><ul>{summary.requests.map((p, i) => <li key={i}>{p}</li>)}</ul></div>}
      <small className="qb-hint">{[q.brief?.chat ? "Pesan klien" : "", ...(q.brief?.files.map(f => f.name) ?? [])].filter(Boolean).join(", ")} · {when(summary.at)}</small>
      {draft ? <button className="primary-button qb-wide qb-light" onClick={apply}><Sparkles size={15} /> Isi penawaran dari brief</button> : <p className="qb-hint">Klik Analisis lagi untuk membuat draf baru.</p>}
    </div>}
    {!summary && <button className="outline-button qb-wide" onClick={onDone}>Lewati, isi manual</button>}
  </>;
}

// ---------- 2 · Isi ----------
function ContentTab({ q, set }: { q: Quote; set: (p: Partial<Quote>) => void }) {
  const [open, setOpen] = useState<string | null>(q.sections[0]?.id ?? null);
  const setSection = (id: string, patch: Partial<QSection>) => set({ sections: q.sections.map(s => (s.id === id ? { ...s, ...patch } : s)) });
  const setItem = (sid: string, iid: string, patch: Partial<QItem>) => set({ sections: q.sections.map(s => (s.id === sid ? { ...s, items: s.items.map(i => (i.id === iid ? { ...i, ...patch } : i)) } : s)) });
  const move = (id: string, d: -1 | 1) => { const i = q.sections.findIndex(s => s.id === id), j = i + d; if (j < 0 || j >= q.sections.length) return; const s = [...q.sections]; [s[i], s[j]] = [s[j], s[i]]; set({ sections: s }); };
  const letterOf = (() => { let n = 0; const m = new Map<string, string>(); for (const s of q.sections) m.set(s.id, s.optional ? "+" : "ABCDEFGHIJ"[n++] ?? "•"); return m; })();
  const tot = totals(q);
  const ask = q.brief?.summary?.questions ?? [], req = q.brief?.summary?.requests ?? [];
  return <>
    {ask.length > 0 && <div className="panel qb-card-p qb-asknote"><h4 className="qb-h">Perlu ditanyakan ke klien</h4><ul>{ask.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
    {req.length > 0 && <div className="panel qb-card-p qb-asknote"><h4 className="qb-h">Diminta klien bersama penawaran</h4><ul>{req.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
    <div className="panel qb-card-p">
      <h4 className="qb-h">Info penawaran</h4>
      <div className="qb-grid">
        <F label="Judul" wide><input value={q.title} onChange={e => set({ title: e.target.value })} placeholder="Show Units + Project & Surroundings" /></F>
        <F label="Label atas"><input value={q.eyebrow} onChange={e => set({ eyebrow: e.target.value })} placeholder="Option 1 — Stage 1" /></F>
        <F label="Badge"><input value={q.badge} onChange={e => set({ badge: e.target.value })} placeholder="Preliminary Quotation" /></F>
        <F label="Deskripsi singkat" wide><textarea rows={2} value={q.subtitle} onChange={e => set({ subtitle: e.target.value })} placeholder="Foto show unit, foto lingkungan, video sinematik dan drone." /></F>
        <F label="Disiapkan untuk"><input value={q.client.name} onChange={e => set({ client: { ...q.client, name: e.target.value } })} placeholder="Andrew — MytePro" /></F>
        <F label="Lokasi project"><input value={q.client.location} onChange={e => set({ client: { ...q.client, location: e.target.value } })} placeholder="Sentul & sekitarnya" /></F>
        <F label="No. penawaran"><input value={q.number} onChange={e => set({ number: e.target.value })} /></F>
        <F label="Tanggal"><input type="date" value={q.date} onChange={e => set({ date: e.target.value })} /></F>
        <F label="Berlaku (hari)"><input type="number" min={1} value={q.validDays} onChange={e => set({ validDays: Math.max(1, Number(e.target.value) || 14) })} /></F>
        <F label="Bahasa halaman"><select value={q.lang} onChange={e => set({ lang: e.target.value as Quote["lang"] })}><option value="id">Indonesia</option><option value="en">English</option></select></F>
        <F label="Catatan penting (opsional)" wide><input value={q.notice ?? ""} onChange={e => set({ notice: e.target.value })} placeholder="Biaya operasional diperkirakan Rp 4.500.000 untuk 3 hari produksi." /></F>
        <F label="Foto cover" wide><Slot quoteId={q.id} value={q.cover} onChange={cover => set({ cover })} wide /></F>
      </div>
    </div>

    {q.sections.map(s => <div className="panel qb-sec" key={s.id}>
      <button className="qb-sec-head" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
        <span className="qb-letter">{letterOf.get(s.id)}</span><span className="qb-sec-t"><b>{s.title || "Seksi tanpa judul"}</b><small>{s.items.length} item{s.optional ? " · opsional" : ""}</small></span>
        <span className="qb-sec-p">{shortIdr(tot.sections.find(x => x.id === s.id)?.subtotal ?? 0)}</span>{open === s.id ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
      </button>
      {open === s.id && <div className="qb-sec-body">
        <div className="qb-grid">
          <F label="Judul seksi" wide><input value={s.title} onChange={e => setSection(s.id, { title: e.target.value })} /></F>
          <F label="Keterangan" wide><input value={s.subtitle ?? ""} onChange={e => setSection(s.id, { subtitle: e.target.value })} placeholder="24 foto · 8 foto per unit" /></F>
          <F label="Tampilan"><select value={s.layout} onChange={e => setSection(s.id, { layout: e.target.value as QLayout })}><option value="cards">Kartu foto (unit/ruangan)</option><option value="list">Daftar kategori</option><option value="media">Video / drone</option></select></F>
          <F label="Masuk total?"><select value={s.optional ? "1" : "0"} onChange={e => setSection(s.id, { optional: e.target.value === "1" })}><option value="0">Ya</option><option value="1">Tidak — add-on opsional</option></select></F>
        </div>
        {s.items.map(i => <div className="qb-item" key={i.id}>
          <Slot quoteId={q.id} value={i.image} onChange={image => setItem(s.id, i.id, { image })} />
          <div className="qb-item-f">
            <div className="qb-row2"><input aria-label="Nama item" value={i.name} onChange={e => setItem(s.id, i.id, { name: e.target.value })} placeholder="1BR show unit" /><input aria-label="Label" className="qb-tag" value={i.tag ?? ""} onChange={e => setItem(s.id, i.id, { tag: e.target.value })} placeholder="Label" maxLength={12} /></div>
            <input aria-label="Keterangan" value={i.desc ?? ""} onChange={e => setItem(s.id, i.id, { desc: e.target.value })} placeholder="Keterangan singkat (opsional)" />
            <div className="qb-row3">
              <input aria-label="Jumlah" type="number" min={0} value={i.qty ?? ""} onChange={e => setItem(s.id, i.id, { qty: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) })} placeholder="Jml" />
              <input aria-label="Satuan" value={i.unit ?? ""} onChange={e => setItem(s.id, i.id, { unit: e.target.value })} placeholder="foto" list="qb-units" />
              <Price value={i.price} onChange={price => setItem(s.id, i.id, { price })} />
            </div>
            {<textarea aria-label="Poin detail" rows={s.layout === "media" ? 3 : 2} value={(i.lines ?? []).join("\n")} onChange={e => setItem(s.id, i.id, { lines: e.target.value.split("\n").map(l => l.trimStart()).slice(0, 8) })} placeholder={s.layout === "media" ? "Detail scene, satu per baris\nFasad & arrival\nPemandangan gunung" : "Poin/sorotan (opsional), satu per baris\nPrivate jacuzzi"} />}
          </div>
          <button className="qb-icon qb-del" aria-label="Hapus item" onClick={() => setSection(s.id, { items: s.items.filter(x => x.id !== i.id) })}><Trash2 size={15} /></button>
        </div>)}
        <div className="qb-actions">
          <button className="outline-button" onClick={() => setSection(s.id, { items: [...s.items, { id: rid(), name: "", qty: s.items.at(-1)?.qty, unit: s.items.at(-1)?.unit ?? "foto", price: 0 }] })}><Plus size={14} /> Item</button>
          <button className="qb-icon" aria-label="Naikkan seksi" onClick={() => move(s.id, -1)}><ChevronUp size={16} /></button>
          <button className="qb-icon" aria-label="Turunkan seksi" onClick={() => move(s.id, 1)}><ChevronDown size={16} /></button>
          <button className="qb-icon qb-del" aria-label="Hapus seksi" onClick={() => { if (window.confirm(`Hapus seksi "${s.title}"?`)) set({ sections: q.sections.filter(x => x.id !== s.id) }); }}><Trash2 size={15} /></button>
        </div>
      </div>}
    </div>)}
    <datalist id="qb-units"><option value="foto" /><option value="menit" /><option value="video" /><option value="klip" /><option value="hari" /></datalist>
    <button className="outline-button qb-wide" onClick={() => { const s: QSection = { id: rid(), title: "", layout: "cards", items: [{ id: rid(), name: "", qty: 8, unit: "foto", price: 0 }] }; set({ sections: [...q.sections, s] }); setOpen(s.id); }}><Plus size={15} /> Tambah seksi</button>

    <div className="panel qb-card-p">
      <h4 className="qb-h">Pertanyaan untuk klien</h4>
      <p className="qb-hint">Tampil di halaman penawaran dengan kolom jawaban. Jawaban klien masuk ke tab Kirim.</p>
      {(q.questions ?? []).map(x => <div className="qb-note" key={x.id}>
        <textarea aria-label="Pertanyaan" rows={2} value={x.text} onChange={e => set({ questions: (q.questions ?? []).map(y => (y.id === x.id ? { ...y, text: e.target.value } : y)) })} placeholder="Tanggal pemotretan yang diinginkan?" />
        <button className="qb-icon qb-del" aria-label="Hapus pertanyaan" onClick={() => set({ questions: (q.questions ?? []).filter(y => y.id !== x.id) })}><Trash2 size={15} /></button>
      </div>)}
      <div className="qb-btns">
        <button className="outline-button" onClick={() => set({ questions: [...(q.questions ?? []), { id: rid(), text: "" }].slice(0, 10) })}><Plus size={14} /> Pertanyaan</button>
        {!!q.brief?.summary?.questions.length && <button className="outline-button" onClick={() => { const have = new Set((q.questions ?? []).map(x => x.text)); set({ questions: [...(q.questions ?? []), ...q.brief!.summary!.questions.filter(t0 => !have.has(t0)).map(text => ({ id: rid(), text }))].slice(0, 10) }); }}><Sparkles size={14} /> Ambil dari analisis</button>}
      </div>
    </div>

    <PortfolioPanel quoteId={q.id} value={q.portfolio ?? []} onChange={portfolio => set({ portfolio })} />

    <div className="panel qb-card-p">
      <h4 className="qb-h">Biaya operasional</h4>
      {q.operational.map(r => <div className="qb-op" key={r.id}>
        <input aria-label="Nama biaya" value={r.name} onChange={e => set({ operational: q.operational.map(x => (x.id === r.id ? { ...x, name: e.target.value } : x)) })} placeholder="Crew, alat, transport (3 hari)" />
        <input aria-label="Catatan" value={r.note ?? ""} onChange={e => set({ operational: q.operational.map(x => (x.id === r.id ? { ...x, note: e.target.value } : x)) })} placeholder="Asumsi (opsional)" />
        <Price value={r.price} onChange={price => set({ operational: q.operational.map(x => (x.id === r.id ? { ...x, price } : x)) })} />
        <button className="qb-icon qb-del" aria-label="Hapus biaya" onClick={() => set({ operational: q.operational.filter(x => x.id !== r.id) })}><Trash2 size={15} /></button>
      </div>)}
      <button className="outline-button" onClick={() => set({ operational: [...q.operational, { id: rid(), name: "", price: 0 } as QRow] })}><Plus size={14} /> Biaya</button>
    </div>

    <div className="panel qb-card-p">
      <h4 className="qb-h">Ketentuan</h4>
      <div className="qb-grid">
        <F label="DP (%)"><input type="number" min={0} max={100} value={q.terms.dpPercent} onChange={e => set({ terms: { ...q.terms, dpPercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)) } })} /></F>
        <F label="Produksi"><input value={q.terms.production} onChange={e => set({ terms: { ...q.terms, production: e.target.value } })} /></F>
        <F label="Pengiriman"><input value={q.terms.delivery} onChange={e => set({ terms: { ...q.terms, delivery: e.target.value } })} /></F>
        <F label="Revisi"><input value={q.terms.revisions} onChange={e => set({ terms: { ...q.terms, revisions: e.target.value } })} /></F>
      </div>
      <h4 className="qb-h" style={{ marginTop: 16 }}>Deliverables & catatan</h4>
      {q.notes.map(n => <div className="qb-note" key={n.id}>
        <input aria-label="Judul catatan" value={n.title} onChange={e => set({ notes: q.notes.map(x => (x.id === n.id ? { ...x, title: e.target.value } : x)) })} placeholder="Judul" />
        <textarea aria-label="Isi catatan" rows={2} value={n.text} onChange={e => set({ notes: q.notes.map(x => (x.id === n.id ? { ...x, text: e.target.value } : x)) })} />
        <button className="qb-icon qb-del" aria-label="Hapus catatan" onClick={() => set({ notes: q.notes.filter(x => x.id !== n.id) })}><Trash2 size={15} /></button>
      </div>)}
      <button className="outline-button" onClick={() => set({ notes: [...q.notes, { id: rid(), title: "", text: "" }] })}><Plus size={14} /> Catatan</button>
      <F label="Catatan kaki (opsional)" wide><input value={q.footnote ?? ""} onChange={e => set({ footnote: e.target.value })} placeholder="Ketentuan komersial dapat berubah setelah konfirmasi." /></F>
    </div>
  </>;
}

const F = ({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) => <label className={`qb-f${wide ? " wide" : ""}`}><span>{label}</span>{children}</label>;

/** Price in rupiah; empty and "TBC" = to be confirmed (shown as such, left out of the total). */
function Price({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value === null ? "" : value ? value.toLocaleString("id-ID") : "");
  useEffect(() => { setText(value === null ? "" : value ? value.toLocaleString("id-ID") : ""); }, [value]);
  return <span className="qb-price-in"><span>Rp</span><input aria-label="Harga" inputMode="numeric" value={text} placeholder="TBC" onChange={e => { const digits = e.target.value.replace(/\D/g, ""); setText(digits ? Number(digits).toLocaleString("id-ID") : ""); onChange(digits ? Number(digits) : null); }} /></span>;
}

// ---------- portfolio (showcase.forior.id) ----------
// The showcase keeps its projects in Firestore (public read); Hub copies the picked ones into the quotation.
const SHOWCASE = "https://firestore.googleapis.com/v1/projects/forior-showcase/databases/(default)/documents/showcase_projects?pageSize=300&key=AIzaSyCJR4mH6VE3ci81zF3NzH9CtRtscZP_SqY";
type FsValue = { stringValue?: string; arrayValue?: { values?: FsValue[] }; integerValue?: string };
const fsStr = (v?: FsValue) => v?.stringValue ?? "";
const showcaseSlug = (s: string) => s.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
async function loadShowcase(): Promise<(PortfolioItem & { type: string; at: number; dataImage?: string })[]> {
  const r = await fetch(SHOWCASE);
  if (!r.ok) throw new Error(`Showcase tidak bisa dibaca (${r.status}).`);
  const data = await r.json() as { documents?: { name: string; fields: Record<string, FsValue> }[] };
  return (data.documents ?? []).map(d => {
    const f = d.fields, title = fsStr(f.title), type = fsStr(f.type) || "foto", link = fsStr(f.link);
    const all = [fsStr(f.image), ...(f.gallery?.arrayValue?.values ?? []).map(fsStr)];
    const imgs = all.filter(u => /^https:\/\//.test(u)), dataImage = imgs.length ? undefined : all.find(u => u.startsWith("data:image/"));
    return { id: d.name.split("/").pop() ?? title, title, type, at: Number(f.timestamp?.integerValue ?? 0), location: fsStr(f.location), category: fsStr(f.category) || (type === "drone" ? "Drone" : ""),
      image: imgs[0] ?? dataImage, dataImage, url: type === "foto" ? `https://showcase.forior.id/p/${showcaseSlug(title)}` : /^https:\/\//.test(link) ? link : "https://showcase.forior.id" };
  }).filter(p => p.title).sort((a, b) => b.at - a.at);
}

function PortfolioPanel({ quoteId, value, onChange }: { quoteId: string; value: PortfolioItem[]; onChange: (v: PortfolioItem[]) => void }) {
  const [open, setOpen] = useState(false);
  return <div className="panel qb-card-p">
    <h4 className="qb-h">Portofolio</h4>
    <p className="qb-hint">Pilih project dari showcase.forior.id untuk ditampilkan di penawaran.</p>
    {value.length > 0 && <div className="qb-pf">{value.map(p => <div key={p.id} className="qb-pf-item">{p.image ? <img src={p.image} alt="" referrerPolicy="no-referrer" /> : <span className="qb-pf-ph"><ImageIcon size={16} /></span>}<span><b>{p.title}</b><small>{[p.category, p.location].filter(Boolean).join(" · ")}</small></span><button className="qb-icon qb-del" aria-label={`Hapus ${p.title}`} onClick={() => onChange(value.filter(x => x.id !== p.id))}><X size={15} /></button></div>)}</div>}
    <button className="outline-button" onClick={() => setOpen(true)}><Plus size={14} /> Pilih dari showcase</button>
    {open && <ShowcasePicker quoteId={quoteId} picked={value} onClose={() => setOpen(false)} onDone={v => { onChange(v); setOpen(false); }} />}
  </div>;
}

function ShowcasePicker({ quoteId, picked, onDone, onClose }: { quoteId: string; picked: PortfolioItem[]; onDone: (v: PortfolioItem[]) => void; onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<Awaited<ReturnType<typeof loadShowcase>> | null>(null);
  const [error, setError] = useState(""), [q, setQ] = useState("");
  const [sel, setSel] = useState<Map<string, PortfolioItem>>(new Map(picked.map(p => [p.id, p])));
  useEffect(() => { loadShowcase().then(setItems, e => setError(e instanceof Error ? e.message : String(e))); }, []);
  const shown = (items ?? []).filter(p => !q || `${p.title} ${p.location} ${p.category}`.toLowerCase().includes(q.toLowerCase()));
  const toggle = (p: PortfolioItem) => setSel(m => { const n = new Map(m); if (n.has(p.id)) n.delete(p.id); else n.set(p.id, { id: p.id, title: p.title, location: p.location, category: p.category, image: p.image, url: p.url }); return n; });
  // Showcase photo projects keep their pictures inline (data:); store a small copy so the client page can show it.
  const done = async () => {
    setSaving(true);
    try {
      const out = await Promise.all([...sel.values()].map(async p => {
        if (!p.image?.startsWith("data:")) return p;
        const blob = await shrink(await (await fetch(p.image)).blob(), 1200, 0.82);
        const path = `img/${quoteId}/${rid()}${rid()}.jpg`;
        const { error: e } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
        return { ...p, image: e ? undefined : supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
      }));
      onDone(out);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setSaving(false); }
  };
  return <div className="cp-modal-backdrop" role="dialog" aria-label="Pilih portofolio" onClick={onClose}><div className="cp-modal qb-pick" onClick={e => e.stopPropagation()}>
    <div className="qb-pick-head"><b>Portofolio showcase</b><button className="qb-icon" onClick={onClose} aria-label="Tutup"><X size={17} /></button></div>
    <label className="qb-search"><Search size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari villa, apartemen, kota…" /></label>
    {error ? <p className="x-error">{error}</p> : !items ? <p className="x-empty"><Loader2 size={16} className="lg-spin" /> Memuat showcase…</p> :
      <div className="qb-sc-grid">{shown.map(p => <button key={p.id} className={`qb-sc${sel.has(p.id) ? " on" : ""}`} onClick={() => toggle(p)} aria-pressed={sel.has(p.id)}>
        <span className="qb-sc-img">{p.image ? <img src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <ImageIcon size={18} />}{sel.has(p.id) && <i><Check size={14} /></i>}<em>{p.type === "drone" ? "Drone" : "Foto"}</em></span>
        <b>{p.title}</b><small>{[p.category, p.location].filter(Boolean).join(" · ")}</small></button>)}{!shown.length && <p className="x-empty">Tidak ada yang cocok.</p>}</div>}
    <div className="cp-modal-actions"><button className="outline-button" onClick={onClose}>Batal</button><button className="primary-button" disabled={saving} onClick={done}>{saving ? <Loader2 size={15} className="lg-spin" /> : null}Pakai {sel.size} project</button></div>
  </div></div>;
}

// ---------- photo slot ----------
function Slot({ quoteId, value, onChange, wide }: { quoteId: string; value?: string; onChange: (v?: string) => void; wide?: boolean }) {
  const [menu, setMenu] = useState(false), [busy, setBusy] = useState(false), [gallery, setGallery] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const upload = async (f?: File) => { if (!f) return; setBusy(true); setMenu(false); try { onChange(await uploadPhoto(quoteId, f)); } catch (e) { notify(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  return <div className={`qb-slot${wide ? " wide" : ""}`}>
    <button type="button" className={`qb-slot-btn${value ? "" : " empty"}`} onClick={() => setMenu(m => !m)} aria-label={value ? "Ganti foto" : "Tambah foto"}>
      {busy ? <Loader2 size={18} className="lg-spin" /> : value ? <img src={value} alt="" referrerPolicy="no-referrer" /> : <><ImageIcon size={18} />{wide && <small>Tambah foto cover</small>}</>}
    </button>
    <input ref={input} type="file" accept="image/*" hidden onChange={e => { upload(e.target.files?.[0]); e.target.value = ""; }} />
    {menu && <div className="qb-menu" role="menu">
      <button role="menuitem" onClick={() => input.current?.click()}><Upload size={15} /> Upload foto</button>
      <button role="menuitem" onClick={() => { setMenu(false); const link = window.prompt("Tempel link Google Drive foto (akses: siapa saja yang punya link)"); if (link) { const u = driveImage(link.trim()); if (u) onChange(u); else notify("Link Drive tidak dikenali."); } }}><Link2 size={15} /> Link Google Drive</button>
      <button role="menuitem" onClick={() => { setMenu(false); setGallery(true); }}><ImageIcon size={15} /> Dari galeri Photo Delivery</button>
      {value && <button role="menuitem" className="x-danger" onClick={() => { setMenu(false); onChange(undefined); }}><Trash2 size={15} /> Hapus foto</button>}
    </div>}
    {gallery && <GalleryPicker onClose={() => setGallery(false)} onPick={u => { onChange(u); setGallery(false); }} />}
  </div>;
}

function GalleryPicker({ onPick, onClose }: { onPick: (url: string) => void; onClose: () => void }) {
  const [rows, setRows] = useState<{ id: string; title: string; photos: { id: string; name: string }[] }[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { supabase.from("galleries").select("id, data").order("created_at", { ascending: false }).limit(40).then(({ data }) => setRows((data ?? []).map(r => { const g = r.data as { title?: string; finalPhotos?: { id: string; name: string }[]; previewPhotos?: { id: string; name: string }[] }; return { id: r.id, title: g.title ?? "Galeri", photos: (g.finalPhotos?.length ? g.finalPhotos : g.previewPhotos ?? []).slice(0, 60) }; }).filter(g => g.photos.length))); }, []);
  const g = rows?.find(r => r.id === sel);
  return <div className="cp-modal-backdrop" role="dialog" aria-label="Pilih foto dari galeri" onClick={onClose}><div className="cp-modal qb-pick" onClick={e => e.stopPropagation()}>
    <div className="qb-pick-head">{g && <button className="qb-icon" onClick={() => setSel(null)} aria-label="Kembali"><ArrowLeft size={17} /></button>}<b>{g ? g.title : "Pilih galeri"}</b><button className="qb-icon" onClick={onClose} aria-label="Tutup"><X size={17} /></button></div>
    {!rows ? <p className="x-empty"><Loader2 size={16} className="lg-spin" /> Memuat…</p> : !g ? <div className="qb-pick-list">{rows.map(r => <button key={r.id} onClick={() => setSel(r.id)}><img src={`https://drive.google.com/thumbnail?id=${r.photos[0].id}&sz=w240`} alt="" referrerPolicy="no-referrer" /><span>{r.title}<small>{r.photos.length} foto</small></span></button>)}{!rows.length && <p className="x-empty">Belum ada galeri berfoto.</p>}</div>
      : <div className="qb-pick-grid">{g.photos.map(p => <button key={p.id} onClick={() => onPick(`https://drive.google.com/thumbnail?id=${p.id}&sz=w1800`)} aria-label={p.name}><img src={`https://drive.google.com/thumbnail?id=${p.id}&sz=w320`} alt="" loading="lazy" referrerPolicy="no-referrer" /></button>)}</div>}
  </div></div>;
}

// ---------- 3 · Kirim ----------
function SendTab({ q, set, opens, answers, dirty, onDuplicate, onDelete }: { q: Quote; set: (p: Partial<Quote>) => void; opens?: { n: number; last: string }; answers?: Answers[string]; dirty: boolean; onDuplicate: () => void; onDelete: () => void }) {
  const suggestion = slugify([q.client.name.split(/[—-]/).pop() ?? "", q.title.split(/\s+/).slice(0, 3).join(" "), (q.eyebrow.match(/\d+/) ?? [""])[0]].filter(Boolean).join(" ")) || "penawaran-" + q.id.slice(0, 6);
  const [slug, setSlug] = useState(q.slug || suggestion);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const link = `${origin}/quote/${q.slug || slug}/`;
  const t = totals(q);
  const missing = [!q.title && "judul", !q.client.name && "nama klien", t.grand <= 0 && "harga"].filter(Boolean) as string[];

  const publish = async () => {
    setError(""); setBusy(true);
    try {
      const next = await publishQuote(q, slug);
      set(next);
      try { await navigator.clipboard.writeText(linkOf(slug)); notify("Penawaran terkirim. Link disalin."); } catch { notify("Penawaran terkirim."); }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const unpublish = async () => {
    if (!window.confirm("Tarik penawaran ini? Link-nya tidak bisa dibuka lagi sampai dikirim ulang.")) return;
    const { error: e } = await supabase.storage.from(BUCKET).remove([`${q.slug}.json`]);
    if (e) return notify(`Gagal: ${e.message}`);
    set({ status: "draft", publishedAt: undefined }); notify("Link ditarik.");
  };
  const wa = `https://wa.me/?text=${encodeURIComponent(`Halo ${q.client.name.split(/[—-]/)[0].trim() || ""}, berikut penawaran dari FORIOR: ${link}`)}`;
  return <>
    <div className="panel qb-card-p">
      <h4 className="qb-h">Link penawaran</h4>
      <label className="qb-f wide"><span>Nama link</span><input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))} placeholder="sentul-mytepro-1" /></label>
      <small className="qb-link">{origin}/quote/<b>{slug || "nama-link"}</b>/</small>
      {missing.length > 0 && <p className="qb-warn">Belum diisi: {missing.join(", ")}.</p>}
      {error && <p className="x-error" role="alert">{error}</p>}
      <button className="primary-button qb-wide" disabled={busy} onClick={publish}>{busy ? <Loader2 size={15} className="lg-spin" /> : q.publishedAt ? <RefreshCw size={15} /> : <Send size={15} />} {q.publishedAt ? (dirty || slug !== q.slug ? "Perbarui link" : "Kirim ulang") : "Simpan & buat link"}</button>
      {q.publishedAt && <div className="qb-sent">
        <p>{opens ? <>Dibuka <b>{opens.n}×</b>, terakhir {ago(opens.last)}.</> : "Belum dibuka klien."} Terkirim {when(q.publishedAt)}.{dirty && " Ada perubahan yang belum dikirim."}</p>
        <div className="qb-btns">
          <button className="outline-button" onClick={async () => { try { await navigator.clipboard.writeText(link); notify("Link disalin."); } catch { window.prompt("Salin link ini:", link); } }}><Copy size={15} /> Salin</button>
          <a className="outline-button dl-wa" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp</a>
          <a className="outline-button" href={`${link}?preview=1`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Buka</a>
        </div>
      </div>}
    </div>
    {!!answers?.length && <div className="panel qb-card-p">
      <h4 className="qb-h">Jawaban klien ({answers.length})</h4>
      {answers.map((r, k) => <div className="qb-answer" key={k}><small>{r.name || "Tanpa nama"} · {when(r.at)}</small>{r.answers.map((x, n) => <p key={n}><b>{x.q}</b>{x.a}</p>)}</div>)}
    </div>}
    <div className="panel qb-card-p">
      <h4 className="qb-h">Lainnya</h4>
      <div className="qb-btns">
        <button className="outline-button" onClick={onDuplicate}><CopyPlus size={15} /> Duplikat jadi opsi baru</button>
        {q.publishedAt && <button className="outline-button" onClick={unpublish}><Undo2 size={15} /> Tarik link</button>}
        <button className="outline-button x-danger" onClick={onDelete}><Trash2 size={15} /> Hapus</button>
      </div>
      <p className="qb-hint">Dokumen klien dan ringkasan AI tidak ikut ke halaman klien.</p>
    </div>
  </>;
}
