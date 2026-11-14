// The content pipeline: stages, the fixed job of each agent, prompts and answer parsing. Pure, so it is unit-tested.
import type { CampaignContent, CampaignData, CampaignKind, Scene } from "../plan-data";

export const STAGES = ["Draft", "Brief Siap", "Produksi", "Review", "Terjadwal", "Dipublish"] as const;
export type Stage = typeof STAGES[number];
export const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGES.map(s => [s, s]));
/** CSS-safe key per stage, for colors. */
export const stageKey = (s: Stage) => s.toLowerCase().replace(/\s+/g, "-");
const LEGACY_STAGE: Record<string, Stage> = { Planned: "Draft", Brief: "Draft", "Brief ready": "Brief Siap", "In production": "Produksi", "In review": "Review", Publish: "Terjadwal", Scheduled: "Terjadwal", Published: "Dipublish" };
/** Maps any stored status, including older ones, to the six current stages. */
export const stageOf = (status: string): Stage => (STAGES as readonly string[]).includes(status) ? (status as Stage) : LEGACY_STAGE[status] ?? "Draft";

export type StepKind = "plan" | "brief" | "production" | "publish";
export type Step = { kind: StepKind | "approval"; agent: string; tier: "light" | "creative"; job: string; trigger: string; output: string; auto: boolean; maxTokens: number };

export const PIPELINE: Step[] = [
  { kind: "plan", agent: "Creative Strategist", tier: "creative", job: "Menyusun judul, format, dan pilar untuk seluruh konten campaign, dari brief campaign.", trigger: "Saat campaign dibuat / Susun ulang judul", output: "Judul semua konten (1 panggilan)", auto: true, maxTokens: 2500 },
  { kind: "brief", agent: "Content Writer + Social Media Manager", tier: "creative", job: "Dalam satu panggilan: brief, storyboard (scene/slide), caption, hashtag, dan usulan jadwal.", trigger: "Konten berstatus Ide", output: "Brief lengkap → tahap Produksi (1 panggilan)", auto: true, maxTokens: 1800 },
  { kind: "approval", agent: "Anda", tier: "light", job: "Memeriksa draft dan menyetujui sebelum dipublish.", trigger: "Draft diajukan dari Studio / brief", output: "Disetujui → Publish, revisi → Produksi", auto: true, maxTokens: 0 },
  { kind: "production", agent: "Graphic Designer / Video Editor", tier: "light", job: "Paket produksi: shot list dan urutan edit, atau arahan layout per slide.", trigger: "Hanya bila diminta di Studio / brief", output: "Paket produksi", auto: false, maxTokens: 1200 },
  { kind: "publish", agent: "Social Media Manager", tier: "light", job: "Merapikan ulang caption, hashtag, dan jadwal setelah brief diedit.", trigger: "Hanya bila diminta di Studio", output: "Caption final + jadwal", auto: false, maxTokens: 600 }
];

export const isVideo = (format: string) => format === "Reels";

/** The next agent step a content item still needs, or null when it is waiting for the human. */
export function nextStep(item: CampaignContent): StepKind | null {
  if (item.untitled) return "plan";
  if (!item.board?.length) return "brief";
  return null; // production package and caption polish run only on request, to keep each content at one call
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
    const sec = Number(o.sec), note = str(o.note);
    return { label: str(o.label) || (isVideo(format) ? `Scene ${i + 1}` : `Slide ${i + 1}`), visual: str(o.visual), text: str(o.text), audio: str(o.audio), ...(sec > 0 ? { sec: Math.round(sec) } : {}), ...(note ? { note } : {}) };
  }).filter(s => s.visual || s.text);
}

export const KIND_LABEL: Record<CampaignKind, string> = { personal: "Personal brand Alvian", business: "Bisnis FORIOR", property: "Promosi properti / klien" };

