"use client";

// Penawaran › Pricelist: FORIOR's packages (one source of prices), and the picker that drops them into a quotation.
import { useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Check, Clapperboard, Copy, ExternalLink, FolderPlus, Globe2, Images, Loader2, MessageCircle, Minus, Plane, Plus, Send, Trash2, X } from "lucide-react";
import { BackButton } from "./modules";
import { MakeProjectModal, publishQuote, useQuoteSignals, type Approval } from "./quote-builder";
import { navigate } from "./lib/hashnav";
import { supabase } from "./lib/cloud";
import { useStored } from "./lib/store";
import { idr, newQuote, rid, shortIdr, slugify, type Quote } from "./lib/quote";
import { CAT_LABEL, DEFAULT_PRICELIST, needsTransport, packageSections, parseChoice, withTransport, type PickedPackage, type PriceCat, type PricePackage } from "./lib/pricelist";
import { notify } from "./modules";

export const usePricelist = () => useStored<PricePackage[]>("pricelist", DEFAULT_PRICELIST);
const CATS: PriceCat[] = ["Foto", "Video", "Drone", "360"];
const CatIcon = ({ cat }: { cat: PriceCat }) => cat === "Foto" ? <Camera size={18} /> : cat === "Video" ? <Clapperboard size={18} /> : cat === "Drone" ? <Plane size={18} /> : <Globe2 size={18} />;
const sub = (p: PricePackage) => p.includes.slice(0, 3).join(" · ");

