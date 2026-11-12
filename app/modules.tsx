"use client";

import { useState } from "react";
import { Check, Copy, Eye, EyeOff, FileText, Loader2, MessageCircle, Plus, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { askAI, CHEAP_MODEL, type Tier } from "./lib/ai";
import { costIdr, monthKey, rupiah } from "./lib/logic";
import { parseLines } from "./lib/logic";
import { aiReady, CLOUD_OFF, saveSecret, signInWithEmail, signInWithPassword, signOut, signUpWithPassword, type Cloud } from "./lib/cloud";
import { useCallLog, addApproval, useApprovals, useIdeas, useLeads, useSettings, useStored, useUsage, writeStored, type Lead } from "./lib/store";

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
  const ready = useAiReady();
  return <div className="x-cost"><b>Biaya AI bulan ini: {rupiah(usage.idr)}</b><span>{ready ? `${percent}% dari batas ${rupiah(settings.budgetIdr)} · ${usage.calls} panggilan` : "API key belum diisi — buka Settings"}</span><i><em style={{ width: percent + "%" }} /></i></div>;
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

export const useCloud = () => useStored<Cloud>("cloud", CLOUD_OFF);
/** AI can run when the signed-in user has a key on the server, or a key is kept in this browser. */
export function useAiReady() { const [cloud] = useCloud(); const [settings] = useSettings(); return aiReady(cloud, settings.apiKey); }

export function AccountPanel() {
  const [cloud] = useCloud();
  const [mode, setMode] = useState<"password" | "signup" | "link">("password");
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [notice, setNotice] = useState("");
  const ai = useAI();
  if (cloud.email) return <section className="f-account"><div><b>Masuk sebagai {cloud.email}</b><small>{cloud.sync === "syncing" ? "Menyinkronkan…" : cloud.sync === "error" ? `Sinkronisasi gagal: ${cloud.error}` : "Data tersinkron ke database. Bisa dibuka dari perangkat lain."}</small></div><button className="outline-button" onClick={() => signOut()}>Keluar</button></section>;
  const validEmail = () => { if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error("Email belum valid."); };
  const submit = () => ai.run("login", async () => {
    validEmail(); setNotice("");
    if (mode === "link") { await signInWithEmail(email.trim()); setNotice(`Link masuk dikirim ke ${email.trim()}. Buka email itu di perangkat ini.`); return; }
    if (password.length < 8) throw new Error("Kata sandi minimal 8 karakter.");
    if (mode === "password") { await signInWithPassword(email.trim(), password); return; }
    const needsConfirm = await signUpWithPassword(email.trim(), password);
    if (needsConfirm) { setNotice("Akun dibuat. Klik link konfirmasi di email Anda — kalau halaman tujuannya error, abaikan saja, akun tetap terkonfirmasi. Lalu kembali ke sini dan pilih “Masuk”."); setMode("password"); }
  });
  return <section className="f-account"><div><b>Masuk untuk menyimpan ke database</b><small>Data dan API key tersimpan aman di server, dan sama di ponsel maupun laptop. Tanpa masuk, data hanya ada di browser ini.</small></div>
    <div className="f-chips f-account-modes" role="tablist">{([["password", "Masuk"], ["signup", "Buat akun"], ["link", "Link email"]] as const).map(([m, label]) => <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? "active" : ""} onClick={() => { setMode(m); setNotice(""); }}>{label}</button>)}</div>
    <div className="f-account-form"><input type="email" aria-label="Email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nama@email.com" autoComplete="email" />
      {mode !== "link" && <input type="password" aria-label="Kata sandi" value={password} onChange={e => setPassword(e.target.value)} placeholder="Kata sandi (min. 8 karakter)" autoComplete={mode === "signup" ? "new-password" : "current-password"} onKeyDown={e => { if (e.key === "Enter") submit(); }} />}
      <AiButton className="primary-button" label={mode === "password" ? "Masuk" : mode === "signup" ? "Buat akun" : "Kirim link masuk"} busyLabel="Memproses…" busy={ai.busy === "login"} onClick={submit} /></div>
    {notice && <p className="x-ok">{notice}</p>}<AiError message={ai.error} /></section>;
}