/** What a campaign of each kind should talk about; keeps photography tips out of property campaigns and vice versa. */
const KIND_GUIDE: Record<CampaignKind, string> = {
  personal: "Ini akun personal brand Alvian, fotografer spesialis interior properti di Jakarta. Campur edukasi fotografi interior, behind the scenes pemotretan, cerita personal dan perjalanan karier, portofolio before/after, dan ajakan memakai jasa FORIOR.",
  business: "Ini akun bisnis FORIOR, penyedia jasa foto interior properti. Fokus pada portofolio proyek klien, before/after, proses kerja tim, testimoni dan hasil bisnis klien, paket dan penawaran jasa.",
  property: "Ini konten promosi untuk properti yang menjadi subjek campaign (villa/rumah/apartemen/hotel klien), dengan foto hasil pemotretan FORIOR. Fokus pada properti itu sendiri: tur ruangan, kamar, fasilitas, pengalaman menginap atau tinggal, detail desain, suasana dan lokasi sekitar, momen dan aktivitas, serta ajakan booking atau inquiry. JANGAN membuat konten tips atau edukasi fotografi."
};
const campaignHeader = (c: CampaignData) => `Akun: ${c.account}\nJenis campaign: ${KIND_LABEL[c.kind ?? "personal"]}\nCampaign: ${c.name} (${c.period})\nTujuan campaign: ${c.goal}${c.brief?.trim() ? `\nBrief campaign: ${c.brief.trim()}` : ""}`;
const context = (c: CampaignData, item: CampaignContent) => `${campaignHeader(c)}\nKonten #${item.day}: ${item.title}\nFormat: ${item.format}\nPilar: ${item.pillar}${item.concept?.trim() ? `\nKonsep dari pemilik: ${item.concept.trim()}` : ""}${item.duration ? `\nDurasi total: ${item.duration}` : ""}${item.style ? `\nGaya: ${item.style}` : ""}`;

export function stepPrompt(kind: StepKind, c: CampaignData, item: CampaignContent): string {
  if (kind === "plan") {
    const open = c.items.filter(x => !x.board?.length).length;
    return `${campaignHeader(c)}\n\n${KIND_GUIDE[c.kind ?? "personal"]}\nSusun ${open} judul konten yang semuanya relevan dengan campaign ini. Variasikan sudut pandang dan pilar, kira-kira 40% Reels, 35% Carousel, 25% Feed. Judul spesifik dan menarik, maksimal 9 kata, pilar 1-2 kata. Balas HANYA JSON array ringkas tanpa spasi berlebih: [{"title":"...","format":"Reels|Carousel|Feed","pillar":"..."}]`;
  }
  if (kind === "brief") return `${context(c, item)}\n\nTulis brief, storyboard, caption, dan jadwal dalam satu jawaban. Singkat dan padat. ${isVideo(item.format) ? "Storyboard video 4-6 scene: label = nama scene (mis. \"Establishing\"), sec = durasi detik (total sesuai durasi), visual = shot & gerakan kamera (maks. 15 kata), text = teks layar (maks. 8 kata), audio = VO atau musik (maks. 12 kata), note = catatan produksi (maks. 10 kata)." : "Storyboard 5-7 slide: label = nama slide (mis. \"Cover\"), visual = foto/komposisi (maks. 12 kata), text = teks slide (maks. 12 kata), note = catatan desain (maks. 10 kata), audio kosong."}\nBalas HANYA JSON tanpa spasi berlebih: {"hook":"maks. 15 kata","message":"maks. 15 kata","goal":"maks. 10 kata","visualDirection":"maks. 25 kata","assetNeeds":"maks. 20 kata","caption":"maks. 70 kata termasuk CTA","cta":"maks. 10 kata","hashtags":"8 hashtag","schedule":"hari & jam WIB + alasan maks. 12 kata","board":[{"label":"","sec":0,"visual":"","text":"","audio":"","note":""}]}`;
  const board = (item.board ?? []).map(s => `${s.label}: ${s.visual} | ${s.text}`).join("\n");
  if (kind === "production") return `${context(c, item)}\nHook: ${item.hook}\nStoryboard:\n${board}\n\n${isVideo(item.format) ? "Buat paket produksi video: shot list bernomor (lensa/angle, gerakan, durasi), urutan edit, transisi, saran audio, dan teks subtitle per scene." : "Buat paket produksi desain: untuk tiap slide tulis layout, hierarki teks, dan catatan pemilihan foto; lalu catatan konsistensi brand."} Maksimal 220 kata, poin-poin singkat, tanpa JSON.`;
  return `${context(c, item)}\nHook: ${item.hook}\nDraf caption: ${item.caption}\nCTA: ${item.cta}\n\nRapikan untuk tayang. Balas HANYA JSON: {"caption":"caption final siap tempel, termasuk CTA","hashtags":"8-12 hashtag dipisah spasi","schedule":"usulan hari dan jam tayang (WIB) beserta alasan singkat"}`;
}

