"use client";

// Settings: everything the old eight tabs held, grouped into four (Workspace, AI & Models, Integrasi, Akses)
// with collapsible cards so a phone screen shows a short list instead of one long page.
import { useState } from "react";
import { Bell, Bot, UserRound, BriefcaseBusiness, Calculator, Check, ChevronDown, Cloud as CloudIcon, Database, Info, Instagram, KeyRound, Layers, Music2, ShieldCheck, Sparkles, Trash2, Users, WandSparkles, Youtube, CalendarDays, Gauge, History } from "lucide-react";
import { AccountPanel, AiButton, AiError, KeyField, MODELS, notify, TRIGGERS, useAI, useCloud, useMonthUsage } from "./modules";
import { TeamSettings } from "./team";
import { askAI, CHEAP_MODEL } from "./lib/ai";
import { activeWorkspace, setDisplayName } from "./lib/cloud";
import { useTheme, type ThemeChoice } from "./lib/theme";
import { costIdr, rupiah } from "./lib/logic";
import { useCallLog, useSettings } from "./lib/store";

type Tab = "Workspace" | "AI & Models" | "Integrasi" | "Akses";
const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => <button className={`settings-toggle ${checked ? "on" : ""}`} onClick={() => onChange(!checked)} aria-pressed={checked}><i /></button>;

