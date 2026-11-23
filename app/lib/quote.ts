// Penawaran builder: the quotation as data, its totals, and the client page rendered from it.
// One renderer serves both the public link (/quote/<slug>/, app/quote/[slug]/route.ts) and the preview in Hub.
// Pure and dependency-free so node:test can run it. Layout follows the "mytepro" quotation, mobile first.

export type QItem = { id: string; name: string; tag?: string; desc?: string; qty?: number; unit?: string; price: number | null; image?: string; lines?: string[];
  /** Pricelist price when the row came from a package; a different `price` is a "harga khusus". Hub only. */
  list?: number };
export type QLayout = "cards" | "list" | "media";
/** pricing "section": one price for the whole section (a package), item prices ignored and hidden; "none": information only (deliverables, terms), no prices at all. */
export type QSection = { id: string; title: string; subtitle?: string; layout: QLayout; optional?: boolean; image?: string; items: QItem[]; pricing?: "item" | "section" | "none"; price?: number | null;
  /** What the package includes, shown once as a checklist under the section title. */
  includes?: string[];
  /** Pricelist package id this section was made from. */
  fromPricelist?: string };
export const sectionSubtotal = (s: QSection) => (s.pricing === "none" ? 0 : s.pricing === "section" ? s.price ?? 0 : s.items.reduce((a, i) => a + (i.price ?? 0), 0));
/** Information only: priced "none", or a package left at Rp 0 (never shown as "Rp 0"). */
export const isInfo = (s: QSection) => s.pricing === "none" || (s.pricing === "section" && s.price === 0);
export type QRow = { id: string; name: string; note?: string; price: number | null };
export type QNote = { id: string; title: string; text: string };
export type PortfolioItem = { id: string; title: string; location?: string; category?: string; image?: string; url: string };
export type QuoteAnswer = { q: string; a: string };
export type BriefFile = { name: string; size: number; type: string };
export type BriefSummary = { points: string[]; questions: string[]; requests?: string[]; at: string; model: string;
  /** Packages Claude matched from the pricelist, as shown in the brief tab. */
  packages?: { name: string; qty: number; price: number; note?: string }[] };
