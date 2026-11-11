"use client";

import { useState } from "react";
import { Check, Copy, Eye, EyeOff, FileText, Loader2, MessageCircle, Plus, Printer, ShieldCheck, Sparkles, Trash2, WandSparkles } from "lucide-react";
import { askAI, type Tier } from "./lib/ai";
import { monthKey, rupiah } from "./lib/logic";
import { buildPlan, briefKey, DEFAULT_ACCOUNTS, DEFAULT_CAMPAIGNS, type Brief, type Campaign } from "./lib/plan";
import { useApprovals, useLeads, useSettings, useStored, useUsage, type Lead } from "./lib/store";

/** Runs an AI action and tracks busy/error state for the button that triggered it. */
export function useAI() {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label); setError("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(""); }
  };
  return { busy, error, run };
}

export function AiError({ message }: { message: string }) {
  return message ? <p className="x-error" role="alert">{message}</p> : null;
}

export function AiButton({ label, busyLabel = "Memproses…", busy, onClick, className = "assistant-action" }: { label: string; busyLabel?: string; busy: boolean; onClick: () => void; className?: string }) {
  return <button className={className} onClick={onClick} disabled={busy}>{busy ? <Loader2 size={14} className="x-spin" /> : <Sparkles size={14} />} {busy ? busyLabel : label}</button>;
}

export function useMonthUsage() {
  const [usage] = useUsage();
  const [settings] = useSettings();
  const current = usage.month === monthKey() ? usage : { ...usage, idr: 0, calls: 0, inputTokens: 0, outputTokens: 0 };
  const percent = settings.budgetIdr > 0 ? Math.min(100, Math.round((current.idr / settings.budgetIdr) * 100)) : 0;
  return { usage: current, settings, percent };
}

export function AiCostBadge() {
  const { usage, settings, percent } = useMonthUsage();
  return <div className="x-cost"><b>Biaya AI bulan ini: {rupiah(usage.idr)}</b><span>{settings.apiKey ? `${percent}% dari batas ${rupiah(settings.budgetIdr)} · ${usage.calls} panggilan` : "API key belum diisi — buka Settings"}</span><i><em style={{ width: percent + "%" }} /></i></div>;
}