/** Turn a step's model answer into the fields it fills on the content item. */
export function applyStep(kind: Exclude<StepKind, "plan">, item: CampaignContent, answer: string): Partial<CampaignContent> {
  if (kind === "production") return { production: answer.trim(), status: "Produksi" };
  const o = extractJson(answer) as Record<string, unknown>;
  if (kind === "publish") {
    if (!str(o.caption)) throw new Error("Jawaban model tidak berisi caption. Coba lagi.");
    return { caption: str(o.caption), hashtags: str(o.hashtags), schedule: str(o.schedule) };
  }
  const board = toBoard(o.board, item.format);
  if (!board.length) throw new Error("Jawaban model tidak berisi storyboard. Coba lagi.");
  return { hook: str(o.hook) || item.hook, message: str(o.message), goal: str(o.goal) || item.goal, visualDirection: str(o.visualDirection) || item.visualDirection, assetNeeds: str(o.assetNeeds), caption: str(o.caption) || item.caption, cta: str(o.cta) || item.cta, board, scenes: board.map(s => `${s.label}: ${s.visual}`), hashtags: str(o.hashtags) || item.hashtags, schedule: str(o.schedule) || item.schedule, status: "Brief Siap" };
}

export function parsePlan(answer: string, count: number): { title: string; format: CampaignContent["format"]; pillar: string }[] {
  const rows = extractJson(answer);
  if (!Array.isArray(rows)) throw new Error("Jawaban model bukan daftar judul. Coba lagi.");
  const list = rows.map(r => { const o = (r ?? {}) as Record<string, unknown>; const f = str(o.format); return { title: str(o.title), format: (/carousel/i.test(f) ? "Carousel" : /feed/i.test(f) ? "Feed" : "Reels") as CampaignContent["format"], pillar: str(o.pillar) || "Brand story" }; }).filter(r => r.title).slice(0, count);
  if (list.length < Math.min(3, count)) throw new Error("Daftar judul dari model terlalu sedikit. Coba lagi.");
  return list;
}

export function driveFolderId(url: string): string | null {
  return /drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/|open\?id=)([A-Za-z0-9_-]{10,})/.exec(url)?.[1] ?? null;
}

const stamp = (sec: number) => `${String(Math.floor(sec / 3600)).padStart(2, "0")}:${String(Math.floor(sec / 60) % 60).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")},000`;

/** Subtitle file from the storyboard, timed by each scene's duration. */
export function toSrt(board: Scene[]): string {
  const times = sceneTimes(board);
  return board.map((s, i) => ({ s, t: times[i] })).filter(x => x.s.text.trim()).map((x, i) => `${i + 1}\n${stamp(x.t.start)} --> ${stamp(x.t.end)}\n${x.s.text.trim()}\n`).join("\n");
}

/** Seconds per scene: its own `sec`, else a "0-3 dtk" label range, else 3. */
export const secOf = (s: Scene) => { if (s.sec && s.sec > 0) return s.sec; const m = /(\d+)\s*(?:-|–|sampai|s\/d)\s*(\d+)/.exec(s.label); return m && Number(m[2]) > Number(m[1]) ? Number(m[2]) - Number(m[1]) : 3; };
/** Running start/end second of each scene. */
export function sceneTimes(board: Scene[]): { start: number; end: number }[] {
  let t = 0;
  return board.map(s => { const start = t; t += secOf(s); return { start, end: t }; });
}
export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

