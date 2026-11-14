"use client";

// Team side of the Client Review Portal: publish a batch snapshot to a private link, see the client's
// decisions and comments, and reply. Rules shared with the public Edge Function live in review.ts.
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Link2, Loader2, MessageSquare, RefreshCw, Send, ShieldOff } from "lucide-react";
import { readCloud, supabase } from "./lib/cloud";
import { notify } from "./modules";
import type { CampaignData } from "./plan-data";
import { progress, reviewSlug, revOf, statusOf, type ClientStatus, type Feedback, type ReviewItem, type ReviewSnapshot } from "../supabase/functions/review/review";

export type ReviewRow = { token: string; snapshot: ReviewSnapshot; feedback: Feedback; revoked: boolean; updated_at: string };
export const CLIENT_LABEL: Record<ClientStatus, string> = { approved: "Disetujui klien", revision: "Revisi klien", review: "Menunggu klien" };

/** Public link for the client. Vercel serves /review/<token>; other hosts use ?r=. */
export function reviewLink(token: string) {
  if (typeof window === "undefined") return "";
  const root = window.location.pathname.replace(/\/(review\/.*)?$/, "");
  return window.location.hostname.endsWith("github.io") ? `${window.location.origin}${root}/review/?r=${token}` : `${window.location.origin}${root}/review/${token}`;
}

const rand4 = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), b => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
const newToken = (c: CampaignData) => reviewSlug(c.account, c.name, rand4());

/** What the client sees of a batch. Only reviewable fields; internal notes and status stay in the app. */
export function snapshotOf(c: CampaignData, version: number): ReviewSnapshot {
  const photo = (x: CampaignData["items"][number]) => x.assets?.find(a => a.kind === "Foto")?.thumb ?? x.board?.find(s => s.image)?.image ?? "";
  const items: ReviewItem[] = c.items.filter(x => !x.untitled).map(x => {
    const base = { day: x.day, title: x.title, format: x.format, publishDate: x.publishDate || "", cover: photo(x), goal: x.goal || "", caption: x.caption || "", hashtags: x.hashtags || "", cta: x.cta || "", concept: x.concept || x.visualDirection || "", board: (x.board ?? []).map(s => ({ label: s.label, visual: s.visual, text: s.text, audio: s.audio, ...(s.sec ? { sec: s.sec } : {}), ...(s.note ? { note: s.note } : {}), ...(s.image ? { image: s.image } : {}), ...(s.sub ? { sub: s.sub } : {}) })) };
    return { ...base, rev: revOf(base) };
  });
  return { account: c.account, batch: c.name, period: c.period, goal: c.goal, brief: c.brief ?? "", cover: items.find(i => i.cover)?.cover ?? "", version, publishedAt: new Date().toISOString(), items };
}

/** Content changed since the last publish (new, edited or removed). */
export function pendingChanges(c: CampaignData, row: ReviewRow | null) {
  if (!row) return 0;
  const now = snapshotOf(c, 0).items, old = new Map(row.snapshot.items.map(i => [i.day, i.rev]));
  return now.filter(i => old.get(i.day) !== i.rev).length + row.snapshot.items.filter(i => !now.some(n => n.day === i.day)).length;
}

