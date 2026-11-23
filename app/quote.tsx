"use client";

// Penawaran: upload a ready-made HTML quotation and get a link to send to the client.
// The file is stored as-is in the Storage bucket `quotes` as <slug>.html; /quote/<slug>/ shows it.
import { useEffect, useState } from "react";
import { Copy, ExternalLink, FileText, Pencil, RefreshCw, Trash2, Upload } from "lucide-react";
import { supabase } from "./lib/cloud";
import { notify } from "./modules";
import { QuoteBuilder } from "./quote-builder";
import { PricelistPage } from "./pricelist";
import { navigate } from "./lib/hashnav";
import { useStored } from "./lib/store";

const BUCKET = "quotes";
const SLUG = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const isSlug = (s: string) => SLUG.test(s) && !s.includes("--");
const slugify = (s: string) => s.toLowerCase().replace(/\.html?$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63);
const when = (iso: string) => (iso ? new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const sizeText = (n: number) => (n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1e3)) + " KB");

type Item = { slug: string; updated: string; size: number };

function HtmlQuotes() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inputKey, setInputKey] = useState(0);
  const [origin, setOrigin] = useState("");
  // GitHub Pages has no server, so /quote/... links would not work there.
  const noServer = origin.includes("github.io");
  const linkOf = (s: string) => `${origin}/quote/${s}/`;

  const load = async () => {
    const { data, error } = await supabase.storage.from(BUCKET).list("", { limit: 1000, sortBy: { column: "updated_at", order: "desc" } });
    if (error) { setError(`Gagal memuat daftar: ${error.message}`); setItems([]); return; }
    setItems((data ?? []).filter(f => f.name.endsWith(".html")).map(f => ({ slug: f.name.slice(0, -5), updated: f.updated_at ?? f.created_at ?? "", size: Number(f.metadata?.size ?? 0) })));
  };
  useEffect(() => { setOrigin(window.location.origin); load(); }, []);

  const pick = (f: File | null) => { setFile(f); setError(""); if (f && !slug) setSlug(slugify(f.name)); };

  const upload = async () => {
    setError("");
    if (!file) { setError("Pilih file HTML dulu."); return; }
    if (!isSlug(slug)) { setError("Nama link hanya boleh huruf kecil, angka, dan tanda minus (3–63 karakter). Contoh: mytepro"); return; }
    const exists = !!items?.some(i => i.slug === slug);
    if (exists && !window.confirm(`Link "${slug}" sudah ada. Ganti dengan file ini?`)) return;
    setBusy(true);
    const { error } = await supabase.storage.from(BUCKET).upload(`${slug}.html`, file, { contentType: "text/html; charset=utf-8", cacheControl: "0", upsert: exists });
    setBusy(false);
    if (error) { setError(/exist|duplicate/i.test(error.message) ? "Nama link ini sudah dipakai. Pakai nama lain." : `Gagal upload: ${error.message}`); return; }
    setFile(null); setSlug(""); setInputKey(k => k + 1);
    notify("Penawaran terupload. Link siap dibagikan.");
    load();
  };

  const copy = async (s: string) => {
    try { await navigator.clipboard.writeText(linkOf(s)); notify("Link disalin."); } catch { window.prompt("Salin link ini:", linkOf(s)); }
  };

  const rename = async (from: string) => {
    const typed = window.prompt(`Nama link baru untuk "${from}".\nLink lama tidak akan bisa dibuka lagi.`, from);
    if (typed === null) return;
    const to = typed.trim().toLowerCase().replace(/\s+/g, "-");
    if (to === from) return;
    if (!isSlug(to)) { notify("Nama link hanya boleh huruf kecil, angka, dan tanda minus (3–63 karakter)."); return; }
    if (items?.some(i => i.slug === to)) { notify(`Nama link "${to}" sudah dipakai. Pakai nama lain.`); return; }
    const { error } = await supabase.storage.from(BUCKET).move(`${from}.html`, `${to}.html`);
    if (error) { notify(`Gagal mengubah link: ${error.message}`); return; }
    notify(`Link diubah jadi ${linkOf(to)}`);
    load();
  };

  const remove = async (s: string) => {
    if (!window.confirm(`Hapus penawaran "${s}"? Link-nya tidak akan bisa dibuka lagi.`)) return;
    const { error } = await supabase.storage.from(BUCKET).remove([`${s}.html`]);
    if (error) { notify(`Gagal menghapus: ${error.message}`); return; }
    notify("Penawaran dihapus.");
    load();
  };

  return <>
    <section className="panel">
      <div className="agent-section-heading"><div><h3>Upload penawaran</h3><p>File HTML ditampilkan apa adanya lewat link. Kirim link-nya ke klien lewat WhatsApp.</p></div></div>
      <div className="qt-form">
        <div className="settings-field"><label>File HTML</label><input key={inputKey} type="file" accept=".html,.htm,text/html" onChange={e => pick(e.target.files?.[0] ?? null)} /></div>
        <div className="settings-field"><label>Nama link</label><input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))} placeholder="mytepro" />
          <small className="qt-preview">{linkOf(slug || "nama-link")}</small></div>
        {error && <p className="qt-error">{error}</p>}
        <div><button className="primary-button" disabled={busy} onClick={upload}><Upload size={15} /> {busy ? "Mengupload…" : "Upload"}</button></div>
      </div>
    </section>

    <section className="panel">
      <div className="agent-section-heading"><div><h3>Daftar penawaran</h3></div><button className="qt-icon" title="Muat ulang" onClick={load}><RefreshCw size={16} /></button></div>
      {noServer && <p className="qt-error">Link penawaran hanya jalan di hub.forior.id, tidak di GitHub Pages.</p>}
      {items === null ? <p className="x-empty">Memuat…</p> : !items.length ? <p className="x-empty">Belum ada penawaran.</p> :
        <ul className="qt-list">{items.map(i => <li key={i.slug}>
          <FileText size={20} />
          <div className="qt-info"><b>{i.slug}</b><small>{linkOf(i.slug)}</small><small>{[when(i.updated), i.size ? sizeText(i.size) : ""].filter(Boolean).join(" · ")}</small></div>
          <div className="qt-actions">
            {!noServer && <button title="Salin link" onClick={() => copy(i.slug)}><Copy size={16} /> Salin link</button>}
            <button title="Ubah link" onClick={() => rename(i.slug)}><Pencil size={16} /> Ubah link</button>
            <a title="Buka" href={linkOf(i.slug)} target="_blank" rel="noreferrer"><ExternalLink size={16} /></a>
            <button title="Hapus" onClick={() => remove(i.slug)}><Trash2 size={16} /></button>
          </div>
        </li>)}</ul>}
    </section>
  </>;
}

/** Penawaran: the builder (quotations made in Hub) and, as before, ready-made HTML files shown as they are. */
export function QuotePage() {
  const [mode, setMode] = useStored<"builder" | "pricelist" | "html">("quoteMode", "builder");
  return <div className="module-page qb-page">
    <div className="qb-seg qb-mode" role="tablist" aria-label="Jenis penawaran"><button role="tab" aria-selected={mode === "builder"} className={mode === "builder" ? "on" : ""} onClick={() => setMode("builder")}><b>Builder</b></button><button role="tab" aria-selected={mode === "pricelist"} className={mode === "pricelist" ? "on" : ""} onClick={() => setMode("pricelist")}><b>Pricelist</b></button><button role="tab" aria-selected={mode === "html"} className={mode === "html" ? "on" : ""} onClick={() => setMode("html")}><b>Upload HTML</b></button></div>
    {mode === "builder" ? <QuoteBuilder /> : mode === "pricelist" ? <PricelistPage openQuote={id => { setMode("builder"); navigate("Penawaran", id); }} /> : <HtmlQuotes />}
  </div>;
}
