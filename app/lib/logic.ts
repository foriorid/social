// Pure helpers (no browser APIs) so they can be unit-tested with `npm test`.

export type Profile = { handle: string; platform: "Instagram" | "TikTok" };

export function parseProfile(input: string): Profile | null {
  const text = input.trim();
  const url = /(instagram|tiktok)\.com\/@?([A-Za-z0-9._]+)/i.exec(text);
  if (url) return { handle: "@" + url[2].replace(/\.+$/, ""), platform: url[1].toLowerCase() === "tiktok" ? "TikTok" : "Instagram" };
  const bare = /^@([A-Za-z0-9._]+)$/.exec(text);
  return bare ? { handle: "@" + bare[1], platform: "Instagram" } : null;
}

// USD per 1M tokens [input, output]. Source: Anthropic price list, Nov 2026.
export const PRICES: Record<string, [number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20]
};

export function costIdr(model: string, inputTokens: number, outputTokens: number, usdToIdr: number): number {
  const [pin, pout] = PRICES[model] ?? PRICES["claude-opus-5-5"]; // unknown model: assume the dearest tier
  return ((inputTokens * pin + outputTokens * pout) / 1_000_000) * usdToIdr;
}

/** Turn a model's list-style answer into clean lines (drops bullets, numbering, quotes). */
export function parseLines(text: string): string[] {
  return text
    .split("\n")
    .map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/^["“”']+|["“”']+$/g, "").trim())
    .filter(Boolean);
}

/** Lines the model marked as content ideas ("IDE: ..."). */
export function parseIdeas(text: string): string[] {
  return parseLines(text).filter(l => /^IDE\s*:/i.test(l)).map(l => l.replace(/^IDE\s*:\s*/i, ""));
}

export function monthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function rupiah(value: number): string {
  return "Rp " + Math.round(value).toLocaleString("id-ID");
}
