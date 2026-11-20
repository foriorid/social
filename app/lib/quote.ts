// Penawaran builder: the quotation as data, its totals, and the client page rendered from it.
// One renderer serves both the public link (/quote/<slug>/, app/quote/[slug]/route.ts) and the preview in Hub.
// Pure and dependency-free so node:test can run it. Layout follows the "mytepro" quotation, mobile first.

export type QItem = { id: string; name: string; tag?: string; desc?: string; qty?: number; unit?: string; price: number | null; image?: string; lines?: string[] };
export type QLayout = "cards" | "list" | "media";
export type QSection = { id: string; title: string; subtitle?: string; layout: QLayout; optional?: boolean; image?: string; items: QItem[] };
export type QRow = { id: string; name: string; note?: string; price: number | null };
export type QNote = { id: string; title: string; text: string };
export type BriefFile = { name: string; size: number; type: string };
export type BriefSummary = { points: string[]; questions: string[]; requests?: string[]; at: string; model: string };
export type Quote = {
  id: string; slug: string; status: "draft" | "sent"; lang: "id" | "en";
  number: string; date: string; validDays: number;
  badge: string; eyebrow: string; title: string; subtitle: string; cover?: string;
  client: { name: string; location: string; whatsapp?: string };
  notice?: string;
  sections: QSection[]; operational: QRow[]; notes: QNote[];
  terms: { dpPercent: number; production: string; delivery: string; revisions: string };
  footnote?: string;
  brief?: { chat?: string; files: BriefFile[]; summary?: BriefSummary };
  publishedAt?: string; updatedAt: string; createdAt: string;
};

export const SLUG = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
export const isSlug = (s: string) => SLUG.test(s) && !s.includes("--");
export const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63).replace(/-+$/, "");
export const rid = () => Math.random().toString(36).slice(2, 10);
export const idr = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");
const shortIdr = (n: number) => (n >= 1e6 ? `Rp ${(n / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt` : idr(n));
export { shortIdr };

export function newQuote(now = new Date()): Quote {
  const iso = now.toISOString();
  return {
    id: rid() + rid(), slug: "", status: "draft", lang: "id",
    number: `FOR/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${rid().slice(0, 3).toUpperCase()}`,
    date: iso.slice(0, 10), validDays: 14,
    badge: "Preliminary Quotation", eyebrow: "", title: "", subtitle: "",
    client: { name: "", location: "" },
    sections: [{ id: rid(), title: "Fotografi Interior", subtitle: "", layout: "cards", items: [{ id: rid(), name: "", qty: 8, unit: "foto", price: 0 }] }],
    operational: [], notes: [
      { id: rid(), title: "Foto resolusi tinggi", text: "Foto edit dikirim dalam JPG resolusi tinggi sesuai shotlist yang disetujui." },
      { id: rid(), title: "Area belum siap", text: "Area yang belum siap atau belum selesai bisa memerlukan jadwal shooting tambahan." }
    ],
    terms: { dpPercent: 50, production: "1 hari produksi", delivery: "7–10 hari kerja", revisions: "2 kali revisi" },
    updatedAt: iso, createdAt: iso
  };
}

/** Totals: optional sections (add-ons) and "to be confirmed" prices stay out of the grand total. */
export function totals(q: Pick<Quote, "sections" | "operational" | "terms">) {
  const sub = (s: QSection) => s.items.reduce((a, i) => a + (i.price ?? 0), 0);
  const sections = q.sections.map(s => ({ id: s.id, title: s.title, optional: !!s.optional, subtotal: sub(s) }));
  const services = sections.filter(s => !s.optional).reduce((a, s) => a + s.subtotal, 0);
  const operational = q.operational.reduce((a, r) => a + (r.price ?? 0), 0);
  const grand = services + operational;
  const dp = Math.round(grand * Math.min(100, Math.max(0, q.terms.dpPercent || 0)) / 100);
  return { sections, services, operational, grand, dp };
}

