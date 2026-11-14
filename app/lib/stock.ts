// Campaign stock: files indexed from one Google Drive folder (subfolder names become tags), and automatic
// matching of storyboard scenes to those files. Pure, so it is unit-tested.
import type { Scene } from "../plan-data";

export type StockFile = { id: string; name: string; kind: "Foto" | "Video" | "Audio"; tags: string[]; path: string };
export type CampaignStock = { folderId: string; url: string; files: StockFile[]; indexedAt: string };

/** Indonesian and English words for the same place or shot, mapped to one key. */
const SYNONYMS: Record<string, string[]> = {
  pool: ["pool", "kolam", "renang", "swimming", "poolside"],
  kitchen: ["kitchen", "dapur", "pantry"],
  bedroom: ["bedroom", "kamar", "tidur", "bed", "master"],
  bathroom: ["bathroom", "mandi", "toilet", "wc", "bathtub", "shower"],
  living: ["living", "keluarga", "ruang tamu", "lounge", "sofa", "family room"],
  dining: ["dining", "makan", "meja makan"],
  exterior: ["exterior", "eksterior", "fasad", "facade", "depan", "luar", "outdoor", "halaman"],
  terrace: ["terrace", "teras", "balkon", "balcony", "deck", "rooftop"],
  garden: ["garden", "taman", "kebun", "lawn"],
  aerial: ["aerial", "drone", "udara", "atas", "birdeye"],
  view: ["view", "pemandangan", "gunung", "mountain", "sea", "laut", "pantai", "beach"],
  night: ["night", "malam"],
  sunset: ["sunset", "sore", "golden", "senja", "dusk"],
  morning: ["morning", "pagi", "sunrise"],
  detail: ["detail", "close", "closeup", "close-up", "dekorasi", "decor"],
  billiard: ["billiard", "biliar", "pool table"],
  sauna: ["sauna", "spa", "jacuzzi"],
  playroom: ["playroom", "bermain", "anak", "kids", "play"],
  bbq: ["bbq", "barbeque", "barbecue", "grill", "panggang"],
  gym: ["gym", "fitness"],
  people: ["talent", "model", "people", "orang", "keluarga bermain", "group", "lifestyle"],
  lobby: ["lobby", "lobi", "resepsionis", "reception"],
  office: ["office", "kantor", "meeting", "workspace"],
  wide: ["wide", "establishing", "luas", "lebar"]
};
const STOP = new Set(["img", "dsc", "dji", "mvi", "jpg", "jpeg", "png", "heic", "mp4", "mov", "wav", "mp3", "final", "edit", "copy", "hdr", "the", "and", "dan", "di", "ke", "dari", "yang", "untuk", "shot", "foto", "video", "scene", "slide", "with"]);

const norm = (v: string) => v.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Words of a text mapped to synonym keys; unknown words are kept as-is (3+ letters, not numbers). */
export function keywords(text: string): string[] {
  const t = ` ${norm(text).replace(/[^a-z0-9]+/g, " ")} `;
  const out = new Set<string>();
  for (const [key, words] of Object.entries(SYNONYMS)) if (words.some(w => t.includes(` ${w} `))) out.add(key);
  for (const w of t.trim().split(/\s+/)) if (w.length >= 3 && !/^\d+$/.test(w) && !STOP.has(w) && !Object.values(SYNONYMS).some(ws => ws.includes(w))) out.add(w);
  return [...out];
}

export const kindOfMime = (mime: string): StockFile["kind"] | null => (mime.startsWith("image/") ? "Foto" : mime.startsWith("video/") ? "Video" : mime.startsWith("audio/") ? "Audio" : null);

/** A stock entry from a Drive file and the folder path it sits in (subfolder names are the strongest tags). */
export function stockFile(f: { id: string; name: string; mimeType: string }, path: string[]): StockFile | null {
  const kind = kindOfMime(f.mimeType);
  if (!kind) return null;
  const tags = [...new Set([...path.flatMap(keywords), ...keywords(f.name.replace(/\.[a-z0-9]+$/i, ""))])];
  return { id: f.id, name: f.name, kind, tags, path: path.join(" / ") };
}

/** What a scene needs: AI-given tags first, else words from its label and shot direction. */
export const sceneWants = (s: Scene) => s.tags?.length ? [...new Set(s.tags.flatMap(keywords))] : keywords(`${s.label} ${s.visual}`);

const hitsOf = (f: StockFile, want: string[]) => want.filter(w => f.tags.includes(w)).length;
function score(f: StockFile, want: string[], preferVideo: boolean, used: number): number {
  const kindBonus = preferVideo ? (f.kind === "Video" ? 0.6 : 0) : f.kind === "Foto" ? 0.6 : -0.6;
  return hitsOf(f, want) * 2 + kindBonus - used * 0.75;
}

/** Best stock files for a scene, best first. Audio never; videos preferred for Reels, photos otherwise. */
export function rankFor(s: Scene, files: StockFile[], video: boolean, used: Record<string, number> = {}): StockFile[] {
  const want = sceneWants(s);
  return files.filter(f => f.kind !== "Audio").map(f => ({ f, sc: score(f, want, video, used[f.id] ?? 0) })).sort((a, b) => b.sc - a.sc || a.f.name.localeCompare(b.f.name)).map(x => x.f);
}

/**
 * Fills scenes that have no picture from the stock. Scenes with a real match are served first (strongest
 * match first), so a scene with no keywords never takes the one photo another scene needs; the rest then get
 * the least-used remaining photo. Each file is used once per content; files used elsewhere rank lower.
 */
export function autoFill(board: Scene[], files: StockFile[], video: boolean, thumb: (id: string) => string, campaignUsed: Record<string, number> = {}, force = false): { board: Scene[]; filled: number } {
  const used = { ...campaignUsed };
  const taken = new Set(board.filter(s => !force && s.assetId).map(s => s.assetId!));
  const next = [...board];
  const open = board.map((s, i) => ({ s, i })).filter(({ s }) => force || !s.image);
  const bestHits = (s: Scene) => { const want = sceneWants(s); return Math.max(0, ...files.map(f => hitsOf(f, want))); };
  const assign = (i: number, f: StockFile) => { taken.add(f.id); used[f.id] = (used[f.id] ?? 0) + 1; next[i] = { ...board[i], image: thumb(f.id), assetId: f.id }; };
  const later: number[] = [];
  for (const { s, i } of open.sort((a, b) => bestHits(b.s) - bestHits(a.s))) {
    const want = sceneWants(s);
    const pick = rankFor(s, files, video, used).find(f => !taken.has(f.id) && hitsOf(f, want) > 0);
    if (pick) assign(i, pick); else later.push(i);
  }
  for (const i of later.sort((a, b) => a - b)) { const pick = rankFor(board[i], files, video, used).find(f => !taken.has(f.id)); if (pick) assign(i, pick); }
  return { board: next, filled: open.filter(({ i }) => next[i].assetId && next[i] !== board[i]).length };
}

/** How often each stock file is already used across a campaign's contents. */
export function usageOf(items: { board?: Scene[] }[]): Record<string, number> {
  const used: Record<string, number> = {};
  for (const it of items) for (const s of it.board ?? []) if (s.assetId) used[s.assetId] = (used[s.assetId] ?? 0) + 1;
  return used;
}

/** Tag counts for chips, most common first. */
export function topTags(files: StockFile[], n = 12): { tag: string; count: number }[] {
  const c: Record<string, number> = {};
  for (const f of files) for (const t of f.tags) c[t] = (c[t] ?? 0) + 1;
  return Object.entries(c).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)).slice(0, n);
}