export function ApprovalList({ limit, empty = "Tidak ada yang menunggu persetujuan." }: { limit?: number; empty?: string }) {
  const [approvals, setApprovals] = useApprovals();
  const [open, setOpen] = useState<number | null>(null);
  const pending = approvals.filter(a => a.status === "pending");
  const shown = limit ? pending.slice(0, limit) : approvals;
  const setStatus = (id: number, status: "approved" | "revision" | "pending") => setApprovals(old => old.map(a => (a.id === id ? { ...a, status } : a)));
  if (!shown.length) return <p className="x-empty">{empty}</p>;
  return <div className="x-approvals">{shown.map(a => <article key={a.id} className="x-approval">
    <div className="x-approval-head"><span className="approval-file-icon"><FileText size={16} /></span><div><b>{a.title}</b><small>{a.by} · {a.type} · {new Date(a.at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</small></div>
      <span className={`x-status x-${a.status}`}>{a.status === "pending" ? "Menunggu" : a.status === "approved" ? "Disetujui" : "Revisi"}</span></div>
    {open === a.id && <pre className="x-output">{a.body}</pre>}
    <div className="x-row"><button className="outline-button" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? "Tutup" : "Lihat hasil"}</button>
      {a.status === "pending" ? <><button className="primary-button" onClick={() => setStatus(a.id, "approved")}><Check size={14} /> Setujui</button><button className="outline-button" onClick={() => setStatus(a.id, "revision")}>Minta revisi</button></> : <button className="outline-button" onClick={() => setStatus(a.id, "pending")}>Batalkan</button>}
      <button className="outline-button x-danger" aria-label="Hapus" onClick={() => setApprovals(old => old.filter(x => x.id !== a.id))}><Trash2 size={14} /></button></div>
  </article>)}</div>;
}

const MODELS = [["claude-haiku-5-5", "Claude Haiku 5.5 — termurah"], ["claude-sonnet-5-5", "Claude Sonnet 5.5 — seimbang"], ["claude-opus-5-5", "Claude Opus 5.5 — kualitas tertinggi"]];

export function ApiSettingsTab() {
  const [settings, setSettings] = useSettings();
  const { usage } = useMonthUsage();
  const [show, setShow] = useState(false);
  const [testResult, setTestResult] = useState("");
  const ai = useAI();
  const set = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) => setSettings(old => ({ ...old, [key]: value }));
  return <>
    <p className="settings-security-note"><ShieldCheck size={16} /> Aplikasi ini statis (GitHub Pages), jadi key disimpan hanya di browser ini (localStorage) dan dikirim langsung ke penyedia API. Jangan isi di komputer bersama. Tidak ada key yang tersimpan di repo.</p>
    <div className="settings-field"><label htmlFor="apikey">ANTHROPIC API KEY</label><div className="x-row"><input id="apikey" type={show ? "text" : "password"} value={settings.apiKey} onChange={e => set("apiKey", e.target.value)} placeholder="sk-ant-…" autoComplete="off" /><button className="outline-button" onClick={() => setShow(!show)} aria-label={show ? "Sembunyikan key" : "Tampilkan key"}>{show ? <EyeOff size={15} /> : <Eye size={15} />}</button></div><small>Dibuat di console.anthropic.com → API Keys. Kosongkan untuk mematikan semua fitur AI.</small></div>
    <div className="x-row"><AiButton className="primary-button" label="Tes koneksi" busyLabel="Mengetes…" busy={ai.busy === "test"} onClick={() => ai.run("test", async () => { setTestResult(""); const text = await askAI({ tier: "light", role: "asisten", prompt: "Balas dengan satu kata: OK", maxTokens: 500 }); setTestResult("Terhubung. Balasan model: " + text); })} />{settings.apiKey && <button className="outline-button x-danger" onClick={() => set("apiKey", "")}>Hapus key</button>}</div>
    {testResult && <p className="x-ok">{testResult}</p>}<AiError message={ai.error} />
    <div className="settings-divider" />
    <div className="settings-field"><label htmlFor="light">MODEL TUGAS RUTIN (balasan, hashtag, ringkasan)</label><select id="light" value={settings.lightModel} onChange={e => set("lightModel", e.target.value)}>{MODELS.map(m => <option key={m[0]} value={m[0]}>{m[1]}</option>)}</select></div>
    <div className="settings-field"><label htmlFor="creative">MODEL KREATIF (naskah, strategi, bedah akun)</label><select id="creative" value={settings.creativeModel} onChange={e => set("creativeModel", e.target.value)}>{MODELS.map(m => <option key={m[0]} value={m[0]}>{m[1]}</option>)}</select></div>
    <div className="settings-field"><label htmlFor="budget">BATAS BIAYA AI PER BULAN (RUPIAH)</label><input id="budget" type="number" min={0} step={10000} value={settings.budgetIdr} onChange={e => set("budgetIdr", Number(e.target.value) || 0)} /><small>Semua fitur AI berhenti otomatis saat batas tercapai. Isi 0 untuk tanpa batas.</small></div>
    <div className="settings-field"><label htmlFor="kurs">KURS USD → RUPIAH (untuk perkiraan biaya)</label><input id="kurs" type="number" min={1} value={settings.usdToIdr} onChange={e => set("usdToIdr", Number(e.target.value) || 1)} /></div>
    <div className="model-routing-cards"><article><span>BULAN INI</span><b>{rupiah(usage.idr)}</b><small>{usage.calls} panggilan AI</small></article><article><span>TOKEN MASUK</span><b>{usage.inputTokens.toLocaleString("id-ID")}</b><small>prompt + konteks brand</small></article><article><span>TOKEN KELUAR</span><b>{usage.outputTokens.toLocaleString("id-ID")}</b><small>hasil tulisan</small></article></div>
    <div className="settings-divider" />
    <div className="settings-field"><label htmlFor="meta">META ACCESS TOKEN (opsional — bedah akun Instagram otomatis)</label><input id="meta" type="password" value={settings.metaToken} onChange={e => set("metaToken", e.target.value)} placeholder="EAAG…" autoComplete="off" /><small>Token dari Meta for Developers dengan izin instagram_basic. Hanya bisa membaca akun Business/Creator publik.</small></div>
    <div className="settings-field"><label htmlFor="igid">INSTAGRAM USER ID (akun Business/Creator Anda)</label><input id="igid" value={settings.igUserId} onChange={e => set("igUserId", e.target.value)} placeholder="1784…" /><small>Tanpa dua isian ini, Bedah Akun tetap berjalan dari catatan/caption yang Anda tempel. TikTok belum punya jalur resmi untuk membaca akun lain.</small></div>
  </>;
}

export function ModelRouterPanel() {
  const { usage, settings, percent } = useMonthUsage();
  return <section className="panel x-router"><div className="agent-section-heading"><div><h3>Model router & biaya</h3><p>Tugas rutin memakai model murah; model kreatif hanya untuk naskah, strategi, dan analisis.</p></div><span className="muted-chip">{settings.apiKey ? "AI aktif" : "API key belum diisi"}</span></div>
    <div className="model-routing-cards"><article><span>RUTIN</span><b>{settings.lightModel}</b><small>Community Manager, Social Media Manager, Workflow</small></article><article><span>KREATIF</span><b>{settings.creativeModel}</b><small>Research, Strategist, Writer, Designer, Video Editor</small></article><article><span>BULAN INI</span><b>{rupiah(usage.idr)}</b><small>{percent}% dari batas {rupiah(settings.budgetIdr)} · {usage.calls} panggilan</small></article></div>
  </section>;
}

