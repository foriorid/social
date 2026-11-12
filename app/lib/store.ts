"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// Browser-only persistence: GitHub Pages has no backend, so everything lives in localStorage.
const PREFIX = "forior-os:";
const cache = new Map<string, unknown>();
const fallbacks = new Map<string, unknown>();
const listeners = new Set<() => void>();
const writeHooks = new Set<(key: string, value: unknown) => void>();
/** Lets the cloud sync observe every write without the store depending on it. */
export function onStoreWrite(hook: (key: string, value: unknown) => void) { writeHooks.add(hook); }

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function fallbackFor<T>(key: string, initial: T): T {
  if (!fallbacks.has(key)) fallbacks.set(key, initial);
  return fallbacks.get(key) as T;
}

export function readStored<T>(key: string, initial: T): T {
  if (cache.has(key)) return cache.get(key) as T;
  let value = fallbackFor(key, initial);
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw !== null) value = JSON.parse(raw) as T;
  } catch { /* private mode or corrupt entry: keep the default */ }
  cache.set(key, value);
  return value;
}

export function writeStored<T>(key: string, next: T | ((old: T) => T), initial: T) {
  const old = readStored(key, initial);
  const value = typeof next === "function" ? (next as (old: T) => T)(old) : next;
  cache.set(key, value);
  try { window.localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* storage full or blocked: state still works for this session */ }
  listeners.forEach(l => l());
  writeHooks.forEach(h => h(key, value));
}

/** useState that survives reloads and stays in sync across every component using the same key. */
export function useStored<T>(key: string, initial: T): [T, (next: T | ((old: T) => T)) => void] {
  const value = useSyncExternalStore(subscribe, () => readStored(key, initial), () => fallbackFor(key, initial));
  const set = useCallback((next: T | ((old: T) => T)) => writeStored(key, next, initial), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return [value, set];
}

export type Settings = {
  apiKey: string;
  lightModel: string;
  creativeModel: string;
  budgetIdr: number;
  usdToIdr: number;
  metaToken: string;
  igUserId: string;
  brandName: string;
  handle: string;
  brandVoice: string;
  requireApproval: boolean;
  googleApiKey: string;
  autoRun: boolean;
  autoLimit: number;
  costMode: "hemat" | "kualitas";
  maxCallIdr: number;
};

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  lightModel: "claude-haiku-5-5",
  creativeModel: "claude-sonnet-5-5",
  budgetIdr: 300000,
  usdToIdr: 16500,
  metaToken: "",
  igUserId: "",
  brandName: "Alvian Indonesia",
  handle: "@alvian.indonesia",
  brandVoice: "Edukatif, hangat, percaya diri. Tidak menggurui dan tidak berlebihan dalam klaim. Visual premium, minimal, autentik.",
  requireApproval: true,
  googleApiKey: "",
  autoRun: false,
  autoLimit: 10,
  costMode: "hemat",
  maxCallIdr: 50
};

export type CallLog = { at: string; label: string; model: string; input: number; output: number; idr: number };
export const useCallLog = () => useStored<CallLog[]>("usageLog", []);

export type Usage = { month: string; inputTokens: number; outputTokens: number; idr: number; calls: number };
export const EMPTY_USAGE: Usage = { month: "", inputTokens: 0, outputTokens: 0, idr: 0, calls: 0 };

export type Approval = { id: number; title: string; by: string; type: string; body: string; status: "pending" | "approved" | "revision"; at: string };
export type Lead = { id: number; name: string; source: string; message: string; status: "Baru" | "Dibalas" | "Penawaran" | "Deal" | "Batal"; reply: string; at: string };

/** Settings saved by an older version lack newer fields, so always layer them over the defaults. */
export const getSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...readStored<Settings>("settings", DEFAULT_SETTINGS) });
export function useSettings(): [Settings, (next: Settings | ((old: Settings) => Settings)) => void] {
  const [stored, setStored] = useStored<Settings>("settings", DEFAULT_SETTINGS);
  const merged = useMemo(() => ({ ...DEFAULT_SETTINGS, ...stored }), [stored]);
  const set = useCallback((next: Settings | ((old: Settings) => Settings)) => setStored(old => (typeof next === "function" ? next({ ...DEFAULT_SETTINGS, ...old }) : next)), [setStored]);
  return [merged, set];
}

export type Task = { id: number; campaignId: string; day: number; kind: "plan" | "brief" | "production" | "publish"; agent: string; title: string; status: "queued" | "running" | "done" | "failed"; chain: boolean; error?: string; at: string };
export const useTasks = () => useStored<Task[]>("tasks", []);
export const useUsage = () => useStored<Usage>("usage", EMPTY_USAGE);
export const useApprovals = () => useStored<Approval[]>("approvals", []);
export const useIdeas = () => useStored<string[]>("ideas", []);
export const useLeads = () => useStored<Lead[]>("leads", []);

export function addApproval(item: Omit<Approval, "id" | "status" | "at">) {
  writeStored<Approval[]>("approvals", old => [{ ...item, id: Date.now(), status: "pending", at: new Date().toISOString() }, ...old], []);
}

export function addIdea(idea: string) {
  writeStored<string[]>("ideas", old => (old.includes(idea) ? old : [idea, ...old]), []);
}
