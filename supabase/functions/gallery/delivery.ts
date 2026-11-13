// Photo Delivery rules, shared by the admin page (browser) and the public client API (Edge Function).
// Ported from the FORIOR Workspace delivery module; the gallery shape is kept identical so data can move over as-is.
// Dependency-free on purpose: imported by Next.js, Deno and node:test.

export const PHASES = ["Preview", "Client Selection", "Editing Progress", "Client Review", "Revision", "Done"] as const;
export type Phase = (typeof PHASES)[number];
export const PHASE_SHORT: Record<Phase, string> = { Preview: "Preview", "Client Selection": "Pemilihan", "Editing Progress": "Editing", "Client Review": "Review", Revision: "Revisi", Done: "Selesai" };
export const PHASE_LABEL: Record<Phase, string> = {
  Preview: "Preview — Persiapan",
  "Client Selection": "Client Selection — Klien memilih foto",
  "Editing Progress": "Editing Progress — Sedang diedit",
  "Client Review": "Client Review — Klien me-review hasil",
  Revision: "Revision — Mengerjakan revisi",
  Done: "Done — Selesai & terkirim"
};
/** Extra edit-photo quota the client can take now and pay for at the end. */
export const ADDON_PACKAGES = [{ photos: 5, price: 500000 }, { photos: 10, price: 750000 }, { photos: 20, price: 1500000 }, { photos: 30, price: 2200000 }, { photos: 40, price: 3000000 }];

export type Photo = { id: string; name: string; section: string | null; thumbnailUrl: string; url: string; selected?: boolean; rawSelected?: boolean; note?: string };
export type Revision = { id: string; text: string; photoNotes: { name: string; note: string }[]; status: "Open" | "Resolved"; createdAt: string };
export type Addon = { id: string; photos: number | null; price: number | null; custom?: boolean; at: string };
export type Gallery = {
  id: string; slug: string; title: string; projectName?: string;
  client: { company?: string; contact?: string; whatsapp?: string; email?: string };
  phase: Phase; selectionLimit: number; rawSelectionLimit: number;
  previewFolderUrl: string; previewPhotos: Photo[]; previewSubmittedAt: string | null; rawSubmittedAt: string | null;
  draftFolderUrl: string; draftPhotos: Photo[]; draftApprovedAt: string | null;
  revisionFolderUrl: string; revisionPhotos: Photo[]; revisions: Revision[];
  finalFolderUrl: string; finalPhotos: Photo[];
  selectByDate: string; feedbackByDate: string; downloadExpiry: string;
  quotaAddons?: Addon[]; notes?: string; createdAt: string; importedFrom?: string; importedAt?: string;
};
export type FolderType = "preview" | "draft" | "revision" | "final";

export const daysFromNow = (n: number, now = new Date()) => new Date(now.getTime() + n * 864e5).toISOString().slice(0, 10);
export const driveThumb = (id: string, size: number) => `https://drive.google.com/thumbnail?id=${id}&sz=w${size}`;