const LEAD_STATUS: Lead["status"][] = ["Baru", "Dibalas", "Penawaran", "Deal", "Batal"];

export function InboxLeadsPage() {
  const [leads, setLeads] = useLeads();
  const [name, setName] = useState(""), [source, setSource] = useState("Instagram DM"), [message, setMessage] = useState("");
  const [copied, setCopied] = useState(0);
  const ai = useAI();
  const update = (id: number, patch: Partial<Lead>) => setLeads(old => old.map(l => (l.id === id ? { ...l, ...patch } : l)));
  const add = () => { if (!name.trim() || !message.trim()) return; setLeads(old => [{ id: Date.now(), name: name.trim(), source, message: message.trim(), status: "Baru", reply: "", at: new Date().toISOString() }, ...old]); setName(""); setMessage(""); };
  const draft = (lead: Lead) => ai.run("lead" + lead.id, async () => { const reply = await askAI({ tier: "light", role: "Community Manager", prompt: `Tulis draf balasan untuk calon klien jasa foto interior FORIOR. Ramah, singkat (maksimal 80 kata), ajak lanjut ke WhatsApp atau minta detail properti (lokasi, jumlah ruangan, tanggal). Jangan menyebut harga pasti; tulis [HARGA PAKET] bila perlu.\n\nNama: ${lead.name}\nSumber: ${lead.source}\nPesan: ${lead.message}`, maxTokens: 1500 }); update(lead.id, { reply }); });
  return <div className="module-page">
    <div className="x-kpis">{LEAD_STATUS.map(s => <div className="agent-overview-card" key={s}><span>{s}</span><b>{leads.filter(l => l.status === s).length}</b><small>leads</small></div>)}</div>
    <section className="panel"><div className="agent-section-heading"><div><h3>Catat lead baru</h3><p>Salin pertanyaan calon klien dari DM, komentar, WhatsApp, atau form forior.id. Inbox otomatis membutuhkan izin API platform.</p></div></div>
      <div className="x-form"><div className="settings-field"><label htmlFor="lname">NAMA / AKUN</label><input id="lname" value={name} onChange={e => setName(e.target.value)} placeholder="@agenproperti.jkt" /></div><div className="settings-field"><label htmlFor="lsrc">SUMBER</label><select id="lsrc" value={source} onChange={e => setSource(e.target.value)}>{["Instagram DM", "Komentar Instagram", "TikTok", "WhatsApp", "Form forior.id"].map(v => <option key={v}>{v}</option>)}</select></div><div className="settings-field x-wide"><label htmlFor="lmsg">PESAN</label><textarea id="lmsg" rows={2} value={message} onChange={e => setMessage(e.target.value)} placeholder="Berapa rate foto untuk 2 unit apartemen?" /></div><button className="primary-button" onClick={add}><Plus size={14} /> Simpan lead</button></div>
    </section>
    <section className="panel"><div className="agent-section-heading"><div><h3>Inbox & Leads</h3><p>{leads.length} lead tercatat · balasan selalu berupa draf untuk Anda periksa sebelum dikirim.</p></div></div><AiError message={ai.error} />
      {!leads.length && <p className="x-empty">Belum ada lead. Catat pertanyaan pertama di atas.</p>}
      <div className="x-approvals">{leads.map(lead => <article className="x-approval" key={lead.id}>
        <div className="x-approval-head"><span className="approval-file-icon"><MessageCircle size={16} /></span><div><b>{lead.name}</b><small>{lead.source} · {new Date(lead.at).toLocaleDateString("id-ID", { dateStyle: "medium" })}</small></div><select aria-label="Status lead" value={lead.status} onChange={e => update(lead.id, { status: e.target.value as Lead["status"] })}>{LEAD_STATUS.map(s => <option key={s}>{s}</option>)}</select></div>
        <p className="x-quote">“{lead.message}”</p>
        {lead.reply && <textarea aria-label="Draf balasan" rows={4} value={lead.reply} onChange={e => update(lead.id, { reply: e.target.value })} />}
        <div className="x-row"><AiButton className="outline-button" label={lead.reply ? "Tulis ulang draf" : "Draf balasan AI"} busy={ai.busy === "lead" + lead.id} onClick={() => draft(lead)} />{lead.reply && <button className="primary-button" onClick={() => { navigator.clipboard?.writeText(lead.reply); setCopied(lead.id); update(lead.id, { status: lead.status === "Baru" ? "Dibalas" : lead.status }); }}><Copy size={14} /> {copied === lead.id ? "Tersalin" : "Salin & tandai dibalas"}</button>}<button className="outline-button x-danger" aria-label="Hapus lead" onClick={() => setLeads(old => old.filter(l => l.id !== lead.id))}><Trash2 size={14} /></button></div>
      </article>)}</div>
    </section>
  </div>;
}