/** A key field: saved encrypted on the server when signed in, otherwise kept in this browser. */
function KeyField({ id, label, hint, placeholder, server, local, setLocal }: { id: string; label: string; hint: React.ReactNode; placeholder: string; server: "anthropic" | "google" | "meta_token" | "ig_user_id"; local: string; setLocal: (v: string) => void }) {
  const [cloud] = useCloud();
  const [draft, setDraft] = useState(""), [show, setShow] = useState(false);
  const ai = useAI();
  const savedAt = cloud.keys[server];
  if (!cloud.email) return <div className="settings-field"><label htmlFor={id}>{label}</label><div className="x-row"><input id={id} type={show ? "text" : "password"} value={local} onChange={e => setLocal(e.target.value)} placeholder={placeholder} autoComplete="off" /><button className="outline-button" onClick={() => setShow(!show)} aria-label={show ? "Sembunyikan" : "Tampilkan"}>{show ? <EyeOff size={15} /> : <Eye size={15} />}</button></div><small>{hint} Tersimpan hanya di browser ini.</small></div>;
  const save = (value: string) => ai.run(id, async () => { await saveSecret(server, value); setDraft(""); if (value) setLocal(""); });
  return <div className="settings-field"><label htmlFor={id}>{label}</label>
    {savedAt && <p className="x-ok">Tersimpan terenkripsi di server · {new Date(savedAt).toLocaleDateString("id-ID", { dateStyle: "medium" })}</p>}
    <div className="x-row"><input id={id} type={show ? "text" : "password"} value={draft} onChange={e => setDraft(e.target.value)} placeholder={savedAt ? "Isi untuk mengganti" : placeholder} autoComplete="off" /><button className="outline-button" onClick={() => setShow(!show)} aria-label={show ? "Sembunyikan" : "Tampilkan"}>{show ? <EyeOff size={15} /> : <Eye size={15} />}</button></div>
    <div className="x-row"><AiButton className="primary-button" label="Simpan ke server" busyLabel="Menyimpan…" busy={ai.busy === id} onClick={() => draft.trim() && save(draft.trim())} />{local && !savedAt && <button className="outline-button" onClick={() => save(local)}>Pindahkan key dari browser ini</button>}{savedAt && <button className="outline-button x-danger" onClick={() => save("")}>Hapus dari server</button>}</div>
    <small>{hint}</small><AiError message={ai.error} /></div>;
}

/** Typical tokens per trigger (input, output) measured on short Indonesian drafts; used for the estimate column. */
const TRIGGERS: [string, string, "light" | "creative", number, number][] = [
  ["Judul campaign", "Buat campaign / Susun ulang judul (30 judul)", "creative", 450, 1300],
  ["Brief lengkap siap review", "Jalankan agen per konten (brief + storyboard + caption + jadwal)", "creative", 550, 900],
  ["Paket produksi", "Studio → Paket produksi (bila diminta)", "light", 650, 650],
  ["Caption final + jadwal", "Studio → Minta SMM merapikan (bila diminta)", "light", 400, 280],
  ["Bedah akun", "Riset → Bedah akun", "creative", 900, 1100],
  ["Generate hooks", "Riset → Generate hooks", "creative", 220, 350],
  ["Draf balasan lead", "Inbox & Leads → Draf balasan AI", "light", 280, 220],
  ["Pertajam teks slide", "Studio → Pertajam teks", "light", 180, 50],
  ["Tugas bebas", "AI Agent → Tugas bebas", "creative", 300, 900]
];