/** Publish date as YYYY-MM-DD: the date picker value, else a parseable free-text date. */
export function dateOf(item: Pick<CampaignContent, "publishOn" | "publishDate">): string | null {
  if (item.publishOn && /^\d{4}-\d{2}-\d{2}$/.test(item.publishOn)) return item.publishOn;
  const t = item.publishDate ? Date.parse(item.publishDate) : NaN;
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** Monday-first month grid as YYYY-MM-DD, null for padding cells. */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = (new Date(year, month, 1).getDay() + 6) % 7, days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: first }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

/** Puts new titles on the items that have no storyboard yet; items already worked on keep their content. */
export function applyPlan(items: CampaignContent[], rows: { title: string; format: CampaignContent["format"]; pillar: string }[]): CampaignContent[] {
  let n = 0;
  return items.map(x => {
    if (x.board?.length || n >= rows.length) return x;
    const r = rows[n++];
    return { ...x, ...r, untitled: false, status: "Draft", hook: "", caption: "", visualDirection: "", cta: "", message: "", assetNeeds: "", hashtags: "", production: "", schedule: "", scenes: [] };
  });
}

// ---------- Account audit (Research → Bedah Akun) ----------
export type Audit = {
  summary: string;
  dataQuality: "cukup" | "terbatas" | "kosong";
  missing: string[];
  profile: { frequency: string; bestTime: string; engagement: string; formats: { name: string; share: number }[]; topics: string[] };
  highlights: { title: string; why: string; format: string; signal: string }[];
  gaps: string[];
  ideas: { format: string; title: string; angle: string }[];
};

export const auditPrompt = (platform: string, handle: string, source: string, data: string) => `Bedah akun ${platform} ${handle}. Sumber data: ${source}.
Aturan: jangan mengarang angka atau posting yang tidak ada di data. Bila data tidak menyebut suatu hal, isi "" atau [] dan jelaskan kebutuhannya di "missing". Ide konten tetap boleh diberikan berdasarkan positioning akun.
Balas HANYA JSON:
{"summary":"2-3 kalimat inti temuan","dataQuality":"cukup|terbatas|kosong","missing":["data yang perlu ditempel agar analisis lebih tajam"],
"profile":{"frequency":"","bestTime":"","engagement":"","formats":[{"name":"Reels|Carousel|Foto","share":0-100}],"topics":["topik"]},
"highlights":[{"title":"konten/pola menarik","why":"alasan singkat","format":"Reels|Carousel|Foto","signal":"mis. ER 11% atau simpan tinggi, kosong bila tidak ada di data"}],
"gaps":["celah atau peluang"],
"ideas":[{"format":"Reels|Carousel|TikTok","title":"judul ide","angle":"sudut pandang singkat"}]}

DATA:
${data}`;

const list = (v: unknown) => (Array.isArray(v) ? v : []);
/** Normalises the model's audit JSON so the view never breaks on a missing field. */
export function parseAudit(answer: string): Audit {
  const o = extractJson(answer) as Record<string, unknown>;
  const p = (o.profile ?? {}) as Record<string, unknown>;
  const q = str(o.dataQuality);
  return {
    summary: str(o.summary),
    dataQuality: q === "cukup" || q === "kosong" ? q : "terbatas",
    missing: list(o.missing).map(str).filter(Boolean),
    profile: { frequency: str(p.frequency), bestTime: str(p.bestTime), engagement: str(p.engagement), topics: list(p.topics).map(str).filter(Boolean),
      formats: list(p.formats).map(f => { const r = (f ?? {}) as Record<string, unknown>; return { name: str(r.name), share: Math.max(0, Math.min(100, Number(r.share) || 0)) }; }).filter(f => f.name && f.share > 0) },
    highlights: list(o.highlights).map(h => { const r = (h ?? {}) as Record<string, unknown>; return { title: str(r.title), why: str(r.why), format: str(r.format), signal: str(r.signal) }; }).filter(h => h.title),
    gaps: list(o.gaps).map(str).filter(Boolean),
    ideas: list(o.ideas).map(i => { const r = (i ?? {}) as Record<string, unknown>; return { format: str(r.format) || "Reels", title: str(r.title), angle: str(r.angle) }; }).filter(i => i.title)
  };
}