export function useReviewLink(campaignId: string | undefined) {
  const [row, setRow] = useState<ReviewRow | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const ws = readCloud().workspaceId;
  const load = useCallback(async () => {
    if (!campaignId || !ws) { setRow(null); setState("ready"); return; }
    const { data, error } = await supabase.from("review_links").select("token, snapshot, feedback, revoked, updated_at").eq("workspace_id", ws).eq("campaign_id", campaignId).maybeSingle();
    if (error) { setState("error"); return; }
    setRow((data as ReviewRow | null) ?? null); setState("ready");
  }, [campaignId, ws]);
  useEffect(() => { setState("loading"); load(); const onFocus = () => { if (document.visibilityState === "visible") load(); }; document.addEventListener("visibilitychange", onFocus); return () => document.removeEventListener("visibilitychange", onFocus); }, [load]);
  const run = async (fn: () => Promise<{ error: { message: string } | null }>, ok: string) => {
    setBusy(true);
    try { const { error } = await fn(); if (error) throw new Error(error.message); await load(); notify(ok); return true; }
    catch (e) { notify(`Gagal: ${e instanceof Error ? e.message : String(e)}`); return false; }
    finally { setBusy(false); }
  };
  const publish = (c: CampaignData) => {
    if (!ws) return Promise.resolve(false);
    if (row) return run(async () => await supabase.from("review_links").update({ snapshot: snapshotOf(c, row.snapshot.version + 1), revoked: false, updated_at: new Date().toISOString() }).eq("token", row.token), "Portal klien diperbarui.");
    // a slug collision is near impossible; retry once with a new tail if it happens
    return run(async () => { let r = await supabase.from("review_links").insert({ token: newToken(c), workspace_id: ws, campaign_id: c.id, snapshot: snapshotOf(c, 1) }); if (r.error?.code === "23505") r = await supabase.from("review_links").insert({ token: newToken(c), workspace_id: ws, campaign_id: c.id, snapshot: snapshotOf(c, 1) }); return r; }, "Link review dibuat.");
  };
  const setRevoked = (revoked: boolean) => row ? run(async () => await supabase.from("review_links").update({ revoked, updated_at: new Date().toISOString() }).eq("token", row.token), revoked ? "Link dinonaktifkan. Klien tidak bisa membukanya lagi." : "Link aktif lagi.") : Promise.resolve(false);
  const reply = (day: number, text: string) => row ? run(async () => await supabase.rpc("review_team_reply", { p_token: row.token, p_day: day, p_name: readCloud().workspaces.find(w => w.id === ws)?.name ?? "FORIOR", p_text: text }), "Balasan terkirim.") : Promise.resolve(false);
  /** Swap an older random link for a readable one; feedback stays. The old link stops working. */
  const tidy = (c: CampaignData) => row ? run(async () => await supabase.from("review_links").update({ token: newToken(c), updated_at: new Date().toISOString() }).eq("token", row.token), "Link diganti ke alamat yang rapi.") : Promise.resolve(false);
  return { row, state, busy, load, publish, setRevoked, reply, tidy };
}

