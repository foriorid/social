"use client";

// Auto DM (ManyChat-style): keyword comment → public reply → DM with a button → follow check → link.
// Automations and stats live in Supabase; the public `ig-webhook` Edge Function runs them.
import { useCallback, useEffect, useState } from "react";
import { AtSign, Check, CheckCircle2, Circle, Copy, Lock, MessageCircle, Pencil, Plus, Send, Trash2, UserCheck, X, Zap } from "lucide-react";
import { SUPABASE_URL, readCloud, supabase } from "./lib/cloud";
import { notify, useCloud } from "./modules";
import { followGateMessage, linkMessage, openingMessage, validate, type Automation } from "../supabase/functions/ig-webhook/autodm";

type Row = Automation & { created_at?: string };
type Stats = Record<string, { triggered: number; dm_sent: number; gated: number; link_sent: number; error: number }>;
const WEBHOOK = `${SUPABASE_URL}/functions/v1/ig-webhook`;
const blank = (): Omit<Row, "id"> => ({ name: "", active: true, keywords: [], match_mode: "contains", media_ids: [], dm_keywords: true, public_replies: ["Sudah kami kirim ke DM ya! 📩", "Cek inbox kamu ya 🙌"], opening: "Hai {nama}! Terima kasih sudah komentar 🙏 Tekan tombol di bawah untuk dapat link-nya.", button_label: "Kirim link", require_follow: true, follow_prompt: "Sedikit lagi! Follow akun kami dulu ya, lalu tekan tombol di bawah 👇", follow_button: "Sudah follow", link_message: "Ini link-nya. Terima kasih sudah follow! ✨", link_label: "Buka link", link_url: "https://" });
const copy = (t: string, what: string) => navigator.clipboard?.writeText(t).then(() => notify(`${what} disalin.`), () => notify("Browser menolak menyalin. Salin manual."));

