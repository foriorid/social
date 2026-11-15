// Auto DM rules (comment → DM → follow check → link), shared by the ig-webhook Edge Function and the app.
// Pure, so it is unit-tested. The function does the network calls; this file decides what to send.

export type Automation = {
  id: string; name: string; active: boolean;
  keywords: string[]; match_mode: "contains" | "exact"; media_ids: string[]; dm_keywords: boolean;
  public_replies: string[]; opening: string; button_label: string;
  require_follow: boolean; follow_prompt: string; follow_button: string;
  link_message: string; link_label: string; link_url: string;
};

export type WebhookEvent =
  | { kind: "comment"; igId: string; commentId: string; text: string; fromId: string; fromUsername: string; mediaId: string }
  | { kind: "payload"; igId: string; sender: string; payload: string }
  | { kind: "dm"; igId: string; sender: string; text: string };

export type Message = { text: string; quick_replies?: { content_type: "text"; title: string; payload: string }[] } | { attachment: { type: "template"; payload: { template_type: "button"; text: string; buttons: { type: "web_url"; url: string; title: string }[] } } };

export const norm = (v: string) => v.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9#@]+/g, " ").trim();

/** Keyword hit: "contains" = the keyword appears as whole word(s) anywhere; "exact" = the whole comment is the keyword. */
export function hits(a: Pick<Automation, "keywords" | "match_mode">, text: string): boolean {
  const t = norm(text);
  if (!a.keywords.length) return true;
  return a.keywords.map(norm).filter(Boolean).some(k => a.match_mode === "exact" ? t === k : ` ${t} `.includes(` ${k} `));
}

/** First active automation for a comment on this media (empty media list = every post and reel). */
export function matchComment(autos: Automation[], text: string, mediaId: string): Automation | null {
  return autos.find(a => a.active && (!a.media_ids.length || a.media_ids.includes(mediaId)) && (a.keywords.length > 0 || a.media_ids.length > 0) && hits(a, text)) ?? null;
}

/** First active automation that also listens to the keyword in DMs. */
export function matchDm(autos: Automation[], text: string): Automation | null {
  return autos.find(a => a.active && a.dm_keywords && a.keywords.length > 0 && hits(a, text)) ?? null;
}

const PREFIX = "FORIOR_LINK:";
export const payloadFor = (id: string) => PREFIX + id;
export const automationOf = (payload: string) => (payload.startsWith(PREFIX) ? payload.slice(PREFIX.length) : null);
/** Typed replies that mean "send me the link" (fallback when buttons are not shown). */
export const wantsLink = (a: Automation, text: string) => { const t = norm(text); return ["link", "kirim link", "mau", "sudah", "sudah follow", "done", norm(a.button_label), norm(a.follow_button)].filter(Boolean).includes(t); };

const title = (v: string, d: string) => (v.trim() || d).slice(0, 20); // Instagram cuts button titles at 20 chars
const fill = (v: string, name: string) => v.replace(/\{nama\}|\{name\}|\{username\}/gi, name ? `@${name}` : "kak").trim();

export function pickReply(list: string[], rand = Math.random()): string | null {
  const l = list.map(s => s.trim()).filter(Boolean);
  return l.length ? l[Math.floor(rand * l.length) % l.length] : null;
}

export const openingMessage = (a: Automation, username = ""): Message => ({ text: fill(a.opening || "Hai {nama}! Terima kasih sudah komentar. Tekan tombol di bawah untuk dapat link-nya ya.", username), quick_replies: [{ content_type: "text", title: title(a.button_label, "Kirim link"), payload: payloadFor(a.id) }] });
export const followGateMessage = (a: Automation): Message => ({ text: fill(a.follow_prompt || "Sedikit lagi! Follow akun kami dulu ya, lalu tekan tombol di bawah untuk dapat link-nya.", ""), quick_replies: [{ content_type: "text", title: title(a.follow_button, "Sudah follow"), payload: payloadFor(a.id) }] });
export const linkMessage = (a: Automation): Message => ({ attachment: { type: "template", payload: { template_type: "button", text: (a.link_message || "Ini link-nya. Terima kasih sudah follow!").slice(0, 640), buttons: [{ type: "web_url", url: a.link_url, title: title(a.link_label, "Buka link") }] } } });
/** Plain-text versions for accounts where buttons/quick replies are refused. */
export const plain = (m: Message, a: Automation): Message => "text" in m ? { text: `${m.text}\n\nBalas pesan ini dengan kata *LINK*.` } : { text: `${a.link_message || "Ini link-nya:"}\n${a.link_url}` };

export function validate(a: Partial<Automation>): string | null {
  if (!a.name?.trim()) return "Isi nama automation.";
  if (!a.keywords?.length && !a.media_ids?.length) return "Isi minimal satu kata kunci (atau pilih post tertentu).";
  if (!/^https:\/\/\S+$/.test(a.link_url ?? "")) return "Link harus diawali https://";
  if ((a.opening ?? "").length > 900 || (a.link_message ?? "").length > 640) return "Pesan terlalu panjang.";
  return null;
}

/** Reads Meta's webhook body (object "instagram") into the events Auto DM cares about. Echoes are skipped. */
export function parseWebhook(body: unknown): WebhookEvent[] {
  const out: WebhookEvent[] = [];
  const b = (body ?? {}) as { object?: string; entry?: Record<string, unknown>[] };
  if (b.object !== "instagram" || !Array.isArray(b.entry)) return out;
  for (const e of b.entry) {
    const igId = String(e.id ?? "");
    for (const c of (Array.isArray(e.changes) ? e.changes : []) as { field?: string; value?: Record<string, unknown> }[]) {
      const v = c.value ?? {};
      if (c.field !== "comments" || !v.id) continue;
      const from = (v.from ?? {}) as { id?: string; username?: string }, media = (v.media ?? {}) as { id?: string };
      out.push({ kind: "comment", igId, commentId: String(v.id), text: String(v.text ?? ""), fromId: String(from.id ?? ""), fromUsername: String(from.username ?? ""), mediaId: String(media.id ?? "") });
    }
    for (const m of (Array.isArray(e.messaging) ? e.messaging : []) as Record<string, any>[]) {
      const sender = String(m.sender?.id ?? "");
      if (!sender || sender === igId || m.message?.is_echo) continue;
      const payload = m.postback?.payload ?? m.message?.quick_reply?.payload;
      if (payload) out.push({ kind: "payload", igId, sender, payload: String(payload) });
      else if (typeof m.message?.text === "string") out.push({ kind: "dm", igId, sender, text: m.message.text });
    }
  }
  return out;
}

/** Hex HMAC-SHA256 check of Meta's X-Hub-Signature-256 header, constant-time compare. */
export async function signatureOk(raw: string, header: string | null, appSecret: string): Promise<boolean> {
  if (!header?.startsWith("sha256=") || !appSecret) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const hex = [...mac].map(x => x.toString(16).padStart(2, "0")).join(""), got = header.slice(7);
  if (got.length !== hex.length) return false;
  let diff = 0; for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}