export function SharedPlanPage() {
  const [campaigns] = useStored<Campaign[]>("campaigns", DEFAULT_CAMPAIGNS);
  const [accounts] = useStored<string[]>("accounts", DEFAULT_ACCOUNTS);
  const [briefs, setBriefs] = useStored<Record<string, Brief>>("briefs", {});
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? 0);
  const campaign = campaigns.find(c => c.id === campaignId) ?? campaigns[0];
  if (!campaign) return <div className="module-page"><p className="x-empty">Belum ada campaign. Buat di Content Plan.</p></div>;
  const plan = buildPlan(campaign, briefs);
  const patch = (day: number, value: Brief) => setBriefs(old => ({ ...old, [briefKey(campaign.id, day)]: { ...old[briefKey(campaign.id, day)], ...value } }));
  const approved = plan.filter(s => s.client === "approved").length;
  return <div className="module-page x-shared">
    <div className="x-row x-noprint"><select aria-label="Pilih campaign" value={campaign.id} onChange={e => setCampaignId(Number(e.target.value))}>{accounts.map(a => <optgroup key={a} label={a}>{campaigns.filter(c => c.account === a).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>)}</select><button className="primary-button" onClick={() => window.print()}><Printer size={14} /> Cetak / simpan PDF</button><span className="muted-chip">Tampilan klien — tanpa data AI, biaya, atau catatan internal</span></div>
    <section className="x-cover"><span>CONTENT PLAN · {campaign.period}</span><h2>{campaign.account}</h2><p>{campaign.name}</p><div><b>{plan.length}</b> konten · <b>{plan.filter(s => s.format === "Reels").length}</b> Reels · <b>{plan.filter(s => s.format !== "Reels").length}</b> Carousel/Feed · tujuan: {campaign.goal}</div></section>
    <section className="panel"><div className="agent-section-heading"><div><h3>Rencana publikasi 30 hari</h3><p>{approved} dari {plan.length} konten disetujui klien.</p></div></div>
      <div className="x-cal">{plan.map(s => <div key={s.day} className={s.client === "approved" ? "ok" : ""}><b>{String(s.day).padStart(2, "0")}</b><span>{s.format}</span><small>{s.title}</small></div>)}</div>
    </section>
    <section className="panel"><div className="agent-section-heading"><div><h3>Detail konten</h3><p>Klien dapat menyetujui atau meminta revisi per konten.</p></div></div>
      <div className="x-approvals">{plan.map(s => <article className="x-approval" key={s.day}>
        <div className="x-approval-head"><span className="approval-file-icon">{String(s.day).padStart(2, "0")}</span><div><b>{s.title}</b><small>{s.format} · {s.pillar}</small></div><span className={`x-status x-${s.client === "approved" ? "approved" : s.client === "revision" ? "revision" : "pending"}`}>{s.client === "approved" ? "Disetujui" : s.client === "revision" ? "Revisi" : "Menunggu"}</span></div>
        <p className="x-quote">{s.hook}</p>
        <div className="x-row x-noprint"><input aria-label={`Catatan klien konten ${s.day}`} value={s.note ?? ""} onChange={e => patch(s.day, { note: e.target.value })} placeholder="Catatan klien (opsional)" /><button className="primary-button" onClick={() => patch(s.day, { client: "approved" })}><Check size={14} /> Setujui</button><button className="outline-button" onClick={() => patch(s.day, { client: "revision" })}>Minta revisi</button></div>
        {s.note && <p className="x-note">Catatan klien: {s.note}</p>}
      </article>)}</div>
    </section>
  </div>;
}

/** Runs a free-form task as one of the agents and files the output for human approval. */
export async function runAgentTask(agent: { name: string; group: string }, task: string, workspace: string): Promise<string> {
  const tier: Tier = agent.group === "Strategy" || agent.group === "Creative" ? "creative" : "light";
  return askAI({ tier, role: agent.name, prompt: `Workspace: ${workspace}\nTugas: ${task}\n\nKerjakan sesuai peranmu dan berikan hasil yang siap diperiksa pemilik akun.`, maxTokens: 6000 });
}

export { WandSparkles };
