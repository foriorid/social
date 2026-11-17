// Google Calendar helpers shared by the gcal Edge Function and the app. Pure (Web Crypto only), unit-tested.

export const SCOPES = "openid email https://www.googleapis.com/auth/calendar.events";
export const TZ = "Asia/Jakarta";

export type CalEvent = { id: string; accountId: string; email: string; color: string; summary: string; start: string; end: string; allDay: boolean; location: string; link: string };
export type ShootInput = { summary: string; description?: string; location?: string; start: string; hours: number; guests?: string[] };
export const isEmail = (v: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(v) && v.length <= 200;

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))));
}

/** OAuth `state`: who is connecting, where to return, expiry; signed so the callback can trust it. */
export async function signState(p: { ws: string; uid: string; ret: string }, secret: string, now = Date.now()): Promise<string> {
  const body = b64url(new TextEncoder().encode(JSON.stringify({ ...p, exp: now + 10 * 60_000 })));
  return `${body}.${await hmac(secret, body)}`;
}
export async function readState(state: string, secret: string, now = Date.now()): Promise<{ ws: string; uid: string; ret: string } | null> {
  const [body, sig] = state.split(".");
  if (!body || !sig || (await hmac(secret, body)) !== sig) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    if (typeof p.exp !== "number" || p.exp < now || !/^https:\/\/[^\s]+$/.test(p.ret)) return null;
    return { ws: String(p.ws), uid: String(p.uid), ret: String(p.ret) };
  } catch { return null; }
}

/** Workspace named in a state, before checking it (to know which OAuth client signed it). */
export function peekState(state: string): string {
  try { return String(JSON.parse(new TextDecoder().decode(fromB64url(state.split(".")[0] ?? ""))).ws ?? ""); } catch { return ""; }
}

/** Email inside Google's id_token (received straight from Google's token endpoint over TLS). */
export function emailOf(idToken: string): string {
  try { return String(JSON.parse(new TextDecoder().decode(fromB64url(idToken.split(".")[1] ?? ""))).email ?? ""); } catch { return ""; }
}

const pad = (n: number) => String(n).padStart(2, "0");
/** "YYYY-MM-DDTHH:mm" + hours → local end time (no time-zone math; Google gets the zone separately). */
export function addHours(local: string, hours: number): string {
  const [d, t = "10:00"] = local.split("T"), [y, mo, da] = d.split("-").map(Number), [h, mi] = t.split(":").map(Number);
  const x = new Date(Date.UTC(y, mo - 1, da, h, mi) + Math.round(hours * 60) * 60_000);
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}T${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`;
}

/** Google Calendar event body for a shoot. */
export function eventBody(s: ShootInput, tz = TZ) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s.start)) throw new Error("Tanggal/jam shoot tidak valid.");
  const hours = Math.min(24, Math.max(0.5, Number(s.hours) || 2));
  const guests = [...new Set((s.guests ?? []).map(g => g.trim().toLowerCase()).filter(isEmail))].slice(0, 10);
  return {
    ...(guests.length ? { attendees: guests.map(email => ({ email })) } : {}),
    summary: s.summary.slice(0, 200) || "Shoot FORIOR",
    description: (s.description ?? "").slice(0, 4000),
    location: (s.location ?? "").slice(0, 300),
    start: { dateTime: `${s.start}:00`, timeZone: tz },
    end: { dateTime: `${addHours(s.start, hours)}:00`, timeZone: tz },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 24 * 60 }, { method: "popup", minutes: 120 }] }
  };
}

/** Google event → the shape the app shows. All-day events keep their date; timed ones keep the offset time. */
export function fromGoogle(e: Record<string, any>, acct: { id: string; email: string; color: string }): CalEvent | null {
  if (!e?.id || e.status === "cancelled") return null;
  const allDay = !!e.start?.date;
  return { id: String(e.id), accountId: acct.id, email: acct.email, color: acct.color, summary: String(e.summary ?? "(tanpa judul)"), start: String(e.start?.dateTime ?? e.start?.date ?? ""), end: String(e.end?.dateTime ?? e.end?.date ?? ""), allDay, location: String(e.location ?? ""), link: String(e.htmlLink ?? "") };
}

/** Local calendar day (YYYY-MM-DD, Asia/Jakarta) of an event start. */
export function dayOf(start: string, tz = TZ): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) return start;
  const d = new Date(start);
  if (Number.isNaN(d.getTime())) return start.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