/** Headline numbers for the hero: one per (non-optional) section, summing quantities of its main unit. */
export function stats(q: Pick<Quote, "sections">): { value: number; unit: string; label: string }[] {
  return q.sections.filter(s => !s.optional).map(s => {
    const byUnit = new Map<string, number>();
    for (const i of s.items) if (i.qty && i.qty > 0) byUnit.set(i.unit || "", (byUnit.get(i.unit || "") ?? 0) + i.qty);
    const [unit, value] = [...byUnit.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
    return { value, unit, label: s.title };
  }).filter(s => s.value > 0).slice(0, 4);
}

/** What goes into the public <slug>.json: the brief (client documents, AI notes) never leaves Hub. */
export function publicSnapshot(q: Quote): Omit<Quote, "brief"> {
  const { brief: _brief, ...rest } = q;
  return rest;
}

// ---------- AI brief → draft ----------
export type BriefDraft = {
  points: string[]; questions: string[]; requests: string[]; client?: string; eyebrow?: string; title?: string; subtitle?: string; location?: string; notice?: string;
  sections: QSection[]; notes: QNote[]; operational: QRow[]; terms: Partial<Quote["terms"]>;
};
const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
/** Reads the model's JSON (tolerating ```json fences or text around it) into sections without prices. */
export function parseBrief(text: string): BriefDraft {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Jawaban AI tidak berisi data. Coba lagi.");
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(text.slice(start, end + 1)); } catch { throw new Error("Jawaban AI tidak bisa dibaca. Coba lagi."); }
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const layouts: QLayout[] = ["cards", "list", "media"];
  return {
    points: arr(raw.points).map(p => str(p, 240)).filter(Boolean).slice(0, 12),
    questions: arr(raw.questions).map(p => str(p, 240)).filter(Boolean).slice(0, 8),
    requests: arr(raw.requests).map(p => str(p, 240)).filter(Boolean).slice(0, 8),
    notice: str(raw.notice, 300) || undefined,
    notes: arr(raw.notes).slice(0, 8).map((n: Record<string, unknown>) => ({ id: rid(), title: str(n?.title, 80), text: str(n?.text, 300) })).filter(n => n.title || n.text),
    operational: arr(raw.operational).slice(0, 6).map((r: Record<string, unknown>) => ({ id: rid(), name: str(r?.name, 100), note: str(r?.note, 160) || undefined, price: null })).filter(r => r.name),
    terms: (() => { const t = (raw.terms ?? {}) as Record<string, unknown>; const out: Partial<Quote["terms"]> = {}; for (const k of ["production", "delivery", "revisions"] as const) if (str(t[k], 60)) out[k] = str(t[k], 60); return out; })(),
    client: str(raw.client, 80), eyebrow: str(raw.eyebrow, 80), title: str(raw.title, 120), subtitle: str(raw.subtitle, 240), location: str(raw.location, 120),
    sections: arr(raw.sections).slice(0, 8).map((s: Record<string, unknown>) => ({
      id: rid(), title: str(s?.title, 80) || "Seksi", subtitle: str(s?.subtitle, 160),
      layout: layouts.includes(s?.layout as QLayout) ? (s.layout as QLayout) : "cards",
      optional: s?.optional === true,
      items: arr(s?.items).slice(0, 12).map((i: Record<string, unknown>) => ({
        id: rid(), name: str(i?.name, 100) || "Item", tag: str(i?.tag, 12) || undefined, desc: str(i?.desc, 240) || undefined,
        qty: Number.isFinite(Number(i?.qty)) && Number(i?.qty) > 0 ? Math.round(Number(i.qty)) : undefined, unit: str(i?.unit, 20) || undefined,
        price: 0, lines: arr(i?.lines).map(l => str(l, 160)).filter(Boolean).slice(0, 8)
      }))
    }))
  };
}

// ---------- Client page ----------
const T = {
  id: { prepared: "Disiapkan untuk", location: "Lokasi project", quoteNo: "No.", valid: "Berlaku", days: "hari", subtotal: "Subtotal", optional: "Opsional", tbc: "Dikonfirmasi kemudian", notes: "Deliverables & Catatan", notesSub: "Yang Anda terima dan yang perlu diperhatikan", terms: "Ketentuan", termsSub: "Jadwal, revisi, dan pembayaran", confirm: "Konfirmasi", production: "Produksi", editing: "Editing & Revisi", delivery: "Pengiriman Final", dp: "DP saat konfirmasi", rest: "Sebelum file final dikirim", payment: "Pembayaran", validity: "Masa berlaku", ops: "Biaya Operasional", opsSub: "Estimasi biaya produksi", grand: "Grand total", services: "Subtotal jasa", opsLine: "Biaya operasional", ask: "Tanya via WhatsApp", pdf: "PDF", hello: "Halo FORIOR, saya ingin bertanya tentang penawaran", dpOf: "DP", photos: "foto", addons: "Opsi tambahan · belum termasuk total" },
  en: { prepared: "Prepared for", location: "Project location", quoteNo: "Quote No.", valid: "Valid", days: "days", subtotal: "Subtotal", optional: "Optional", tbc: "To be confirmed", notes: "Deliverables & Notes", notesSub: "What to expect and what may affect coverage", terms: "Commercial Terms", termsSub: "Timeline, revisions and payment", confirm: "Confirmation", production: "Production", editing: "Editing & Revisions", delivery: "Final Delivery", dp: "Down payment upon confirmation", rest: "Before final delivery", payment: "Payment terms", validity: "Quotation validity", ops: "Production & Operational Costs", opsSub: "Operational budget estimate", grand: "Grand total", services: "Service subtotal", opsLine: "Operational costs", ask: "Ask on WhatsApp", pdf: "PDF", hello: "Hello FORIOR, I have a question about quotation", dpOf: "DP", photos: "photos", addons: "Optional add-ons · not included" }
};
export const FORIOR_CONTACT = { website: "www.forior.id", wa: "6281542048268", phone: "0815 4204 8268" };
/** The one inline script on the client page; its hash goes into the page's CSP. */
export const PRINT_SCRIPT = "document.getElementById('qpdf').addEventListener('click',function(e){e.preventDefault();print()})";

