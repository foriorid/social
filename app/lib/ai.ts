"use client";

import Anthropic from "@anthropic-ai/sdk";
import { costIdr, estimateTokens, fitMaxTokens, monthKey, rupiah, thinkingFor } from "./logic";
import { callServer, isSignedIn, readCloudKeys, ServerSetupError } from "./cloud";
import { EMPTY_USAGE, getSettings, readStored, writeStored, type CallLog, type Usage } from "./store";

export type Tier = "light" | "creative";

export class AiSetupError extends Error {}

function currentUsage(): Usage {
  const usage = readStored<Usage>("usage", EMPTY_USAGE);
  return usage.month === monthKey() ? usage : { ...EMPTY_USAGE, month: monthKey() };
}

/**
 * One model call with the brand voice as system prompt.
 * light = routine/volume work (cheapest model), creative = scripts, strategy, analysis.
 * Signed in: the call goes through the creator-api Edge Function, which holds the key in Vault.
 * Signed out: falls back to a key kept in this browser, sent straight to Anthropic.
 */
export const CHEAP_MODEL = "claude-haiku-5-5";

/**
 * label names the button/step that triggered the call; it is shown in Settings → Riwayat biaya.
 * Hemat mode runs everything on Haiku with thinking off; every call is capped at settings.maxCallIdr worst case.
 */
export async function askAI({ tier, role, prompt, maxTokens = 1500, label }: { tier: Tier; role: string; prompt: string; maxTokens?: number; label?: string }): Promise<string> {
  const settings = getSettings();
  const viaServer = isSignedIn() && !!readCloudKeys().anthropic;
  if (!viaServer && !settings.apiKey.trim()) throw new AiSetupError("API key belum diisi. Buka Settings → AI & Models.");
  const usage = currentUsage();
  if (settings.budgetIdr > 0 && usage.idr >= settings.budgetIdr) throw new AiSetupError("Batas biaya AI bulan ini sudah tercapai. Naikkan batas di Settings → AI & Models.");

  const model = settings.costMode === "hemat" ? CHEAP_MODEL : tier === "light" ? settings.lightModel : settings.creativeModel;
  const system = `Kamu adalah ${role} di tim media sosial ${settings.brandName} (${settings.handle}), fotografer spesialis interior properti di Jakarta, pemilik brand FORIOR. Gaya bahasa brand: ${settings.brandVoice} Jawab dalam bahasa Indonesia, ringkas, langsung ke hasil, tanpa pembuka atau penutup.`;

  const fitted = fitMaxTokens(model, estimateTokens(system + prompt) + 20, maxTokens, settings.maxCallIdr, settings.usdToIdr);
  if (fitted < 256) throw new AiSetupError(`Dengan ${model}, panggilan ini bisa melebihi batas ${rupiah(settings.maxCallIdr)} per panggilan. Aktifkan Mode hemat atau naikkan batas di Settings → AI & Models.`);
  maxTokens = fitted;
  const record = (input: number, output: number) => {
    const idr = costIdr(model, input, output, settings.usdToIdr);
    writeStored<Usage>("usage", { month: monthKey(), inputTokens: usage.inputTokens + input, outputTokens: usage.outputTokens + output, idr: usage.idr + idr, calls: usage.calls + 1 }, EMPTY_USAGE);
    writeStored<CallLog[]>("usageLog", old => [{ at: new Date().toISOString(), label: label ?? role, model, input, output, idr }, ...old].slice(0, 150), []);
  };
  if (viaServer) {
    try {
      const r = await callServer<{ text: string; stop_reason: string; usage: { input_tokens: number; output_tokens: number } }>("ai", { model, system, prompt, maxTokens });
      record(r.usage.input_tokens, r.usage.output_tokens);
      if (r.stop_reason === "refusal") throw new Error("Model menolak permintaan ini. Ubah instruksinya lalu coba lagi.");
      if (!r.text) throw new Error("Model tidak mengembalikan teks. Coba lagi.");
      return r.text;
    } catch (error) { if (error instanceof ServerSetupError) throw new AiSetupError(error.message); throw error; }
  }
  const client = new Anthropic({ apiKey: settings.apiKey.trim(), dangerouslyAllowBrowser: true });
  try {
    // Sonnet/Opus tiers can decline on safety classifiers; let the API retry on its default fallback model. Haiku has no server-side fallback.
    const withFallback = !model.includes("haiku");
    const response = await client.beta.messages.create({
      ...(withFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      model,
      max_tokens: maxTokens,
      ...(thinkingFor(model) ? { thinking: thinkingFor(model) } : {}),
      output_config: { effort: "low" }, // these are short drafting tasks; low effort keeps token spend down
      system,
      messages: [{ role: "user", content: prompt }]
    });
    record(response.usage.input_tokens, response.usage.output_tokens);
    if (response.stop_reason === "refusal") throw new Error("Model menolak permintaan ini. Ubah instruksinya lalu coba lagi.");
    const text = response.content.map(block => (block.type === "text" ? block.text : "")).join("").trim();
    if (!text) throw new Error("Model tidak mengembalikan teks. Coba lagi.");
    return text;
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new AiSetupError("API key ditolak. Periksa kembali di Settings → AI & Models.");
    if (error instanceof Anthropic.NotFoundError) throw new AiSetupError(`Model "${model}" tidak ditemukan. Periksa nama model di Settings.`);
    if (error instanceof Anthropic.RateLimitError) throw new Error("Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.");
    if (error instanceof Anthropic.APIConnectionError) throw new Error("Tidak bisa terhubung ke Anthropic. Periksa koneksi internet.");
    if (error instanceof Anthropic.APIError) throw new Error(`Anthropic API error ${error.status ?? ""}: ${error.message}`);
    throw error;
  }
}

export type IgPost = { caption: string; likes: number; comments: number; type: string; date: string };

/**
 * Public posts of an Instagram business/creator account via Meta's Business Discovery.
 * Needs the user's own Meta access token + Instagram user ID from Settings.
 */
export async function fetchInstagramPosts(username: string): Promise<{ followers: number; posts: IgPost[] }> {
  if (isSignedIn() && readCloudKeys().meta_token) {
    const d = await callServer<{ followers_count?: number; media?: { data?: Record<string, unknown>[] } }>("instagram", { username });
    return { followers: d.followers_count ?? 0, posts: (d.media?.data ?? []).map(m => ({ caption: String(m.caption ?? ""), likes: Number(m.like_count ?? 0), comments: Number(m.comments_count ?? 0), type: String(m.media_type ?? ""), date: String(m.timestamp ?? "").slice(0, 10) })) };
  }
  const { metaToken, igUserId } = getSettings();
  if (!metaToken.trim() || !igUserId.trim()) throw new AiSetupError("Token Meta belum diisi.");
  const fields = `business_discovery.username(${username}){followers_count,media.limit(30){caption,like_count,comments_count,media_type,timestamp}}`;
  const response = await fetch(`https://graph.facebook.com/${encodeURIComponent(igUserId.trim())}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(metaToken.trim())}`);
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error?.message ?? `Meta API error ${response.status}`);
  const discovery = data.business_discovery;
  return {
    followers: discovery.followers_count ?? 0,
    posts: (discovery.media?.data ?? []).map((m: Record<string, unknown>) => ({ caption: String(m.caption ?? ""), likes: Number(m.like_count ?? 0), comments: Number(m.comments_count ?? 0), type: String(m.media_type ?? ""), date: String(m.timestamp ?? "").slice(0, 10) }))
  };
}
