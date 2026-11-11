// The content pipeline: stages, the fixed job of each agent, prompts and answer parsing. Pure, so it is unit-tested.
import type { CampaignContent, CampaignData, Scene } from "../plan-data";

export const STAGES = ["Planned", "Brief ready", "In production", "In review", "Scheduled", "Published"] as const;
export const STAGE_LABEL: Record<string, string> = { Planned: "Ide", "Brief ready": "Brief", "In production": "Produksi", "In review": "Review", Scheduled: "Terjadwal", Published: "Tayang" };

export type StepKind = "plan" | "brief" | "production" | "publish";
export type Step = { kind: StepKind | "approval"; agent: string; tier: "light" | "creative"; job: string; trigger: string; output: string };

export const PIPELINE: Step[] = [
  { kind: "plan", agent: "Creative Strategist", tier: "creative", job: "Menyusun judul, format, dan pilar untuk seluruh konten campaign.", trigger: "Saat campaign dibuat", output: "30 judul konten" },
  { kind: "brief", agent: "Content Writer", tier: "creative", job: "Menulis brief lengkap dan storyboard (scene untuk video, slide untuk carousel).", trigger: "Konten berstatus Ide", output: "Brief + storyboard" },
  { kind: "production", agent: "Graphic Designer / Video Editor", tier: "light", job: "Menyiapkan paket produksi: arahan layout per slide atau shot list dan catatan edit.", trigger: "Brief siap", output: "Paket produksi" },
  { kind: "publish", agent: "Social Media Manager", tier: "light", job: "Merapikan caption, hashtag, dan mengusulkan jadwal tayang.", trigger: "Paket produksi siap", output: "Caption final + jadwal" },
  { kind: "approval", agent: "Anda", tier: "light", job: "Memeriksa dan menyetujui sebelum konten dijadwalkan.", trigger: "Semua langkah agen selesai", output: "Disetujui / revisi" }
];

export const isVideo = (format: string) => format === "Reels";

/** The next agent step a content item still needs, or null when it is waiting for the human. */
export function nextStep(item: CampaignContent): StepKind | null {
  if (!item.board?.length) return "brief";
  if (!item.production) return "production";
  if (!item.schedule) return "publish";
  return null;
}

/** Models sometimes wrap JSON in prose or code fences; take the outermost object/array. */
export function extractJson(text: string): unknown {
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start < 0 || end <= start) throw new Error("Jawaban model bukan JSON. Coba lagi.");
  try { return JSON.parse(text.slice(start, end + 1)); } catch { throw new Error("JSON dari model tidak valid. Coba lagi."); }
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));

export function toBoard(raw: unknown, format: string): Scene[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>;
    return { label: str(o.label) || (isVideo(format) ? `Scene ${i + 1}` : `Slide ${i + 1}`), visual: str(o.visual), text: str(o.text), audio: str(o.audio) };
  }).filter(s => s.visual || s.text);
}

const context = (c: CampaignData, item: CampaignContent) => `Akun: ${c.account}\nCampaign: ${c.name} (${c.period})\nTujuan campaign: ${c.goal}\nKonten #${item.day}: ${item.title}\nFormat: ${item.format}\nPilar: ${item.pillar}`;

