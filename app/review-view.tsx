"use client";

// Client Review Portal (no login). One private link per batch: the client scans all content, opens one,
// and approves, asks for revision, or comments (per scene too). Rules live in supabase/functions/review/review.ts.
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, FileText, HelpCircle, Image as ImageIcon, Layers3, Loader2, MessageSquare, Pencil, Play, Send, Target, X } from "lucide-react";
import { supabase } from "./lib/cloud";
import { progress, statusOf, type ClientStatus, type Feedback, type ReviewAction, type ReviewItem, type ReviewSnapshot } from "../supabase/functions/review/review";

type Data = { snapshot: ReviewSnapshot; feedback: Feedback };
type Act = ReviewAction extends infer A ? A extends { name: string } ? Omit<A, "name"> : never : never;
const FMT_ICON = { Reels: Play, Carousel: Layers3, Feed: ImageIcon } as const;
const LABEL: Record<ClientStatus, string> = { approved: "Approved", revision: "Revisi", review: "In review" };
const pad = (n: number) => String(n).padStart(2, "0");
const clock = (n: number) => `${Math.floor(n / 60)}:${pad(n % 60)}`;
const secOf = (s: { sec?: number; label: string }) => { if (s.sec && s.sec > 0) return s.sec; const m = /(\d+)\s*(?:-|–)\s*(\d+)/.exec(s.label); return m && +m[2] > +m[1] ? +m[2] - +m[1] : 3; };
const when = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const sizeOf = (i: ReviewItem) => (i.format === "Reels" ? `± ${i.board.reduce((a, s) => a + secOf(s), 0) || 30} detik` : i.format === "Carousel" ? `${i.board.length || 1} slide` : "1 gambar");
const NAME_KEY = "forior-review-name";
const readName = () => { try { return localStorage.getItem(NAME_KEY) ?? ""; } catch { return ""; } };

