// Google Calendar for Jadwal Shoot. verify_jwt is off only because Google's OAuth redirect (GET) carries no JWT;
// every POST checks the signed-in user's JWT and workspace membership itself, like creator-api.
// Several Google accounts per workspace; each refresh token is kept in Vault.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import postgres from "npm:postgres@3.4.9";
import { SCOPES, emailOf, eventBody, fromGoogle, peekState, readState, signState, type CalEvent } from "./gcal.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (code: string, error: string, status = 400) => json({ code, error }, status);
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });
const auth = createClient(Deno.env.get("SUPABASE_URL")!, JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")!).default);
const SELF = `${Deno.env.get("SUPABASE_URL")}/functions/v1/gcal`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLORS = ["#16a36a", "#2563eb", "#d97706", "#db2777", "#0891b2", "#7c3aed"];
const RANK: Record<string, number> = { editor: 1, admin: 2, owner: 3 };
/** Only send people back to our own app (no open redirect). */
const okReturn = (u: string) => { try { const x = new URL(u); return x.protocol === "https:" && (x.hostname.endsWith("forior.id") || x.hostname.endsWith(".vercel.app") || x.hostname.endsWith(".github.io")); } catch { return false; } };

async function secret(ws: string, name: string): Promise<string | null> {
  const [row] = await sql`
    select private.get_secret(m.user_id, ${name}) as v from public.workspace_members m
    where m.workspace_id = ${ws}::uuid and m.role = 'owner' and private.get_secret(m.user_id, ${name}) is not null
    order by m.created_at limit 1`;
  return row?.v ?? null;
}
async function client(ws: string) {
  const [id, sec] = await Promise.all([secret(ws, "google_client_id"), secret(ws, "google_client_secret")]);
  if (!id || !sec) throw Object.assign(new Error("OAuth Client ID / Secret Google belum disimpan. Buka Settings → AI & Models."), { code: "no_key" });
  return { id, sec };
}
async function accessToken(ws: string, secretId: string): Promise<string> {
  const { id, sec } = await client(ws);
  const [row] = await sql`select decrypted_secret as v from vault.decrypted_secrets where id = ${secretId}::uuid`;
  if (!row?.v) throw new Error("Token akun Google hilang. Hubungkan ulang akun ini.");
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: id, client_secret: sec, refresh_token: row.v, grant_type: "refresh_token" }) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) throw Object.assign(new Error(data.error === "invalid_grant" ? "Izin akun Google kedaluwarsa atau dicabut. Hubungkan ulang akun ini." : `Google menolak token (${data.error ?? r.status}).`), { code: "reauth" });
  return data.access_token;
}
async function cal(token: string, path: string, init: { method?: string; body?: unknown; query?: Record<string, string> } = {}) {
  const url = `https://www.googleapis.com/calendar/v3/${path}${init.query ? "?" + new URLSearchParams(init.query) : ""}`;
  const r = await fetch(url, { method: init.method ?? "GET", headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) }, body: init.body ? JSON.stringify(init.body) : undefined });
  if (r.status === 204) return {};
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Google Calendar: ${data.error?.message ?? r.status}`);
  return data;
}

async function callback(url: URL): Promise<Response> {
  const back = (ret: string, q: Record<string, string>) => new Response(null, { status: 302, headers: { Location: `${ret}${ret.includes("?") ? "&" : "?"}${new URLSearchParams(q)}` } });
  const raw = url.searchParams.get("state") ?? "";
  const wsGuess = peekState(raw);
  if (!UUID.test(wsGuess)) return new Response("Permintaan tidak valid.", { status: 400 });
  const { id, sec } = await client(wsGuess);
  const st = await readState(raw, sec);
  if (!st || !okReturn(st.ret)) return new Response("Link kedaluwarsa. Ulangi dari Jadwal Shoot.", { status: 400 });
  if (url.searchParams.get("error")) return back(st.ret, { gcal: "cancel" });
  const [member] = await sql`select role from public.workspace_members where workspace_id = ${st.ws}::uuid and user_id = ${st.uid}::uuid`;
  if (!member) return back(st.ret, { gcal: "error", msg: "Bukan anggota workspace." });
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code: url.searchParams.get("code") ?? "", client_id: id, client_secret: sec, redirect_uri: SELF, grant_type: "authorization_code" }) });
  const tok = await r.json().catch(() => ({}));
  const email = emailOf(tok.id_token ?? "");
  if (!r.ok || !email) return back(st.ret, { gcal: "error", msg: `Google menolak (${tok.error ?? r.status}).` });
  const [existing] = await sql`select id, secret_id from public.gcal_accounts where workspace_id = ${st.ws}::uuid and email = ${email}`;
  if (!tok.refresh_token && !existing) return back(st.ret, { gcal: "error", msg: "Google tidak memberi izin offline. Cabut akses aplikasi di akun Google lalu hubungkan ulang." });
  if (existing) { if (tok.refresh_token) await sql`select vault.update_secret(${existing.secret_id}::uuid, ${tok.refresh_token})`; }
  else {
    const [{ count }] = await sql`select count(*)::int as count from public.gcal_accounts where workspace_id = ${st.ws}::uuid`;
    const [{ sid }] = await sql`select vault.create_secret(${tok.refresh_token}, ${`gcal:${st.ws}:${email}:${crypto.randomUUID()}`}) as sid`;
    await sql`insert into public.gcal_accounts (workspace_id, email, color, is_default, secret_id) values (${st.ws}::uuid, ${email}, ${COLORS[count % COLORS.length]}, ${count === 0}, ${sid}::uuid)`;
  }
  return back(st.ret, { gcal: "ok", email });
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  try {
    if (req.method === "GET") return await callback(url);
    if (req.method !== "POST") return fail("method", "Gunakan POST.", 405);
    const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const { data: who, error: authError } = await auth.auth.getUser(jwt);
    if (authError || !who.user) return fail("auth", "Sesi login tidak valid. Masuk ulang.", 401);
    let body: Record<string, any>;
    try { body = await req.json(); } catch { return fail("input", "Body harus JSON."); }
    const ws = String(body.workspaceId ?? "");
    if (!UUID.test(ws)) return fail("input", "Workspace tidak dikenal.");
    const [member] = await sql`select role from public.workspace_members where workspace_id = ${ws}::uuid and user_id = ${who.user.id}::uuid`;
    if (!member) return fail("forbidden", "Anda bukan anggota workspace ini.", 403);
    const account = async () => { const id = String(body.accountId ?? ""); if (!UUID.test(id)) throw new Error("Akun Google tidak dikenal."); const [a] = await sql`select id, email, calendar_id, color, secret_id from public.gcal_accounts where id = ${id}::uuid and workspace_id = ${ws}::uuid`; if (!a) throw new Error("Akun Google tidak ditemukan."); return a; };

    switch (body.action) {
      case "connect": {
        if (RANK[String(member.role)] < RANK.admin) return fail("forbidden", "Hanya Owner/Admin yang bisa menghubungkan akun Google.", 403);
        const ret = String(body.ret ?? "");
        if (!okReturn(ret)) return fail("input", "Alamat kembali tidak diizinkan.");
        const { id, sec } = await client(ws);
        const state = await signState({ ws, uid: who.user.id, ret }, sec);
        const q = new URLSearchParams({ client_id: id, redirect_uri: SELF, response_type: "code", scope: SCOPES, access_type: "offline", prompt: "consent select_account", include_granted_scopes: "true", state });
        return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${q}`, redirectUri: SELF });
      }
      case "events": {
        const timeMin = String(body.timeMin ?? ""), timeMax = String(body.timeMax ?? "");
        if (Number.isNaN(Date.parse(timeMin)) || Number.isNaN(Date.parse(timeMax))) return fail("input", "Rentang tanggal tidak valid.");
        const accts = await sql`select id, email, calendar_id, color, secret_id from public.gcal_accounts where workspace_id = ${ws}::uuid order by created_at`;
        const events: CalEvent[] = [], errors: { email: string; error: string }[] = [];
        await Promise.all(accts.map(async a => {
          try {
            const token = await accessToken(ws, a.secret_id);
            const data = await cal(token, `calendars/${encodeURIComponent(a.calendar_id)}/events`, { query: { timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "250" } });
            for (const e of data.items ?? []) { const x = fromGoogle(e, { id: a.id, email: a.email, color: a.color }); if (x) events.push(x); }
          } catch (e) { errors.push({ email: a.email, error: e instanceof Error ? e.message : String(e) }); }
        }));
        return json({ events, errors });
      }
      case "upsert": {
        const a = await account(), token = await accessToken(ws, a.secret_id);
        const ev = eventBody({ summary: String(body.summary ?? ""), description: String(body.description ?? ""), location: String(body.location ?? ""), start: String(body.start ?? ""), hours: Number(body.hours) });
        const eventId = typeof body.eventId === "string" && /^[A-Za-z0-9_-]{5,1024}$/.test(body.eventId) ? body.eventId : "";
        const path = `calendars/${encodeURIComponent(a.calendar_id)}/events${eventId ? `/${eventId}` : ""}`;
        const data = await cal(token, path, { method: eventId ? "PATCH" : "POST", body: ev });
        return json({ eventId: data.id, link: data.htmlLink, accountId: a.id, email: a.email });
      }
      case "delete": {
        const a = await account(), token = await accessToken(ws, a.secret_id);
        const eventId = String(body.eventId ?? "");
        if (!/^[A-Za-z0-9_-]{5,1024}$/.test(eventId)) return fail("input", "Event tidak dikenal.");
        await cal(token, `calendars/${encodeURIComponent(a.calendar_id)}/events/${eventId}`, { method: "DELETE" }).catch(e => { if (!/404|410|deleted/i.test(String(e))) throw e; });
        return json({ ok: true });
      }
      case "disconnect": {
        if (RANK[String(member.role)] < RANK.admin) return fail("forbidden", "Hanya Owner/Admin yang bisa melepas akun Google.", 403);
        const a = await account();
        const [row] = await sql`select decrypted_secret as v from vault.decrypted_secrets where id = ${a.secret_id}::uuid`;
        if (row?.v) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(row.v)}`, { method: "POST" }).catch(() => {});
        await sql`delete from public.gcal_accounts where id = ${a.id}::uuid`;
        await sql`delete from vault.secrets where id = ${a.secret_id}::uuid`;
        const [left] = await sql`select id from public.gcal_accounts where workspace_id = ${ws}::uuid and is_default limit 1`;
        if (!left) await sql`update public.gcal_accounts set is_default = true where id = (select id from public.gcal_accounts where workspace_id = ${ws}::uuid order by created_at limit 1)`;
        return json({ ok: true });
      }
      default: return fail("input", "Aksi tidak dikenal.");
    }
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "no_key" || code === "reauth") return fail(code, (e as Error).message);
    console.error(e);
    return fail("server", e instanceof Error ? e.message : "Terjadi kesalahan di server.", 500);
  }
});