export function stepPrompt(kind: StepKind, c: CampaignData, item: CampaignContent): string {
  if (kind === "plan") return `Susun ${c.items.length} judul konten untuk akun ${c.account}, campaign "${c.name}" (${c.period}, tujuan: ${c.goal}). Campur edukasi, portofolio/before-after, behind the scenes, personal, dan promo jasa. Balas HANYA JSON array: [{"title":"...","format":"Reels|Carousel|Feed","pillar":"..."}]`;
  if (kind === "brief") return `${context(c, item)}\n\nTulis brief lengkap dan storyboard. ${isVideo(item.format) ? "Storyboard video 4-6 scene: label berisi rentang detik (mis. \"0-3 dtk\"), visual = arahan shot/gerak kamera, text = teks di layar atau narasi, audio = musik/suara." : "Storyboard 5-8 slide: label \"Slide N\", visual = foto/komposisi yang dipakai, text = teks pada slide (singkat), audio kosong."}\nBalas HANYA JSON: {"hook":"kalimat pembuka","message":"pesan utama satu kalimat","goal":"tujuan konten","visualDirection":"arah visual keseluruhan","assetNeeds":"foto/footage yang perlu disiapkan","caption":"draf caption","cta":"ajakan","board":[{"label":"","visual":"","text":"","audio":""}]}`;
  const board = (item.board ?? []).map(s => `${s.label}: ${s.visual} | ${s.text}`).join("\n");
  if (kind === "production") return `${context(c, item)}\nHook: ${item.hook}\nStoryboard:\n${board}\n\n${isVideo(item.format) ? "Buat paket produksi video: shot list bernomor (lensa/angle, gerakan, durasi), urutan edit, transisi, saran audio, dan teks subtitle per scene." : "Buat paket produksi desain: untuk tiap slide tulis layout, hierarki teks, dan catatan pemilihan foto; lalu catatan konsistensi brand."} Tulis sebagai teks biasa yang rapi, tanpa JSON.`;
  return `${context(c, item)}\nHook: ${item.hook}\nDraf caption: ${item.caption}\nCTA: ${item.cta}\n\nRapikan untuk tayang. Balas HANYA JSON: {"caption":"caption final siap tempel, termasuk CTA","hashtags":"8-12 hashtag dipisah spasi","schedule":"usulan hari dan jam tayang (WIB) beserta alasan singkat"}`;
}

/** Turn a step's model answer into the fields it fills on the content item. */
export function applyStep(kind: Exclude<StepKind, "plan">, item: CampaignContent, answer: string): Partial<CampaignContent> {
  if (kind === "production") return { production: answer.trim(), status: "In production" };
  const o = extractJson(answer) as Record<string, unknown>;
  if (kind === "publish") {
    if (!str(o.caption)) throw new Error("Jawaban model tidak berisi caption. Coba lagi.");
    return { caption: str(o.caption), hashtags: str(o.hashtags), schedule: str(o.schedule), status: "In review" };
  }
  const board = toBoard(o.board, item.format);
  if (!board.length) throw new Error("Jawaban model tidak berisi storyboard. Coba lagi.");
  return { hook: str(o.hook) || item.hook, message: str(o.message), goal: str(o.goal) || item.goal, visualDirection: str(o.visualDirection) || item.visualDirection, assetNeeds: str(o.assetNeeds), caption: str(o.caption) || item.caption, cta: str(o.cta) || item.cta, board, scenes: board.map(s => `${s.label}: ${s.visual}`), status: "Brief ready" };
}

export function parsePlan(answer: string, count: number): { title: string; format: CampaignContent["format"]; pillar: string }[] {
  const rows = extractJson(answer);
  if (!Array.isArray(rows)) throw new Error("Jawaban model bukan daftar judul. Coba lagi.");
  const list = rows.map(r => { const o = (r ?? {}) as Record<string, unknown>; const f = str(o.format); return { title: str(o.title), format: (/carousel/i.test(f) ? "Carousel" : /feed/i.test(f) ? "Feed" : "Reels") as CampaignContent["format"], pillar: str(o.pillar) || "Brand story" }; }).filter(r => r.title).slice(0, count);
  if (list.length < 3) throw new Error("Daftar judul dari model terlalu sedikit. Coba lagi.");
  return list;
}

export function driveFolderId(url: string): string | null {
  return /drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/|open\?id=)([A-Za-z0-9_-]{10,})/.exec(url)?.[1] ?? null;
}

const stamp = (sec: number) => `${String(Math.floor(sec / 3600)).padStart(2, "0")}:${String(Math.floor(sec / 60) % 60).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")},000`;

/** Subtitle file from the storyboard. Uses "0-3 dtk" style labels when present, otherwise 3 seconds per scene. */
export function toSrt(board: Scene[]): string {
  let cursor = 0;
  return board.filter(s => s.text.trim()).map((s, i) => {
    const m = /(\d+)\s*(?:-|–|sampai|s\/d)\s*(\d+)/.exec(s.label);
    const start = m && Number(m[2]) > Number(m[1]) ? Number(m[1]) : cursor;
    const end = m && Number(m[2]) > Number(m[1]) ? Number(m[2]) : start + 3;
    cursor = end;
    return `${i + 1}\n${stamp(start)} --> ${stamp(end)}\n${s.text.trim()}\n`;
  }).join("\n");
}
