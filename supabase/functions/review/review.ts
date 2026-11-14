// Client Review Portal rules, shared by the edge function (server) and the app (owner side). Pure, so it is unit-tested.
// The owner publishes a snapshot of one batch; the client approves, asks for revision, or comments per content.
// A decision belongs to the revision (`rev`) it was made on: when the owner publishes changed content, that
// content goes back to "review" so a change after approval always needs approval again.

export type ReviewScene = { label: string; sec?: number; visual: string; text: string; audio: string; note?: string; image?: string };
export type ReviewItem = { day: number; title: string; format: "Reels" | "Carousel" | "Feed"; publishDate: string; cover: string; goal: string; caption: string; hashtags: string; cta: string; concept: string; board: ReviewScene[]; rev: string };
export type ReviewSnapshot = { account: string; batch: string; period: string; goal: string; brief: string; cover: string; version: number; publishedAt: string; items: ReviewItem[] };
export type ReviewComment = { id: string; by: string; text: string; at: string; scene?: number; team?: boolean };
export type ItemFeedback = { status?: "approved" | "revision"; rev?: string; at?: string; by?: string; comments: ReviewComment[] };
/** Keyed by content day; "0" holds general notes for the whole batch. */
export type Feedback = Record<string, ItemFeedback>;
export type ClientStatus = "approved" | "revision" | "review";
export type ReviewAction =
  | { action: "approve"; day: number; name: string }
  | { action: "approve-all"; name: string }
  | { action: "revision"; day: number; name: string; text: string }
  | { action: "comment"; day: number; name: string; text: string; scene?: number };

export class ReviewError extends Error { code: string; constructor(code: string, message: string) { super(message); this.code = code; } }

const MAX_TEXT = 1000, MAX_COMMENTS = 200;

/** Short stable hash of what the client reviews; changes when the owner edits that content. */
export function revOf(x: Omit<ReviewItem, "rev">): string {
  const s = JSON.stringify([x.title, x.format, x.caption, x.hashtags, x.cta, x.concept, x.cover, x.board]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

export function statusOf(item: ReviewItem, fb?: ItemFeedback): ClientStatus {
  return fb?.status && fb.rev === item.rev ? fb.status : "review";
}

export function progress(s: ReviewSnapshot, fb: Feedback) {
  const st = s.items.map(i => statusOf(i, fb[String(i.day)]));
  return { total: st.length, approved: st.filter(x => x === "approved").length, revision: st.filter(x => x === "revision").length, review: st.filter(x => x === "review").length };
}

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+\n/g, "\n").trim().slice(0, max);

/** Apply one client action. Throws ReviewError on bad input; never mutates `fb`. */
export function applyReview(s: ReviewSnapshot, fb: Feedback, a: ReviewAction, id: () => string, now = new Date()): Feedback {
  const by = clean(a.name, 60);
  if (!by) throw new ReviewError("input", "Isi nama Anda dulu.");
  const at = now.toISOString();
  const next: Feedback = { ...fb };
  const itemOf = (day: number) => { const it = s.items.find(i => i.day === Number(day)); if (!it) throw new ReviewError("input", "Konten tidak ditemukan."); return it; };
  const slot = (day: number): ItemFeedback => { const cur = next[String(day)]; return cur ? { ...cur, comments: [...cur.comments] } : { comments: [] }; };
  if (a.action === "approve-all") {
    for (const it of s.items) if (statusOf(it, fb[String(it.day)]) !== "approved") next[String(it.day)] = { ...slot(it.day), status: "approved", rev: it.rev, at, by };
    return next;
  }
  if (a.action === "approve") { const it = itemOf(a.day); next[String(it.day)] = { ...slot(it.day), status: "approved", rev: it.rev, at, by }; return next; }
  const text = clean(a.text, MAX_TEXT);
  if (!text) throw new ReviewError("input", a.action === "revision" ? "Tulis catatan revisinya." : "Komentar masih kosong.");
  const day = Number(a.day) === 0 ? 0 : itemOf(a.day).day;
  const cur = slot(day);
  if (cur.comments.length >= MAX_COMMENTS) throw new ReviewError("input", "Komentar untuk konten ini sudah terlalu banyak.");
  const scene = a.action === "comment" && Number.isInteger(a.scene) && day ? a.scene : undefined;
  if (scene !== undefined && (scene! < 0 || scene! >= itemOf(day).board.length)) throw new ReviewError("input", "Scene tidak ditemukan.");
  const comment: ReviewComment = { id: id(), by, text, at, ...(scene !== undefined ? { scene } : {}) };
  next[String(day)] = { ...cur, comments: [...cur.comments, comment], ...(a.action === "revision" ? { status: "revision" as const, rev: itemOf(day).rev, at, by } : {}) };
  return next;
}

/** Reply from the team (owner side, signed in). */
export function teamReply(fb: Feedback, day: number, name: string, text: string, id: string, now = new Date()): Feedback {
  const t = clean(text, MAX_TEXT);
  if (!t) throw new ReviewError("input", "Balasan masih kosong.");
  const cur = fb[String(day)] ?? { comments: [] };
  return { ...fb, [String(day)]: { ...cur, comments: [...cur.comments, { id, by: clean(name, 60) || "FORIOR", text: t, at: now.toISOString(), team: true }] } };
}

export const isToken = (t: string) => /^[a-z0-9]{20,40}$/.test(t);
