// FORIOR pricelist (Corp Pricelist 2026) as data, and how a picked package becomes quotation sections.
// Pure so node:test can run it. Prices are copied into the quotation when a package is added, so editing
// the pricelist later never changes a quotation that was already sent.
import type { QRow, QSection } from "./quote";

const rid = () => Math.random().toString(36).slice(2, 10); // same as quote.ts; kept local so this module has no runtime imports

export type PriceCat = "Foto" | "Video" | "Drone" | "360";
export type PriceAddon = { id: string; name: string; price: number };
export type PricePackage = {
  id: string; cat: PriceCat; name: string; price: number;
  /** What one unit of this package is, e.g. "unit" (a room/unit), "video", "lokasi". */
  per: string;
  /** Headline quantity of one unit, e.g. 15 edited photos, for the client page's numbers. */
  qty?: number; qtyUnit?: string;
  includes: string[];
  /** Who it suits, e.g. "2–3BR". */
  fit?: string;
  addons?: PriceAddon[];
};

export const CAT_LABEL: Record<PriceCat, string> = { Foto: "Foto Interior", Video: "Video", Drone: "Drone", "360": "Virtual Tour 360" };

export const DEFAULT_PRICELIST: PricePackage[] = [
  { id: "basic", cat: "Foto", name: "Basic", price: 1_500_000, per: "unit", qty: 10, qtyUnit: "foto", fit: "Studio – 1BR", includes: ["10 foto edit", "5 foto original (tanpa edit)", "Maks. 1 jam pemotretan", "Hasil dikirim dalam 5 hari"] },
  { id: "pro", cat: "Foto", name: "Pro", price: 2_500_000, per: "unit", qty: 15, qtyUnit: "foto", fit: "2 – 3BR", includes: ["15 foto edit", "5 foto original (tanpa edit)", "Maks. 2 jam pemotretan", "Hasil dikirim dalam 5 hari"] },
  { id: "max", cat: "Foto", name: "Max", price: 3_500_000, per: "unit", qty: 25, qtyUnit: "foto", fit: "3 – 4BR", includes: ["25 foto edit", "5 foto original (tanpa edit)", "Maks. 3 jam pemotretan", "Hasil dikirim dalam 5 hari"] },
  { id: "ultra", cat: "Foto", name: "Ultra", price: 4_500_000, per: "unit", qty: 40, qtyUnit: "foto", fit: "4BR+", includes: ["40 foto edit", "5 foto original (tanpa edit)", "Maks. 4 jam pemotretan", "Hasil dikirim dalam 5 hari"] },
  { id: "cinematic", cat: "Video", name: "Cinematic Video", price: 3_500_000, per: "video", qty: 1, qtyUnit: "video", includes: ["Video cinematic 2 menit", "Maks. 3 jam produksi", "Termasuk editing, 2× revisi minor", "File dikirim dalam 7 hari"], addons: [{ id: "drone-video", name: "Drone Video", price: 2_000_000 }] },
  { id: "drone", cat: "Drone", name: "Drone Photo & Video", price: 3_500_000, per: "lokasi", qty: 15, qtyUnit: "foto", includes: ["15 foto drone edit", "Video drone 3 menit", "3 jam produksi", "File dikirim dalam 7 hari"] },
  { id: "tour360", cat: "360", name: "Virtual Tour 360", price: 3_000_000, per: "unit", qty: 10, qtyUnit: "POV", fit: "1 – 2BR", includes: ["Kamera 360 otomatis", "Maks. 10 titik POV", "Online, web based (HTML / embed)", "Tampilan dasar desktop & mobile"] }
];

export type PickedPackage = { id: string; qty: number; addons?: string[] };