export function AutoDmPage() {
  const [cloud] = useCloud();
  const ws = readCloud().workspaceId ?? "";
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats>({});
  const [acct, setAcct] = useState<{ ig_user_id: string | null; verify_token: string } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [edit, setEdit] = useState<Partial<Row> | null>(null);
  const [igId, setIgId] = useState("");
  const load = useCallback(async () => {
    if (!ws) return;
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const [a, r, e] = await Promise.all([
      supabase.from("ig_accounts").select("ig_user_id, verify_token").eq("workspace_id", ws).maybeSingle(),
      supabase.from("dm_automations").select("*").eq("workspace_id", ws).order("created_at"),
      supabase.from("dm_events").select("automation_id, kind").eq("workspace_id", ws).gte("at", since).limit(10000)
    ]);
    if (a.error || r.error || e.error) { setState("error"); return; }
    setAcct(a.data); setIgId(a.data?.ig_user_id ?? ""); setRows((r.data ?? []) as Row[]);
    const s: Stats = {};
    for (const ev of e.data ?? []) { const k = String(ev.automation_id ?? ""); s[k] ??= { triggered: 0, dm_sent: 0, gated: 0, link_sent: 0, error: 0 }; s[k][ev.kind as keyof Stats[string]]++; }
    setStats(s); setState("ready");
  }, [ws]);
  useEffect(() => { load(); }, [load]);

  const saveAccount = async () => {
    if (!/^[0-9]{5,25}$/.test(igId.trim())) return notify("Instagram User ID berupa angka, contoh 17841400000000000.");
    const { error } = acct ? await supabase.from("ig_accounts").update({ ig_user_id: igId.trim(), updated_at: new Date().toISOString() }).eq("workspace_id", ws) : await supabase.from("ig_accounts").insert({ workspace_id: ws, ig_user_id: igId.trim() });
    if (error) return notify(error.code === "23505" ? "Akun Instagram ini sudah terhubung ke workspace lain." : `Gagal: ${error.message}`);
    notify("Akun Instagram terhubung."); load();
  };
  const save = async () => {
    if (!edit) return;
    const err = validate(edit); if (err) return notify(err);
    const { id, created_at: _c, ...fields } = edit as Row;
    const payload = { ...fields, keywords: (fields.keywords ?? []).map(k => k.trim()).filter(Boolean), public_replies: (fields.public_replies ?? []).map(k => k.trim()).filter(Boolean), updated_at: new Date().toISOString() };
    const { error } = id ? await supabase.from("dm_automations").update(payload).eq("id", id) : await supabase.from("dm_automations").insert({ ...payload, workspace_id: ws });
    if (error) return notify(`Gagal menyimpan: ${error.message}`);
    setEdit(null); notify("Automation disimpan."); load();
  };
  const toggle = async (r: Row) => { const { error } = await supabase.from("dm_automations").update({ active: !r.active }).eq("id", r.id); if (error) return notify(error.message); load(); };
  const remove = async (r: Row) => { if (!window.confirm(`Hapus automation “${r.name}”? Statistiknya ikut terhapus.`)) return; const { error } = await supabase.from("dm_automations").delete().eq("id", r.id); if (error) return notify(error.message); load(); };

  const steps = [
    { ok: !!cloud.keys.meta_token, label: "Token Meta tersimpan", hint: "Settings → AI & Models → Meta Access Token (izin instagram_manage_messages & instagram_manage_comments)." },
    { ok: !!cloud.keys.meta_app_secret, label: "App Secret tersimpan", hint: "Settings → AI & Models → Meta App Secret." },
    { ok: !!acct?.ig_user_id, label: "Instagram User ID terhubung", hint: "Isi di bawah." },
    { ok: rows.some(r => r.active), label: "Minimal satu automation aktif", hint: "Buat automation baru." }
  ];
  const total = Object.values(stats).reduce((t, s) => ({ triggered: t.triggered + s.triggered, link_sent: t.link_sent + s.link_sent, gated: t.gated + s.gated }), { triggered: 0, link_sent: 0, gated: 0 });

  return <div className="module-page ad">
    <div className="ad-head">
      <div className="ad-kpis"><div><Zap size={18} /><b>{total.triggered}</b><small>Komentar memicu (30 hari)</small></div><div><Lock size={18} /><b>{total.gated}</b><small>Diminta follow dulu</small></div><div><Send size={18} /><b>{total.link_sent}</b><small>Link terkirim</small></div></div>
      <button className="primary-button" onClick={() => setEdit(blank())}><Plus size={16} /> Automation baru</button>
    </div>
    <div className="ad-layout">
      <section className="ad-list">
        {state === "loading" && <p className="x-empty">Memuat…</p>}
        {state === "error" && <p className="x-error">Belum bisa memuat Auto DM. <button className="cx-link" onClick={load}>Coba lagi</button></p>}
        {state === "ready" && !rows.length && <div className="panel cx-empty"><MessageCircle size={30} /><h3>Belum ada automation</h3><p>Contoh: orang komentar <b>PRICELIST</b> di Reels → otomatis dapat DM → wajib follow → link pricelist terkirim.</p><button className="primary-button" onClick={() => setEdit(blank())}><Plus size={16} /> Buat automation pertama</button></div>}
        {rows.map(r => { const s = stats[r.id] ?? { triggered: 0, dm_sent: 0, gated: 0, link_sent: 0, error: 0 }; return <article key={r.id} className={`panel ad-card ${r.active ? "" : "off"}`}>
          <div className="ad-card-head"><div><h3>{r.name}</h3><div className="ad-kw">{r.keywords.map(k => <em key={k}>{k}</em>)}{r.media_ids.length > 0 && <small>{r.media_ids.length} post tertentu</small>}{r.require_follow && <small><UserCheck size={12} /> wajib follow</small>}</div></div>
            <label className="ad-switch" title={r.active ? "Aktif" : "Nonaktif"}><input type="checkbox" checked={r.active} onChange={() => toggle(r)} /><span /></label></div>
          <div className="ad-funnel"><span><b>{s.triggered}</b>komentar</span><span><b>{s.dm_sent}</b>DM terkirim</span><span><b>{s.gated}</b>minta follow</span><span><b>{s.link_sent}</b>link terkirim</span>{s.error > 0 && <span className="bad"><b>{s.error}</b>gagal</span>}</div>
          <div className="ad-actions"><button className="outline-button" onClick={() => setEdit(r)}><Pencil size={14} /> Edit</button><button className="outline-button x-danger" onClick={() => remove(r)}><Trash2 size={14} /></button></div>
        </article>; })}
      </section>
      <aside className="panel ad-setup">
        <h3><AtSign size={18} /> Koneksi Instagram</h3>
        <ul className="ad-steps">{steps.map(s => <li key={s.label} className={s.ok ? "ok" : ""}>{s.ok ? <CheckCircle2 size={16} /> : <Circle size={16} />}<span><b>{s.label}</b>{!s.ok && <small>{s.hint}</small>}</span></li>)}</ul>
        <label className="cx-f"><span>Instagram User ID</span><div className="sk-link"><input value={igId} onChange={e => setIgId(e.target.value)} placeholder="17841400000000000" inputMode="numeric" /><button className="primary-button" onClick={saveAccount}>Simpan</button></div></label>
        {acct && <>
          <div className="ad-copy"><span>Callback URL webhook</span><code>{WEBHOOK}</code><button className="cx-link" onClick={() => copy(WEBHOOK, "Callback URL")}><Copy size={13} /> Salin</button></div>
          <div className="ad-copy"><span>Verify token</span><code>{acct.verify_token}</code><button className="cx-link" onClick={() => copy(acct.verify_token, "Verify token")}><Copy size={13} /> Salin</button></div>
        </>}
        <details className="ad-guide"><summary>Cara menghubungkan (sekali saja)</summary><ol>
          <li>Akun Instagram harus <b>Business/Creator</b> dan terhubung ke Facebook Page.</li>
          <li>Di Meta for Developers, buka aplikasi Anda → tambahkan produk <b>Instagram</b> (atau Messenger → Instagram settings).</li>
          <li>Webhooks → objek <b>Instagram</b> → tempel Callback URL &amp; Verify token di atas → subscribe field <b>comments</b>, <b>messages</b>, <b>messaging_postbacks</b>.</li>
          <li>Buat token akses (Page token / Instagram token) dengan izin <i>instagram_manage_messages</i>, <i>instagram_manage_comments</i>, <i>pages_manage_metadata</i>, lalu simpan di Settings beserta App Secret.</li>
          <li>Di aplikasi Instagram: Settings → Messages and story replies → Message controls → <b>Allow access to messages</b> (Connected tools) = aktif.</li>
          <li>Selama aplikasi Meta masih mode Development, Auto DM hanya berjalan untuk akun yang punya peran di aplikasi itu. Untuk semua pengikut, aplikasi perlu <b>Live</b> (App Review izin di atas).</li>
        </ol></details>
      </aside>
    </div>
    {edit && <Editor value={edit} onChange={setEdit} onSave={save} onClose={() => setEdit(null)} />}
  </div>;
}