export type Quote = {
  id: string; slug: string; status: "draft" | "sent"; lang: "id" | "en";
  number: string; date: string; validDays: number;
  badge: string; eyebrow: string; title: string; subtitle: string; cover?: string;
  client: { name: string; location: string; whatsapp?: string };
  notice?: string;
  sections: QSection[]; operational: QRow[]; notes: QNote[];
  terms: { dpPercent: number; production: string; delivery: string; revisions: string };
  /** Discount on the services (not operational costs): a percentage or a rupiah amount. */
  discount?: { type: "pct" | "idr"; value: number };
  footnote?: string;
  /** Picked from showcase.forior.id; a copy is kept so the client page never depends on the showcase. */
  portfolio?: PortfolioItem[];
  /** Questions shown on the client page with a form to answer them. */
  questions?: { id: string; text: string }[];
  brief?: { chat?: string; files: BriefFile[]; summary?: BriefSummary };
  /** "pricelist": a personal pricelist link (Penawaran › Pricelist › Kirim) where the client picks packages. */
  kind?: "quote" | "pricelist";
  /** Opening message on a pricelist link, addressed to the client. */
  intro?: string;
  /** Pricelist link: the packages on offer, copied when the link was made. */
  packages?: { id: string; cat?: string; name: string; price: number; per: string; fit?: string; includes: string[]; addons?: { id: string; name: string; price: number }[] }[];
  /** Set by "Jadikan proyek" after the client approved: the Photo Delivery gallery made from this quotation. */
  project?: { galleryId: string; at: string };
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
export function totals(q: Pick<Quote, "sections" | "operational" | "terms"> & { discount?: Quote["discount"] }) {
  const sub = sectionSubtotal;
  const sections = q.sections.map(s => ({ id: s.id, title: s.title, optional: !!s.optional, info: isInfo(s), subtotal: sub(s) }));
  const services = sections.filter(s => !s.optional).reduce((a, s) => a + s.subtotal, 0);
  const operational = q.operational.reduce((a, r) => a + (r.price ?? 0), 0);
  const d = q.discount, v = Math.max(0, Number(d?.value) || 0);
  const discount = Math.min(services, Math.round(d?.type === "pct" ? services * Math.min(100, v) / 100 : d?.type === "idr" ? v : 0));
  const grand = services - discount + operational;
  const dp = Math.round(grand * Math.min(100, Math.max(0, q.terms.dpPercent || 0)) / 100);
  return { sections, services, discount, operational, grand, dp };
}
/** "Diskon 5%" or "Diskon" (amount discounts read better without repeating the number). */
export const discountLabel = (d: Quote["discount"], word = "Diskon") => (d?.type === "pct" ? `${word} ${+(Number(d.value) || 0).toFixed(2)}%` : word);

/** Headline numbers for the hero: one per (non-optional) section, summing quantities of its main unit. */
export function stats(q: Pick<Quote, "sections">): { value: number; unit: string; label: string }[] {
  return q.sections.filter(s => !s.optional && !isInfo(s)).map(s => {
    const byUnit = new Map<string, number>();
    for (const i of s.items) if (i.qty && i.qty > 0) byUnit.set(i.unit || "", (byUnit.get(i.unit || "") ?? 0) + i.qty);
    const [unit, value] = [...byUnit.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
    return { value, unit, label: s.title };
  }).filter(s => s.value > 0).slice(0, 4);
}

/** What goes into the public <slug>.json: the brief (client documents, AI notes) never leaves Hub. */
export function publicSnapshot(q: Quote): Omit<Quote, "brief"> {
  const { brief: _brief, project: _project, ...rest } = q;
  // The pricelist price behind a "harga khusus" stays in Hub.
  return { ...rest, sections: rest.sections.map(s => ({ ...s, items: s.items.map(({ list: _list, ...i }) => i) })) };
}

// ---------- AI brief → draft ----------
export type BriefDraft = {
  points: string[]; questions: string[]; requests: string[]; client?: string; eyebrow?: string; title?: string; subtitle?: string; location?: string; notice?: string;
  sections: QSection[]; notes: QNote[]; operational: QRow[]; terms: Partial<Quote["terms"]>;
  /** The model's pricelist picks, unchecked; read with parsePackages (lib/pricelist). */
  packagesRaw?: unknown;
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
    packagesRaw: raw.packages,
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
      optional: s?.optional === true, ...(s?.pricing === "none" ? { pricing: "none" as const } : {}),
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
  id: { prepared: "Disiapkan untuk", location: "Lokasi project", quoteNo: "No.", valid: "Berlaku", days: "hari", subtotal: "Subtotal", optional: "Opsional", tbc: "Dikonfirmasi kemudian", notes: "Deliverables & Catatan", notesOnly: "Catatan", notesOnlySub: "Hal yang perlu diperhatikan", notesSub: "Yang Anda terima dan yang perlu diperhatikan", terms: "Ketentuan", termsSub: "Jadwal, revisi, dan pembayaran", confirm: "Konfirmasi", production: "Produksi", editing: "Editing & Revisi", delivery: "Pengiriman Final", dp: "DP saat konfirmasi", rest: "Sebelum file final dikirim", payment: "Pembayaran", validity: "Masa berlaku", ops: "Biaya Operasional", opsSub: "Estimasi biaya produksi", grand: "Grand total", services: "Subtotal jasa", opsLine: "Biaya operasional", ask: "Tanya via WhatsApp", pdf: "PDF", hello: "Halo FORIOR, saya ingin bertanya tentang penawaran", dpOf: "DP", photos: "foto", package: "Harga paket", inPackage: "Termasuk paket", portfolio: "Portofolio", portfolioSub: "Contoh project FORIOR yang serupa", viewProject: "Lihat project", allWork: "Lihat semua portofolio", askTitle: "Pertanyaan untuk Anda", askSub: "Jawaban Anda membantu kami menyesuaikan penawaran", yourName: "Nama Anda", send: "Kirim jawaban", sending: "Mengirim…", approving: "Memproses persetujuan…", sent: "Terima kasih, jawaban Anda sudah terkirim ke FORIOR.", addons: "Opsi tambahan · belum termasuk total", discount: "Diskon", includes: "Termasuk", forYou: "Disiapkan khusus untuk", pickTitle: "Pilih paket", pickSub: "Centang paket yang sesuai, atur jumlahnya, lalu konfirmasi", pick: "Pilih paket ini", perOf: "per", qtyOf: "Jumlah", noPick: "Belum ada paket dipilih", yourPick: "Pilihan Anda", confirmPick: "Konfirmasi pilihan paket", picked: "Paket dipilih", approveTitle: "Setujui penawaran", approveSub: "Konfirmasi bahwa Anda menyetujui penawaran ini", approveIntro: "Setelah disetujui, tim FORIOR menghubungi Anda untuk jadwal shoot dan DP.", picName: "Nama penanggung jawab", waNo: "No. WhatsApp", agree: "Saya setuju dengan ketentuan di atas", approveBtn: "Setujui penawaran ini", approved: "Penawaran disetujui", approvedBy: "Disetujui oleh", approvedOn: "pada", next: "Langkah berikutnya", next1: "Tim FORIOR menghubungi Anda via WhatsApp untuk berdiskusi dan menentukan jadwal pemotretan", nextTalk: "Request konsep foto dan hal lain yang perlu dijelaskan kita bahas di diskusi ini. Untuk project yang cukup besar, kita bisa jadwalkan meeting online", next2: "Transfer DP", lock: "untuk mengunci jadwal", meet: "Jadwalkan meeting online", meetWa: "Halo FORIOR, saya ingin menjadwalkan meeting online untuk membahas", next3: "Shoot, lalu foto preview dikirim lewat link galeri", chat: "Chat FORIOR di WhatsApp", approvedWa: "Halo FORIOR, saya sudah menyetujui penawaran" },
  en: { prepared: "Prepared for", location: "Project location", quoteNo: "Quote No.", valid: "Valid", days: "days", subtotal: "Subtotal", optional: "Optional", tbc: "To be confirmed", notes: "Deliverables & Notes", notesOnly: "Notes", notesOnlySub: "Things to keep in mind", notesSub: "What to expect and what may affect coverage", terms: "Commercial Terms", termsSub: "Timeline, revisions and payment", confirm: "Confirmation", production: "Production", editing: "Editing & Revisions", delivery: "Final Delivery", dp: "Down payment upon confirmation", rest: "Before final delivery", payment: "Payment terms", validity: "Quotation validity", ops: "Production & Operational Costs", opsSub: "Operational budget estimate", grand: "Grand total", services: "Service subtotal", opsLine: "Operational costs", ask: "Ask on WhatsApp", pdf: "PDF", hello: "Hello FORIOR, I have a question about quotation", dpOf: "DP", photos: "photos", package: "Package price", inPackage: "Included in package", portfolio: "Portfolio", portfolioSub: "Similar FORIOR projects", viewProject: "View project", allWork: "See full portfolio", askTitle: "Questions for you", askSub: "Your answers help us tailor this quotation", yourName: "Your name", send: "Send answers", sending: "Sending…", approving: "Processing approval…", sent: "Thank you, your answers have been sent to FORIOR.", addons: "Optional add-ons · not included", discount: "Discount", includes: "Includes", forYou: "Prepared exclusively for", pickTitle: "Choose your package", pickSub: "Tick the packages you need, set the quantity, then confirm", pick: "Choose this package", perOf: "per", qtyOf: "Qty", noPick: "No package chosen yet", yourPick: "Your choice", confirmPick: "Confirm my packages", picked: "Packages chosen", approveTitle: "Approve this quotation", approveSub: "Confirm that you accept this quotation", approveIntro: "Once approved, FORIOR will contact you to schedule the shoot and the down payment.", picName: "Person in charge", waNo: "WhatsApp number", agree: "I agree to the terms above", approveBtn: "Approve this quotation", approved: "Quotation approved", approvedBy: "Approved by", approvedOn: "on", next: "Next steps", next1: "FORIOR contacts you on WhatsApp to discuss and set the shoot date", nextTalk: "Photo concept requests and any other details are covered in that discussion. For larger projects we can schedule an online meeting", next2: "Down payment", lock: "to lock the date", meet: "Schedule an online meeting", meetWa: "Hello FORIOR, I would like to schedule an online meeting to discuss", next3: "The shoot, then preview photos through a gallery link", chat: "Chat FORIOR on WhatsApp", approvedWa: "Hello FORIOR, I have approved quotation" }
};
export const FORIOR_CONTACT = { website: "www.forior.id", wa: "6281542048268", phone: "0815 4204 8268" };
/** The one inline script on the client page; its hash goes into the page's CSP. */
// The only script on the client page (pinned by hash in the route's CSP): the PDF button, and forms that show
// they are sending and ignore repeat taps on a slow connection; reset when the page comes back from the back/forward cache.
export const PRINT_SCRIPT = "document.getElementById('qpdf').addEventListener('click',function(e){e.preventDefault();print()});var P=document.querySelector('form.plf');if(P){var U=function(){var s=0,n=[];P.querySelectorAll('.pkc').forEach(function(c){var cb=c.querySelector('[data-pk]');c.classList.toggle('on',cb.checked);if(!cb.checked)return;var q=c.querySelector('[data-q]'),k=Math.min(50,Math.max(1,parseInt(q&&q.value)||1)),v=cb.dataset.price*k;c.querySelectorAll('[data-add]:checked').forEach(function(a){v+=+a.dataset.price});s+=v;n.push(cb.dataset.name+(k>1?' \u00d7 '+k:''))});document.getElementById('pltot').textContent='Rp '+s.toLocaleString('id-ID');document.getElementById('plsel').textContent=n.length?n.join(', '):P.dataset.none||document.getElementById('plsel').dataset.none||'-'};document.getElementById('plsel').dataset.none=document.getElementById('plsel').textContent;P.addEventListener('input',U);P.addEventListener('change',U);P.addEventListener('submit',function(e){if(!P.querySelector('[data-pk]:checked')){e.preventDefault();document.getElementById('pilih').scrollIntoView({behavior:'smooth'})}});U()}document.querySelectorAll('form[method=post]').forEach(function(f){var b=f.querySelector('button[type=submit]'),l=b&&b.querySelector('.bl'),t=l&&l.textContent;f.addEventListener('submit',function(e){if(e.defaultPrevented)return;if(f.dataset.busy){e.preventDefault();return}f.dataset.busy='1';if(b){b.classList.add('busy');b.setAttribute('aria-busy','true');if(l)l.textContent=b.dataset.busy}});addEventListener('pageshow',function(){delete f.dataset.busy;if(b){b.classList.remove('busy');b.removeAttribute('aria-busy');if(l)l.textContent=t}})})";

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
.hero{position:relative;overflow:hidden;color:#fff;min-height:440px;display:flex;flex-direction:column;justify-content:space-between}.hero>.ph{position:absolute;inset:0}.hero>.ph::after{background:linear-gradient(180deg,rgba(12,18,32,.55) 0%,rgba(12,18,32,0) 28%,rgba(12,18,32,0) 42%,rgba(12,18,32,.8) 100%)}.hero-top,.hero-body{text-shadow:0 1px 3px rgba(0,0,0,.45)}.hero .eyebrow{color:#f1d58a}
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
.pf{grid-template-columns:1fr 1fr}.pfc{display:flex;flex-direction:column;background:var(--card);border-radius:16px;overflow:hidden;box-shadow:var(--sh);text-decoration:none;color:inherit}.pfc>.ph{aspect-ratio:4/3}.pfc .body{padding:10px 12px;display:grid;gap:2px}.pfc b{font-size:13px;color:var(--navy);line-height:1.3}.pfc small{font-size:11px;color:var(--muted)}.pfc span{font-size:11.5px;font-weight:700;color:var(--pi);margin-top:4px}.pf-all{margin:10px 2px 0;font-size:13px}.pf-all a{color:var(--pi);font-weight:700;text-decoration:none}
.ask{display:grid;gap:12px}.ask label{display:grid;gap:6px}.ask span{font-size:13.5px;font-weight:700;color:var(--navy)}.ask textarea,.ask input{width:100%;font:inherit;font-size:14px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:#fafbfc;color:var(--ink)}.ask button{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:13px;padding:13px;background:var(--navy);color:#fff;font:inherit;font-weight:800;font-size:14px;cursor:pointer}.ask button svg.i{width:17px;height:17px}.sent{display:flex;gap:10px;align-items:center;color:#16884a}
.plintro{font-size:14.5px;line-height:1.6;color:var(--ink);margin-bottom:12px}
.grid.pks{display:grid;gap:12px;grid-template-columns:1fr}@media(min-width:720px){.grid.pks{grid-template-columns:1fr 1fr}}
.pkc{background:#fff;border:1.5px solid var(--line);border-radius:var(--r);padding:16px;box-shadow:var(--sh);transition:border-color .15s,box-shadow .15s}.pkc.on{border-color:var(--navy);box-shadow:0 0 0 3px rgba(29,44,69,.1)}
.pkt{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.pkt h3{margin:0;font-size:18px;color:var(--navy)}.pkt .fit{display:inline-block;margin-top:5px;font-size:11.5px;font-weight:700;color:var(--pi);background:var(--ps);border-radius:999px;padding:3px 9px}
.pkp{text-align:right;font-weight:800;color:var(--navy);font-size:17px;white-space:nowrap}.pkp small{display:block;font-size:11.5px;color:var(--muted);font-weight:600}
.pkc ul{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:6px}.pkc li{display:flex;gap:8px;font-size:13.5px;color:#3d4556}.pkc li svg.i{width:15px;height:15px;color:#16884a;flex:none;margin-top:2px}
.pkpick{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-top:14px;padding-top:12px;border-top:1px solid #eef0f4}
.pkcb{display:flex;gap:9px;align-items:center;font-weight:800;font-size:14px;color:var(--navy);cursor:pointer}.pkcb input,.pkadd input{width:20px;height:20px;accent-color:#1d2c45}
.pkq{display:flex;gap:6px;align-items:center;font-size:13px;color:var(--muted)}.pkq input{width:58px;font:inherit;font-size:14px;padding:6px 8px;border:1px solid var(--line);border-radius:10px;text-align:center}
.pkadd{display:flex;gap:9px;align-items:center;margin-top:10px;font-size:13.5px;font-weight:600;color:var(--ink)}
.pltot{position:sticky;bottom:78px;z-index:5;margin:14px 0;background:var(--navy);color:#fff;border-radius:16px;padding:13px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;box-shadow:0 12px 30px -10px rgba(24,37,58,.5)}.pltot span{font-size:12.5px;color:#c9d2e3}.pltot b{font-size:18px;white-space:nowrap}
.incl{margin-bottom:10px}.incl ul{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:7px}.incl li{display:flex;gap:9px;align-items:flex-start;font-size:14px;color:var(--ink)}.incl li svg.i{width:16px;height:16px;color:#16884a;flex:none;margin-top:2px}.total .disc span{color:#9ee6b6}
.appr-intro{font-size:13.5px;color:var(--muted,#667085);margin:0}.ask .agree{display:flex;gap:10px;align-items:flex-start}.ask .agree input{width:20px;height:20px;flex:none;margin-top:1px;accent-color:#16884a}.ask .agree span{font-weight:600;font-size:13px}.appr button{background:#16884a}.ask button{transition:transform .12s ease,opacity .2s,box-shadow .2s}.ask button:active{transform:scale(.97)}.ask button .bl{color:inherit;font-size:inherit;font-weight:inherit}.ask button.busy{opacity:.8;pointer-events:none;cursor:progress}.ask button.busy svg.i{display:none}.ask button.busy::before{content:"";width:16px;height:16px;border-radius:50%;border:2.5px solid rgba(255,255,255,.4);border-top-color:#fff;animation:qspin .7s linear infinite}@keyframes qspin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.ask button.busy::before{animation-duration:2s}.ask button:active{transform:none}}
.okc{display:flex;gap:14px;align-items:center;border-color:#bfe6cc;background:#f2fbf5}.okic{width:46px;height:46px;border-radius:50%;background:#16884a;color:#fff;display:grid;place-items:center;flex:none}.okic svg.i{width:22px;height:22px}.okc b{display:block;font-size:15px;color:#0f5c31}.okc span{font-size:13px;color:#3f5c49}
.nexts{margin-top:12px}.nexts ol{margin:0 0 14px;padding-left:20px;display:grid;gap:7px;font-size:13.5px}.wa-btn{display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid #bfe6cc;border-radius:13px;padding:12px;color:#16884a;font-weight:800;text-decoration:none}.wa-btn svg.i{width:17px;height:17px}.wa-btn.meet{margin-top:8px;border-color:var(--line);color:var(--navy)}
.sec-price{margin-left:auto;text-align:right;font-weight:800;color:var(--navy);font-size:15px;white-space:nowrap;line-height:1.2}.sec-price small{display:block;font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.6px}.inpkg{font-size:11px;font-weight:700;color:var(--pi);background:var(--ps);padding:3px 8px;border-radius:999px;white-space:nowrap}
.footer{margin-top:26px;background:var(--card);border-radius:var(--r);box-shadow:var(--sh);padding:18px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}.footer .brand{color:var(--navy);font-size:19px}.footer .brand small{color:var(--muted)}.contacts{display:flex;gap:8px;flex-wrap:wrap}.contacts a{display:inline-flex;align-items:center;gap:7px;text-decoration:none;font-size:13px;font-weight:700;color:var(--navy);background:#f3f4f8;padding:9px 12px;border-radius:11px}.contacts svg.i{width:16px;height:16px}
.fine{font-size:11.5px;color:var(--muted);text-align:center;margin-top:14px}
.cta{position:fixed;left:0;right:0;bottom:0;z-index:20;padding:10px 14px calc(12px + env(safe-area-inset-bottom));background:linear-gradient(180deg,rgba(238,240,244,0),#eef0f4 35%);display:flex;gap:8px;justify-content:center}.cta a{display:inline-flex;align-items:center;justify-content:center;gap:7px;white-space:nowrap;text-decoration:none;font-weight:800;font-size:13.5px;padding:13px 16px;border-radius:14px;background:#fff;color:var(--navy);box-shadow:0 6px 16px -8px rgba(0,0,0,.3);flex:1;max-width:200px}.cta a.wa{background:#1f9d55;color:#fff;flex:2;max-width:320px}.cta svg.i{width:17px;height:17px}
@media(min-width:640px){.doc{padding:20px 16px 110px}.pad{padding:0}.hero{border-radius:24px;min-height:400px}.hero-top,.hero-body{padding:24px 26px}.hero-body{padding-bottom:64px}.client{grid-template-columns:1fr 1fr}.stats{grid-template-columns:repeat(4,1fr)}.units{grid-template-columns:repeat(2,1fr)}.unit{flex-direction:column}.unit .ph{width:auto;aspect-ratio:4/3;min-height:0}.unit .body{flex-direction:row;justify-content:space-between;align-items:center;flex-wrap:wrap}.media{grid-template-columns:1fr 1fr}.deliv{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}.surr{grid-template-columns:1.05fr 1fr}.surr>.ph{min-height:260px}.terms{grid-template-columns:1fr 1fr}
.tl{grid-template-columns:repeat(4,1fr);gap:0}.tl::before{left:12.5%;right:12.5%;top:23px;bottom:auto;width:auto;height:2px;background:repeating-linear-gradient(90deg,var(--purple) 0 6px,transparent 6px 12px)}.step{flex-direction:column;text-align:center;padding:0 6px}}
@media(min-width:900px){.units{grid-template-columns:repeat(3,1fr)}.pf{grid-template-columns:repeat(4,1fr)}}
@media print{body{background:#fff}.doc{max-width:none;padding:0}.cta{display:none}.card,.unit,.mcard,.stat,.dl,.footer{box-shadow:none;border:1px solid var(--line)}.hero,.total,.subbar,.pay div,.sec-num,.step .ico{-webkit-print-color-adjust:exact;print-color-adjust:exact}.unit,.mcard,.card,.total{break-inside:avoid}form.ask,.nexts,.wa-btn{display:none!important}.hero{min-height:0!important}.sig{display:flex!important}}@page{size:A4;margin:12mm}.sig{display:none;justify-content:space-between;gap:24px;margin:28px 0 8px;break-inside:avoid}.sig div{flex:1;border-top:1px solid #c9cfda;padding-top:6px;font-size:12px;color:var(--muted)}.sig b{display:block;color:var(--ink);font-size:13px}`;

const bullets = (all?: string[]) => { const lines = all?.filter(l => l.trim()); return lines?.length ? `<ul class="pts">${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul>` : ""; };
function sectionHtml(s: QSection, letter: string, t: typeof T.id): string {
  // A package priced at Rp 0 is a section that has no price yet: never show "Rp 0" to the client.
  const sub = sectionSubtotal(s), perSection = s.pricing === "section" && s.price !== 0, noPrice = isInfo(s) || (s.pricing === "section" && s.price === 0);
  const qty = (i: QItem) => (i.qty ? `${i.qty} ${esc(i.unit || "")}`.trim() : "");
  const priceOf = (p: number | null) => (noPrice ? "" : perSection ? `<span class="inpkg">${t.inPackage}</span>` : p === null ? `<span class="tbc">${t.tbc}</span>` : p > 0 ? `<span class="price">${idr(p)}</span>` : "");
  const totalQty = s.items.reduce((a, i) => a + (i.qty || 0), 0);
  const unit = s.items.find(i => i.unit)?.unit ?? "";
  const head = `<div class="sec-head"><div class="sec-num">${noPrice ? ic("check", "width:18px;height:18px") : esc(letter)}</div><div><h2>${esc(s.title)}${s.optional ? `<span class="pill">${t.optional}</span>` : ""}</h2>${s.subtitle ? `<p>${esc(s.subtitle)}</p>` : ""}</div></div>`;
  let body = "";
  const inc = (s.includes ?? []).map(x => x.trim()).filter(Boolean);
  const includes = inc.length ? `<div class="card incl"><div class="lbl">${t.includes}</div><ul>${inc.map(x => `<li>${ic("check")}<span>${esc(x)}</span></li>`).join("")}</ul></div>` : "";
  if (s.layout === "list") {
    body = `<div class="surr">${url(s.image) || url(s.items[0]?.image) ? ph(s.image || s.items[0]?.image, s.title) : ""}<div class="card">${s.items.map(i => `<div class="cat"><div class="ico">${ic(i.unit && /video|menit|min/i.test(i.unit) ? "film" : "camera")}</div><div class="t"><b>${esc(i.name)}</b>${i.desc ? `<small>${esc(i.desc)}</small>` : ""}${bullets(i.lines)}</div>${qty(i) ? `<span class="qty">${qty(i)}</span>` : ""}${i.price ? `&nbsp;${priceOf(i.price)}` : i.price === null ? `&nbsp;${priceOf(null)}` : ""}</div>`).join("")}</div></div>`;
  } else if (s.layout === "media") {
    body = `<div class="grid media">${s.items.map(i => `<div class="mcard${s.optional ? " opt" : ""}">${url(i.image) ? ph(i.image, i.name, i.tag ? `<span class="tag">${esc(i.tag)}</span>` : "") : ""}<div class="body"><h3>${esc(i.name)}</h3>${i.desc ? `<p class="mdesc">${esc(i.desc)}</p>` : ""}${i.lines?.some(l => l.trim()) ? `<div class="scenes">${i.lines.filter(l => l.trim()).map(l => `<div class="scene">${ic("check")}<span>${esc(l)}</span></div>`).join("")}</div>` : ""}<div class="foot"><small>${qty(i)}</small>${priceOf(i.price)}</div></div></div>`).join("")}</div>`;
  } else {
    body = `<div class="grid units">${s.items.map(i => `<div class="unit">${ph(i.image, i.name, i.tag ? `<span class="tag">${esc(i.tag)}</span>` : "")}<div class="body"><div><b>${esc(i.name)}</b>${i.desc || qty(i) ? `<small style="display:block">${esc(i.desc || "")}${i.desc && qty(i) ? " · " : ""}${qty(i)}</small>` : ""}${bullets(i.lines)}</div>${perSection ? "" : priceOf(i.price)}</div></div>`).join("")}</div>`;
  }
  const label = `${perSection ? t.package : t.subtotal} ${esc(letter)}${totalQty ? ` — ${totalQty} ${esc(unit)}` : ""}`;
  const bar = noPrice ? "" : perSection ? `<div class="subbar"><span>${label}</span><b>${s.price === null || s.price === undefined ? t.tbc : idr(sub)}</b></div>`
    : sub > 0 && s.items.length > 1 ? `<div class="subbar"><span>${label}</span><b>${idr(sub)}</b></div>` : "";
  return head + includes + body + bar;
}

function portfolioHtml(items: PortfolioItem[], t: typeof T.id): string {
  if (!items.length) return "";
  return `<div class="sec-head"><div class="sec-num">${ic("camera", "width:18px;height:18px")}</div><div><h2>${t.portfolio}</h2><p>${t.portfolioSub}</p></div></div>
<div class="grid pf">${items.map(p => `<a class="pfc" href="${esc(url(p.url) || "https://showcase.forior.id")}" target="_blank" rel="noopener">${ph(p.image, p.title)}<div class="body"><b>${esc(p.title)}</b><small>${esc([p.category, p.location].filter(Boolean).join(" · "))}</small><span>${t.viewProject} →</span></div></a>`).join("")}</div>
<p class="pf-all"><a href="https://showcase.forior.id" target="_blank" rel="noopener">${t.allWork} →</a></p>`;
}
function questionsHtml(qs: { id: string; text: string }[], t: typeof T.id, opts: { preview?: boolean; sent?: boolean }): string {
  const list = qs.filter(x => x.text.trim()).slice(0, 10);
  if (!list.length) return "";
  const head = `<div class="sec-head"><div class="sec-num">${ic("info", "width:18px;height:18px")}</div><div><h2>${t.askTitle}</h2><p>${t.askSub}</p></div></div>`;
  if (opts.sent) return `${head}<div class="card sent" id="tanya">${ic("check")}<b>${t.sent}</b></div>`;
  return `${head}<form class="card ask" id="tanya" method="post" action="#tanya">${list.map((x, i) => `<label><span>${i + 1}. ${esc(x.text)}</span><textarea name="a${i}" rows="2" maxlength="1000"></textarea></label>`).join("")}
<label><span>${t.yourName}</span><input name="name" maxlength="80" autocomplete="name"></label><input type="hidden" name="n" value="${list.length}"><button type="submit" data-busy="${t.sending}"${opts.preview ? " disabled" : ""}>${ic("send")}<span class="bl">${t.send}</span></button></form>`;
}

export type QuoteApproval = { name: string; at: string; title?: string | null; total?: number | null };
function approveHtml(q: Omit<Quote, "brief">, t: typeof T.id, dp: number, opts: { preview?: boolean; approval?: QuoteApproval | null; pageUrl?: string }): string {
  const head = `<div class="sec-head" id="setuju"><div class="sec-num">${ic("check", "width:18px;height:18px")}</div><div><h2>${opts.approval ? t.approved : t.approveTitle}</h2><p>${opts.approval ? "" : t.approveSub}</p></div></div>`;
  if (opts.approval) {
    const when = new Date(opts.approval.at).toLocaleString(q.lang === "en" ? "en-GB" : "id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
    const wa = encodeURIComponent(`${t.approvedWa} ${q.title}${q.number ? ` (${q.number})` : ""}${opts.pageUrl ? `: ${opts.pageUrl}` : ""}`);
    return `${head}<div class="card okc"><div class="okic">${ic("check")}</div><div><b>${t.approvedBy} ${esc(opts.approval.name)}</b><span>${t.approvedOn} ${esc(when)}</span></div></div>
<div class="card nexts"><div class="lbl" style="margin-bottom:6px">${t.next}</div><ol><li>${t.next1}</li><li>${t.nextTalk}</li>${dp > 0 ? `<li>${t.next2} ${q.terms.dpPercent}% · ${idr(dp)} ${t.lock}</li>` : ""}<li>${t.next3}</li></ol><a class="wa-btn" href="https://wa.me/${FORIOR_CONTACT.wa}?text=${wa}" target="_blank" rel="noopener">${ic("phone")}${t.chat}</a><a class="wa-btn meet" href="https://wa.me/${FORIOR_CONTACT.wa}?text=${encodeURIComponent(`${t.meetWa} ${opts.approval?.title || q.title || ""}${opts.pageUrl ? ` (${opts.pageUrl})` : ""}`)}" target="_blank" rel="noopener">${ic("cal")}${t.meet}</a></div>`;
  }
  return `${head}<form class="card ask appr" method="post" action="#setuju"><input type="hidden" name="act" value="approve"><p class="appr-intro">${t.approveIntro}</p>
<label><span>${t.picName}</span><input name="name" maxlength="80" autocomplete="name" required></label>
<label><span>${t.waNo}</span><input name="phone" maxlength="30" inputmode="tel" autocomplete="tel"></label>
<label class="agree"><input type="checkbox" name="agree" value="1" required><span>${t.agree}${dp > 0 ? ` · ${t.dpOf} ${q.terms.dpPercent}% (${idr(dp)})` : ""}</span></label>
<button type="submit" data-busy="${t.approving}"${opts.preview ? " disabled" : ""}>${ic("check")}<span class="bl">${t.approveBtn}</span></button></form>`;
}

/** Pricelist link: package cards the client ticks (with quantity and add-ons), then the same approval form as a quotation. */
function pricelistBody(q: Omit<Quote, "brief">, t: typeof T.id, opts: { preview?: boolean; approval?: QuoteApproval | null; pageUrl?: string }): string {
  const pk = q.packages ?? [];
  const chosen = new Set((opts.approval?.title ?? "").split("; ").map(x => x.split(" × ")[0].split(" + ")[0]));
  const card = (p: NonNullable<Quote["packages"]>[number], live: boolean) => `<div class="pkc${!live && chosen.has(p.name) ? " on" : ""}">
<div class="pkt"><div><h3>${esc(p.name)}</h3>${p.fit ? `<span class="fit">${esc(p.fit)}</span>` : ""}</div><div class="pkp">${idr(p.price)}<small>${t.perOf} ${esc(p.per)}</small></div></div>
<ul>${p.includes.map(x => `<li>${ic("check")}<span>${esc(x)}</span></li>`).join("")}</ul>
${live ? `<div class="pkpick"><label class="pkcb"><input type="checkbox" name="p_${esc(p.id)}" value="1" data-pk data-price="${p.price}" data-name="${esc(p.name)}"${opts.preview ? " disabled" : ""}><span>${t.pick}</span></label><label class="pkq">${t.qtyOf} <input type="number" name="q_${esc(p.id)}" min="1" max="50" value="1" inputmode="numeric" data-q${opts.preview ? " disabled" : ""}> ${esc(p.per)}</label></div>
${(p.addons ?? []).map(a => `<label class="pkadd"><input type="checkbox" name="a_${esc(p.id)}_${esc(a.id)}" value="1" data-add data-price="${a.price}"${opts.preview ? " disabled" : ""}><span>+ ${esc(a.name)} · ${idr(a.price)}</span></label>`).join("")}` : ""}</div>`;
  const head = `<div class="sec-head" id="pilih"><div class="sec-num">${ic("check", "width:18px;height:18px")}</div><div><h2>${opts.approval ? t.picked : t.pickTitle}</h2><p>${opts.approval ? "" : t.pickSub}</p></div></div>`;
  if (opts.approval) {
    const when = new Date(opts.approval.at).toLocaleString(q.lang === "en" ? "en-GB" : "id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
    const wa = encodeURIComponent(`${t.approvedWa} ${opts.approval.title ?? ""}${opts.pageUrl ? `: ${opts.pageUrl}` : ""}`);
    return `<div id="setuju"></div>${head}<div class="card okc"><div class="okic">${ic("check")}</div><div><b>${t.yourPick}: ${esc(opts.approval.title ?? "")}</b><span>${opts.approval.total ? `${idr(opts.approval.total)} · ` : ""}${esc(opts.approval.name)}, ${esc(when)}</span></div></div>
<div class="card nexts"><div class="lbl" style="margin-bottom:6px">${t.next}</div><ol><li>${t.next1}</li><li>${t.nextTalk}</li><li>${t.next2} ${q.terms.dpPercent}% ${t.lock}</li><li>${t.next3}</li></ol><a class="wa-btn" href="https://wa.me/${FORIOR_CONTACT.wa}?text=${wa}" target="_blank" rel="noopener">${ic("phone")}${t.chat}</a><a class="wa-btn meet" href="https://wa.me/${FORIOR_CONTACT.wa}?text=${encodeURIComponent(`${t.meetWa} ${opts.approval?.title || q.title || ""}${opts.pageUrl ? ` (${opts.pageUrl})` : ""}`)}" target="_blank" rel="noopener">${ic("cal")}${t.meet}</a></div>
<div class="grid pks">${pk.map(p => card(p, false)).join("")}</div>`;
  }
  return `${head}<form class="plf" method="post" action="#setuju"><input type="hidden" name="act" value="approve">
<div class="grid pks">${pk.map(p => card(p, true)).join("")}</div>
<div class="pltot" id="setuju"><span id="plsel">${t.noPick}</span><b id="pltot">Rp 0</b></div>
<div class="card ask appr"><p class="appr-intro">${t.approveIntro}</p>
<label><span>${t.picName}</span><input name="name" maxlength="80" autocomplete="name" required></label>
<label><span>${t.waNo}</span><input name="phone" maxlength="30" inputmode="tel" autocomplete="tel"></label>
<label class="agree"><input type="checkbox" name="agree" value="1" required><span>${t.agree}${q.terms.dpPercent > 0 ? ` · ${t.dpOf} ${q.terms.dpPercent}%` : ""}</span></label>
<button type="submit" data-busy="${t.approving}"${opts.preview ? " disabled" : ""}>${ic("check")}<span class="bl">${t.confirmPick}</span></button></div></form>`;
}

/** The full client page. preview=true: no tracking hints and no script (used inside Hub's sandboxed iframe). */
export function renderQuoteHtml(q: Omit<Quote, "brief">, opts: { pageUrl?: string; preview?: boolean; sent?: boolean; approval?: QuoteApproval | null } = {}): string {
  const t = T[q.lang] ?? T.id;
  const tot = totals(q), st = stats(q);
  const letters = "ABCDEFGHIJ";
  const main = q.sections.filter(s => !s.optional), extra = q.sections.filter(s => s.optional), priced = main.filter(s => !isInfo(s));
  const letterOf = new Map(priced.map((s, i) => [s.id, letters[i] ?? "•"]));
  const opsLetter = letters[priced.length] ?? "•";
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
<div class="client"><div class="card"><div class="ico">${ic("user")}</div><div><div class="lbl">${q.kind === "pricelist" ? t.forYou : t.prepared}</div><div class="val">${esc(q.client.name || "—")}</div></div></div>${q.client.location ? `<div class="card"><div class="ico">${ic("pin")}</div><div><div class="lbl">${t.location}</div><div class="val">${esc(q.client.location)}</div></div></div>` : ""}</div>
<div class="pad">
${q.kind === "pricelist" ? `${q.intro ? `<div class="card plintro">${esc(q.intro).replace(/\n/g, "<br>")}</div>` : ""}${q.notice ? `<div class="notice">${ic("info")}<div>${esc(q.notice)}</div></div>` : ""}${pricelistBody(q, t, opts)}
` : `${st.length ? `<div class="stats">${st.map(s => `<div class="stat"><b>${s.value}${s.unit ? ` <small>${esc(s.unit)}</small>` : ""}</b><span>${esc(s.label)}</span></div>`).join("")}</div>` : ""}
${q.notice ? `<div class="notice">${ic("info")}<div>${esc(q.notice)}</div></div>` : ""}
${main.map(s => sectionHtml(s, letterOf.get(s.id) ?? "•", t)).join("")}
${extra.map(s => sectionHtml(s, "+", t)).join("")}
${q.notes.length ? `<div class="sec-head"><div class="sec-num">${ic("send", "width:18px;height:18px")}</div><div><h2>${main.some(isInfo) ? t.notesOnly : t.notes}</h2><p>${main.some(isInfo) ? t.notesOnlySub : t.notesSub}</p></div></div><div class="grid deliv">${q.notes.map(n => `<div class="dl"><div class="ico">${ic("check")}</div><div><b>${esc(n.title)}</b><p>${esc(n.text)}</p></div></div>`).join("")}</div>` : ""}
<div class="sec-head"><div class="sec-num">${ic("hand", "width:18px;height:18px")}</div><div><h2>${t.terms}</h2><p>${t.termsSub}</p></div></div>
<div class="card"><div class="tl"><div class="step"><div class="ico">${ic("hand")}</div><div><b>${t.confirm}</b><span>${t.dpOf} ${q.terms.dpPercent}%</span></div></div><div class="step"><div class="ico">${ic("camera")}</div><div><b>${t.production}</b><span>${esc(q.terms.production)}</span></div></div><div class="step"><div class="ico">${ic("edit")}</div><div><b>${t.editing}</b><span>${esc(q.terms.revisions)}</span></div></div><div class="step"><div class="ico">${ic("send")}</div><div><b>${t.delivery}</b><span>${esc(q.terms.delivery)}</span></div></div></div></div>
<div class="grid terms" style="margin-top:12px"><div class="card"><div class="lbl" style="margin-bottom:8px">${t.payment}</div><div class="pay"><div><b>${q.terms.dpPercent}%</b><span>${t.dp}</span></div><div><b>${100 - q.terms.dpPercent}%</b><span>${t.rest}</span></div></div></div>
<div class="card"><div class="row"><span>${t.production}</span><span>${esc(q.terms.production)}</span></div><div class="row"><span>${t.delivery}</span><span>${esc(q.terms.delivery)}</span></div><div class="row"><span>${t.editing}</span><span>${esc(q.terms.revisions)}</span></div><div class="row"><span>${t.validity}</span><span>${q.validDays} ${t.days}</span></div></div></div>
${q.operational.length ? `<div class="sec-head"><div class="sec-num">${esc(opsLetter)}</div><div><h2>${t.ops}</h2><p>${t.opsSub}</p></div></div><div class="card ops">${q.operational.map(r => `<div class="row"><span>${esc(r.name)}${r.note ? `<small>${esc(r.note)}</small>` : ""}</span><span>${r.price === null ? `<span class="tbc">${t.tbc}</span>` : idr(r.price)}</span></div>`).join("")}</div>` : ""}
${portfolioHtml(q.portfolio ?? [], t)}
${questionsHtml(q.questions ?? [], t, opts)}
<div class="total">${tot.sections.filter(s => !s.optional && !s.info).map(s => `<div class="line"><span>${esc(s.title)} (${letterOf.get(s.id)})</span><span>${idr(s.subtotal)}</span></div>`).join("")}
${q.operational.length || tot.discount ? `<div class="line"><span><b>${t.services}</b></span><span><b>${idr(tot.services)}</b></span></div>` : ""}${tot.discount ? `<div class="line disc"><span>${esc(discountLabel(q.discount, t.discount))}</span><span>− ${idr(tot.discount)}</span></div>` : ""}${q.operational.length ? `<div class="line"><span>${t.opsLine} (${opsLetter})</span><span>${tot.operational || !q.operational.some(r => r.price === null) ? idr(tot.operational) : t.tbc}</span></div>` : ""}
<div class="grand"><div class="lbl">${t.grand}</div><div><b>${idr(tot.grand)}</b>${q.terms.dpPercent > 0 && q.terms.dpPercent < 100 ? `<small>${t.dpOf} ${q.terms.dpPercent}% · ${idr(tot.dp)}</small>` : ""}</div></div>
${tot.sections.some(s => s.optional && s.subtotal > 0) ? `<div class="opts"><div class="lbl">${t.addons}</div>${tot.sections.filter(s => s.optional && s.subtotal > 0).map(s => `<div class="line"><span>+ ${esc(s.title)}</span><span>${idr(s.subtotal)}</span></div>`).join("")}</div>` : ""}</div>
${approveHtml(q, t, tot.dp, opts)}
<div class="sig"><div>${q.lang === "en" ? "Client" : "Klien"}<b>${esc(opts.approval?.name || q.client.name || "")}</b>${opts.approval ? `${t.approvedOn} ${esc(new Date(opts.approval.at).toLocaleDateString(q.lang === "en" ? "en-GB" : "id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }))}` : "&nbsp;"}</div><div>FORIOR<b>&nbsp;</b>&nbsp;</div></div>
`}<footer class="footer"><div class="brand">FORIOR<small>Property Photography &amp; Video Services</small></div><div class="contacts"><a href="https://${FORIOR_CONTACT.website}" target="_blank" rel="noopener">${ic("globe")}${FORIOR_CONTACT.website}</a><a href="https://wa.me/${FORIOR_CONTACT.wa}" target="_blank" rel="noopener">${ic("phone")}${FORIOR_CONTACT.phone}</a></div></footer>
${q.footnote ? `<p class="fine">${esc(q.footnote)}</p>` : ""}
</div></main>
<nav class="cta"><a id="qpdf" href="#">${ic("down")}${t.pdf}</a><a class="wa" href="https://wa.me/${FORIOR_CONTACT.wa}?text=${waText}" target="_blank" rel="noopener">${ic("phone")}${t.ask}</a></nav>
${opts.preview ? "" : `<script>${PRINT_SCRIPT}</script>`}
</body></html>`;
}
