"use client";

// Supabase: sign-in, syncing the browser store to the database, and the server API that holds the user's keys.
import { createClient, type Session } from "@supabase/supabase-js";
import { onStoreWrite, readStored, writeStored } from "./store";

// Publishable values (safe in the browser); override per deployment with env vars.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ojfezodyjvlzexxqbgak.supabase.co";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_UVGsfzjQRv9mbBPdOOgAnQ_RhQdbL0R";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

export type Cloud = { email: string | null; sync: "off" | "syncing" | "synced" | "error"; error?: string; keys: Record<string, string> };
export const CLOUD_OFF: Cloud = { email: null, sync: "off", keys: {} };
const setCloud = (patch: Partial<Cloud>) => writeStored<Cloud>("cloud", old => ({ ...old, ...patch }), CLOUD_OFF);

/** Keys that are UI-only or derived; never sent to the database. */
const LOCAL_ONLY = new Set(["toast", "cloud"]);
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
const pending = new Map<string, unknown>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  flushTimer = null;
  if (!session || !pending.size) return;
  const rows = [...pending].map(([key, value]) => ({ user_id: session!.user.id, key, value: forCloud(key, value), updated_at: new Date().toISOString() }));
  pending.clear();
  const { error } = await supabase.from("app_state").upsert(rows);
  setCloud(error ? { sync: "error", error: error.message } : { sync: "synced", error: undefined });
}

onStoreWrite((key, value) => {
  if (!session || applyingRemote || LOCAL_ONLY.has(key)) return;
  pending.set(key, value);
  if (!flushTimer) flushTimer = setTimeout(flush, 800);
});

/** Server wins for keys it has; anything only in this browser is uploaded (first sign-in on this device). */
async function pull() {
  setCloud({ sync: "syncing" });
  const { data, error } = await supabase.from("app_state").select("key, value");
  if (error) return setCloud({ sync: "error", error: error.message });
  const remote = new Map(data.map(r => [r.key as string, r.value]));
  applyingRemote = true;
  try {
    for (const [key, value] of remote) {
      if (key === "settings") writeStored(key, (old: Record<string, unknown>) => ({ ...old, ...(value as object) }), {});
      else writeStored(key, value, value);
    }
  } finally { applyingRemote = false; }
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const full = window.localStorage.key(i) ?? "";
      if (!full.startsWith("forior-os:")) continue;
      const key = full.slice("forior-os:".length);
      if (!remote.has(key) && !LOCAL_ONLY.has(key)) pending.set(key, readStored(key, null));
    }
  } catch { /* storage blocked: nothing local to upload */ }
  await flush();
  setCloud({ sync: "synced" });
  refreshKeyStatus();
}

let started = false;
/** Call once at the app root. */
export function startCloud() {
  if (started) return;
  started = true;
  supabase.auth.getSession().then(({ data }) => onSession(data.session));
  supabase.auth.onAuthStateChange((_event, next) => { if (next?.access_token !== session?.access_token) onSession(next); });
}

function onSession(next: Session | null) {
  const wasSignedOut = !session;
  session = next;
  if (!next) { setCloud({ ...CLOUD_OFF }); return; }
  setCloud({ email: next.user.email ?? null });
  if (wasSignedOut) pull();
}

export const isSignedIn = () => !!session;
export const readCloudKeys = () => readStored<Cloud>("cloud", CLOUD_OFF).keys;
/** True when AI can run: a key saved on the server for this user, or one kept in this browser. */
export const aiReady = (cloud: Cloud, localKey: string) => (!!cloud.email && !!cloud.keys.anthropic) || !!localKey.trim();

export async function signInWithEmail(email: string) {
  const redirect = window.location.origin + window.location.pathname;
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
  if (error) throw new Error(error.message);
}

/** Password sign-in needs no redirect URL, so it works even before the Auth URL settings are changed. */
export async function signInWithPassword(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(/invalid login/i.test(error.message) ? "Email atau kata sandi salah, atau email belum dikonfirmasi." : /not confirmed/i.test(error.message) ? "Email belum dikonfirmasi. Klik link di email konfirmasi dulu." : error.message);
}

/** Returns true when the account still needs its email confirmed. */
export async function signUpWithPassword(email: string, password: string): Promise<boolean> {
  const redirect = window.location.origin + window.location.pathname;
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirect } });
  if (error) throw new Error(error.message);
  return !data.session;
}

export async function signOut() {
  await flush();
  await supabase.auth.signOut();
}

export class ServerSetupError extends Error {}

/** Calls the creator-api Edge Function as the signed-in user. */
export async function callServer<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!session) throw new ServerSetupError("Belum masuk. Buka Settings → Akun.");
  const { data, error } = await supabase.functions.invoke("creator-api", { body: { action, ...payload } });
  if (error) {
    let detail: { code?: string; error?: string } = {};
    try { detail = await (error as { context?: Response }).context?.json(); } catch { /* not JSON */ }
    if (detail.code === "no_key" || detail.code === "bad_key" || detail.code === "auth") throw new ServerSetupError(detail.error ?? error.message);
    throw new Error(detail.error ?? error.message);
  }
  return data as T;
}

export async function refreshKeyStatus() {
  try { const { saved } = await callServer<{ saved: Record<string, string> }>("secrets.status"); setCloud({ keys: saved }); } catch { /* function not deployed yet or offline */ }
}

export async function saveSecret(name: "anthropic" | "google" | "meta_token" | "ig_user_id", value: string) {
  await callServer("secrets.set", { name, value });
  await refreshKeyStatus();
}