function Editor({ value: v, onChange, onSave, onClose }: { value: Partial<Row>; onChange: (v: Partial<Row>) => void; onSave: () => void; onClose: () => void }) {
  const set = (p: Partial<Row>) => onChange({ ...v, ...p });
  const [kw, setKw] = useState("");
  const a = { ...blank(), id: v.id ?? "preview", ...v } as Automation;
  const o = openingMessage(a, "rina.travel"), g = followGateMessage(a), l = linkMessage(a);
  const addKw = () => { const k = kw.trim().replace(/,$/, ""); if (k && !(v.keywords ?? []).includes(k)) set({ keywords: [...(v.keywords ?? []), k] }); setKw(""); };
  return <div className="modal-backdrop" onClick={onClose}><div className="quick-modal cp-modal ad-modal" role="dialog" aria-label="Automation" onClick={e => e.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Tutup"><X size={18} /></button>
    <div className="cp-modal-head"><span className="modal-icon"><MessageCircle size={21} /></span><div><h2>{v.id ? "Edit automation" : "Automation baru"}</h2><p>Komentar dengan kata kunci → DM otomatis → cek follow → kirim link.</p></div></div>
    <div className="ad-edit">
      <div className="cx-form">
        <label className="cx-f wide"><span>Nama automation <b>*</b></span><input value={v.name ?? ""} maxLength={80} onChange={e => set({ name: e.target.value })} placeholder="Pricelist foto interior" /></label>
        <div className="cx-f wide"><span>1 · Kata kunci komentar <b>*</b> <small>Enter untuk menambah</small></span>
          <div className="cx-chipsel">{(v.keywords ?? []).map(k => <button type="button" key={k} className="active" onClick={() => set({ keywords: (v.keywords ?? []).filter(x => x !== k) })}>{k} <X size={12} /></button>)}<input value={kw} onChange={e => setKw(e.target.value)} onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addKw(); } }} onBlur={addKw} placeholder="PRICELIST, harga, info" aria-label="Tambah kata kunci" /></div></div>
        <div className="cx-f"><span>Cara cocok</span><div className="cx-segs two">{([["contains", "Mengandung kata"], ["exact", "Persis sama"]] as const).map(([m, l2]) => <button type="button" key={m} className={(v.match_mode ?? "contains") === m ? "active" : ""} onClick={() => set({ match_mode: m })}>{l2}</button>)}</div></div>
        <label className="cx-f ad-check"><input type="checkbox" checked={v.dm_keywords ?? true} onChange={e => set({ dm_keywords: e.target.checked })} /><span>Juga jalan jika kata kunci dikirim lewat DM</span></label>
        <div className="cx-f wide"><span>2 · Balasan komentar publik <small>dipilih acak supaya tidak terlihat spam; kosongkan bila tidak perlu</small></span>
          {(v.public_replies ?? []).map((r, i) => <div key={i} className="ad-row"><input value={r} maxLength={300} onChange={e => set({ public_replies: (v.public_replies ?? []).map((x, n) => n === i ? e.target.value : x) })} /><button className="outline-button" onClick={() => set({ public_replies: (v.public_replies ?? []).filter((_, n) => n !== i) })} aria-label="Hapus balasan"><X size={14} /></button></div>)}
          {(v.public_replies ?? []).length < 10 && <button className="cx-link" onClick={() => set({ public_replies: [...(v.public_replies ?? []), ""] })}><Plus size={13} /> Tambah variasi</button>}</div>
        <label className="cx-f wide"><span>3 · DM pembuka <small>{"{nama}"} = username</small></span><textarea rows={3} maxLength={900} value={v.opening ?? ""} onChange={e => set({ opening: e.target.value })} /></label>
        <label className="cx-f"><span>Label tombol</span><input value={v.button_label ?? ""} maxLength={20} onChange={e => set({ button_label: e.target.value })} placeholder="Kirim link" /></label>
        <label className="cx-f ad-check"><input type="checkbox" checked={v.require_follow ?? true} onChange={e => set({ require_follow: e.target.checked })} /><span><b>4 · Wajib follow dulu</b> sebelum link dikirim</span></label>
        {(v.require_follow ?? true) && <><label className="cx-f wide"><span>Pesan jika belum follow</span><textarea rows={2} maxLength={900} value={v.follow_prompt ?? ""} onChange={e => set({ follow_prompt: e.target.value })} /></label>
          <label className="cx-f"><span>Tombol cek ulang</span><input value={v.follow_button ?? ""} maxLength={20} onChange={e => set({ follow_button: e.target.value })} placeholder="Sudah follow" /></label></>}
        <label className="cx-f wide"><span>5 · Pesan link</span><textarea rows={2} maxLength={640} value={v.link_message ?? ""} onChange={e => set({ link_message: e.target.value })} /></label>
        <label className="cx-f"><span>URL <b>*</b></span><input value={v.link_url ?? ""} onChange={e => set({ link_url: e.target.value })} placeholder="https://forior.id/pricelist" inputMode="url" /></label>
        <label className="cx-f"><span>Label tombol link</span><input value={v.link_label ?? ""} maxLength={20} onChange={e => set({ link_label: e.target.value })} placeholder="Buka link" /></label>
      </div>
      <aside className="ad-phone" aria-label="Pratinjau percakapan">
        <div className="ad-screen">
          <div className="ad-post"><b>rina.travel</b> {(v.keywords ?? [])[0] ?? "PRICELIST"}{(v.public_replies ?? []).find(x => x.trim()) && <p><b>kamu</b> {(v.public_replies ?? []).find(x => x.trim())}</p>}</div>
          <div className="ad-msgs">
            <p className="in">{"text" in o ? o.text : ""}</p>
            <button className="ad-qr">{"text" in o ? o.quick_replies?.[0].title : ""}</button>
            {a.require_follow && <><p className="me">belum follow…</p><p className="in">{"text" in g ? g.text : ""}</p><button className="ad-qr">{"text" in g ? g.quick_replies?.[0].title : ""}</button></>}
            <p className="me">{a.require_follow ? "sudah follow ✓" : "tap tombol ✓"}</p>
            {"attachment" in l && <div className="ad-link"><p>{l.attachment.payload.text}</p><span>{l.attachment.payload.buttons[0].title}</span></div>}
          </div>
        </div>
      </aside>
    </div>
    <div className="cp-modal-actions"><label className="ad-check"><input type="checkbox" checked={v.active ?? true} onChange={e => set({ active: e.target.checked })} /> Aktif</label><button className="outline-button" onClick={onClose}>Batal</button><button className="primary-button" onClick={onSave}><Check size={15} /> Simpan</button></div>
  </div></div>;
}