/** A card with a summary row that opens to its fields. */
function Group({ icon, title, sub, status, open: initial = false, children }: { icon: React.ReactNode; title: string; sub?: string; status?: React.ReactNode; open?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(initial);
  return <section className={`sx-group${open ? " open" : ""}`}>
    <button className="sx-row" onClick={() => setOpen(o => !o)} aria-expanded={open}><span className="sx-ic">{icon}</span><span className="sx-x"><b>{title}</b>{sub && <small>{sub}</small>}</span>{status}<ChevronDown size={17} className="sx-chev" /></button>
    {open && <div className="sx-body">{children}</div>}
  </section>;
}
const Ok = ({ on, off = "Belum diatur" }: { on: boolean; off?: string }) => on ? <em className="sx-ok"><Check size={12} /> Terhubung</em> : <em className="sx-no">{off}</em>;

export function SettingsPage() {
  const [cloud] = useCloud();
  const ws = activeWorkspace(cloud);
  const isEditor = ws?.role === "editor";
  const tabs: Tab[] = ["Workspace", "AI & Models", "Integrasi", "Akses"];
  const shown = isEditor ? tabs.filter(t => t !== "AI & Models") : tabs;
  const [tab, setTab] = useState<Tab>("Workspace");
  const icon = (t: Tab) => (t === "Workspace" ? <BriefcaseBusiness size={15} /> : t === "AI & Models" ? <WandSparkles size={15} /> : t === "Integrasi" ? <Layers size={15} /> : <Users size={15} />);
  return <div className="module-page sx-page">
    <div className="sx-tabs" role="tablist">{shown.map(t => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{icon(t)}{t}</button>)}</div>
    {tab === "Workspace" && <WorkspaceTab go={setTab} />}
    {tab === "AI & Models" && !isEditor && <AiTab />}
    {tab === "Integrasi" && <IntegrationsTab isEditor={isEditor} />}
    {tab === "Akses" && <AccessTab />}
  </div>;
}

/** Light / dark / follow the device, for this device only. */
function ThemeGroup() {
  const [theme, setTheme] = useTheme();
  const opts: [ThemeChoice, string, string][] = [["light", "Terang", "☀︎"], ["dark", "Gelap", "☾"], ["system", "Ikuti sistem", "◐"]];
  return <Group icon={<Gauge size={17} />} title="Tampilan" sub={`${opts.find(o => o[0] === theme)?.[1] ?? "Terang"} · disimpan di perangkat ini`}>
    <div className="sx-theme" role="radiogroup" aria-label="Tampilan">{opts.map(([v, label, icon]) => <button key={v} role="radio" aria-checked={theme === v} className={theme === v ? "on" : ""} onClick={() => setTheme(v)}><i>{icon}</i>{label}</button>)}</div>
    <small className="sx-hint">Halaman yang dilihat klien (penawaran, pricelist, galeri) tetap terang.</small>
  </Group>;
}

/** Display name for the greeting and avatar; stored on the account, so it follows the user across workspaces. */
function ProfileGroup() {
  const [cloud] = useCloud();
  const [name, setName] = useState(cloud.name ?? ""), [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { await setDisplayName(name); notify("Nama tampilan disimpan."); } catch (e) { notify(`Gagal menyimpan: ${e instanceof Error ? e.message : e}`); } setBusy(false); };
  return <Group icon={<UserRound size={17} />} title={cloud.name ?? "Nama tampilan"} sub={cloud.name ? `Nama tampilan · ${cloud.email ?? ""}` : "Belum diatur · dipakai di sapaan Dashboard"} open={!cloud.name}>
    <div className="settings-field"><label htmlFor="sx-name">NAMA TAMPILAN</label><input id="sx-name" value={name} maxLength={60} placeholder="mis. Alvian" onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") save(); }} /><small>Tampil di sapaan Dashboard ("Selamat pagi, {name.trim() || "Alvian"}") dan avatar. Berlaku di semua workspace Anda.</small></div>
    <button className="primary-button" disabled={busy || name.trim() === (cloud.name ?? "")} onClick={save}><Check size={14} /> Simpan</button>
  </Group>;
}

// ---------- Workspace: info, brand identity, notifications, and a summary of the other tabs ----------
function WorkspaceTab({ go }: { go: (t: Tab) => void }) {
  const [cloud] = useCloud();
  const ws = activeWorkspace(cloud);
  const [settings, setSettings] = useSettings();
  const { usage, percent } = useMonthUsage();
  const [tone, setTone] = useState("Educative, warm & confident");
  const [emailNotif, setEmailNotif] = useState(true), [approvalNotif, setApprovalNotif] = useState(true), [weeklyReport, setWeeklyReport] = useState(false);
  const role = ws?.role === "owner" ? "Owner" : ws?.role === "admin" ? "Admin" : "Editor";
  const keys = cloud.keys;
  return <>
    <div className="sx-hero"><div><b>Pengaturan Workspace</b><small>Identitas, brand, AI, integrasi, dan akses tim {ws?.name ?? ""}.</small></div><BriefcaseBusiness size={30} /></div>
    <h3 className="sx-h">Profil</h3>
    <ProfileGroup />
    <ThemeGroup />
    <h3 className="sx-h">Informasi</h3>
    <Group icon={<BriefcaseBusiness size={17} />} title={`${ws?.name ?? "Workspace"} · ${ws?.kind === "business" ? "Business" : "Personal"}`} sub={`${role} · ${cloud.email ?? ""}`}>
      <div className="settings-field"><label>WORKSPACE NAME</label><input value={ws?.name ?? ""} readOnly /><small>Nama workspace tampil di pemilih workspace. Perubahan nama menyusul.</small></div>
      <div className="settings-field"><label>WORKSPACE TYPE</label><select><option>Personal Brand</option><option>Business Workspace</option><option>Client Project</option></select></div>
      <div className="settings-field"><label>DEFAULT TIMEZONE</label><select><option>Asia/Jakarta (GMT+7)</option><option>Asia/Makassar (GMT+8)</option><option>Asia/Jayapura (GMT+9)</option></select></div>
      <div className="settings-option-row"><div><b>Require approval before publishing</b><small>Content must be approved by workspace owner before scheduling or publishing.</small></div><Toggle checked={settings.requireApproval} onChange={v => setSettings(o => ({ ...o, requireApproval: v }))} /></div>
    </Group>
    <Group icon={<Sparkles size={17} />} title="Brand identity" sub={`${settings.brandName} · ${settings.handle}`}>
      <div className="settings-field"><label>BRAND / CREATOR NAME</label><input value={settings.brandName} onChange={e => setSettings(o => ({ ...o, brandName: e.target.value }))} /></div>
      <div className="settings-field"><label>PRIMARY SOCIAL HANDLE</label><input value={settings.handle} onChange={e => setSettings(o => ({ ...o, handle: e.target.value }))} /></div>
      <div className="settings-field"><label>BRAND VOICE</label><select value={tone} onChange={e => setTone(e.target.value)}><option>Educative, warm & confident</option><option>Premium, minimal & aspirational</option><option>Friendly, conversational & witty</option><option>Professional & informative</option></select></div>
      <div className="settings-field"><label>BRAND GUIDELINES</label><textarea rows={4} value={settings.brandVoice} onChange={e => setSettings(o => ({ ...o, brandVoice: e.target.value }))} /><small>Dipakai sebagai gaya bahasa di setiap permintaan AI.</small></div>
      <div className="settings-option-row"><div><b>Use workspace brand kit in production</b><small>Apply approved logo, colors, and typography to generated assets.</small></div><Toggle checked={true} onChange={() => {}} /></div>
    </Group>
    <Group icon={<Bell size={17} />} title="Notifikasi" sub="Email, pengingat approval, laporan mingguan">
      {[{ title: "Email notifications", desc: "Important workspace activity and invitations.", value: emailNotif, change: setEmailNotif }, { title: "Approval reminders", desc: "Notify reviewers when content needs their attention.", value: approvalNotif, change: setApprovalNotif }, { title: "Weekly performance report", desc: "Receive a summary of content and channel performance.", value: weeklyReport, change: setWeeklyReport }].map(n => <div className="settings-option-row" key={n.title}><div><b>{n.title}</b><small>{n.desc}</small></div><Toggle checked={n.value} onChange={n.change} /></div>)}
    </Group>
    {ws?.role !== "editor" && <>
      <h3 className="sx-h">AI &amp; biaya</h3>
      <button className="sx-sum" onClick={() => go("AI & Models")}><span><small>Bulan ini</small><b>{rupiah(usage.idr)}</b><em>{usage.calls} panggilan</em></span><span><small>Batas per bulan</small><b>{settings.budgetIdr ? rupiah(settings.budgetIdr) : "Tanpa batas"}</b><em>{settings.budgetIdr ? `terpakai ${percent}%` : "—"}</em></span></button>
      <h3 className="sx-h">Integrasi</h3>
      <div className="sx-list">{[["Anthropic (Claude)", "Semua fitur AI", !!keys.anthropic, "AI & Models"], ["Google Drive", "Asset Library", !!keys.google, "Integrasi"], ["Google Calendar", "Jadwal Shoot", !!(keys.google_client_id && keys.google_client_secret), "Integrasi"], ["Meta / Instagram", "Auto DM, Bedah Akun", !!(keys.meta_token && keys.ig_user_id), "Integrasi"]].map(([t, s, on, to]) =>
        <button key={t as string} className="sx-row" onClick={() => go(to as Tab)}><span className="sx-x"><b>{t as string}</b><small>{s as string}</small></span><Ok on={on as boolean} /></button>)}</div>
    </>}
  </>;
}

// ---------- AI & Models ----------
function AiTab() {
  const [sub, setSub] = useState<"config" | "usage">("config");
  return <>
    <div className="sx-seg" role="tablist"><button role="tab" aria-selected={sub === "config"} className={sub === "config" ? "on" : ""} onClick={() => setSub("config")}>Model &amp; Konfigurasi</button><button role="tab" aria-selected={sub === "usage"} className={sub === "usage" ? "on" : ""} onClick={() => setSub("usage")}>Riwayat &amp; Penggunaan</button></div>
    {sub === "config" ? <AiConfig /> : <AiUsage />}
  </>;
}

function AiConfig() {
  const [settings, setSettings] = useSettings();
  const [cloud] = useCloud();
  const ai = useAI();
  const [testResult, setTestResult] = useState(""), [saved, setSaved] = useState(false);
  const set = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) => setSettings(old => ({ ...old, [key]: value }));
  const modelFor = (tier: "light" | "creative") => (settings.costMode === "hemat" ? CHEAP_MODEL : tier === "light" ? settings.lightModel : settings.creativeModel);
  const name = (m: string) => MODELS.find(x => x[0] === m)?.[1].split(" — ")[0] ?? m;
  return <>
    <AccountPanel />
    <h3 className="sx-h">API &amp; koneksi</h3>
    <Group icon={<Bot size={17} />} title="Anthropic (Claude)" sub={cloud.keys.anthropic ? `Tersimpan terenkripsi · ${new Date(cloud.keys.anthropic).toLocaleDateString("id-ID", { dateStyle: "medium" })}` : "API key untuk semua fitur AI"} status={<Ok on={!!cloud.keys.anthropic || !!settings.apiKey} />}>
      <p className="settings-security-note"><ShieldCheck size={16} /> {cloud.email ? "Satu set key dipakai bersama oleh semua workspace, disimpan terenkripsi (Supabase Vault) dan hanya dipakai server. Pemakaian dan biaya AI dicatat terpisah per workspace." : "Belum masuk: key disimpan di browser ini saja dan dikirim langsung ke Anthropic."}</p>
      <KeyField id="apikey" label="ANTHROPIC API KEY" server="anthropic" placeholder="sk-ant-…" local={settings.apiKey} setLocal={v => set("apiKey", v)} hint="Dibuat di console.anthropic.com → API Keys. Wajib untuk semua fitur AI." />
      <div className="x-row"><AiButton className="outline-button" label="Tes koneksi AI" busyLabel="Mengetes…" busy={ai.busy === "test"} onClick={() => ai.run("test", async () => { setTestResult(""); const text = await askAI({ tier: "light", role: "asisten", label: "Tes koneksi", prompt: "Balas dengan satu kata: OK", maxTokens: 20 }); setTestResult(`Terhubung. Jawaban model: ${text}`); })} /></div>
      {testResult && <p className="x-ok">{testResult}</p>}<AiError message={ai.error} />
    </Group>

    <h3 className="sx-h">Mode biaya</h3>
    <div className="sx-modes" role="radiogroup" aria-label="Mode biaya">{(["hemat", "kualitas"] as const).map(m => <button key={m} role="radio" aria-checked={settings.costMode === m} className={settings.costMode === m ? "on" : ""} onClick={() => set("costMode", m)}>
      <b>{m === "hemat" ? "Hemat" : "Kualitas"}</b><small>{m === "hemat" ? `Semua tugas memakai ${name(CHEAP_MODEL)} tanpa “thinking”. Rata-rata Rp 5–25 per panggilan.` : "Memakai model rutin/kreatif di bawah. Bisa Rp 100–400 per panggilan dengan Sonnet."}</small></button>)}</div>

    <h3 className="sx-h">Model yang digunakan</h3>
    <div className="sx-list">
      <label className="sx-row sx-static"><span className="sx-ic"><Sparkles size={17} /></span><span className="sx-x"><b>Tugas rutin</b><small>Dipakai di mode Kualitas · caption, balasan, teks</small></span><select value={settings.lightModel} onChange={e => set("lightModel", e.target.value)}>{MODELS.map(m => <option key={m[0]} value={m[0]}>{m[1].split(" — ")[0].replace("Claude ", "")}</option>)}</select></label>
      <label className="sx-row sx-static"><span className="sx-ic"><Layers size={17} /></span><span className="sx-x"><b>Tugas kreatif</b><small>Dipakai di mode Kualitas · brief, strategi, analisis</small></span><select value={settings.creativeModel} onChange={e => set("creativeModel", e.target.value)}>{MODELS.map(m => <option key={m[0]} value={m[0]}>{m[1].split(" — ")[0].replace("Claude ", "")}</option>)}</select></label>
    </div>

    <h3 className="sx-h">Batas biaya &amp; kontrol</h3>
    <div className="sx-two">
      <label className="sx-num"><span><Gauge size={15} /> Per panggilan</span><span className="sx-rp">Rp<input type="number" min={0} step={5} value={settings.maxCallIdr} onChange={e => set("maxCallIdr", Math.max(0, Number(e.target.value) || 0))} /></span><small>Panjang jawaban dibatasi agar tidak melewati angka ini. 0 = tanpa batas.</small></label>
      <label className="sx-num"><span><CalendarDays size={15} /> Per bulan</span><span className="sx-rp">Rp<input type="number" min={0} step={10000} value={settings.budgetIdr} onChange={e => set("budgetIdr", Number(e.target.value) || 0)} /></span><small>Semua fitur AI berhenti saat batas tercapai. 0 = tanpa batas.</small></label>
    </div>
    <Group icon={<Calculator size={17} />} title="Estimasi biaya per fitur" sub="Perkiraan per panggilan dengan model saat ini">
      <div className="sx-est">{TRIGGERS.map(([label, trigger, tier, i, o]) => { const m = modelFor(tier); return <div key={label}><span className="sx-x"><b>{label}</b><small>{trigger} · {m.replace("claude-", "")}</small></span><b>{rupiah(costIdr(m, i, o, settings.usdToIdr))}</b></div>; })}</div>
      <p className="f-help">Satu konten dari ide sampai siap review = <b>1 panggilan</b> (brief + storyboard + caption + jadwal). Paket produksi dan rapikan caption hanya berjalan bila Anda memintanya.</p>
    </Group>
    <Group icon={<Info size={17} />} title="Lanjutan" sub={`Kurs USD → Rp ${settings.usdToIdr.toLocaleString("id-ID")}`}>
      <div className="settings-field"><label htmlFor="kurs">KURS USD → RUPIAH (untuk perkiraan biaya)</label><input id="kurs" type="number" min={1} value={settings.usdToIdr} onChange={e => set("usdToIdr", Number(e.target.value) || 1)} /></div>
    </Group>
    <button className="primary-button sx-save" onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 1800); }}><Check size={15} /> {saved ? "Tersimpan" : "Simpan perubahan"}</button>
    <p className="sx-foot">Perubahan juga tersimpan otomatis ke workspace ini.</p>
  </>;
}