function tokenFromLocation() {
  const q = new URLSearchParams(window.location.search).get("r");
  if (q) return q;
  const m = /\/review\/([^/?#]+)/.exec(window.location.pathname);
  return m ? decodeURIComponent(m[1]) : "";
}
async function call(token: string, body: Record<string, unknown>): Promise<Data> {
  const { data, error } = await supabase.functions.invoke("review", { body: { token, ...body } });
  if (error) {
    let detail: { error?: string } = {};
    try { detail = await (error as { context?: Response }).context?.json(); } catch { /* not JSON */ }
    throw new Error(detail.error ?? "Koneksi bermasalah. Coba lagi.");
  }
  return data as Data;
}

function Thumb({ src, className, children }: { src: string; className: string; children?: React.ReactNode }) {
  return <div className={className} style={src ? { backgroundImage: `url("${src}")` } : undefined}>{children}</div>;
}
function Status({ s }: { s: ClientStatus }) { return <em className={`rv-status rv-${s}`}>{s === "approved" ? <CheckCircle2 size={14} /> : s === "revision" ? <Pencil size={13} /> : <Clock size={14} />} {LABEL[s]}</em>; }
function Brand() { return <div className="rv-brand"><span className="lg-mark" aria-hidden="true"><i /><i /></span><span><b>FORIOR</b><small>Creative Production</small></span></div>; }

export function PublicReviewPage() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [day, setDay] = useState<number | null>(null);
  const [fmt, setFmt] = useState("");
  const [name, setName] = useState("");
  const [asking, setAsking] = useState<{ a: Act; done: (ok: boolean) => void } | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [help, setHelp] = useState(false);
  const [general, setGeneral] = useState("");
  useEffect(() => {
    const t = tokenFromLocation(); setToken(t); setName(readName());
    if (!t) { setState("missing"); return; }
    call(t, { action: "get" }).then(d => { setData(d); setState("ready"); document.title = `${d.snapshot.batch} — ${d.snapshot.account} · FORIOR Review`; }).catch(() => setState("missing"));
  }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3200); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [day]);

  /** Every action needs the reviewer's name once; it is remembered on this device. */
  const act = useCallback(async (a: Act, who = name): Promise<boolean> => {
    if (!who.trim()) return new Promise<boolean>(done => setAsking({ a, done })); // resumes after the name is given
    setBusy(true);
    try { setData(await call(token, { ...a, name: who.trim() })); setToast(a.action === "approve" ? "Konten disetujui. Terima kasih!" : a.action === "approve-all" ? "Seluruh konten disetujui. Terima kasih!" : a.action === "revision" ? "Catatan revisi terkirim ke tim FORIOR." : "Komentar terkirim."); return true; }
    catch (e) { setToast(e instanceof Error ? e.message : String(e)); return false; }
    finally { setBusy(false); }
  }, [name, token]);

  if (state === "loading") return <main className="rv-page rv-center"><Loader2 size={28} className="lg-spin" /></main>;
  if (state === "missing" || !data) return <main className="rv-page rv-center"><Brand /><h1>Link review tidak ditemukan</h1><p>Link mungkin sudah dinonaktifkan. Hubungi tim FORIOR untuk link terbaru.</p></main>;

  const { snapshot: s, feedback: fb } = data;
  const st = (i: ReviewItem) => statusOf(i, fb[String(i.day)]);
  const p = progress(s, fb);
  const pct = Math.round((p.approved / Math.max(1, p.total)) * 100);
  const item = day !== null ? s.items.find(i => i.day === day) : null;
  const count = (f: string) => s.items.filter(i => i.format === f).length;

  const cancelName = () => { asking?.done(false); setAsking(null); };
  const nameModal = asking && <div className="modal-backdrop" onClick={cancelName}><form className="quick-modal rv-name" onClick={e => e.stopPropagation()} onSubmit={async e => { e.preventDefault(); const v = name.trim(); if (!v) return; try { localStorage.setItem(NAME_KEY, v); } catch { /* private mode */ } const { a, done } = asking; setAsking(null); done(await act(a, v)); }}>
    <button type="button" className="modal-close" onClick={cancelName} aria-label="Tutup"><X size={18} /></button>
    <h2>Siapa yang mereview?</h2><p>Nama Anda tampil di setiap persetujuan dan komentar, supaya tim FORIOR tahu siapa yang memberi masukan.</p>
    <label htmlFor="rv-name">NAMA</label><input id="rv-name" autoFocus value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="Contoh: Rina — Intragama Villa" />
    <button className="primary-button" type="submit" disabled={!name.trim()}>Lanjutkan</button>
  </form></div>;
  const toastEl = toast && <div className="rv-toast" role="status">{toast}</div>;
  const header = <header className="rv-top"><Brand /><span className="rv-top-title">Client Review Portal</span><button className="rv-help-btn" onClick={() => setHelp(!help)}><HelpCircle size={16} /> Cara review</button></header>;
  const helpBox = help && <div className="rv-help"><b>Cara review</b><ol><li>Klik <i>Lihat detail</i> untuk membuka storyboard (Reels), slide (Carousel), atau desain (Feed).</li><li>Tekan <i>Approve</i> bila sudah sesuai, atau <i>Minta revisi</i> dan tulis catatannya.</li><li>Komentar bisa untuk konten secara umum atau untuk scene/slide tertentu.</li><li>Bila tim mengubah konten setelah Anda setujui, konten itu kembali menunggu persetujuan.</li></ol></div>;

  if (item) {
    const f = fb[String(item.day)];
    const status = st(item);
    const idx = s.items.indexOf(item);
    return <main className="rv-page">{header}{helpBox}
      <div className="rv-wrap">
        <nav className="rv-crumbs"><button onClick={() => setDay(null)}><ArrowLeft size={16} /> {s.batch}</button><span>Konten {pad(item.day)}</span>
          <span className="rv-nav"><button disabled={idx === 0} onClick={() => setDay(s.items[idx - 1].day)} aria-label="Konten sebelumnya"><ChevronLeft size={18} /></button>{idx + 1} / {s.items.length}<button disabled={idx === s.items.length - 1} onClick={() => setDay(s.items[idx + 1].day)} aria-label="Konten berikutnya"><ChevronRight size={18} /></button></span></nav>
        <div className="rv-detail">
          <section className="rv-main">
            <div className="rv-card rv-dhead"><Thumb src={item.cover} className="rv-dcover">{item.format === "Reels" && <span><Play size={12} /> {sizeOf(item).replace("± ", "")}</span>}</Thumb>
              <div><em className={`cx-fmt cx-f-${item.format.toLowerCase()}`}>{item.format} {item.format === "Reels" ? "· 9:16" : "· 4:5"}</em><h1>{item.title}</h1>
                <div className="rv-meta"><span><Layers3 size={14} /> {s.account}</span><span><Clock size={14} /> {sizeOf(item)}</span>{item.publishDate && <span><CalendarDays size={14} /> Tayang {item.publishDate}</span>}{item.goal && <span><Target size={14} /> {item.goal}</span>}</div>
                {item.concept && <p>{item.concept}</p>}</div></div>
            {item.board.length > 0 && <div className="rv-card"><h3><FileText size={17} /> {item.format === "Reels" ? "Storyboard" : "Slide"} <span>({item.board.length})</span></h3>
              <ol className={`rv-scenes ${item.format === "Reels" ? "v" : "s"}`}>{(() => { let t = 0; return item.board.map((sc, i) => { const start = t; t += secOf(sc); const n = (f?.comments ?? []).filter(c => c.scene === i).length; return <li key={i}><Thumb src={sc.image ?? ""} className="rv-scene-img"><b>{pad(i + 1)}</b>{item.format === "Reels" && <span>{clock(start)} – {clock(t)}</span>}</Thumb>
                <div><h4>{sc.label}</h4>{sc.visual && <p><i>{item.format === "Reels" ? "Shot" : "Visual"}</i>{sc.visual}</p>}{sc.text && <p><i>Teks</i>{sc.text}</p>}{sc.audio && <p><i>VO / Audio</i>{sc.audio}</p>}
                  <SceneComment busy={busy} count={n} onSend={text => act({ action: "comment", day: item.day, text, scene: i })} /></div></li>; }); })()}</ol></div>}
            <div className="rv-card"><h3><MessageSquare size={17} /> Caption & copy</h3>
              <p className="rv-caption">{item.caption || "Caption belum ditulis."}</p>{item.hashtags && <p className="rv-tags">{item.hashtags}</p>}{item.cta && <p className="rv-cta"><b>CTA:</b> {item.cta}</p>}</div>
          </section>
          <aside className="rv-side">
            <div className="rv-card rv-decide">
              <div className="rv-row"><span>Status konten</span><Status s={status} /></div>
              {f?.status && f.by && status !== "review" && <small>{f.status === "approved" ? "Disetujui" : "Revisi diminta"} oleh {f.by} · {when(f.at!)}</small>}
              {f?.status && status === "review" && <small>Konten sudah diperbarui tim. Mohon review ulang.</small>}
              <button className="primary-button" disabled={busy || status === "approved"} onClick={() => act({ action: "approve", day: item.day })}><Check size={16} /> {status === "approved" ? "Sudah disetujui" : "Approve konten"}</button>
              <Revision busy={busy} onSend={text => act({ action: "revision", day: item.day, text })} />
            </div>
            <div className="rv-card"><h3><MessageSquare size={17} /> Komentar <span>({f?.comments.length ?? 0})</span></h3>
              {(f?.comments ?? []).length ? <ul className="rv-comments">{f!.comments.map(c => <li key={c.id} className={c.team ? "team" : ""}><span className="rv-av">{c.by[0]}</span><div><b>{c.by}{c.scene !== undefined && <small> · {item.board[c.scene]?.label ?? `Scene ${c.scene + 1}`}</small>}</b><p>{c.text}</p><small>{when(c.at)}</small></div></li>)}</ul> : <p className="rv-empty">Belum ada komentar.</p>}
              <Composer busy={busy} placeholder="Tulis komentar…" onSend={text => act({ action: "comment", day: item.day, text })} />
            </div>
            {idx < s.items.length - 1 && <button className="outline-button rv-next" onClick={() => setDay(s.items[idx + 1].day)}>Konten berikutnya <ArrowRight size={15} /></button>}
          </aside>
        </div>
      </div>{nameModal}{toastEl}</main>;
  }

  const shown = s.items.filter(i => !fmt || i.format === fmt);
  const notes = fb["0"]?.comments ?? [];
  return <main className="rv-page">{header}{helpBox}
    <div className="rv-wrap rv-overview">
      <section className="rv-main">
        <Thumb src={s.cover} className="rv-hero"><div><span>CONTENT PRODUCTION · {s.account}</span><h1>{s.account}</h1><p>{s.batch}{s.period && s.period !== "-" ? ` · ${s.period}` : ""}</p><small>Review rencana konten, berikan feedback, dan setujui setiap konten.</small></div><em className={`rv-status rv-${pct === 100 ? "approved" : "review"}`}>{pct === 100 ? "Semua disetujui" : "In review"}</em></Thumb>
        <div className="rv-card">
          <div className="rv-chips">{[["", "Semua", s.items.length], ...(["Reels", "Carousel", "Feed"] as const).filter(f => count(f)).map(f => [f, f, count(f)])].map(([v, l, n]) => <button key={String(v)} className={fmt === v ? "active" : ""} onClick={() => setFmt(String(v))}>{l} ({n})</button>)}</div>
          <div className="rv-table">
            <div className="rv-tr rv-th"><span>No.</span><span>Konten</span><span>Format</span><span>Durasi / slide</span><span>Status</span><span /></div>
            {shown.map(i => { const I = FMT_ICON[i.format]; return <button key={i.day} className="rv-tr" onClick={() => setDay(i.day)}>
              <span className="rv-no">{pad(i.day)}</span>
              <span className="rv-tcontent"><Thumb src={i.cover} className="rv-thumb" /><span><b>{i.title}</b><small>{i.publishDate ? `Tayang ${i.publishDate}` : i.format}{(fb[String(i.day)]?.comments.length ?? 0) > 0 ? ` · ${fb[String(i.day)]!.comments.length} komentar` : ""}</small></span></span>
              <span className="rv-fmt"><I size={14} /> {i.format}</span><span className="rv-size">{sizeOf(i)}</span><span><Status s={st(i)} /></span><span className="rv-open">Lihat detail <ArrowRight size={14} /></span>
            </button>; })}
          </div>
        </div>
      </section>
      <aside className="rv-side">
        <div className="rv-card"><div className="rv-row"><h3>Progress persetujuan</h3><b className="rv-pct">{pct}% <small>({p.approved}/{p.total})</small></b></div><i className="rv-bar"><em style={{ width: `${pct}%` }} /></i>
          <div className="rv-counts">{(["Reels", "Carousel", "Feed"] as const).map(f => { const I = FMT_ICON[f]; return <span key={f}><I size={18} /><b>{count(f)}</b>{f}</span>; })}</div></div>
        <div className="rv-card"><h3>Informasi batch</h3><dl className="rv-dl"><dt><CalendarDays size={15} /> Periode</dt><dd>{s.period || "-"}</dd><dt><Target size={15} /> Tujuan</dt><dd>{s.goal}</dd><dt><Layers3 size={15} /> Total konten</dt><dd>{s.items.length} konten</dd><dt><Clock size={15} /> Diperbarui</dt><dd>{when(s.publishedAt)}</dd></dl>
          {s.brief && <p className="rv-brief">{s.brief}</p>}</div>
        <div className="rv-card"><h3><FileText size={17} /> Catatan untuk review</h3><ul className="rv-tips"><li>Review setiap konten, lalu setujui atau beri catatan revisi.</li><li>Klik “Lihat detail” untuk melihat storyboard (Reels), slide (Carousel), atau desain (Feed).</li><li>Revisi dapat diajukan per konten, komentar bisa per scene.</li></ul></div>
        <button className="primary-button rv-all" disabled={busy || p.approved === p.total} onClick={() => { if (window.confirm(`Setujui ${p.total - p.approved} konten yang belum disetujui?`)) act({ action: "approve-all" }); }}><Check size={17} /> {p.approved === p.total ? "Seluruh konten disetujui" : `Setujui seluruh konten (${p.total - p.approved})`}</button>
        <div className="rv-card"><h3><MessageSquare size={17} /> Catatan umum</h3>
          {notes.length > 0 && <ul className="rv-comments">{notes.map(c => <li key={c.id} className={c.team ? "team" : ""}><span className="rv-av">{c.by[0]}</span><div><b>{c.by}</b><p>{c.text}</p><small>{when(c.at)}</small></div></li>)}</ul>}
          <div className="rv-compose"><textarea rows={2} maxLength={1000} value={general} onChange={e => setGeneral(e.target.value)} placeholder="Masukan untuk seluruh batch…" aria-label="Catatan umum" /><button className="primary-button" disabled={busy || !general.trim()} onClick={async () => { if (await act({ action: "comment", day: 0, text: general })) setGeneral(""); }} aria-label="Kirim catatan umum"><Send size={15} /></button></div>
        </div>
      </aside>
    </div>
    <footer className="rv-foot">FORIOR · Creative Production · Link ini privat untuk {s.account}</footer>
    {nameModal}{toastEl}</main>;
}