// ---------- Video guidebook for Claude Code + Remotion ----------
const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "video";
export const guidebookName = (item: CampaignContent) => `guidebook-${String(item.day).padStart(2, "0")}-${slug(item.title)}.md`;

/** One Markdown file that Claude Code can follow to build the video with Remotion from local footage. */
export function videoGuidebook(c: CampaignData, item: CampaignContent, brand: { name: string; handle: string }): string {
  const board = item.board ?? [];
  const rows = board.map((s, i) => `| ${i + 1} | ${s.label} | ${s.visual.replace(/\|/g, "/")} | ${s.text.replace(/\|/g, "/")} | ${s.audio.replace(/\|/g, "/")} |`).join("\n");
  const assets = (item.assets ?? []).map(a => `- ${a.kind}: ${a.name} — ${a.url}`).join("\n") || "- (belum ada aset Drive yang ditautkan; pakai file di folder lokal)";
  const name = slug(item.title);
  return `# Guidebook video — ${item.title}

> Dibuat dari FORIOR Creator OS. Simpan file ini di folder proyek bersama footage dan foto, lalu minta Claude Code: "Ikuti guidebook ini dan buat videonya dengan Remotion."

## Proyek
- Akun: ${c.account} (${brand.name}, ${brand.handle})
- Campaign: ${c.name} · ${c.period} · tujuan: ${c.goal}
- Konten #${item.day}: **${item.title}** · format ${item.format} · pilar ${item.pillar || "-"}
${c.brief?.trim() ? `- Brief campaign: ${c.brief.trim()}\n` : ""}
## Brief
- Hook: ${item.hook || "-"}
- Pesan utama: ${item.message || "-"}
- Tujuan konten: ${item.goal || "-"}
- Arah visual: ${item.visualDirection || "-"}
- CTA: ${item.cta || "-"}

## Storyboard
| # | Durasi | Visual / arahan shot | Teks layar / narasi | Audio |
|---|---|---|---|---|
${rows || "| - | - | (storyboard belum ada) | - | - |"}

## Paket produksi
${item.production?.trim() || "(belum ada)"}

## Aset
Struktur folder yang diharapkan:
\`\`\`
./footage/   klip video (urut nama file = urutan scene, mis. 01-hook.mp4, 02-proses.mp4)
./photos/    foto (dipakai bila scene tidak punya klip)
./audio/     musik latar dan voice-over (opsional)
./guidebook.md
\`\`\`
Aset dari Google Drive yang ditautkan:
${assets}

## Instruksi untuk Claude Code
1. Buat proyek Remotion (TypeScript) bila belum ada, dengan komposisi \`${name}\`: 1080×1920, 30 fps, durasi total mengikuti kolom Durasi di storyboard.
2. Satu \`<Sequence>\` per baris storyboard. Pakai klip dari \`./footage\` sesuai urutan; bila tidak ada, pakai foto dari \`./photos\` dengan gerakan zoom/pan halus (Ken Burns).
3. Tampilkan "Teks layar / narasi" sebagai teks besar di sepertiga bawah: font sans-serif tebal, putih dengan bayangan lembut, maksimal 2 baris. Wordmark "FORIOR" kecil di kiri atas.
4. Bila ada voice-over di \`./audio\`, sinkronkan per scene; musik latar di volume rendah (≈ -18 dB) di bawah voice-over.
5. Subtitle: pakai file SRT di bawah sebagai sumber teks dan waktu.
6. Jangan ubah warna asli footage interior selain koreksi exposure ringan; jangan tambahkan objek yang tidak ada di properti.
7. Render ke \`./out/${name}.mp4\` (H.264, 1080×1920), lalu tampilkan pratinjau di Remotion Studio untuk dicek.

## Caption untuk posting
${item.caption || "-"}

${item.hashtags || ""}

## Subtitle (SRT)
\`\`\`srt
${toSrt(board).trim()}
\`\`\`
`;
}