const linkOf = (slug: string) => `${typeof window === "undefined" ? "" : window.location.origin}/quote/${slug}/`;
const ago = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? "baru saja" : m < 60 ? `${m} mnt lalu` : m < 1440 ? `${Math.round(m / 60)} jam lalu` : `${Math.round(m / 1440)} hari lalu`; };
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export function PricelistPage({ openQuote }: { openQuote?: (id: string) => void }) {
  const [list, setList] = usePricelist();
  const [edit, setEdit] = useState<PricePackage | null>(null);
  const [quotes, setQuotes] = useStored<Quote[]>("quotes", []);
  const sentLinks = quotes.filter(q => q.kind === "pricelist" && q.publishedAt);
  const { opens, approvals } = useQuoteSignals(sentLinks.map(q => q.slug));
  const [sending, setSending] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const current = sentLinks.find(q => q.id === openId);
  if (current) return <PricelistLinkDetail q={current} opens={opens[current.slug]} approval={approvals[current.slug]} onBack={() => setOpenId(null)}
    onChange={next => setQuotes(l => l.map(x => (x.id === next.id ? next : x)))} onDelete={() => { setQuotes(l => l.filter(x => x.id !== current.id)); setOpenId(null); }} openQuote={openQuote} addQuote={q => setQuotes(l => [q, ...l])} />;
  const save = (p: PricePackage) => { setList(l => (l.some(x => x.id === p.id) ? l.map(x => (x.id === p.id ? p : x)) : [...l, p])); setEdit(null); notify("Pricelist disimpan."); };
  const remove = (p: PricePackage) => { if (!window.confirm(`Hapus paket "${p.name}" dari pricelist? Penawaran yang sudah dibuat tidak berubah.`)) return; setList(l => l.filter(x => x.id !== p.id)); setEdit(null); };
  return <section className="pl-page">
    <button className="pl-send" onClick={() => setSending(true)}><span><Send size={18} /></span><span><b>Kirim pricelist ke klien</b><small>Link pribadi, klien pilih paket sendiri</small></span></button>
    {sentLinks.length > 0 && <><h4 className="pl-grp">Pricelist terkirim · {sentLinks.length}</h4>
      {sentLinks.map(q => { const ap = approvals[q.slug], o = opens[q.slug]; return <button key={q.id} className="panel pl-sent" onClick={() => setOpenId(q.id)}>
        <span className="pl-av">{(q.client.name || "?").charAt(0).toUpperCase()}</span>
        <span className="pl-x"><b>{q.client.name}</b><small>{[q.client.location, `dikirim ${ago(q.publishedAt!)}`].filter(Boolean).join(" · ")}</small></span>
        {ap ? <em className="pl-st ok">✓ {ap.title || "Memilih paket"}</em> : o ? <em className="pl-st op">Dibuka {o.n}×</em> : <em className="pl-st nw">Belum dibuka</em>}
      </button>; })}</>}
    {sending && <SendPricelistModal list={list} onClose={() => setSending(false)} onSent={q => { setQuotes(l => [q, ...l]); setSending(false); setOpenId(q.id); }} />}
    <h4 className="pl-grp">Paket</h4>
    <p className="pl-note">Harga termasuk transport <b>Jakarta Kota</b>. Lokasi di luar Jakarta otomatis mendapat baris "Transport luar kota" di biaya operasional saat paket dimasukkan ke penawaran.</p>
    {CATS.map(cat => { const items = list.filter(p => p.cat === cat); return items.length ? <div key={cat}>
      <h4 className="pl-grp">{CAT_LABEL[cat]}</h4>
      {items.map(p => <button key={p.id} className="panel pl-pk" onClick={() => setEdit(p)}>
        <span className={`pl-ic ${cat}`}><CatIcon cat={cat} /></span>
        <span className="pl-x"><b>{p.name}</b><small>{sub(p)}</small>{(p.fit || p.addons?.length) && <span className="pl-tags">{p.fit && <em>{p.fit}</em>}{p.addons?.map(a => <em key={a.id} className="o">+ {a.name} {shortIdr(a.price)}</em>)}</span>}</span>
        <span className="pl-pr">{shortIdr(p.price)}<small>per {p.per}</small></span>
      </button>)}
    </div> : null; })}
    <button className="primary-button qb-wide" onClick={() => setEdit({ id: rid(), cat: "Foto", name: "", price: 0, per: "unit", includes: [] })}><Plus size={15} /> Paket baru</button>
    <button className="outline-button qb-wide" onClick={() => { if (window.confirm("Kembalikan pricelist ke versi FORIOR 2026? Perubahan Anda di pricelist akan hilang (penawaran tidak berubah).")) setList(DEFAULT_PRICELIST); }}>Kembalikan ke pricelist 2026</button>
    {edit && <PackageEditor value={edit} isNew={!list.some(x => x.id === edit.id)} onSave={save} onDelete={() => remove(edit)} onClose={() => setEdit(null)} />}
  </section>;
}