/** One quotation section per picked package: one priced row per unit (named later), add-ons as their own rows. */
export function packageSections(picked: PickedPackage[], list: PricePackage[]): QSection[] {
  return picked.flatMap(p => {
    const pkg = list.find(x => x.id === p.id);
    if (!pkg) return [];
    const n = Math.max(1, Math.min(50, Math.round(p.qty) || 1));
    const rows = Array.from({ length: n }, (_, k) => ({
      id: rid(), name: n > 1 ? `${pkg.per === "unit" ? "Unit" : pkg.per[0].toUpperCase() + pkg.per.slice(1)} ${k + 1}` : pkg.name,
      qty: pkg.qty, unit: pkg.qtyUnit, price: pkg.price, list: pkg.price
    }));
    const addons = (pkg.addons ?? []).filter(a => p.addons?.includes(a.id)).map(a => ({ id: rid(), name: `Add-on: ${a.name}`, price: a.price, list: a.price }));
    return [{
      id: rid(), title: pkg.cat === "Foto" ? `${CAT_LABEL.Foto} · ${pkg.name}` : pkg.name,
      subtitle: [n > 1 ? `${n} ${pkg.per}` : "", pkg.fit ? `cocok untuk ${pkg.fit}` : ""].filter(Boolean).join(" · "),
      layout: "list" as const, pricing: "item" as const, includes: pkg.includes, items: [...rows, ...addons], fromPricelist: pkg.id
    }];
  });
}

/** Transport is included only within Jakarta; anywhere else gets an operational line to fill in. */
export const needsTransport = (location: string) => !!location.trim() && !/jakarta/i.test(location);
export function withTransport(operational: QRow[], location: string): QRow[] {
  if (!needsTransport(location) || operational.some(r => /transport/i.test(r.name))) return operational;
  return [...operational, { id: rid(), name: "Transport luar kota", note: location.trim().slice(0, 100), price: null }];
}

/** Compact pricelist for the AI brief prompt. */
export const pricelistForPrompt = (list: PricePackage[]) =>
  list.map(p => `- id "${p.id}": ${p.name} (${CAT_LABEL[p.cat]}), Rp ${p.price.toLocaleString("id-ID")} per ${p.per}${p.fit ? `, cocok ${p.fit}` : ""}: ${p.includes.join("; ")}${p.addons?.length ? `. Add-on: ${p.addons.map(a => `id "${a.id}" ${a.name} Rp ${a.price.toLocaleString("id-ID")}`).join(", ")}` : ""}`).join("\n");

/** Reads the model's "packages" list, keeping only real package and add-on ids. */
export function parsePackages(raw: unknown, list: PricePackage[]): (PickedPackage & { note?: string })[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 8).flatMap((r: Record<string, unknown>) => {
    const pkg = list.find(p => p.id === r?.id);
    if (!pkg) return [];
    const qty = Math.max(1, Math.min(50, Math.round(Number(r.qty)) || 1));
    const addons = Array.isArray(r.addons) ? r.addons.filter(a => pkg.addons?.some(x => x.id === a)).map(String) : [];
    return [{ id: pkg.id, qty, addons, note: typeof r.note === "string" ? r.note.trim().slice(0, 160) : undefined }];
  });
}

/** One line per pick, e.g. "Pro × 3; Cinematic Video + Drone Video": stored as the approval title and read back with parseChoice. */
export function choiceTitle(picks: PickedPackage[], list: PricePackage[]): string {
  return picks.flatMap(p => {
    const pkg = list.find(x => x.id === p.id);
    if (!pkg) return [];
    const adds = (pkg.addons ?? []).filter(a => p.addons?.includes(a.id)).map(a => a.name);
    return [`${pkg.name}${p.qty > 1 ? ` × ${p.qty}` : ""}${adds.length ? ` + ${adds.join(", ")}` : ""}`];
  }).join("; ");
}
export function parseChoice(title: string, list: PricePackage[]): PickedPackage[] {
  return title.split("; ").flatMap(part => {
    const m = /^(.*?)(?: × (\d+))?(?: \+ (.*))?$/.exec(part.trim());
    const pkg = m && list.find(x => x.name === m[1]);
    if (!pkg) return [];
    const names = m[3] ? m[3].split(", ") : [];
    return [{ id: pkg.id, qty: Math.max(1, Number(m[2]) || 1), addons: (pkg.addons ?? []).filter(a => names.includes(a.name)).map(a => a.id) }];
  });
}
export const choiceTotal = (picks: PickedPackage[], list: PricePackage[]) => picks.reduce((s, p) => {
  const pkg = list.find(x => x.id === p.id);
  return pkg ? s + pkg.price * p.qty + (pkg.addons ?? []).filter(a => p.addons?.includes(a.id)).reduce((t, a) => t + a.price, 0) : s;
}, 0);