export function CostPanel() {
  const [settings, setSettings] = useSettings();
  const [log, setLog] = useCallLog();
  const modelFor = (tier: "light" | "creative") => (settings.costMode === "hemat" ? CHEAP_MODEL : tier === "light" ? settings.lightModel : settings.creativeModel);
  const actual = new Map<string, { n: number; idr: number }>();
  log.forEach(c => { const k = c.label.startsWith("Tugas bebas") ? "Tugas bebas" : c.label; const a = actual.get(k) ?? { n: 0, idr: 0 }; actual.set(k, { n: a.n + 1, idr: a.idr + c.idr }); });
  return <section className="f-cost">
    <div className="f-cost-head"><div><b>Mode biaya</b><small>{settings.costMode === "hemat" ? `Hemat: semua tugas memakai ${CHEAP_MODEL} tanpa “thinking”. Rata-rata Rp 5–25 per panggilan.` : "Kualitas: memakai model rutin/kreatif yang Anda pilih di bawah. Bisa Rp 100–400 per panggilan dengan Sonnet."}</small></div>
      <div className="f-chips" role="radiogroup" aria-label="Mode biaya">{(["hemat", "kualitas"] as const).map(m => <button key={m} role="radio" aria-checked={settings.costMode === m} className={settings.costMode === m ? "active" : ""} onClick={() => setSettings(o => ({ ...o, costMode: m }))}>{m === "hemat" ? "Hemat" : "Kualitas"}</button>)}</div></div>
    <div className="settings-field"><label htmlFor="maxcall">BATAS BIAYA PER PANGGILAN (RUPIAH)</label><input id="maxcall" type="number" min={0} step={5} value={settings.maxCallIdr} onChange={e => setSettings(o => ({ ...o, maxCallIdr: Math.max(0, Number(e.target.value) || 0) }))} /><small>Panjang jawaban dibatasi otomatis agar biaya terburuk satu panggilan tidak melewati angka ini. Isi 0 untuk tanpa batas.</small></div>
    <div className="scroll"><table className="f-cost-table"><thead><tr><th>Pemicu</th><th>Model</th><th>Perkiraan / panggilan</th><th>Rata-rata nyata</th></tr></thead><tbody>
      {TRIGGERS.map(([label, trigger, tier, i, o]) => { const m = modelFor(tier); const a = actual.get(label); return <tr key={label}><td><b>{label}</b><small>{trigger}</small></td><td>{m.replace("claude-", "")}</td><td>{rupiah(costIdr(m, i, o, settings.usdToIdr))}</td><td>{a ? `${rupiah(a.idr / a.n)} · ${a.n}×` : "—"}</td></tr>; })}
    </tbody></table></div>
    <p className="f-help">Satu konten dari ide sampai siap review = <b>1 panggilan</b> (brief + storyboard + caption + jadwal). Paket produksi dan rapikan caption hanya berjalan bila Anda memintanya.</p>
    <div className="f-h-row"><h4 className="f-h">Riwayat biaya ({log.length} panggilan terakhir)</h4>{log.length > 0 && <button className="outline-button" onClick={() => setLog([])}>Kosongkan riwayat</button>}</div>
    {!log.length ? <p className="x-empty">Belum ada panggilan sejak fitur ini aktif.</p> : <div className="scroll"><table className="f-cost-table"><thead><tr><th>Waktu</th><th>Pemicu</th><th>Model</th><th>Token masuk/keluar</th><th>Biaya</th></tr></thead><tbody>
      {log.slice(0, 30).map(c => <tr key={c.at + c.label}><td>{new Date(c.at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</td><td>{c.label}</td><td>{c.model.replace("claude-", "")}</td><td>{c.input.toLocaleString("id-ID")} / {c.output.toLocaleString("id-ID")}</td><td className={c.idr > settings.maxCallIdr && settings.maxCallIdr > 0 ? "f-over" : ""}>{rupiah(c.idr)}</td></tr>)}
    </tbody></table></div>}
  </section>;
}

export function ApiSettingsTab() {
  const [settings, setSettings] = useSettings();
  const [cloud] = useCloud();
  const { usage } = useMonthUsage();
  const [testResult, setTestResult] = useState("");
  const ai = useAI();
  const set = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) => setSettings(old => ({ ...old, [key]: value }));
  return <>
    <AccountPanel />
    <p className="settings-security-note"><ShieldCheck size={16} /> {cloud.email ? "Key disimpan terenkripsi (Supabase Vault) dan hanya dipakai oleh server. Browser tidak pernah menerimanya kembali." : "Belum masuk: key disimpan di browser ini saja dan dikirim langsung ke penyedia API. Jangan isi di komputer bersama."}</p>
    <KeyField id="apikey" label="ANTHROPIC API KEY" server="anthropic" placeholder="sk-ant-…" local={settings.apiKey} setLocal={v => set("apiKey", v)} hint="Dibuat di console.anthropic.com → API Keys. Wajib untuk semua fitur AI." />
    <div className="x-row"><AiButton className="primary-button" label="Tes koneksi AI" busyLabel="Mengetes…" busy={ai.busy === "test"} onClick={() => ai.run("test", async () => { setTestResult(""); const text = await askAI({ tier: "light", role: "asisten", label: "Tes koneksi", prompt: "Balas dengan satu kata: OK", maxTokens: 300 }); setTestResult("Terhubung. Balasan model: " + text); })} /></div>
    {testResult && <p className="x-ok">{testResult}</p>}<AiError message={ai.error} />
    <div className="settings-divider" />
    <CostPanel />
    <div className="settings-divider" />
    <div className="settings-field"><label htmlFor="light">MODEL TUGAS RUTIN — dipakai di mode Kualitas</label><select id="light" value={settings.lightModel} onChange={e => set("lightModel", e.target.value)}>{MODELS.map(m => <option key={m[0]} value={m[0]}>{m[1]}</option>)}</select></div>
    <div className="settings-field"><label htmlFor="creative">MODEL KREATIF — dipakai di mode Kualitas</label><select id="creative" value={settings.creativeModel} onChange={e => set("creativeModel", e.target.value)}>{MODELS.map(m => <option key={m[0]} value={m[0]}>{m[1]}</option>)}</select></div>
    <div className="settings-field"><label htmlFor="budget">BATAS BIAYA AI PER BULAN (RUPIAH)</label><input id="budget" type="number" min={0} step={10000} value={settings.budgetIdr} onChange={e => set("budgetIdr", Number(e.target.value) || 0)} /><small>Semua fitur AI berhenti otomatis saat batas tercapai. Isi 0 untuk tanpa batas.</small></div>
    <div className="settings-field"><label htmlFor="kurs">KURS USD → RUPIAH (untuk perkiraan biaya)</label><input id="kurs" type="number" min={1} value={settings.usdToIdr} onChange={e => set("usdToIdr", Number(e.target.value) || 1)} /></div>
    <div className="model-routing-cards"><article><span>BULAN INI</span><b>{rupiah(usage.idr)}</b><small>{usage.calls} panggilan AI</small></article><article><span>TOKEN MASUK</span><b>{usage.inputTokens.toLocaleString("id-ID")}</b><small>prompt + konteks brand</small></article><article><span>TOKEN KELUAR</span><b>{usage.outputTokens.toLocaleString("id-ID")}</b><small>hasil tulisan</small></article></div>
    <div className="settings-divider" />
    <KeyField id="gkey" label="GOOGLE API KEY (Asset Library — membaca folder Google Drive)" server="google" placeholder="AIza…" local={settings.googleApiKey} setLocal={v => set("googleApiKey", v)} hint="Google Cloud Console → Credentials → API key, lalu aktifkan “Google Drive API”. Batasi key hanya ke Google Drive API; Application restrictions biarkan None. Folder harus dibagikan “Siapa saja yang memiliki link”." />
    <div className="settings-divider" />
    <KeyField id="meta" label="META ACCESS TOKEN (opsional — bedah akun Instagram otomatis)" server="meta_token" placeholder="EAAG…" local={settings.metaToken} setLocal={v => set("metaToken", v)} hint="Token dari Meta for Developers dengan izin instagram_basic. Hanya membaca akun Business/Creator publik." />
    <KeyField id="igid" label="INSTAGRAM USER ID (akun Business/Creator Anda)" server="ig_user_id" placeholder="1784…" local={settings.igUserId} setLocal={v => set("igUserId", v)} hint="Tanpa token Meta dan ID ini, Bedah Akun tetap jalan dari caption yang Anda tempel." />
  </>;
}

export function ModelRouterPanel() {
  const { usage, settings, percent } = useMonthUsage();
  const ready = useAiReady();
  return <section className="panel x-router"><div className="agent-section-heading"><div><h3>Model router & biaya</h3><p>Tugas rutin memakai model murah; model kreatif hanya untuk naskah, strategi, dan analisis.</p></div><span className="muted-chip">{ready ? "AI aktif" : "API key belum diisi"}</span></div>
    <div className="model-routing-cards"><article><span>RUTIN</span><b>{settings.costMode === "hemat" ? CHEAP_MODEL : settings.lightModel}</b><small>Community Manager, Social Media Manager, Workflow</small></article><article><span>KREATIF</span><b>{settings.costMode === "hemat" ? CHEAP_MODEL : settings.creativeModel}</b><small>Research, Strategist, Writer, Designer, Video Editor</small></article><article><span>BULAN INI</span><b>{rupiah(usage.idr)}</b><small>{percent}% dari batas {rupiah(settings.budgetIdr)} · {usage.calls} panggilan</small></article></div>
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
  const draft = (lead: Lead) => ai.run("lead" + lead.id, async () => { const reply = await askAI({ tier: "light", role: "Community Manager", label: "Draf balasan lead", maxTokens: 500, prompt: `Tulis draf balasan untuk calon klien jasa foto interior FORIOR. Ramah, singkat (maksimal 80 kata), ajak lanjut ke WhatsApp atau minta detail properti (lokasi, jumlah ruangan, tanggal). Jangan menyebut harga pasti; tulis [HARGA PAKET] bila perlu.\n\nNama: ${lead.name}\nSumber: ${lead.source}\nPesan: ${lead.message}` }); update(lead.id, { reply }); });
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

/** Runs a free-form task as one of the agents and files the output for human approval. */
export async function runAgentTask(agent: { name: string; group: string }, task: string, workspace: string): Promise<string> {
  const tier: Tier = agent.group === "Strategy" || agent.group === "Creative" ? "creative" : "light";
  return askAI({ tier, role: agent.name, label: `Tugas bebas · ${agent.name}`, maxTokens: 1500, prompt: `Workspace: ${workspace}\nTugas: ${task}\n\nKerjakan sesuai peranmu dan berikan hasil yang siap diperiksa pemilik akun.` });
}

export const notify = (message: string) => writeStored<string>("toast", message, "");