function Composer({ onSend, busy, placeholder }: { onSend: (t: string) => Promise<boolean>; busy: boolean; placeholder: string }) {
  const [t, setT] = useState("");
  return <div className="rv-compose"><textarea rows={2} maxLength={1000} value={t} onChange={e => setT(e.target.value)} placeholder={placeholder} aria-label={placeholder} /><button className="primary-button" disabled={busy || !t.trim()} onClick={async () => { if (await onSend(t)) setT(""); }} aria-label="Kirim"><Send size={15} /></button></div>;
}
function Revision({ onSend, busy }: { onSend: (t: string) => Promise<boolean>; busy: boolean }) {
  const [open, setOpen] = useState(false), [t, setT] = useState("");
  if (!open) return <button className="outline-button" disabled={busy} onClick={() => setOpen(true)}><Pencil size={15} /> Minta revisi</button>;
  return <div className="rv-revise"><label htmlFor="rv-rev">Apa yang perlu diubah?</label><textarea id="rv-rev" autoFocus rows={3} maxLength={1000} value={t} onChange={e => setT(e.target.value)} placeholder="Contoh: scene 3 tolong ambil dari sudut yang lebih luas." /><div className="rv-row"><button className="outline-button" onClick={() => setOpen(false)}>Batal</button><button className="primary-button" disabled={busy || !t.trim()} onClick={async () => { if (await onSend(t)) { setT(""); setOpen(false); } }}><Send size={14} /> Kirim revisi</button></div></div>;
}
function SceneComment({ onSend, busy, count }: { onSend: (t: string) => Promise<boolean>; busy: boolean; count: number }) {
  const [open, setOpen] = useState(false), [t, setT] = useState("");
  return open ? <div className="rv-compose rv-scene-compose"><textarea autoFocus rows={2} maxLength={1000} value={t} onChange={e => setT(e.target.value)} placeholder="Komentar untuk bagian ini…" aria-label="Komentar scene" /><button className="primary-button" disabled={busy || !t.trim()} onClick={async () => { if (await onSend(t)) { setT(""); setOpen(false); } }} aria-label="Kirim"><Send size={14} /></button></div>
    : <button className="rv-scene-btn" onClick={() => setOpen(true)}><MessageSquare size={13} /> Komentar{count ? ` (${count})` : ""}</button>;
}
