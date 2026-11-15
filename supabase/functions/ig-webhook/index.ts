// Instagram webhook for Auto DM. Public (verify_jwt off): Meta calls it. GET answers the subscription check
// with the workspace's verify token; POST must carry a valid X-Hub-Signature-256 made with the Meta app secret.
// Flow: keyword comment → optional public reply → private reply DM with a button → on tap, check follow →
// follow prompt (button re-checks) or the link. Rules and message shapes live in autodm.ts.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.9";
import { automationOf, followGateMessage, linkMessage, matchComment, matchDm, openingMessage, parseWebhook, pickReply, plain, signatureOk, wantsLink, type Automation, type Message, type WebhookEvent } from "./autodm.ts";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });

/** The workspace's key: the first owner of the workspace who saved one (same rule as creator-api). */
async function secret(ws: string, name: string): Promise<string | null> {
  const [row] = await sql`
    select private.get_secret(m.user_id, ${name}) as v from public.workspace_members m
    where m.workspace_id = ${ws}::uuid and m.role = 'owner' and private.get_secret(m.user_id, ${name}) is not null
    order by m.created_at limit 1`;
  return row?.v ?? null;
}

type Ctx = { ws: string; igId: string; token: string; host: string; autos: Automation[] };
const log = (c: Ctx, kind: string, a: Automation | null, user: string, detail = "", comment: string | null = null) =>
  sql`insert into public.dm_events (workspace_id, automation_id, kind, ig_user, comment_id, detail) values (${c.ws}::uuid, ${a?.id ?? null}, ${kind}, ${user}, ${comment}, ${detail.slice(0, 500)})`.catch(e => console.error("log", e));

async function graph(c: Ctx, path: string, init?: { method?: string; body?: unknown }): Promise<{ ok: boolean; data: any }> {
  const url = `${c.host}/${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(c.token)}`;
  const r = await fetch(url, init?.body ? { method: init.method ?? "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(init.body) } : undefined);
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok && !data.error, data };
}
/** Send a DM; if Instagram refuses buttons for this account, send the plain-text version. */
async function send(c: Ctx, recipient: Record<string, string>, m: Message, a: Automation): Promise<string | null> {
  const path = c.host.includes("graph.instagram.com") ? `${c.igId}/messages` : "me/messages";
  let r = await graph(c, path, { body: { recipient, message: m } });
  if (!r.ok) r = await graph(c, path, { body: { recipient, message: plain(m, a) } });
  return r.ok ? null : String(r.data?.error?.message ?? "Gagal mengirim DM");
}
/** true / false from Instagram, or null when it cannot tell (then the link is sent rather than blocking forever). */
async function follows(c: Ctx, igsid: string): Promise<boolean | null> {
  const r = await graph(c, `${encodeURIComponent(igsid)}?fields=is_user_follow_business`);
  return r.ok && typeof r.data.is_user_follow_business === "boolean" ? r.data.is_user_follow_business : null;
}

async function deliverLink(c: Ctx, a: Automation, sender: string) {
  if (a.require_follow) {
    const f = await follows(c, sender);
    if (f === false) { const err = await send(c, { id: sender }, followGateMessage(a), a); await log(c, err ? "error" : "gated", a, sender, err ?? ""); return; }
    if (f === null) await log(c, "error", a, sender, "Status follow tidak terbaca; link tetap dikirim");
  }
  const err = await send(c, { id: sender }, linkMessage(a), a);
  await log(c, err ? "error" : "link_sent", a, sender, err ?? "");
}

async function handle(c: Ctx, e: WebhookEvent) {
  if (e.kind === "comment") {
    if (e.fromId === c.igId) return; // our own replies
    const a = matchComment(c.autos, e.text, e.mediaId);
    if (!a) return;
    const [first] = await sql`insert into public.dm_events (workspace_id, automation_id, kind, ig_user, comment_id, detail) values (${c.ws}::uuid, ${a.id}, 'triggered', ${e.fromId}, ${e.commentId}, ${e.text.slice(0, 300)}) on conflict (comment_id) where kind = 'triggered' do nothing returning id`;
    if (!first) return; // duplicate delivery
    const reply = pickReply(a.public_replies);
    if (reply) { const r = await graph(c, `${encodeURIComponent(e.commentId)}/replies`, { body: { message: reply } }); if (!r.ok) await log(c, "error", a, e.fromId, `Balasan publik: ${r.data?.error?.message ?? "gagal"}`); }
    const err = await send(c, { comment_id: e.commentId }, openingMessage(a, e.fromUsername), a);
    await log(c, err ? "error" : "dm_sent", a, e.fromId, err ?? "");
    return;
  }
  if (e.kind === "payload") {
    const id = automationOf(e.payload), a = c.autos.find(x => x.id === id);
    if (a) await deliverLink(c, a, e.sender);
    return;
  }
  const byKeyword = matchDm(c.autos, e.text);
  if (byKeyword) { const err = await send(c, { id: e.sender }, openingMessage(byKeyword), byKeyword); await log(c, err ? "error" : "dm_sent", byKeyword, e.sender, err ?? ""); return; }
  // Typed "LINK" / "sudah follow": continue the automation this person was last sent (7 days).
  const [last] = await sql`select automation_id from public.dm_events where workspace_id = ${c.ws}::uuid and ig_user = ${e.sender} and kind in ('dm_sent', 'gated') and at > now() - interval '7 days' order by at desc limit 1`;
  const a = c.autos.find(x => x.id === last?.automation_id);
  if (a && wantsLink(a, e.text)) await deliverLink(c, a, e.sender);
}

Deno.serve(async req => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const token = url.searchParams.get("hub.verify_token") ?? "";
    if (url.searchParams.get("hub.mode") === "subscribe" && /^[0-9a-f]{32}$/.test(token)) {
      const [row] = await sql`select 1 from public.ig_accounts where verify_token = ${token}`;
      if (row) return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("method", { status: 405 });
  const raw = await req.text();
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  const events = parseWebhook(body);
  const byAccount = new Map<string, WebhookEvent[]>();
  for (const e of events) byAccount.set(e.igId, [...(byAccount.get(e.igId) ?? []), e]);
  try {
    for (const [igId, list] of byAccount) {
      const [acct] = await sql`select workspace_id from public.ig_accounts where ig_user_id = ${igId}`;
      if (!acct) continue;
      const ws = String(acct.workspace_id);
      const [appSecret, token] = await Promise.all([secret(ws, "meta_app_secret"), secret(ws, "meta_token")]);
      if (!appSecret || !(await signatureOk(raw, req.headers.get("x-hub-signature-256"), appSecret))) return new Response("bad signature", { status: 401 });
      if (!token) continue;
      const autos = (await sql`select * from public.dm_automations where workspace_id = ${ws}::uuid and active order by created_at`) as unknown as Automation[];
      if (!autos.length) continue;
      const c: Ctx = { ws, igId, token, host: token.startsWith("IG") ? "https://graph.instagram.com" : "https://graph.facebook.com", autos };
      for (const e of list) { try { await handle(c, e); } catch (err) { console.error(err); await log(c, "error", null, "", err instanceof Error ? err.message : String(err)); } }
    }
  } catch (err) { console.error(err); }
  return new Response("ok", { status: 200 }); // Meta retries anything else
});
