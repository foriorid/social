"use client";

// Supabase: sign-in (invite only), workspaces, syncing the browser store to the database per workspace,
// and the server API that holds the shared API keys.
import { createClient, type Session } from "@supabase/supabase-js";
import { clearWorkspaceCache, isGlobalKey, localKeysOf, onStoreWrite, readStored, setStoreSpace, storeSpace, writeStored } from "./store";

// Publishable values (safe in the browser); override per deployment with env vars.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ojfezodyjvlzexxqbgak.supabase.co";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_UVGsfzjQRv9mbBPdOOgAnQ_RhQdbL0R";

// Invite and password-reset links land here with "#…type=invite|recovery". Read it before the client
// consumes the hash, so the app can ask for a new password before anything else.
const LINK_TYPE = typeof window === "undefined" ? null : new URLSearchParams(window.location.hash.slice(1)).get("type");

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

export type Role = "owner" | "admin" | "editor";
export type Workspace = { id: string; slug: string; name: string; kind: "personal" | "business"; role: Role };
export type Cloud = {
  /** False until the session (and, when signed in, the workspaces) are known. Nothing is shown before that. */
  ready: boolean;
  email: string | null;
  workspaces: Workspace[];
  workspaceId: string | null;
  /** Arrived from an invite or reset link: the user must choose a password first. */
  mustSetPassword: boolean;
  sync: "off" | "syncing" | "synced" | "error";
  error?: string;
  keys: Record<string, string>;
};
export const CLOUD_OFF: Cloud = { ready: false, email: null, workspaces: [], workspaceId: null, mustSetPassword: false, sync: "off", keys: {} };
const setCloud = (patch: Partial<Cloud>) => writeStored<Cloud>("cloud", old => ({ ...CLOUD_OFF, ...old, ...patch }), CLOUD_OFF);
export const readCloud = () => ({ ...CLOUD_OFF, ...readStored<Cloud>("cloud", CLOUD_OFF) });
export const activeWorkspace = (c: Cloud = readCloud()) => c.workspaces.find(w => w.id === c.workspaceId) ?? null;

/** Secrets live in Vault via the server API, so they are stripped from the synced settings. */
const SECRET_FIELDS = ["apiKey", "metaToken", "igUserId", "googleApiKey"];
const forCloud = (key: string, value: unknown) => {
  if (key !== "settings" || !value || typeof value !== "object") return value;
  const copy = { ...(value as Record<string, unknown>) };
  SECRET_FIELDS.forEach(f => delete copy[f]);
  return copy;
};

let session: Session | null = null;
let applyingRemote = false;
/** Writes waiting to be sent, keyed by workspace + key so a switch never sends them to the wrong workspace. */
const pending = new Map<string, { ws: string; key: string; value: unknown }>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (!session || !pending.size) return;
  const user = session.user.id;
  const rows = [...pending.values()].map(p => ({ workspace_id: p.ws, key: p.key, value: forCloud(p.key, p.value), user_id: user, updated_at: new Date().toISOString() }));
  pending.clear();
  const { error } = await supabase.from("app_state").upsert(rows, { onConflict: "workspace_id,key" });
  setCloud(error ? { sync: "error", error: error.message } : { sync: "synced", error: undefined });
}

onStoreWrite((key, value) => {
  const ws = storeSpace();
  if (!session || !ws || applyingRemote || isGlobalKey(key)) return;
  pending.set(`${ws}\u0000${key}`, { ws, key, value });
  if (!flushTimer) flushTimer = setTimeout(flush, 800);
});

/** Server wins for keys it has; anything only in this browser is uploaded. */
async function pull(ws: string) {
  setCloud({ sync: "syncing" });
  const { data, error } = await supabase.from("app_state").select("key, value").eq("workspace_id", ws);
  if (ws !== storeSpace()) return; // switched again meanwhile
  if (error) return setCloud({ sync: "error", error: error.message });
  const remote = new Map(data.map(r => [r.key as string, r.value]));
  applyingRemote = true;
  try {
    for (const [key, value] of remote) {
      if (key === "settings") writeStored(key, (old: Record<string, unknown>) => ({ ...old, ...(value as object) }), {});
      else writeStored(key, value, value);
    }
  } finally { applyingRemote = false; }
  for (const key of localKeysOf(ws)) if (!remote.has(key) && !isGlobalKey(key)) pending.set(`${ws}\u0000${key}`, { ws, key, value: readStored(key, null) });
  await flush();
  setCloud({ sync: "synced" });
  refreshKeyStatus();
}

const LAST_WS = "forior-os:workspace";
const lastWorkspace = () => { try { return window.localStorage.getItem(LAST_WS) ?? ""; } catch { return ""; } };