function PackageEditor({ value, isNew, onSave, onDelete, onClose }: { value: PricePackage; isNew: boolean; onSave: (p: PricePackage) => void; onDelete: () => void; onClose: () => void }) {
  const [p, setP] = useState(value);
  const [inc, setInc] = useState(value.includes.join("\n"));
  const [adds, setAdds] = useState((value.addons ?? []).map(a => `${a.name} | ${a.price}`).join("\n"));
  const set = (patch: Partial<PricePackage>) => setP(x => ({ ...x, ...patch }));
  const done = () => {
    if (!p.name.trim() || !(p.price > 0)) return notify("Isi nama dan harga paket.");
    const addons = adds.split("\n").map(l => l.split("|")).filter(([n, v]) => n?.trim() && Number(String(v).replace(/\D/g, "")) > 0)
      .map(([n, v], k) => ({ id: value.addons?.[k]?.id ?? rid(), name: n.trim(), price: Number(String(v).replace(/\D/g, "")) }));
    onSave({ ...p, name: p.name.trim(), includes: inc.split("\n").map(l => l.trim()).filter(Boolean).slice(0, 10), addons: addons.length ? addons : undefined });
  };
  return createPortal(<div className="modal-backdrop" role="dialog" aria-label="Paket pricelist" onClick={onClose}><div className="quick-modal cp-modal pl-edit" onClick={e => e.stopPropagation()}>
    <div className="qb-pick-head"><b>{isNew ? "Paket baru" : `Edit ${value.name}`}</b><button className="qb-icon" onClick={onClose} aria-label="Tutup"><X size={17} /></button></div>
    <div className="qb-row2">
      <label className="qb-f"><span>Nama paket</span><input value={p.name} onChange={e => set({ name: e.target.value })} placeholder="Pro" /></label>
      <label className="qb-f"><span>Kategori</span><select value={p.cat} onChange={e => set({ cat: e.target.value as PriceCat })}>{CATS.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}</select></label>
      <label className="qb-f"><span>Harga (Rp)</span><input inputMode="numeric" value={p.price ? p.price.toLocaleString("id-ID") : ""} onChange={e => set({ price: Number(e.target.value.replace(/\D/g, "")) || 0 })} placeholder="2.500.000" /></label>
      <label className="qb-f"><span>Harga per</span><input value={p.per} onChange={e => set({ per: e.target.value })} placeholder="unit / video / lokasi" /></label>
      <label className="qb-f"><span>Jumlah utama</span><input inputMode="numeric" value={p.qty ?? ""} onChange={e => set({ qty: Number(e.target.value.replace(/\D/g, "")) || undefined })} placeholder="15" /></label>
      <label className="qb-f"><span>Satuan</span><input value={p.qtyUnit ?? ""} onChange={e => set({ qtyUnit: e.target.value })} placeholder="foto" /></label>
    </div>
    <label className="qb-f"><span>Cocok untuk</span><input value={p.fit ?? ""} onChange={e => set({ fit: e.target.value || undefined })} placeholder="2 – 3BR" /></label>
    <label className="qb-f"><span>Termasuk (satu per baris, tampil ke klien)</span><textarea rows={4} value={inc} onChange={e => setInc(e.target.value)} placeholder={"15 foto edit\n5 foto original (tanpa edit)\nMaks. 2 jam pemotretan"} /></label>
    <label className="qb-f"><span>Add-on (satu per baris: nama | harga)</span><textarea rows={2} value={adds} onChange={e => setAdds(e.target.value)} placeholder="Drone Video | 2000000" /></label>
    <div className="cp-modal-actions">{!isNew && <button className="outline-button x-danger" onClick={onDelete}><Trash2 size={14} /> Hapus</button>}<button className="outline-button" onClick={onClose}>Batal</button><button className="primary-button" onClick={done}><Check size={15} /> Simpan</button></div>
  </div></div>, document.body);
}