const CATS: [string, RegExp][] = [["Penawaran", /penawaran/i], ["Konten", /brief|caption|judul|paket|slide|campaign|produksi/i], ["Riset", /bedah|hook|riset|tren/i]];
function AiUsage() {
  const { usage, settings, percent } = useMonthUsage();
  const [log, setLog] = useCallLog();
  const [cat, setCat] = useState(""), [all, setAll] = useState(false);
  const rows = log.filter(c => !cat || (cat === "Lainnya" ? !CATS.some(([, r]) => r.test(c.label)) : CATS.find(([n]) => n === cat)![1].test(c.label)));
  const month = new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  return <>
    <div className="sx-month"><History size={15} /> {month}</div>
    <div className="sx-stats">
      <div><small>Total biaya</small><b>{rupiah(usage.idr)}</b><em>{settings.budgetIdr ? `${percent}% dari ${rupiah(settings.budgetIdr)}` : "tanpa batas"}</em></div>
      <div><small>Panggilan</small><b>{usage.calls}</b><em>{usage.calls ? `rata-rata ${rupiah(usage.idr / usage.calls)}` : "—"}</em></div>
      <div><small>Token masuk</small><b>{usage.inputTokens.toLocaleString("id-ID")}</b><em>prompt + konteks brand</em></div>
      <div><small>Token keluar</small><b>{usage.outputTokens.toLocaleString("id-ID")}</b><em>hasil tulisan</em></div>
    </div>
    <div className="sx-hrow"><h3 className="sx-h">Riwayat ({log.length} panggilan terakhir)</h3>{log.length > 0 && <button className="outline-button" onClick={() => { if (window.confirm("Kosongkan riwayat biaya?")) setLog([]); }}><Trash2 size={14} /> Kosongkan</button>}</div>
    <div className="sx-chips">{["", ...CATS.map(c => c[0]), "Lainnya"].map(c => <button key={c || "all"} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>{c || "Semua"}</button>)}</div>
    {!rows.length ? <p className="x-empty">Belum ada panggilan{cat ? " di kategori ini" : " sejak fitur ini aktif"}.</p> :
      <div className="sx-list sx-log">{(all ? rows : rows.slice(0, 10)).map(c => <div key={c.at + c.label} className="sx-row sx-static"><span className="sx-x"><b>{c.label}</b><small>{new Date(c.at).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {c.model.replace("claude-", "")} · {c.input.toLocaleString("id-ID")} / {c.output.toLocaleString("id-ID")} token</small></span><b className={settings.maxCallIdr > 0 && c.idr > settings.maxCallIdr ? "sx-over" : ""}>{rupiah(c.idr)}</b></div>)}</div>}
    {rows.length > 10 && <button className="outline-button sx-save" onClick={() => setAll(a => !a)}>{all ? "Tampilkan lebih sedikit" : `Lihat semua riwayat (${rows.length})`}</button>}
  </>;
}

// ---------- Integrasi: the keys that used to sit under AI, social accounts, and the not-yet-active credentials ----------
function IntegrationsTab({ isEditor }: { isEditor: boolean }) {
  const [cloud] = useCloud();
  const [settings, setSettings] = useSettings();
  const [values, setValues] = useState<Record<string, string>>({});
  const k = cloud.keys;
  const fields = (list: { key: string; label: string; placeholder?: string }[]) => list.map(f => <div className="settings-field" key={f.key}><label>{f.label}</label><input type="password" autoComplete="off" value={values[f.key] || ""} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} placeholder={f.placeholder ?? ""} /></div>);
  return <>
    {!isEditor && <>
      <h3 className="sx-h">Terhubung ke Hub</h3>
      <Group icon={<CloudIcon size={17} />} title="Google Drive" sub="Asset Library · API key" status={<Ok on={!!k.google || !!settings.googleApiKey} />}>
        <KeyField id="gkey" label="GOOGLE API KEY (Asset Library — membaca folder Google Drive)" server="google" placeholder="AIza…" local={settings.googleApiKey} setLocal={v => setSettings(o => ({ ...o, googleApiKey: v }))} hint="Google Cloud Console → Credentials → API key, lalu aktifkan “Google Drive API”. Batasi key hanya ke Google Drive API; Application restrictions biarkan None. Folder harus dibagikan “Siapa saja yang memiliki link”." />
      </Group>
      <Group icon={<CalendarDays size={17} />} title="Google Calendar" sub="Jadwal Shoot · OAuth client" status={<Ok on={!!(k.google_client_id && k.google_client_secret)} />}>
        <KeyField id="gcid" label="GOOGLE OAUTH CLIENT ID" server="google_client_id" placeholder="…apps.googleusercontent.com" local="" setLocal={() => {}} hint="Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application). Aktifkan Google Calendar API." />
        <KeyField id="gcsec" label="GOOGLE OAUTH CLIENT SECRET" server="google_client_secret" placeholder="GOCSPX-…" local="" setLocal={() => {}} hint="Dari OAuth client yang sama. Authorized redirect URI: lihat halaman Jadwal Shoot." />
      </Group>
      <Group icon={<Instagram size={17} />} title="Meta / Instagram" sub="Auto DM, Bedah Akun · 3 kolom" status={<Ok on={!!(k.meta_token && k.ig_user_id)} off={k.meta_token || k.ig_user_id || k.meta_app_secret ? "Sebagian" : "Belum diatur"} />}>
        <KeyField id="meta" label="META ACCESS TOKEN (Bedah Akun & Auto DM)" server="meta_token" placeholder="EAAG…" local={settings.metaToken} setLocal={v => setSettings(o => ({ ...o, metaToken: v }))} hint="Token dari Meta for Developers dengan izin instagram_basic. Hanya membaca akun Business/Creator publik." />
        <KeyField id="appsecret" label="META APP SECRET (Auto DM — verifikasi webhook)" server="meta_app_secret" placeholder="32 karakter dari App settings → Basic" local="" setLocal={() => {}} hint="Meta for Developers → aplikasi Anda → App settings → Basic → App secret. Dipakai server untuk memastikan webhook benar-benar dari Meta." />
        <KeyField id="igid" label="INSTAGRAM USER ID (akun Business/Creator Anda)" server="ig_user_id" placeholder="1784…" local={settings.igUserId} setLocal={v => setSettings(o => ({ ...o, igUserId: v }))} hint="Tanpa token Meta dan ID ini, Bedah Akun tetap jalan dari caption yang Anda tempel." />
      </Group>
    </>}
    <h3 className="sx-h">Akun sosial</h3>
    <Group icon={<Users size={17} />} title="Social accounts" sub="Instagram, TikTok, YouTube" status={<em className="sx-no">Belum terhubung</em>}>
      <div className="connected-accounts">{[{ name: "Instagram", user: "@alvian.indonesia", icon: Instagram }, { name: "TikTok", user: "@alvian.indonesia", icon: Music2 }, { name: "YouTube", user: "Alvian Indonesia", icon: Youtube }].map(a => { const Icon = a.icon; return <div className="connected-account-row" key={a.name}><span><Icon size={18} /></span><div><b>{a.name}</b><small>{a.user}</small></div><em>Not connected</em><button className="outline-button" onClick={() => notify("Koneksi akun lewat OAuth resmi membutuhkan server. Untuk bedah akun Instagram, isi token Meta di Integrasi → Meta / Instagram.")}>Connect</button></div>; })}<p>Social account connections will use official OAuth permissions. Passwords are never stored in this workspace.</p></div>
    </Group>
    {!isEditor && <>
      <h3 className="sx-h">Kredensial lain</h3>
      <Group icon={<Database size={17} />} title="Integrations & API" sub="AI providers, database, social platform APIs · belum aktif" status={<em className="sx-no">Belum aktif</em>}>
        <div className="integration-settings">
          <div className="integration-warning"><ShieldCheck size={18} /><div><b>Credential fields are ready for setup</b><p>Semua field sengaja dikosongkan. Nilai yang diketik di sini hanya berada di memori halaman saat ini dan belum dikirim atau disimpan. Setelah backend dan encrypted secret vault tersedia, penyimpanan aman dapat diaktifkan.</p></div></div>
          <p className="x-ok">Key yang sudah berfungsi (Anthropic, Google, Meta) diatur di bagian di atas dan di tab AI &amp; Models.</p>
          <h4>AI providers</h4>{fields([{ key: "openai", label: "OpenAI API Key", placeholder: "sk-..." }, { key: "anthropic", label: "Anthropic API Key", placeholder: "sk-ant-..." }, { key: "gemini", label: "Google Gemini API Key", placeholder: "AIza..." }])}
          <h4>Database &amp; storage</h4>{fields([{ key: "supabaseUrl", label: "Supabase Project URL", placeholder: "https://your-project.supabase.co" }, { key: "supabaseAnon", label: "Supabase Anon / Publishable Key" }, { key: "supabaseService", label: "Supabase Service Role Key (server only)" }, { key: "googleClientId", label: "Google OAuth Client ID" }, { key: "googleClientSecret", label: "Google OAuth Client Secret" }])}
          <h4>Social platform APIs</h4>{fields([{ key: "metaAppId", label: "Meta App ID" }, { key: "metaAppSecret", label: "Meta App Secret" }, { key: "tiktokClientKey", label: "TikTok Client Key" }, { key: "tiktokClientSecret", label: "TikTok Client Secret" }, { key: "youtubeClientId", label: "YouTube OAuth Client ID" }, { key: "youtubeClientSecret", label: "YouTube OAuth Client Secret" }])}
          <div className="integration-warning subtle"><Info size={17} /><div><b>Important security note</b><p>Jangan simpan service-role key atau secret di browser. Semua credential harus dipindahkan ke server-side environment variables atau encrypted vault sebelum fitur API diaktifkan.</p></div></div>
        </div>
      </Group>
      <p className="sx-foot"><KeyRound size={13} /> Key yang terhubung tersimpan terenkripsi di server (Supabase Vault). Hanya Owner yang bisa mengubahnya.</p>
    </>}
  </>;
}

// ---------- Akses: team members and security ----------
function AccessTab() {
  return <>
    <h3 className="sx-h">Anggota tim</h3>
    <div className="sx-card"><TeamSettings /></div>
    <h3 className="sx-h">Keamanan</h3>
    <Group icon={<ShieldCheck size={17} />} title="Security" sub="Kontrol keamanan workspace" status={<em className="sx-no">Direncanakan</em>}>
      <div className="security-summary"><ShieldCheck size={22} /><div><b>Workspace security</b><small>Security controls will be enforced by the backend.</small></div></div>
      {[{ t: "Role-based access control", d: "Restrict projects, assets, and settings by team role." }, { t: "Session management", d: "Review active sessions and revoke access." }, { t: "Activity audit log", d: "Track approvals, edits, exports, and integration changes." }, { t: "Two-factor authentication", d: "Require an additional verification step for team members." }].map(item => <div className="settings-option-row" key={item.t}><div><b>{item.t}</b><small>{item.d}</small></div><span className="muted-chip">Planned</span></div>)}
    </Group>
  </>;
}
