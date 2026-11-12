// Server side of FORIOR Creator OS: keeps the user's API keys in Vault and makes the calls that need them.
// Every request carries the signed-in user's JWT (verify_jwt is on); keys are looked up per user.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk@1.8.0";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import postgres from "npm:postgres@3.4.9";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (code: string, error: string, status = 400) => json({ code, error }, status);

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
const auth = createClient(Deno.env.get("SUPABASE_URL")!, JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")!).default);
const NAMES = ["anthropic", "google", "meta_token", "ig_user_id"] as const;
const MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"];

async function secret(user: string, name: string): Promise<string | null> {
  const [row] = await sql`select private.get_secret(${user}::uuid, ${name}) as v`;
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

  try {
    switch (body.action) {
      case "secrets.status": {
        const rows = await sql`select name, updated_at from private.secret_status(${user}::uuid)`;
        return json({ saved: Object.fromEntries(rows.map(r => [r.name, r.updated_at])) });
      }
      case "secrets.set": {
        const name = String(body.name ?? ""), value = typeof body.value === "string" ? body.value.trim() : "";
        if (!NAMES.includes(name as typeof NAMES[number])) return fail("input", "Nama key tidak dikenal.");
        if (value.length > 4000) return fail("input", "Key terlalu panjang.");
        await sql`select private.set_secret(${user}::uuid, ${name}, ${value})`;
        return json({ ok: true });
      }
      case "ai": {
        const key = await secret(user, "anthropic");
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
        const key = await secret(user, "google");
        if (!key) return fail("no_key", "Google API key belum disimpan. Buka Settings → AI & Models.");
        const folder = String(body.folderId ?? "");
        if (!/^[A-Za-z0-9_-]{10,}$/.test(folder)) return fail("input", "ID folder tidak valid.");
        const params = new URLSearchParams({ q: `'${folder}' in parents and trashed = false`, fields: "files(id,name,mimeType,size,modifiedTime,webViewLink)", pageSize: "200", orderBy: "folder,name", supportsAllDrives: "true", includeItemsFromAllDrives: "true", key });
        const r = await fetch("https://www.googleapis.com/drive/v3/files?" + params);
        const data = await r.json().catch(() => ({}));
        if (!r.ok) return fail("upstream", data?.error?.message ? `Google Drive: ${data.error.message}` : `Google Drive error ${r.status}`, 502);
        return json({ files: data.files ?? [] });
      }
      case "instagram": {
        const [token, igId] = await Promise.all([secret(user, "meta_token"), secret(user, "ig_user_id")]);
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