/** "+ Dari pricelist": pick packages, set how many units, tick add-ons; returns the picks. */
export function PricelistPicker({ onClose, onPick }: { onClose: () => void; onPick: (picked: PickedPackage[]) => void }) {
  const [list] = usePricelist();
  const [cat, setCat] = useState<PriceCat | "">("");
  const [sel, setSel] = useState<Record<string, PickedPackage>>({});
  const toggle = (p: PricePackage) => setSel(s => { const n = { ...s }; if (n[p.id]) delete n[p.id]; else n[p.id] = { id: p.id, qty: 1, addons: [] }; return n; });
  const upd = (id: string, patch: Partial<PickedPackage>) => setSel(s => ({ ...s, [id]: { ...s[id], ...patch } }));
  const picked = Object.values(sel);
  const total = picked.reduce((a, x) => { const p = list.find(y => y.id === x.id); return a + (p ? p.price * x.qty + (p.addons ?? []).filter(ad => x.addons?.includes(ad.id)).reduce((b, ad) => b + ad.price, 0) : 0); }, 0);
  return createPortal(<div className="modal-backdrop" role="dialog" aria-label="Tambah dari pricelist" onClick={onClose}><div className="quick-modal cp-modal pl-pick" onClick={e => e.stopPropagation()}>
    <div className="qb-pick-head"><b>Tambah dari pricelist</b><button className="qb-icon" onClick={onClose} aria-label="Tutup"><X size={17} /></button></div>
    <p className="qb-muted">Pilih paket dan jumlahnya. Isi dan harga masuk otomatis, tetap bisa diubah.</p>
    <div className="qb-chips">{(["", ...CATS] as const).map(c => <button key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>{c ? CAT_LABEL[c] : "Semua"}</button>)}</div>
    <div className="pl-list">{list.filter(p => !cat || p.cat === cat).map(p => { const s = sel[p.id]; return <div key={p.id} className={`pl-pk${s ? " on" : ""}`}>
      <button className="pl-hit" onClick={() => toggle(p)} aria-pressed={!!s}><span className={`pl-ic ${p.cat}`}><CatIcon cat={p.cat} /></span><span className="pl-x"><b>{p.name}</b><small>{sub(p)}</small>{p.fit && <span className="pl-tags"><em>{p.fit}</em></span>}</span><span className="pl-pr">{shortIdr(p.price)}<small>per {p.per}</small></span></button>
      {s && <div className="pl-opts">
        <div className="pl-qty"><button aria-label="Kurangi" onClick={() => upd(p.id, { qty: Math.max(1, s.qty - 1) })}><Minus size={14} /></button><b>{s.qty}</b><button aria-label="Tambah" onClick={() => upd(p.id, { qty: Math.min(50, s.qty + 1) })}><Plus size={14} /></button><small>{p.per}</small></div>
        {p.addons?.map(a => <label key={a.id} className="pl-add"><input type="checkbox" checked={!!s.addons?.includes(a.id)} onChange={e => upd(p.id, { addons: e.target.checked ? [...(s.addons ?? []), a.id] : (s.addons ?? []).filter(x => x !== a.id) })} />+ {a.name} ({shortIdr(a.price)})</label>)}
      </div>}
    </div>; })}</div>
    <div className="pl-sum"><span>{picked.length} paket</span><b>{idr(total)}</b></div>
    <div className="cp-modal-actions"><button className="outline-button" onClick={onClose}>Batal</button><button className="primary-button" disabled={!picked.length} onClick={() => onPick(picked)}><Plus size={15} /> Masukkan ke penawaran</button></div>
  </div></div>, document.body);
}