const copy = (text: string, ok: string) => navigator.clipboard?.writeText(text).then(() => notify(ok), () => notify("Browser menolak menyalin. Salin manual."));
const when = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Batch side panel block: create / update / disable the client link and see approval progress. */
export function ReviewPanel({ campaign, review }: { campaign: CampaignData; review: ReturnType<typeof useReviewLink> }) {
  const { row, state, busy, publish, setRevoked, load, tidy } = review;
  const changes = pendingChanges(campaign, row);
  const p = row ? progress(row.snapshot, row.feedback) : null;
  const general = row?.feedback["0"]?.comments ?? [];
  if (state === "loading") return <div className="rv-panel"><h4><Link2 size={16} /> Client review</h4><p className="cx-hint"><Loader2 size={14} className="lg-spin" /> Memuat…</p></div>;
  if (state === "error") return <div className="rv-panel"><h4><Link2 size={16} /> Client review</h4><p className="cx-hint">Belum bisa memuat status review. <button className="cx-link" onClick={load}>Coba lagi</button></p></div>;
  if (!row) return <div className="rv-panel"><h4><Link2 size={16} /> Client review</h4><p className="cx-hint">Bagikan satu link privat. Klien bisa approve, minta revisi, dan komentar per konten tanpa perlu akun.</p><button className="primary-button cx-wide" disabled={busy || !campaign.items.some(x => !x.untitled)} onClick={() => publish(campaign)}><Link2 size={15} /> Buat link review</button></div>;
  return <div className="rv-panel">
    <h4><Link2 size={16} /> Client review {row.revoked ? <em className="cx-badge off">Nonaktif</em> : <em className="cx-badge">v{row.snapshot.version}</em>}<button className="cx-link" onClick={load} aria-label="Muat ulang status review"><RefreshCw size={13} /></button></h4>
    {p && <><div className="rv-progress"><b>{Math.round((p.approved / Math.max(1, p.total)) * 100)}%</b><span>{p.approved}/{p.total} disetujui{p.revision ? ` · ${p.revision} revisi` : ""}</span></div><i className="cx-bar-mini rv-bar"><em style={{ width: `${(p.approved / Math.max(1, p.total)) * 100}%` }} /></i></>}
    {general.length > 0 && <div className="rv-general"><MessageSquare size={14} /><span><b>{general.at(-1)!.by}:</b> {general.at(-1)!.text}</span></div>}
    {!row.revoked && <code className="rv-link">{reviewLink(row.token).replace(/^https?:\/\//, "")}</code>}
    {!row.revoked && !row.token.includes("-") && <button className="cx-link rv-tidy" disabled={busy} onClick={() => { if (window.confirm("Ganti ke link yang rapi? Link lama tidak bisa dibuka lagi, jadi kirim link baru ke klien.")) tidy(campaign); }}>Rapikan alamat link</button>}
    {changes > 0 && !row.revoked && <p className="rv-changes">{changes} konten berubah sejak dibagikan. Perbarui agar klien melihat versi terbaru. Konten yang berubah perlu disetujui ulang.</p>}
    <div className="cx-batch-actions">
      {row.revoked ? <button className="primary-button" disabled={busy} onClick={() => setRevoked(false)}><Check size={14} /> Aktifkan lagi</button> : <>
        <button className="outline-button" onClick={() => copy(reviewLink(row.token), "Link review disalin.")}><Copy size={14} /> Salin link</button>
        <a className="outline-button" href={reviewLink(row.token)} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Buka</a>
        <button className={changes ? "primary-button" : "outline-button"} disabled={busy} onClick={() => publish(campaign)}><RefreshCw size={14} /> Perbarui{changes ? ` (${changes})` : ""}</button>
      </>}
    </div>
    <p className="cx-hint">Terakhir dibagikan {when(row.snapshot.publishedAt)}.{!row.revoked && <> <button className="cx-link" onClick={() => { if (window.confirm("Nonaktifkan link? Klien tidak bisa membukanya lagi; feedback tetap tersimpan.")) setRevoked(true); }}><ShieldOff size={12} /> Nonaktifkan</button></>}</p>
  </div>;
}

/** Client decision for one content item, as stored in the published snapshot. */
export function clientStatusOf(row: ReviewRow | null, day: number): ClientStatus | null {
  const item = row?.snapshot.items.find(i => i.day === day);
  return item ? statusOf(item, row!.feedback[String(day)]) : null;
}

/** Content detail card: the client's decision, comments (per scene too), and a reply box. */
export function ClientFeedback({ day, review, boardLabels, extra }: { day: number; review: ReturnType<typeof useReviewLink>; boardLabels: string[]; extra?: React.ReactNode }) {
  const [text, setText] = useState("");
  const { row, busy, reply } = review;
  const status = clientStatusOf(row, day);
  if (!row || !status) return null;
  const fb = row.feedback[String(day)];
  const comments = fb?.comments ?? [];
  return <section className="panel cx-card rv-feedback">
    <div className="cx-card-head"><h3><MessageSquare size={18} /> Feedback klien</h3><em className={`rv-status rv-${status}`}>{CLIENT_LABEL[status]}</em></div>
    {fb?.status && fb.by && <p className="cx-hint">{fb.status === "approved" ? "Disetujui" : "Revisi diminta"} oleh {fb.by} · {when(fb.at!)}{status === "review" ? " (versi lama; perubahan perlu disetujui ulang)" : ""}</p>}
    {extra}
    {comments.length ? <ul className="rv-comments">{comments.map(c => <li key={c.id} className={c.team ? "team" : ""}><b>{c.by}{c.scene !== undefined && <small> · {boardLabels[c.scene] ?? `Scene ${c.scene + 1}`}</small>}</b><p>{c.text}</p><small>{when(c.at)}</small></li>)}</ul> : <p className="x-empty">Belum ada komentar.</p>}
    <div className="rv-reply"><textarea rows={2} value={text} maxLength={1000} onChange={e => setText(e.target.value)} placeholder="Balas klien…" aria-label="Balas klien" /><button className="primary-button" disabled={busy || !text.trim()} onClick={async () => { if (await reply(day, text)) setText(""); }}><Send size={14} /></button></div>
  </section>;
}
