// Server side of FORIOR Hub: keeps the API keys in Vault and makes the calls that need them.
// Every request carries the signed-in user's JWT (verify_jwt is on) and the active workspace; the caller must
// be a member of it. One set of keys is shared: they belong to the workspace owners (today Alvian owns both
// workspaces), while usage and cost are recorded per workspace by the client.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk@1.8.0";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import postgres from "npm:postgres@3.4.9";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (code: string, error: string, status = 400) => json({ code, error }, status);

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
const auth = createClient(Deno.env.get("SUPABASE_URL")!, JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")!).default);
// Admin client for invitations only (creates the invited account and its sign-in link; sends no email).
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default ?? "";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const NAMES = ["anthropic", "google", "meta_token", "ig_user_id"] as const;
const MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RANK: Record<string, number> = { editor: 1, admin: 2, owner: 3 };

/** The workspace's key: the first owner of the workspace who saved one. */
async function secret(ws: string, name: string): Promise<string | null> {
  const [row] = await sql`
    select private.get_secret(m.user_id, ${name}) as v
    from public.workspace_members m
    where m.workspace_id = ${ws}::uuid and m.role = 'owner' and private.get_secret(m.user_id, ${name}) is not null
    order by m.created_at limit 1`;
  return row?.v ?? null;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("method", "Gunakan POST.", 405);
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: who, error: authError } = await auth.auth.getUser(token);
  if (authError || !who.user) return fail("auth", "Sesi login tidak valid. Masuk ulang.", 401);
  const user = who.user.id;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("input", "Body harus JSON."); }
  const ws = String(body.workspaceId ?? "");
  if (!UUID.test(ws)) return fail("input", "Workspace tidak dikenal. Muat ulang halaman.");
  const [member] = await sql`select m.role, w.kind from public.workspace_members m join public.workspaces w on w.id = m.workspace_id where m.workspace_id = ${ws}::uuid and m.user_id = ${user}::uuid`;
  if (!member) return fail("forbidden", "Anda bukan anggota workspace ini.", 403);
  const role = String(member.role), kind = String(member.kind);
  const redirectTo = typeof body.redirectTo === "string" && /^https:\/\/[^\s]+$/.test(body.redirectTo) ? body.redirectTo : undefined;
  /** A fresh sign-in link that lands on "choose a password": invite for new accounts, recovery once confirmed. */
  const inviteLink = async (email: string) => {
    const first = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo } });
    if (!first.error) return { link: first.data.properties.action_link, userId: first.data.user.id };
    const again = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
    if (again.error) throw new Error(again.error.message);
    return { link: again.data.properties.action_link, userId: again.data.user.id };
  };

  try {
    switch (body.action) {
      case "secrets.status": {
        const rows = await sql`
          select s.name, max(s.updated_at) as updated_at
          from public.workspace_members m cross join lateral private.secret_status(m.user_id) s
          where m.workspace_id = ${ws}::uuid and m.role = 'owner'
          group by s.name`;
        return json({ saved: Object.fromEntries(rows.map(r => [r.name, r.updated_at])) });
      }
      case "secrets.set": {
        if (RANK[role] < RANK.owner) return fail("forbidden", "Hanya Owner yang bisa mengubah API key.", 403);
        const name = String(body.name ?? ""), value = typeof body.value === "string" ? body.value.trim() : "";
        if (!NAMES.includes(name as typeof NAMES[number])) return fail("input", "Nama key tidak dikenal.");
        if (value.length > 4000) return fail("input", "Key terlalu panjang.");
        await sql`select private.set_secret(${user}::uuid, ${name}, ${value})`;
        return json({ ok: true });
      }
      case "ai": {
        const key = await secret(ws, "anthropic");
        if (!key) return fail("no_key", "API key Anthropic belum disimpan. Buka Settings → AI & Models.");
        const model = String(body.model ?? "");
        if (!MODELS.includes(model)) return fail("input", `Model "${model}" tidak diizinkan.`);
        const maxTokens = Math.min(Math.max(Number(body.maxTokens) || 1500, 64), 8000); // the client already fits this under the per-call cost cap
        const client = new Anthropic({ apiKey: key });
        // Haiku has no server-side refusal fallback; the other tiers retry on Anthropic's default fallback model.
        const fallback = model.includes("haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };
        try {
          // Hidden reasoning is billed as output; drafting tasks don't need it (Opus can't turn it off).
          const thinking = model.includes("haiku") ? { thinking: { type: "disabled" as const } } : model.includes("sonnet") ? { thinking: { type: "between_tools" as const } } : {};
          const response = await client.beta.messages.create({ ...fallback, ...thinking, model, max_tokens: maxTokens, output_config: { effort: "low" }, system: String(body.system ?? ""), messages: [{ role: "user", content: String(body.prompt ?? "") }] });
          const text = response.content.map(b => (b.type === "text" ? b.text : "")).join("").trim();
          return json({ text, stop_reason: response.stop_reason, model: response.model, usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens } });
        } catch (e) {
          if (e instanceof Anthropic.AuthenticationError) return fail("bad_key", "API key Anthropic ditolak. Periksa di Settings.", 400);
          if (e instanceof Anthropic.RateLimitError) return fail("rate_limit", "Terlalu banyak permintaan ke Anthropic. Tunggu sebentar.", 429);
          if (e instanceof Anthropic.APIError) return fail("upstream", `Anthropic API error ${e.status ?? ""}: ${e.message}`, 502);
          throw e;
        }
      }
      case "drive": {
        const key = await secret(ws, "google");
        if (!key) return fail("no_key", "Google API key belum disimpan. Buka Settings → AI & Models.");
        const folder = String(body.folderId ?? "");
        if (!/^[A-Za-z0-9_-]{10,}$/.test(folder)) return fail("input", "ID folder tidak valid.");
        // Photo galleries can hold hundreds of files, so follow nextPageToken (capped at 5,000).
        const files: unknown[] = [];
        let pageToken = "";
        do {
          const params = new URLSearchParams({ q: `'${folder}' in parents and trashed = false`, fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink)", pageSize: "1000", orderBy: "folder,name", supportsAllDrives: "true", includeItemsFromAllDrives: "true", key });
          if (pageToken) params.set("pageToken", pageToken);
          const r = await fetch("https://www.googleapis.com/drive/v3/files?" + params);
          const data = await r.json().catch(() => ({}));
          if (!r.ok) return fail("upstream", data?.error?.message ? `Google Drive: ${data.error.message}` : `Google Drive error ${r.status}`, 502);
          files.push(...(data.files ?? []));
          pageToken = data.nextPageToken ?? "";
        } while (pageToken && files.length < 5000);
        return json({ files });
      }
      case "workspace.galleries": {
        if (RANK[role] < RANK.admin) return fail("forbidden", "Hanya Owner/Admin yang bisa mengimpor dari Workspace.", 403);
        // Read-only copy of Photo Delivery galleries from the FORIOR Workspace app (app.forior.id).
        // The Workspace password is used once to get a token and is never stored or logged.
        const email = String(body.email ?? "").trim(), password = String(body.password ?? "");
        if (!email || !password || email.length > 200 || password.length > 200) return fail("input", "Isi email dan kata sandi Workspace.");
        const base = "https://app.forior.id/api";
        const login = await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
        const auth = await login.json().catch(() => ({}));
        if (!login.ok || !auth.token) return fail("workspace_auth", auth.error === "Invalid email or password" ? "Email atau kata sandi Workspace salah." : (auth.error ?? `Workspace menolak login (${login.status}).`), 400);
        const r = await fetch(`${base}/galleries`, { headers: { Authorization: `Bearer ${auth.token}` } });
        const list = await r.json().catch(() => null);
        if (!r.ok || !Array.isArray(list)) return fail("upstream", `Gagal membaca galeri Workspace (${r.status}).`, 502);
        return json({ galleries: list });
      }
      case "members.list": {
        const rows = await sql`
          select m.user_id, m.role, m.created_at, u.email, u.last_sign_in_at
          from public.workspace_members m join auth.users u on u.id = m.user_id
          where m.workspace_id = ${ws}::uuid
          order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, m.created_at`;
        return json({ kind, you: role, members: rows.map(r => ({ userId: r.user_id, email: r.email, role: r.role, joinedAt: r.created_at, active: !!r.last_sign_in_at, self: r.user_id === user })) });
      }
      case "members.invite": {
        if (kind !== "business") return fail("forbidden", "Workspace pribadi tidak bisa mengundang anggota.", 403);
        if (RANK[role] < RANK.admin) return fail("forbidden", "Hanya Owner/Admin yang bisa mengundang.", 403);
        const email = String(body.email ?? "").trim().toLowerCase(), newRole = String(body.role ?? "editor");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return fail("input", "Email belum valid.");
        if (!["editor", "admin"].includes(newRole)) return fail("input", "Peran tidak dikenal.");
        if (newRole === "admin" && role !== "owner") return fail("forbidden", "Hanya Owner yang bisa menambah Admin.", 403);
        const [existing] = await sql`select u.id, u.last_sign_in_at, m.role from auth.users u left join public.workspace_members m on m.user_id = u.id and m.workspace_id = ${ws}::uuid where lower(u.email) = ${email}`;
        if (existing?.role) return fail("input", "Email ini sudah menjadi anggota workspace.");
        let userId = existing?.id as string | undefined, link: string | null = null;
        if (!existing || !existing.last_sign_in_at) { const made = await inviteLink(email); userId = made.userId; link = made.link; }
        await sql`insert into public.workspace_members (workspace_id, user_id, role) values (${ws}::uuid, ${userId!}::uuid, ${newRole}) on conflict do nothing`;
        return json({ added: true, link, existingAccount: !!existing?.last_sign_in_at });
      }
      case "members.link":
      case "members.role":
      case "members.remove": {
        if (RANK[role] < RANK.admin) return fail("forbidden", "Hanya Owner/Admin yang bisa mengelola anggota.", 403);
        const target = String(body.userId ?? "");
        if (!UUID.test(target)) return fail("input", "Anggota tidak dikenal.");
        const [t] = await sql`select m.role, u.email, u.last_sign_in_at from public.workspace_members m join auth.users u on u.id = m.user_id where m.workspace_id = ${ws}::uuid and m.user_id = ${target}::uuid`;
        if (!t) return fail("input", "Anggota tidak ditemukan.");
        if (body.action === "members.link") return json({ link: (await inviteLink(String(t.email))).link });
        if (target === user) return fail("forbidden", "Anda tidak bisa mengubah akses Anda sendiri.", 403);
        if (t.role === "owner") return fail("forbidden", "Owner tidak bisa diubah atau dikeluarkan.", 403);
        if (role !== "owner" && t.role !== "editor") return fail("forbidden", "Admin hanya bisa mengelola Editor.", 403);
        if (body.action === "members.remove") { await sql`delete from public.workspace_members where workspace_id = ${ws}::uuid and user_id = ${target}::uuid`; return json({ ok: true }); }
        const newRole = String(body.role ?? "");
        if (!["editor", "admin"].includes(newRole)) return fail("input", "Peran tidak dikenal.");
        if (newRole === "admin" && role !== "owner") return fail("forbidden", "Hanya Owner yang bisa menjadikan Admin.", 403);
        await sql`update public.workspace_members set role = ${newRole} where workspace_id = ${ws}::uuid and user_id = ${target}::uuid`;
        return json({ ok: true });
      }
      case "instagram": {
        const [token, igId] = await Promise.all([secret(ws, "meta_token"), secret(ws, "ig_user_id")]);
        if (!token || !igId) return fail("no_key", "Token Meta belum disimpan.");
        const username = String(body.username ?? "");
        if (!/^[A-Za-z0-9._]{1,30}$/.test(username)) return fail("input", "Username tidak valid.");
        const fields = `business_discovery.username(${username}){followers_count,media.limit(30){caption,like_count,comments_count,media_type,timestamp}}`;
        const r = await fetch(`https://graph.facebook.com/${encodeURIComponent(igId)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`);
        const data = await r.json().catch(() => ({}));
        if (!r.ok || data.error) return fail("upstream", data.error?.message ?? `Meta API error ${r.status}`, 502);
        return json(data.business_discovery ?? {});
      }
      default:
        return fail("input", "Aksi tidak dikenal.");
    }
  } catch (e) {
    console.error(e);
    return fail("server", "Terjadi kesalahan di server. Coba lagi.", 500);
  }
});