export function slugify(text: string): string {
  return String(text || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "galeri";
}

/** Appends -2, -3, … until the slug is not taken. */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export function newGallery(input: { id: string; slug: string; title: string; projectName?: string; client?: Gallery["client"]; selectionLimit?: number; rawSelectionLimit?: number; previewFolderUrl?: string; notes?: string }, now = new Date()): Gallery {
  return {
    id: input.id, slug: input.slug, title: input.title || "Photo Delivery", projectName: input.projectName ?? "",
    client: input.client ?? {}, phase: "Preview",
    selectionLimit: Math.max(0, Number(input.selectionLimit) || 0), rawSelectionLimit: Math.max(0, Number(input.rawSelectionLimit) || 0),
    previewFolderUrl: input.previewFolderUrl ?? "", previewPhotos: [], previewSubmittedAt: null, rawSubmittedAt: null,
    draftFolderUrl: "", draftPhotos: [], draftApprovedAt: null, revisionFolderUrl: "", revisionPhotos: [], revisions: [],
    finalFolderUrl: "", finalPhotos: [],
    selectByDate: daysFromNow(7, now), feedbackByDate: daysFromNow(14, now), downloadExpiry: daysFromNow(30, now),
    quotaAddons: [], notes: input.notes ?? "", createdAt: now.toISOString()
  };
}

/** Turns Drive files into gallery photos, keeping the client's picks and notes across folder reloads. */
export function photosFrom(files: { id: string; name?: string; section?: string | null }[], prior: Photo[] = []): Photo[] {
  const old = new Map(prior.map(p => [p.id, p]));
  return files.map((f, i) => ({
    id: f.id, name: f.name || `Photo ${String(i + 1).padStart(2, "0")}`, section: f.section || null,
    thumbnailUrl: driveThumb(f.id, 400), url: driveThumb(f.id, 1600),
    selected: old.get(f.id)?.selected || false, rawSelected: old.get(f.id)?.rawSelected || false, note: old.get(f.id)?.note || ""
  }));
}

export function withFolder(g: Gallery, type: FolderType, folderUrl: string, files: { id: string; name?: string; section?: string | null }[]): Gallery {
  if (type === "preview") return { ...g, previewFolderUrl: folderUrl, previewPhotos: photosFrom(files, g.previewPhotos) };
  if (type === "draft") return { ...g, draftFolderUrl: folderUrl, draftPhotos: photosFrom(files) };
  if (type === "final") return { ...g, finalFolderUrl: folderUrl, finalPhotos: photosFrom(files) };
  return { ...g, revisionFolderUrl: folderUrl, revisionPhotos: photosFrom(files) };
}

/** Admin moves the gallery through the workflow. Going back to Preview reopens the client's selection (picks are kept). */
export function setPhase(g: Gallery, phase: string): Gallery {
  const next = (PHASES as readonly string[]).includes(phase) ? (phase as Phase) : "Preview";
  return next === "Preview" ? { ...g, phase: next, previewSubmittedAt: null, rawSubmittedAt: null } : { ...g, phase: next };
}

export function groupBySection(photos: Photo[] = []): { section: string | null; items: Photo[] }[] {
  const groups: { section: string | null; items: Photo[] }[] = [];
  for (const p of photos) {
    const key = p.section || null;
    const last = groups.find(x => x.section === key);
    if (last) last.items.push(p); else groups.push({ section: key, items: [p] });
  }
  return groups;
}

/** What the public link may see: everything except internal notes. */
export const forClient = (g: Gallery) => { const { notes: _notes, ...rest } = g; return rest; };

export type ClientAction =
  | { action: "photo"; photoId: string; selected?: boolean; rawSelected?: boolean; note?: string }
  | { action: "draft-note" | "revision-note"; photoId: string; note: string }
  | { action: "addon"; photos?: number; custom?: boolean }
  | { action: "submit" | "submit-raw" | "approve" }
  | { action: "revision"; text?: string };

export class DeliveryError extends Error { code: string; constructor(code: string, message: string) { super(message); this.code = code; } }

/** Applies one action from the client's gallery page. Throws DeliveryError when the rules forbid it. */
export function applyClientAction(g: Gallery, a: ClientAction, makeId: () => string, now = new Date()): Gallery {
  const at = now.toISOString();
  switch (a.action) {
    case "photo": {
      const rawOp = a.rawSelected !== undefined;
      if (rawOp ? g.rawSubmittedAt : g.previewSubmittedAt) throw new DeliveryError("locked", rawOp ? "Pilihan RAW sudah dikirim." : "Pilihan sudah dikirim.");
      const photo = g.previewPhotos.find(p => p.id === a.photoId);
      if (!photo) throw new DeliveryError("not_found", "Foto tidak ditemukan.");
      const limit = Number(g.selectionLimit) || 0, rawLimit = Number(g.rawSelectionLimit) || 0;
      if (a.selected === true && limit > 0 && !photo.selected && g.previewPhotos.filter(p => p.selected).length >= limit) throw new DeliveryError("limit", `Batas paket tercapai. Maksimal ${limit} foto.`);
      if (a.rawSelected === true && rawLimit > 0 && !photo.rawSelected && g.previewPhotos.filter(p => p.rawSelected).length >= rawLimit) throw new DeliveryError("raw_limit", `Batas RAW tercapai. Maksimal ${rawLimit} foto.`);
      const patch: Partial<Photo> = {};
      // Edit and RAW picks are mutually exclusive.
      if (a.selected !== undefined) { patch.selected = !!a.selected; if (a.selected) patch.rawSelected = false; }
      if (a.rawSelected !== undefined) { patch.rawSelected = !!a.rawSelected; if (a.rawSelected) patch.selected = false; }
      if (a.note !== undefined) patch.note = String(a.note).slice(0, 1000);
      return { ...g, previewPhotos: g.previewPhotos.map(p => (p.id === a.photoId ? { ...p, ...patch } : p)) };
    }
    case "draft-note":
    case "revision-note": {
      if (g.draftApprovedAt) throw new DeliveryError("locked", "Sudah disetujui.");
      const key = a.action === "draft-note" ? "draftPhotos" : "revisionPhotos";
      return { ...g, [key]: g[key].map(p => (p.id === a.photoId ? { ...p, note: String(a.note).slice(0, 1000) } : p)) };
    }
    case "addon": {
      if (g.previewSubmittedAt) throw new DeliveryError("locked", "Pilihan sudah dikirim.");
      if (a.custom) return { ...g, selectionLimit: 0, quotaAddons: [...(g.quotaAddons ?? []), { id: makeId(), custom: true, photos: null, price: null, at }] };
      const pkg = ADDON_PACKAGES.find(p => p.photos === Number(a.photos));
      if (!pkg) throw new DeliveryError("input", "Paket tidak valid.");
      return { ...g, selectionLimit: (Number(g.selectionLimit) || 0) + pkg.photos, quotaAddons: [...(g.quotaAddons ?? []), { id: makeId(), photos: pkg.photos, price: pkg.price, at }] };
    }
    case "submit":
      // With a RAW quota the client stays in Preview for the RAW step; otherwise selection is done.
      return (Number(g.rawSelectionLimit) || 0) > 0 ? { ...g, previewSubmittedAt: at } : { ...g, previewSubmittedAt: at, phase: "Client Selection" };
    case "submit-raw":
      if (!g.previewSubmittedAt) throw new DeliveryError("order", "Pilih foto Edit dulu.");
      return { ...g, rawSubmittedAt: at, phase: "Client Selection" };
    case "approve":
      return { ...g, draftApprovedAt: at, phase: "Done" };
    case "revision": {
      const photoNotes = [...g.draftPhotos, ...g.revisionPhotos].filter(p => p.note).map(p => ({ name: p.name, note: p.note! }));
      const rev: Revision = { id: makeId(), text: String(a.text ?? "").slice(0, 4000), photoNotes, status: "Open", createdAt: at };
      return { ...g, revisions: [...g.revisions, rev], draftApprovedAt: null, phase: "Revision" };
    }
    default:
      throw new DeliveryError("input", "Aksi tidak dikenal.");
  }
}

/** Turns a gallery document from the Workspace app (MongoDB) into this app's shape; missing fields get defaults. */
export function fromWorkspace(doc: Record<string, unknown>, slug: string, now = new Date()): Gallery {
  const base = newGallery({ id: String(doc.id ?? ""), slug, title: String(doc.title ?? "Photo Delivery") }, now);
  const { _id: _ignored, ...rest } = doc as Record<string, unknown> & { _id?: unknown };
  const merged = { ...base, ...(rest as Partial<Gallery>), slug };
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    ...merged,
    phase: (PHASES as readonly string[]).includes(merged.phase) ? merged.phase : "Preview",
    client: merged.client && typeof merged.client === "object" ? merged.client : {},
    selectionLimit: Number(merged.selectionLimit) || 0, rawSelectionLimit: Number(merged.rawSelectionLimit) || 0,
    previewPhotos: arr<Photo>(merged.previewPhotos), draftPhotos: arr<Photo>(merged.draftPhotos), revisionPhotos: arr<Photo>(merged.revisionPhotos),
    finalPhotos: arr<Photo>(merged.finalPhotos), revisions: arr<Revision>(merged.revisions), quotaAddons: arr<Addon>(merged.quotaAddons)
  };
}