/** Makes a personal pricelist link for one client: the chosen categories' packages, an opening message, and who it is for. */
function SendPricelistModal({ list, onClose, onSent }: { list: PricePackage[]; onClose: () => void; onSent: (q: Quote) => void }) {
  const cats = CATS.filter(c => list.some(p => p.cat === c));
  const [form, setForm] = useState({ name: "", location: "", intro: "", days: 14, cats: cats as PriceCat[] });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const send = async () => {
    if (!form.name.trim()) return setError("Isi pricelist ini ditujukan untuk siapa.");
    const pk = list.filter(p => form.cats.includes(p.cat));
    if (!pk.length) return setError("Pilih minimal satu kategori paket.");
    setBusy(true); setError("");
    try {
      const now = new Date(), base = newQuote(now);
      const q: Quote = { ...base, kind: "pricelist", number: base.number.replace(/^FOR\//, "PL/"), validDays: Math.max(1, form.days), badge: "", eyebrow: "PRICELIST 2026", title: "Paket Foto & Video",
        subtitle: form.intro.trim() ? "" : `Pricelist khusus untuk ${form.name.trim()}. Pilih paket yang paling sesuai kebutuhan Anda.`,
        cover: `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, "")}/stock/japanese-restaurant.jpg`, intro: form.intro.trim() || undefined, client: { name: form.name.trim(), location: form.location.trim() }, sections: [], operational: [], notes: [], questions: [],
        notice: form.location.trim() && needsTransport(form.location) ? `Harga termasuk transport Jakarta Kota. Untuk ${form.location.trim()} ada biaya transport yang akan kami konfirmasi.` : "Harga termasuk transport Jakarta Kota.",
        packages: pk.map(p => ({ id: p.id, cat: p.cat, name: p.name, price: p.price, per: p.per, fit: p.fit, includes: p.includes, addons: p.addons })) };
      const slug = `${slugify(`pricelist ${form.name}`).slice(0, 48).replace(/-+$/, "")}-${rid().slice(0, 4)}`;
      const published = await publishQuote(q, slug);
      try { await navigator.clipboard.writeText(linkOf(slug)); notify("Pricelist terkirim. Link disalin."); } catch { notify("Pricelist terkirim."); }
      onSent(published);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  return createPortal(<div className="modal-backdrop" role="dialog" aria-label="Kirim pricelist" onClick={onClose}><div className="quick-modal cp-modal pl-edit" onClick={e => e.stopPropagation()}>
    <div className="qb-pick-head"><b>Kirim pricelist</b><button className="qb-icon" onClick={onClose} aria-label="Tutup"><X size={17} /></button></div>
    <p className="qb-muted">Halaman pricelist pribadi untuk satu klien. Tercatat di daftar "Pricelist terkirim".</p>
    <label className="qb-f"><span>Ditujukan untuk</span><input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Rina — MytePro" /></label>
    <label className="qb-f"><span>Lokasi project (opsional)</span><input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Sentul, Bogor" /></label>
    <div className="qb-f"><span>Paket yang ditampilkan</span><div className="qb-chips pl-cats">{cats.map(c => <button key={c} className={form.cats.includes(c) ? "on" : ""} onClick={() => setForm(f => ({ ...f, cats: f.cats.includes(c) ? f.cats.filter(x => x !== c) : [...f.cats, c] }))}>{CAT_LABEL[c]}</button>)}</div></div>
    <label className="qb-f"><span>Pesan pembuka (opsional)</span><textarea rows={3} value={form.intro} onChange={e => setForm(f => ({ ...f, intro: e.target.value }))} placeholder={`Halo ${form.name.split(/[—-]/)[0].trim() || "Bu Rina"}, berikut pricelist khusus untuk Anda. Silakan pilih paket yang paling sesuai.`} /></label>
    <label className="qb-f"><span>Berlaku (hari)</span><input type="number" min={1} value={form.days} onChange={e => setForm(f => ({ ...f, days: Math.max(1, Number(e.target.value) || 14) }))} /></label>
    {error && <p className="x-error" role="alert">{error}</p>}
    <div className="cp-modal-actions"><button className="outline-button" onClick={onClose}>Batal</button><button className="primary-button" disabled={busy} onClick={send}>{busy ? <Loader2 size={15} className="lg-spin" /> : <Send size={15} />} Buat link &amp; salin</button></div>
  </div></div>, document.body);
}

/** One sent pricelist link: status, what the client picked, and the next steps (full quotation, project, WhatsApp). */
function PricelistLinkDetail({ q, opens, approval, onBack, onChange, onDelete, openQuote, addQuote }: { q: Quote; opens?: { n: number; last: string }; approval?: Approval; onBack: () => void; onChange: (q: Quote) => void; onDelete: () => void; openQuote?: (id: string) => void; addQuote: (q: Quote) => void }) {
  const [making, setMaking] = useState(false);
  const link = linkOf(q.slug);
  const first = q.client.name.split(/[—-]/)[0].trim();
  const wa = `https://wa.me/?text=${encodeURIComponent(`Halo ${first}, berikut pricelist FORIOR khusus untuk Anda. Silakan pilih paket yang sesuai: ${link}`)}`;
  const picks = approval?.title ? parseChoice(approval.title, (q.packages ?? []) as PricePackage[]) : [];
  const toQuote = () => {
    const base = newQuote();
    const full: Quote = { ...base, title: q.client.name ? `Penawaran ${q.client.name.split(/[—-]/).pop()!.trim()}` : "Penawaran", client: { ...q.client, whatsapp: approval?.phone ?? undefined },
      sections: packageSections(picks, (q.packages ?? []) as PricePackage[]), operational: withTransport([], q.client.location), eyebrow: "Option 1" };
    addQuote(full); notify("Draf penawaran dibuat dari pilihan klien."); openQuote?.(full.id);
  };
  const remove = async () => {
    if (!window.confirm(`Hapus pricelist untuk ${q.client.name}? Link-nya berhenti bekerja.`)) return;
    const { error } = await supabase.storage.from("quotes").remove([`${q.slug}.json`]);
    if (error) return notify(`Gagal menghapus link: ${error.message}`);
    onDelete(); notify("Pricelist dihapus.");
  };
  return <section className="pl-page">
    <BackButton label="Pricelist" onClick={onBack} />
    <div className="pl-dhead"><b>Pricelist · {q.client.name}</b><small>{[q.client.location, `dikirim ${when(q.publishedAt)}`, opens ? `dibuka ${opens.n}×, terakhir ${ago(opens.last)}` : "belum dibuka"].filter(Boolean).join(" · ")}</small></div>
    {approval ? <div className="panel qb-card-p qb-approved">
      <div className="qb-ap-head"><span className="qb-ap-ic"><Check size={18} /></span><div><b>Klien memilih paket</b><small>{approval.name}{approval.phone ? ` · ${approval.phone}` : ""} · {when(approval.at)}</small></div></div>
      <div className="qb-ap-kv"><span>{approval.title}</span><b>{idr(approval.total ?? 0)}</b></div>
      {q.notice?.includes("biaya transport") && <div className="qb-ap-kv"><span>Transport luar kota</span><b style={{ color: "#c2410c" }}>dikonfirmasi</b></div>}
      <div className="qb-btns">
        <button className="primary-button" onClick={toQuote} disabled={!picks.length}><Plus size={15} /> Jadikan penawaran lengkap</button>
        {q.project ? <button className="outline-button" onClick={() => navigate("Photo Delivery", q.project!.galleryId)}><Images size={15} /> Buka galeri proyek</button> : <button className="outline-button" onClick={() => setMaking(true)}><FolderPlus size={15} /> Jadikan proyek</button>}
        {approval.phone && <a className="outline-button dl-wa" href={`https://wa.me/${approval.phone.replace(/\D/g, "").replace(/^0/, "62")}?text=${encodeURIComponent(`Halo ${approval.name}, terima kasih sudah memilih ${approval.title}. Kami konfirmasi jadwal shoot dan DP ya.`)}`} target="_blank" rel="noreferrer"><MessageCircle size={15} /> Konfirmasi via WA</a>}
      </div>
    </div> : <p className="panel qb-card-p qb-muted">{opens ? "Klien sudah membuka pricelist tapi belum memilih paket." : "Klien belum membuka pricelist."}</p>}
    <div className="panel qb-card-p"><h4 className="qb-h">Link pricelist</h4><small className="qb-link">{link}</small>
      <div className="qb-btns">
        <button className="outline-button" onClick={async () => { try { await navigator.clipboard.writeText(link); notify("Link disalin."); } catch { window.prompt("Salin link ini:", link); } }}><Copy size={15} /> Salin</button>
        <a className="outline-button dl-wa" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp</a>
        <a className="outline-button" href={`${link}?preview=1`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Buka</a>
        <button className="outline-button x-danger" onClick={remove}><Trash2 size={15} /> Hapus</button>
      </div>
      <p className="qb-hint">Paket di link ini: {(q.packages ?? []).map(p => p.name).join(", ")}.</p>
    </div>
    {making && approval && <MakeProjectModal q={q} approval={approval} onClose={() => setMaking(false)} onDone={galleryId => { onChange({ ...q, project: { galleryId, at: new Date().toISOString() } }); setMaking(false); }} />}
  </section>;
}