async function loadWorkspaces(user: string): Promise<Workspace[]> {
  const { data, error } = await supabase.from("workspace_members").select("role, workspaces(id, slug, name, kind)").eq("user_id", user);
  if (error) throw new Error(error.message);
  type Row = { role: Role; workspaces: Omit<Workspace, "role"> | Omit<Workspace, "role">[] | null };
  return ((data ?? []) as unknown as Row[]).flatMap(r => { const w = Array.isArray(r.workspaces) ? r.workspaces[0] : r.workspaces; return w ? [{ ...w, role: r.role }] : []; })
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "personal" ? -1 : 1));
}

/** Opens a workspace: switches the browser cache to it and loads its data. */
export async function switchWorkspace(id: string) {
  await flush();
  try { window.localStorage.setItem(LAST_WS, id); } catch { /* storage blocked */ }
  setStoreSpace(id);
  setCloud({ workspaceId: id, keys: {} });
  await pull(id);
}

let started = false;
let loadingFor = "";
/** Call once at the app root. */
export function startCloud() {
  if (started) return;
  started = true;
  // The cached cloud state may be from an earlier visit: nothing counts until the session is checked again.
  setCloud({ ready: false, mustSetPassword: LINK_TYPE === "invite" || LINK_TYPE === "recovery" });
  supabase.auth.getSession().then(({ data }) => onSession(data.session));
  supabase.auth.onAuthStateChange((event, next) => {
    if (event === "PASSWORD_RECOVERY") setCloud({ mustSetPassword: true });
    if (next?.access_token !== session?.access_token) onSession(next);
  });
}

async function onSession(next: Session | null) {
  const before = session?.user.id;
  session = next;
  if (!next) { setStoreSpace(""); setCloud({ ...CLOUD_OFF, ready: true, mustSetPassword: readCloud().mustSetPassword }); return; }
  setCloud({ email: next.user.email ?? null });
  if (before === next.user.id && (readCloud().workspaceId || loadingFor === next.user.id)) return; // token refresh, or already loading
  loadingFor = next.user.id;
  try {
    const workspaces = await loadWorkspaces(next.user.id);
    const pick = workspaces.find(w => w.id === lastWorkspace()) ?? workspaces[0];
    setCloud({ workspaces, ready: true });
    if (pick) await switchWorkspace(pick.id);
    else setCloud({ workspaceId: null });
  } catch (e) {
    setCloud({ ready: true, workspaces: [], workspaceId: null, sync: "error", error: e instanceof Error ? e.message : String(e) });
  } finally { loadingFor = ""; }
}

export const isSignedIn = () => !!session;
export const readCloudKeys = () => readCloud().keys;
/** True when AI can run: a key saved on the server for this workspace, or one kept in this browser. */
export const aiReady = (cloud: Cloud, localKey: string) => (!!cloud.email && !!cloud.keys.anthropic) || !!localKey.trim();

const here = () => window.location.origin + window.location.pathname;

/** Sends a sign-in link. Never creates an account: access is by invitation only. */
export async function signInWithEmail(email: string) {
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: here(), shouldCreateUser: false } });
  if (error) throw new Error(/signups not allowed|not found|otp_disabled/i.test(error.message) ? "Email ini belum diundang ke FORIOR Hub. Minta undangan ke admin." : error.message);
}

export async function signInWithPassword(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(/invalid login/i.test(error.message) ? "Email atau kata sandi salah." : /not confirmed/i.test(error.message) ? "Email belum dikonfirmasi. Buka link di email undangan dulu." : error.message);
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: here() });
  if (error) throw new Error(error.message);
}

export async function setNewPassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(/should be different/i.test(error.message) ? "Kata sandi baru harus berbeda dari yang lama." : error.message);
  setCloud({ mustSetPassword: false });
  try { window.history.replaceState(null, "", window.location.pathname + window.location.search); } catch { /* ignore */ }
}

export async function signOut() {
  await flush();
  await supabase.auth.signOut();
  clearWorkspaceCache();
  setCloud({ ...CLOUD_OFF, ready: true });
}

export class ServerSetupError extends Error {}

/** Calls the creator-api Edge Function as the signed-in user, inside the active workspace. */
export async function callServer<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!session) throw new ServerSetupError("Sesi berakhir. Masuk lagi.");
  const { data, error } = await supabase.functions.invoke("creator-api", { body: { action, workspaceId: storeSpace() || readCloud().workspaceId, ...payload } });
  if (error) {
    let detail: { code?: string; error?: string } = {};
    try { detail = await (error as { context?: Response }).context?.json(); } catch { /* not JSON */ }
    if (detail.code === "no_key" || detail.code === "bad_key" || detail.code === "auth") throw new ServerSetupError(detail.error ?? error.message);
    throw new Error(detail.error ?? error.message);
  }
  return data as T;
}

export async function refreshKeyStatus() {
  try { const { saved } = await callServer<{ saved: Record<string, string> }>("secrets.status"); setCloud({ keys: saved }); } catch { /* offline */ }
}

export async function saveSecret(name: "anthropic" | "google" | "meta_token" | "ig_user_id", value: string) {
  await callServer("secrets.set", { name, value });
  await refreshKeyStatus();
}