const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const url = (v?: string) => (v && /^https:\/\/[^\s"'<>]+$/.test(v) ? v : "");
const ICON: Record<string, string> = {
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  pin: '<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  film: '<rect x="2" y="2" width="20" height="20" rx="2.5"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  hand: '<path d="M11 17l2 2a1.4 1.4 0 0 0 2-2"/><path d="M14 14l2.5 2.5a1.4 1.4 0 0 0 2-2L15 11l-3 3-2-2 4-4h3l4 4"/><path d="M2 12l4-4h3M2 12l6 6 1.5-1.5"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  down: '<path d="M12 3v12M6 11l6 6 6-6M4 21h16"/>'
};
const ic = (n: string, s = "") => `<svg class="i"${s ? ` style="${s}"` : ""} viewBox="0 0 24 24" aria-hidden="true">${ICON[n] ?? ""}</svg>`;
const ph = (src: string | undefined, alt: string, extra = "") => `<div class="ph">${url(src) ? `<img src="${esc(url(src))}" alt="${esc(alt)}" loading="lazy">` : ""}${extra}</div>`;

const CSS = `:root{--navy:#1d2c45;--navy-2:#2a3d5e;--purple:#7961a8;--ps:#efeaf7;--pi:#5f4a8b;--bg:#eef0f4;--card:#fff;--line:#e3e6ec;--muted:#667085;--ink:#1c2333;--gold:#c9a24a;--gs:#fbf4e2;--r:18px;--sh:0 10px 30px -12px rgba(24,37,58,.18)}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;font-family:"Plus Jakarta Sans",Arial,Helvetica,sans-serif;color:var(--ink);background:var(--bg);line-height:1.55}
img{display:block;max-width:100%}svg.i{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}
.doc{max-width:980px;margin:0 auto;padding:0 0 110px}.pad{padding:0 14px}
.ph{position:relative;overflow:hidden;background:linear-gradient(135deg,#2a3d5e,#7961a8)}.ph img{width:100%;height:100%;object-fit:cover}.ph::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 45%,rgba(16,24,40,.5));pointer-events:none}
.hero{position:relative;overflow:hidden;color:#fff;min-height:440px;display:flex;flex-direction:column;justify-content:space-between}.hero>.ph{position:absolute;inset:0}.hero>.ph::after{background:linear-gradient(160deg,rgba(29,44,69,.92),rgba(29,44,69,.7) 45%,rgba(121,97,168,.55))}
.hero-top,.hero-body{position:relative;z-index:2;padding:22px 18px}.hero-body{padding-bottom:58px}.hero-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
.brand{font-size:22px;font-weight:800;letter-spacing:5px}.brand small{display:block;font-size:9.5px;letter-spacing:1px;font-weight:500;opacity:.8;margin-top:2px}
.badge{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25);padding:6px 11px;border-radius:999px;font-size:10.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase}.badge i{width:7px;height:7px;border-radius:50%;background:var(--gold)}
.eyebrow{font-size:11.5px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#d9cff0}.hero h1{font-size:clamp(26px,6.5vw,40px);line-height:1.12;margin:8px 0 6px;font-weight:800}.hero p.sub{margin:0;font-size:14.5px;opacity:.9;max-width:560px}
.meta{display:flex;flex-wrap:wrap;gap:7px;margin-top:16px}.chip{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);padding:6px 10px;border-radius:10px;font-size:11.5px}.chip svg.i{width:14px;height:14px;opacity:.85}
.card{background:var(--card);border-radius:var(--r);box-shadow:var(--sh);padding:18px}.grid{display:grid;gap:12px}
.client{display:grid;gap:10px;margin-top:-34px;position:relative;z-index:3;padding:0 14px}.client .card{display:flex;gap:12px;align-items:center;padding:14px 16px}
.ico{width:40px;height:40px;border-radius:12px;background:var(--ps);color:var(--pi);display:grid;place-items:center;flex:none}.lbl{font-size:10.5px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.8px}.val{font-size:15px;font-weight:700;color:var(--navy)}
.stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}.stat{background:var(--card);border-radius:16px;padding:14px;box-shadow:var(--sh);position:relative;overflow:hidden}.stat::before{content:"";position:absolute;right:-18px;top:-18px;width:64px;height:64px;border-radius:50%;background:var(--ps)}.stat b{position:relative;display:block;font-size:25px;color:var(--navy);line-height:1}.stat b small{font-size:13px;font-weight:700}.stat span{position:relative;font-size:11.5px;color:var(--muted)}
.notice{display:flex;gap:10px;align-items:flex-start;background:var(--gs);border:1px solid #efdfb4;color:#6d5214;border-radius:14px;padding:13px 14px;font-size:13px;margin-top:16px}.notice svg.i{color:#a07a1d}
.sec-head{display:flex;align-items:center;gap:12px;margin:30px 0 12px}.sec-num{width:36px;height:36px;border-radius:12px;background:var(--navy);color:#fff;display:grid;place-items:center;font-weight:800;font-size:15px;flex:none}.sec-head h2{margin:0;font-size:18px;color:var(--navy);line-height:1.2}.sec-head p{margin:2px 0 0;font-size:12.5px;color:var(--muted)}.pill{display:inline-block;background:var(--ps);color:var(--pi);font-weight:700;padding:3px 9px;border-radius:999px;font-size:11px;vertical-align:middle;margin-left:6px}
.units{grid-template-columns:1fr}.unit{background:var(--card);border-radius:var(--r);overflow:hidden;box-shadow:var(--sh);display:flex}.unit .ph{width:42%;min-height:118px;flex:none}.tag{position:absolute;z-index:2;left:10px;top:10px;background:#fff;color:var(--navy);font-weight:800;font-size:12px;padding:5px 9px;border-radius:9px}
.unit .body{padding:12px 14px;display:flex;flex-direction:column;justify-content:center;gap:2px;flex:1;min-width:0}.unit .body b{font-size:14px;color:var(--navy)}.unit .body small{color:var(--muted);font-size:12px}.price{font-weight:800;color:var(--navy);white-space:nowrap}.tbc{display:inline-flex;font-size:11.5px;font-weight:700;color:#8a6400;background:var(--gs);padding:4px 9px;border-radius:999px;white-space:nowrap}
.subbar{display:flex;justify-content:space-between;align-items:center;gap:10px;background:var(--navy);color:#fff;border-radius:14px;padding:13px 16px;margin-top:12px;flex-wrap:wrap}.subbar span{font-size:12.5px;opacity:.85}.subbar b{font-size:17px}
.surr{display:grid;gap:12px}.surr>.ph{border-radius:var(--r);min-height:190px;box-shadow:var(--sh)}.cat{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px dashed var(--line)}.cat:last-child{border-bottom:0}.cat .t{flex:1;min-width:0}.cat .t b{display:block;font-size:13.5px;color:var(--navy)}.cat .t small{color:var(--muted);font-size:11.5px}.qty{font-weight:800;color:var(--pi);font-size:12.5px;white-space:nowrap;background:var(--ps);padding:5px 9px;border-radius:8px}
.media{grid-template-columns:1fr}.mcard{background:var(--card);border-radius:var(--r);overflow:hidden;box-shadow:var(--sh);display:flex;flex-direction:column}.mcard>.ph{aspect-ratio:16/10}.mcard .body{padding:15px;display:flex;flex-direction:column;gap:9px;flex:1}.mcard h3{margin:0;font-size:15.5px;color:var(--navy)}.mdesc{margin:0;font-size:12.5px;color:var(--muted)}
.scenes{background:#f8f7fc;border-radius:12px;padding:4px 12px}.scene{display:flex;gap:9px;align-items:flex-start;padding:8px 0;border-bottom:1px dashed var(--line);font-size:12.5px;color:#3b4456}.scene:last-child{border-bottom:0}.scene svg.i{width:16px;height:16px;color:var(--purple);margin-top:2px}
.foot{margin-top:auto;padding-top:11px;border-top:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:8px}.foot small{color:var(--muted);font-size:11.5px}
.opt{border:1.5px dashed #cdbfe6;box-shadow:none;background:#fbfafe}
.pts{margin:6px 0 0;padding-left:16px;font-size:12px;color:#3b4456;display:grid;gap:2px}.pts li::marker{color:var(--purple)}
.deliv{grid-template-columns:1fr}.dl{display:flex;gap:12px;background:var(--card);border-radius:16px;padding:14px;box-shadow:var(--sh)}.dl p{margin:0;font-size:12.5px;color:#3b4456}.dl b{display:block;font-size:13.5px;color:var(--navy);margin-bottom:2px}
.tl{display:grid;gap:14px;position:relative}.tl::before{content:"";position:absolute;left:23px;top:10px;bottom:10px;width:2px;background:repeating-linear-gradient(180deg,var(--purple) 0 6px,transparent 6px 12px)}.step{display:flex;gap:14px;align-items:center;position:relative}.step .ico{width:48px;height:48px;border-radius:50%;background:var(--navy);color:#fff;box-shadow:0 0 0 6px #fff}.step b{display:block;font-size:13px;color:var(--navy)}.step span{font-size:12px;color:var(--muted)}
.pay{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px}.pay div{border-radius:12px;padding:13px;color:#fff}.pay div:first-child{background:var(--purple)}.pay div:last-child{background:var(--navy)}.pay b{font-size:22px;display:block;line-height:1}.pay span{font-size:11.5px;opacity:.9}
.row{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--line);font-size:13px}.row:last-child{border-bottom:0}.row span:first-child{color:var(--muted)}.row span:last-child{font-weight:700;color:var(--navy);text-align:right}
.ops .row{align-items:center}.ops .row span:first-child{color:var(--ink);font-weight:700}.ops small{display:block;color:var(--muted);font-weight:500;font-size:11.5px}
.total{background:linear-gradient(135deg,var(--navy),var(--navy-2) 60%,#4a3f7a);color:#fff;border-radius:22px;padding:20px;box-shadow:var(--sh);margin-top:26px;position:relative;overflow:hidden}.total::after{content:"";position:absolute;right:-60px;top:-60px;width:200px;height:200px;border-radius:50%;border:30px solid rgba(255,255,255,.05)}
.total .line{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.14);font-size:13.5px;position:relative;z-index:1}.total .line span:first-child{opacity:.8}.total .grand{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-top:14px;flex-wrap:wrap;position:relative;z-index:1}.total .grand .lbl{color:#d9cff0}.total .grand b{font-size:clamp(24px,7vw,34px);line-height:1.1;display:block;text-align:right}.total .grand small{display:block;font-size:12.5px;color:var(--gold);font-weight:700;margin-top:4px;text-align:right}
.total .opts{position:relative;z-index:1;margin-top:14px;padding-top:12px;border-top:1px dashed rgba(255,255,255,.25)}.total .opts .lbl{color:#d9cff0;margin-bottom:2px}.total .opts .line{border-bottom:0;padding:5px 0;opacity:.9}
.footer{margin-top:26px;background:var(--card);border-radius:var(--r);box-shadow:var(--sh);padding:18px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}.footer .brand{color:var(--navy);font-size:19px}.footer .brand small{color:var(--muted)}.contacts{display:flex;gap:8px;flex-wrap:wrap}.contacts a{display:inline-flex;align-items:center;gap:7px;text-decoration:none;font-size:13px;font-weight:700;color:var(--navy);background:#f3f4f8;padding:9px 12px;border-radius:11px}.contacts svg.i{width:16px;height:16px}
.fine{font-size:11.5px;color:var(--muted);text-align:center;margin-top:14px}
.cta{position:fixed;left:0;right:0;bottom:0;z-index:20;padding:10px 14px calc(12px + env(safe-area-inset-bottom));background:linear-gradient(180deg,rgba(238,240,244,0),#eef0f4 35%);display:flex;gap:8px;justify-content:center}.cta a{display:inline-flex;align-items:center;justify-content:center;gap:7px;white-space:nowrap;text-decoration:none;font-weight:800;font-size:13.5px;padding:13px 16px;border-radius:14px;background:#fff;color:var(--navy);box-shadow:0 6px 16px -8px rgba(0,0,0,.3);flex:1;max-width:200px}.cta a.wa{background:#1f9d55;color:#fff;flex:2;max-width:320px}.cta svg.i{width:17px;height:17px}
@media(min-width:640px){.doc{padding:20px 16px 110px}.pad{padding:0}.hero{border-radius:24px;min-height:400px}.hero-top,.hero-body{padding:24px 26px}.hero-body{padding-bottom:64px}.client{grid-template-columns:1fr 1fr}.stats{grid-template-columns:repeat(4,1fr)}.units{grid-template-columns:repeat(2,1fr)}.unit{flex-direction:column}.unit .ph{width:auto;aspect-ratio:4/3;min-height:0}.unit .body{flex-direction:row;justify-content:space-between;align-items:center;flex-wrap:wrap}.media{grid-template-columns:1fr 1fr}.deliv{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}.surr{grid-template-columns:1.05fr 1fr}.surr>.ph{min-height:260px}.terms{grid-template-columns:1fr 1fr}
.tl{grid-template-columns:repeat(4,1fr);gap:0}.tl::before{left:12.5%;right:12.5%;top:23px;bottom:auto;width:auto;height:2px;background:repeating-linear-gradient(90deg,var(--purple) 0 6px,transparent 6px 12px)}.step{flex-direction:column;text-align:center;padding:0 6px}}
@media(min-width:900px){.units{grid-template-columns:repeat(3,1fr)}}
@media print{body{background:#fff}.doc{max-width:none;padding:0}.cta{display:none}.card,.unit,.mcard,.stat,.dl,.footer{box-shadow:none;border:1px solid var(--line)}.hero,.total,.subbar,.pay div,.sec-num,.step .ico{-webkit-print-color-adjust:exact;print-color-adjust:exact}.unit,.mcard,.card,.total{break-inside:avoid}}`;

const bullets = (all?: string[]) => { const lines = all?.filter(l => l.trim()); return lines?.length ? `<ul class="pts">${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul>` : ""; };
function sectionHtml(s: QSection, letter: string, t: typeof T.id): string {
  const sub = s.items.reduce((a, i) => a + (i.price ?? 0), 0);
  const qty = (i: QItem) => (i.qty ? `${i.qty} ${esc(i.unit || "")}`.trim() : "");
  const priceOf = (p: number | null) => (p === null ? `<span class="tbc">${t.tbc}</span>` : p > 0 ? `<span class="price">${idr(p)}</span>` : "");
  const totalQty = s.items.reduce((a, i) => a + (i.qty || 0), 0);
  const unit = s.items.find(i => i.unit)?.unit ?? "";
  const head = `<div class="sec-head"><div class="sec-num">${esc(letter)}</div><div><h2>${esc(s.title)}${s.optional ? `<span class="pill">${t.optional}</span>` : ""}</h2>${s.subtitle ? `<p>${esc(s.subtitle)}</p>` : ""}</div></div>`;
  let body = "";
  if (s.layout === "list") {
    body = `<div class="surr">${url(s.image) || url(s.items[0]?.image) ? ph(s.image || s.items[0]?.image, s.title) : ""}<div class="card">${s.items.map(i => `<div class="cat"><div class="ico">${ic(i.unit && /video|menit|min/i.test(i.unit) ? "film" : "camera")}</div><div class="t"><b>${esc(i.name)}</b>${i.desc ? `<small>${esc(i.desc)}</small>` : ""}${bullets(i.lines)}</div>${qty(i) ? `<span class="qty">${qty(i)}</span>` : ""}${i.price ? `&nbsp;${priceOf(i.price)}` : i.price === null ? `&nbsp;${priceOf(null)}` : ""}</div>`).join("")}</div></div>`;
  } else if (s.layout === "media") {
    body = `<div class="grid media">${s.items.map(i => `<div class="mcard${s.optional ? " opt" : ""}">${url(i.image) ? ph(i.image, i.name, i.tag ? `<span class="tag">${esc(i.tag)}</span>` : "") : ""}<div class="body"><h3>${esc(i.name)}</h3>${i.desc ? `<p class="mdesc">${esc(i.desc)}</p>` : ""}${i.lines?.some(l => l.trim()) ? `<div class="scenes">${i.lines.filter(l => l.trim()).map(l => `<div class="scene">${ic("check")}<span>${esc(l)}</span></div>`).join("")}</div>` : ""}<div class="foot"><small>${qty(i)}</small>${priceOf(i.price)}</div></div></div>`).join("")}</div>`;
  } else {
    body = `<div class="grid units">${s.items.map(i => `<div class="unit">${ph(i.image, i.name, i.tag ? `<span class="tag">${esc(i.tag)}</span>` : "")}<div class="body"><div><b>${esc(i.name)}</b>${i.desc || qty(i) ? `<small style="display:block">${esc(i.desc || "")}${i.desc && qty(i) ? " · " : ""}${qty(i)}</small>` : ""}${bullets(i.lines)}</div>${priceOf(i.price)}</div></div>`).join("")}</div>`;
  }
  const bar = sub > 0 && s.items.length > 1 ? `<div class="subbar"><span>${t.subtotal} ${esc(letter)}${totalQty ? ` — ${totalQty} ${esc(unit)}` : ""}</span><b>${idr(sub)}</b></div>` : "";
  return head + body + bar;
}

/** The full client page. preview=true: no tracking hints and no script (used inside Hub's sandboxed iframe). */
export function renderQuoteHtml(q: Omit<Quote, "brief">, opts: { pageUrl?: string; preview?: boolean } = {}): string {
  const t = T[q.lang] ?? T.id;
  const tot = totals(q), st = stats(q);
  const letters = "ABCDEFGHIJ";
  const main = q.sections.filter(s => !s.optional), extra = q.sections.filter(s => s.optional);
  const letterOf = new Map(main.map((s, i) => [s.id, letters[i] ?? "•"]));
  const opsLetter = letters[main.length] ?? "•";
  const title = [q.eyebrow, q.title].filter(Boolean).join(" — ") || "Quotation";
  const desc = `${t.prepared} ${q.client.name || "—"} · FORIOR`;
  const waText = encodeURIComponent(`${t.hello} ${q.title}${q.number ? ` (${q.number})` : ""}${opts.pageUrl ? `: ${opts.pageUrl}` : ""}`);
  const date = q.date ? new Date(q.date + "T00:00:00").toLocaleDateString(q.lang === "en" ? "en-GB" : "id-ID", { day: "numeric", month: "long", year: "numeric" }) : "";
  const cover = url(q.cover) || url(q.sections.flatMap(s => s.items).find(i => url(i.image))?.image);
  return `<!doctype html><html lang="${q.lang === "en" ? "en" : "id"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(`FORIOR — ${title}`)}</title><meta name="robots" content="noindex,nofollow"><meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">${cover ? `<meta property="og:image" content="${esc(cover)}">` : ""}${opts.pageUrl ? `<meta property="og:url" content="${esc(opts.pageUrl)}">` : ""}<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body><main class="doc">
<section class="hero">${ph(cover, "")}<div class="hero-top"><div class="brand">FORIOR<small>Interior • Architecture • Property Photography &amp; Video</small></div>${q.badge ? `<span class="badge"><i></i>${esc(q.badge)}</span>` : ""}</div>
<div class="hero-body">${q.eyebrow ? `<div class="eyebrow">${esc(q.eyebrow)}</div>` : ""}<h1>${esc(q.title || "Quotation")}</h1>${q.subtitle ? `<p class="sub">${esc(q.subtitle)}</p>` : ""}
<div class="meta">${q.number ? `<span class="chip">${ic("doc")}${t.quoteNo} <b>${esc(q.number)}</b></span>` : ""}${date ? `<span class="chip">${ic("cal")}${esc(date)}</span>` : ""}${q.validDays ? `<span class="chip">${ic("clock")}${t.valid} ${q.validDays} ${t.days}</span>` : ""}</div></div></section>
<div class="client"><div class="card"><div class="ico">${ic("user")}</div><div><div class="lbl">${t.prepared}</div><div class="val">${esc(q.client.name || "—")}</div></div></div>${q.client.location ? `<div class="card"><div class="ico">${ic("pin")}</div><div><div class="lbl">${t.location}</div><div class="val">${esc(q.client.location)}</div></div></div>` : ""}</div>
<div class="pad">
${st.length ? `<div class="stats">${st.map(s => `<div class="stat"><b>${s.value}${s.unit ? ` <small>${esc(s.unit)}</small>` : ""}</b><span>${esc(s.label)}</span></div>`).join("")}</div>` : ""}
${q.notice ? `<div class="notice">${ic("info")}<div>${esc(q.notice)}</div></div>` : ""}
${main.map(s => sectionHtml(s, letterOf.get(s.id) ?? "•", t)).join("")}
${extra.map(s => sectionHtml(s, "+", t)).join("")}
${q.notes.length ? `<div class="sec-head"><div class="sec-num">${ic("send", "width:18px;height:18px")}</div><div><h2>${t.notes}</h2><p>${t.notesSub}</p></div></div><div class="grid deliv">${q.notes.map(n => `<div class="dl"><div class="ico">${ic("check")}</div><div><b>${esc(n.title)}</b><p>${esc(n.text)}</p></div></div>`).join("")}</div>` : ""}
<div class="sec-head"><div class="sec-num">${ic("hand", "width:18px;height:18px")}</div><div><h2>${t.terms}</h2><p>${t.termsSub}</p></div></div>
<div class="card"><div class="tl"><div class="step"><div class="ico">${ic("hand")}</div><div><b>${t.confirm}</b><span>${t.dpOf} ${q.terms.dpPercent}%</span></div></div><div class="step"><div class="ico">${ic("camera")}</div><div><b>${t.production}</b><span>${esc(q.terms.production)}</span></div></div><div class="step"><div class="ico">${ic("edit")}</div><div><b>${t.editing}</b><span>${esc(q.terms.revisions)}</span></div></div><div class="step"><div class="ico">${ic("send")}</div><div><b>${t.delivery}</b><span>${esc(q.terms.delivery)}</span></div></div></div></div>
<div class="grid terms" style="margin-top:12px"><div class="card"><div class="lbl" style="margin-bottom:8px">${t.payment}</div><div class="pay"><div><b>${q.terms.dpPercent}%</b><span>${t.dp}</span></div><div><b>${100 - q.terms.dpPercent}%</b><span>${t.rest}</span></div></div></div>
<div class="card"><div class="row"><span>${t.production}</span><span>${esc(q.terms.production)}</span></div><div class="row"><span>${t.delivery}</span><span>${esc(q.terms.delivery)}</span></div><div class="row"><span>${t.editing}</span><span>${esc(q.terms.revisions)}</span></div><div class="row"><span>${t.validity}</span><span>${q.validDays} ${t.days}</span></div></div></div>
${q.operational.length ? `<div class="sec-head"><div class="sec-num">${esc(opsLetter)}</div><div><h2>${t.ops}</h2><p>${t.opsSub}</p></div></div><div class="card ops">${q.operational.map(r => `<div class="row"><span>${esc(r.name)}${r.note ? `<small>${esc(r.note)}</small>` : ""}</span><span>${r.price === null ? `<span class="tbc">${t.tbc}</span>` : idr(r.price)}</span></div>`).join("")}</div>` : ""}
<div class="total">${tot.sections.filter(s => !s.optional).map(s => `<div class="line"><span>${esc(s.title)} (${letterOf.get(s.id)})</span><span>${idr(s.subtotal)}</span></div>`).join("")}
${q.operational.length ? `<div class="line"><span><b>${t.services}</b></span><span><b>${idr(tot.services)}</b></span></div><div class="line"><span>${t.opsLine} (${opsLetter})</span><span>${idr(tot.operational)}</span></div>` : ""}
<div class="grand"><div class="lbl">${t.grand}</div><div><b>${idr(tot.grand)}</b>${q.terms.dpPercent > 0 && q.terms.dpPercent < 100 ? `<small>${t.dpOf} ${q.terms.dpPercent}% · ${idr(tot.dp)}</small>` : ""}</div></div>
${tot.sections.some(s => s.optional && s.subtotal > 0) ? `<div class="opts"><div class="lbl">${t.addons}</div>${tot.sections.filter(s => s.optional && s.subtotal > 0).map(s => `<div class="line"><span>+ ${esc(s.title)}</span><span>${idr(s.subtotal)}</span></div>`).join("")}</div>` : ""}</div>
<footer class="footer"><div class="brand">FORIOR<small>Property Photography &amp; Video Services</small></div><div class="contacts"><a href="https://${FORIOR_CONTACT.website}" target="_blank" rel="noopener">${ic("globe")}${FORIOR_CONTACT.website}</a><a href="https://wa.me/${FORIOR_CONTACT.wa}" target="_blank" rel="noopener">${ic("phone")}${FORIOR_CONTACT.phone}</a></div></footer>
${q.footnote ? `<p class="fine">${esc(q.footnote)}</p>` : ""}
</div></main>
<nav class="cta"><a id="qpdf" href="#">${ic("down")}${t.pdf}</a><a class="wa" href="https://wa.me/${FORIOR_CONTACT.wa}?text=${waText}" target="_blank" rel="noopener">${ic("phone")}${t.ask}</a></nav>
${opts.preview ? "" : `<script>${PRINT_SCRIPT}</script>`}
</body></html>`;
}
