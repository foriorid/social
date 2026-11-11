"use client";

import Anthropic from "@anthropic-ai/sdk";
import { costIdr, monthKey } from "./logic";
import { DEFAULT_SETTINGS, EMPTY_USAGE, readStored, writeStored, type Settings, type Usage } from "./store";

export type Tier = "light" | "creative";

export class AiSetupError extends Error {}

function currentUsage(): Usage {
  const usage = readStored<Usage>("usage", EMPTY_USAGE);
  return usage.month === monthKey() ? usage : { ...EMPTY_USAGE, month: monthKey() };
}

/**
 * One model call with the brand voice as system prompt.
 * light = routine/volume work (cheapest model), creative = scripts, strategy, analysis.
 * The key comes from Settings and is sent straight from this browser to Anthropic.
 */
export async function askAI({ tier, role, prompt, maxTokens = 4000 }: { tier: Tier; role: string; prompt: string; maxTokens?: number }): Promise<string> {
  const settings = readStored<Settings>("settings", DEFAULT_SETTINGS);
  if (!settings.apiKey.trim()) throw new AiSetupError("API key belum diisi. Buka Settings → API & Integrasi.");
  const usage = currentUsage();
  if (settings.budgetIdr > 0 && usage.idr >= settings.budgetIdr) throw new AiSetupError("Batas biaya AI bulan ini sudah tercapai. Naikkan batas di Settings → API & Integrasi.");

  const model = tier === "light" ? settings.lightModel : settings.creativeModel;
  const client = new Anthropic({ apiKey: settings.apiKey.trim(), dangerouslyAllowBrowser: true });
  const system = `Kamu adalah ${role} di tim media sosial ${settings.brandName} (${settings.handle}), fotografer spesialis interior properti di Jakarta, pemilik brand FORIOR. Gaya bahasa brand: ${settings.brandVoice} Jawab dalam bahasa Indonesia, ringkas, langsung ke hasil, tanpa pembuka atau penutup.`;

  try {
    // Sonnet/Opus tiers can decline on safety classifiers; let the API retry on its default fallback model. Haiku has no server-side fallback.
    const withFallback = !model.includes("haiku");
    const response = await client.beta.messages.create({
      ...(withFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      model,
      max_tokens: maxTokens,
      output_config: { effort: "low" }, // these are short drafting tasks; low effort keeps token spend down
      system,
      messages: [{ role: "user", content: prompt }]
    });
    writeStored<Usage>("usage", {
      month: monthKey(),
      inputTokens: usage.inputTokens + response.usage.input_tokens,
      outputTokens: usage.outputTokens + response.usage.output_tokens,
      idr: usage.idr + costIdr(model, response.usage.input_tokens, response.usage.output_tokens, settings.usdToIdr),
      calls: usage.calls + 1
    }, EMPTY_USAGE);
    if (response.stop_reason === "refusal") throw new Error("Model menolak permintaan ini. Ubah instruksinya lalu coba lagi.");
    const text = response.content.map(block => (block.type === "text" ? block.text : "")).join("").trim();
    if (!text) throw new Error("Model tidak mengembalikan teks. Coba lagi.");
    return text;
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new AiSetupError("API key ditolak. Periksa kembali di Settings → API & Integrasi.");
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
  const { metaToken, igUserId } = readStored<Settings>("settings", DEFAULT_SETTINGS);
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
