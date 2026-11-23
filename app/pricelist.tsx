"use client";

// Penawaran › Pricelist: FORIOR's packages (one source of prices), and the picker that drops them into a quotation.
import { useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Check, Clapperboard, Globe2, Minus, Plane, Plus, Trash2, X } from "lucide-react";
import { useStored } from "./lib/store";
import { idr, rid, shortIdr } from "./lib/quote";
import { CAT_LABEL, DEFAULT_PRICELIST, type PickedPackage, type PriceCat, type PricePackage } from "./lib/pricelist";
import { notify } from "./modules";

export const usePricelist = () => useStored<PricePackage[]>("pricelist", DEFAULT_PRICELIST);
const CATS: PriceCat[] = ["Foto", "Video", "Drone", "360"];
const CatIcon = ({ cat }: { cat: PriceCat }) => cat === "Foto" ? <Camera size={18} /> : cat === "Video" ? <Clapperboard size={18} /> : cat === "Drone" ? <Plane size={18} /> : <Globe2 size={18} />;
const sub = (p: PricePackage) => p.includes.slice(0, 3).join(" · ");

export function PricelistPage() {
  const [list, setList] = usePricelist();
  const [edit, setEdit] = useState<PricePackage | null>(null);
  const save = (p: PricePackage) => { setList(l => (l.some(x => x.id === p.id) ? l.map(x => (x.id === p.id ? p : x)) : [...l, p])); setEdit(null); notify("Pricelist disimpan."); };
  const remove = (p: PricePackage) => { if (!window.confirm(`Hapus paket "${p.name}" dari pricelist? Penawaran yang sudah dibuat tidak berubah.`)) return; setList(l => l.filter(x => x.id !== p.id)); setEdit(null); };
  return <section className="pl-page">
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
