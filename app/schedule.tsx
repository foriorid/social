"use client";

// Jadwal Shoot: shoots (projects with a shoot date) and events from several connected Google Calendars in one
// month view. New shoots can be created here directly; they become a project and, optionally, a Calendar event.
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Users, Check, ChevronLeft, ChevronRight, Copy, Eye, EyeOff, Link2, Loader2, MapPin, Plus, RefreshCw, Star, Trash2, X } from "lucide-react";
import { SUPABASE_URL, readCloud, supabase } from "./lib/cloud";
import { useStored } from "./lib/store";
import { monthGrid } from "./lib/flow";
import { notify, useCloud } from "./modules";
import { PHASE_CLASS, fmtShoot } from "./delivery";
import { createProjectFromPlan } from "./business";
import { dayOf, isEmail, type CalEvent } from "../supabase/functions/gcal/gcal";
import { PHASE_SHORT, type Gallery } from "../supabase/functions/gallery/delivery";

type Row = { id: string; data: Gallery };
type Account = { id: string; email: string; color: string; is_default: boolean; calendar_id: string };
/** Calendar link per project, kept in workspace state (not in the gallery, which clients can read). */
type Sync = { accountId: string; email: string; eventId: string; start: string; hours: number; location: string; link: string; guests?: string[] };
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const DAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const TYPES = ["Villa", "Rumah", "Apartemen", "Hotel", "Kantor", "Restoran / Cafe", "Kost", "Lainnya"];
const REDIRECT = `${SUPABASE_URL}/functions/v1/gcal`;
const pad = (n: number) => String(n).padStart(2, "0");
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const timeOf = (iso: string) => (/T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "");

async function gcal<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("gcal", { body: { action, workspaceId: readCloud().workspaceId, ...payload } });
  if (error) { let d: { error?: string } = {}; try { d = await (error as { context?: Response }).context?.json(); } catch { /* not JSON */ } throw new Error(d.error ?? error.message); }
  return data as T;
}

const jkt = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", ...o }).format(new Date(iso));
/** "Kam, 19 Nov 2026 · 10:00–11:00" or "Sab, 21 Nov 2026 · Sepanjang hari" (Google's all-day end date is exclusive). */
function whenOf(e: CalEvent): string {
  if (e.allDay) {
    const last = new Date(new Date(`${e.end}T00:00:00Z`).getTime() - 864e5).toISOString().slice(0, 10);
    const f = (d: string) => new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${d}T00:00:00Z`));
    return `${f(e.start)}${last > e.start ? ` – ${f(last)}` : ""} · Sepanjang hari`;
  }
  return `${jkt(e.start, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · ${jkt(e.start, { hour: "2-digit", minute: "2-digit", hour12: false })}–${jkt(e.end, { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

export function CalendarPage({ openGallery }: { openGallery: (id: string) => void; go?: (nav: string) => void }) {
  const [cloud] = useCloud();
  const ws = readCloud().workspaceId ?? "";
  const [rows, setRows] = useState<Row[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [calErrors, setCalErrors] = useState<{ email: string; error: string }[]>([]);
  const [loadingCal, setLoadingCal] = useState(false);
  const [sync, setSync] = useStored<Record<string, Sync>>("shootSync", {});
  const [hidden, setHidden] = useStored<string[]>("gcalHidden", []);
  const now = new Date();
  const [month, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [form, setForm] = useState<null | { client: string; wa: string; clientEmails: string[]; crew: string[]; invite: boolean; name: string; type: string; date: string; time: string; hours: number; location: string; quota: number; notes: string; account: string }>(null);
  const [busy, setBusy] = useState("");
  const [picked, setPicked] = useState<CalEvent | null>(null);
  const [crewBook, setCrewBook] = useStored<string[]>("crewEmails", []);
  const isAdmin = ["owner", "admin"].includes(cloud.workspaces.find(w => w.id === ws)?.role ?? "");
  const hasClient = !!cloud.keys.google_client_id && !!cloud.keys.google_client_secret;

  const loadBase = useCallback(async () => {
    const [g, a] = await Promise.all([
      supabase.from("galleries").select("id, data").eq("workspace_id", ws),
      supabase.from("gcal_accounts").select("id, email, color, is_default, calendar_id").eq("workspace_id", ws).order("created_at")
    ]);
    setRows((g.data ?? []) as Row[]); setAccounts((a.data ?? []) as Account[]);
  }, [ws]);
  const loadEvents = useCallback(async () => {
    if (!accounts.length) { setEvents([]); return; }
    setLoadingCal(true);
    try {
      const from = new Date(month.y, month.m, 1 - 7), to = new Date(month.y, month.m + 1, 8);
      const r = await gcal<{ events: CalEvent[]; errors: { email: string; error: string }[] }>("events", { timeMin: from.toISOString(), timeMax: to.toISOString() });
      setEvents(r.events); setCalErrors(r.errors);
    } catch (e) { setCalErrors([{ email: "", error: e instanceof Error ? e.message : String(e) }]); }
    finally { setLoadingCal(false); }
  }, [accounts.length, month.y, month.m]);
  useEffect(() => { loadBase(); }, [loadBase]);
  useEffect(() => { loadEvents(); }, [loadEvents]);
  // Back from Google's consent screen.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search), st = q.get("gcal");
    if (!st) return;
    notify(st === "ok" ? `Google Calendar ${q.get("email") ?? ""} terhubung.` : st === "cancel" ? "Menghubungkan Google Calendar dibatalkan." : `Gagal: ${q.get("msg") ?? "coba lagi"}`);
    ["gcal", "email", "msg"].forEach(k => q.delete(k));
    window.history.replaceState(null, "", window.location.pathname + (q.toString() ? `?${q}` : "") + window.location.hash);
  }, []);

  const connect = async () => {
    setBusy("connect");
    try { const r = await gcal<{ url: string }>("connect", { ret: window.location.origin + window.location.pathname }); window.location.href = r.url; }
    catch (e) { notify(e instanceof Error ? e.message : String(e)); setBusy(""); }
  };
  const makeDefault = async (a: Account) => {
    await supabase.from("gcal_accounts").update({ is_default: false }).eq("workspace_id", ws).neq("id", a.id);
    const { error } = await supabase.from("gcal_accounts").update({ is_default: true }).eq("id", a.id);
    if (error) return notify(error.message); loadBase();
  };
  const disconnect = async (a: Account) => {
    if (!window.confirm(`Lepas ${a.email}? Event yang sudah dibuat tetap ada di Google Calendar.`)) return;
    try { await gcal("disconnect", { accountId: a.id }); notify(`${a.email} dilepas.`); loadBase(); } catch (e) { notify(e instanceof Error ? e.message : String(e)); }
  };
  const pushToCalendar = async (r: Row, accountId: string, extra: Partial<Sync> = {}) => {
    const prev = sync[r.id], g = r.data;
    if (!g.shootDate) return notify("Project ini belum punya jadwal shoot.");
    const hours = extra.hours ?? prev?.hours ?? 2, location = extra.location ?? prev?.location ?? "", guests = extra.guests ?? prev?.guests ?? [];
    const link = `${window.location.origin}${window.location.pathname}`;
    const res = await gcal<{ eventId: string; link: string; email: string; accountId: string }>("upsert", {
      accountId, eventId: prev?.accountId === accountId ? prev.eventId : undefined, start: g.shootDate, hours, location, guests: extra.guests ?? [], // only new invitations; Google keeps existing guests on update
      summary: `📷 Shoot · ${g.title}`, description: [g.client?.company && `Klien: ${g.client.company}`, g.client?.contact && `PIC: ${g.client.contact}`, g.client?.whatsapp && `WA: ${g.client.whatsapp}`, g.client?.email && `Email: ${g.client.email}`, g.selectionLimit ? `Kuota edit: ${g.selectionLimit} foto` : "", g.plan?.details, `Project: ${link}`].filter(Boolean).join("\n")
    });
    setSync(o => ({ ...o, [r.id]: { accountId: res.accountId, email: res.email, eventId: res.eventId, start: g.shootDate!, hours, location, link: res.link, ...(guests.length ? { guests } : {}) } }));
    return res;
  };
  const sendRow = async (r: Row) => {
    const acct = sync[r.id]?.accountId ?? accounts.find(a => a.is_default)?.id ?? accounts[0]?.id;
    if (!acct) return notify("Hubungkan akun Google dulu.");
    setBusy(r.id);
    try { const res = await pushToCalendar(r, acct); if (res) notify(`Masuk ke Google Calendar ${res.email}.`); loadEvents(); } catch (e) { notify(e instanceof Error ? e.message : String(e)); } finally { setBusy(""); }
  };
  const openNew = (date = "") => setForm({ client: "", wa: "", clientEmails: [], crew: [], invite: true, name: "", type: TYPES[0], date: date || todayIso(), time: "10:00", hours: 2, location: "", quota: 20, notes: "", account: accounts.find(a => a.is_default)?.id ?? "" });
  const saveNew = async () => {
    if (!form) return;
    if (!form.client.trim() || !form.name.trim()) return notify("Isi nama klien dan nama project/properti.");
    if (!form.date || !/^\d{2}:\d{2}$/.test(form.time)) return notify("Isi tanggal dan jam shoot.");
    const guests = [...new Set([...form.clientEmails, ...form.crew])];
    if (guests.length > 10) return notify("Maksimal 10 email undangan per shoot.");
    setBusy("new");
    try {
      const id = await createProjectFromPlan({ clientName: form.client.trim(), clientWhatsapp: form.wa.trim(), clientEmail: form.clientEmails[0], propertyType: form.type, propertyName: form.name.trim(), details: form.notes.trim(), packageCount: Math.max(0, form.quota), shootDate: form.date, shootTime: form.time });
      const { data } = await supabase.from("galleries").select("id, data").eq("id", id).single();
      if (form.crew.length) setCrewBook(b => [...new Set([...form.crew, ...b])].slice(0, 20));
      if (form.account && data) { try { await pushToCalendar(data as Row, form.account, { hours: form.hours, location: form.location.trim(), ...(form.invite && guests.length ? { guests } : {}) }); } catch (e) { notify(`Project dibuat, tapi gagal masuk Calendar: ${e instanceof Error ? e.message : e}`); } }
      else setSync(o => ({ ...o, [id]: { accountId: "", email: "", eventId: "", start: `${form.date}T${form.time}`, hours: form.hours, location: form.location.trim(), link: "" } }));
      setForm(null); notify("Shoot dijadwalkan dan project dibuat di Photo Delivery."); loadBase(); loadEvents();
    } catch (e) { notify(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  };

  const shoots = (rows ?? []).filter(r => r.data.shootDate);
  const ourEvents = new Set(Object.values(sync).map(s => s.eventId).filter(Boolean));
  const visible = events.filter(e => !hidden.includes(e.accountId) && !ourEvents.has(e.id));
  const byDay = new Map<string, { kind: "shoot" | "event"; key: string; label: string; time: string; color: string; onClick: () => void }[]>();
  const put = (d: string, x: { kind: "shoot" | "event"; key: string; label: string; time: string; color: string; onClick: () => void }) => byDay.set(d, [...(byDay.get(d) ?? []), x]);
  for (const r of shoots) put(r.data.shootDate!.slice(0, 10), { kind: "shoot", key: r.id, label: r.data.title, time: timeOf(r.data.shootDate!), color: "#7c4de2", onClick: () => openGallery(r.id) });
  for (const e of visible) put(dayOf(e.start), { kind: "event", key: e.accountId + e.id, label: e.summary, time: e.allDay ? "" : timeOf(new Date(e.start).toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }).replace(" ", "T")), color: e.color, onClick: () => setPicked(e) });
  for (const list of byDay.values()) list.sort((a, b) => a.time.localeCompare(b.time));
  const today = todayIso();
  const upcoming = shoots.filter(r => r.data.shootDate!.slice(0, 10) >= today).sort((a, b) => a.data.shootDate!.localeCompare(b.data.shootDate!));
  const shift = (d: number) => setMonth(({ y, m }) => { const t = new Date(y, m + d, 1); return { y: t.getFullYear(), m: t.getMonth() }; });

  return <div className="module-page sc">
    <div className="sc-bar">
      <div className="cx-monthnav"><button className="cx-icon" onClick={() => shift(-1)} aria-label="Bulan sebelumnya"><ChevronLeft size={18} /></button><h3>{MONTHS[month.m]} {month.y}</h3><button className="cx-icon" onClick={() => shift(1)} aria-label="Bulan berikutnya"><ChevronRight size={18} /></button><button className="outline-button" onClick={() => setMonth({ y: now.getFullYear(), m: now.getMonth() })}>Hari ini</button>{loadingCal && <Loader2 size={16} className="lg-spin" />}</div>
      <button className="primary-button" onClick={() => openNew()}><Plus size={16} /> Shoot baru</button>
    </div>
    <div className="sc-layout">
      <section className="panel sc-cal">
        <div className="cx-grid">{DAYS.map(d => <b key={d} className="cx-dow">{d}</b>)}
          {monthGrid(month.y, month.m).map((d, i) => { const list = d ? byDay.get(d) ?? [] : []; return <div key={i} className={`cx-day ${!d ? "pad" : ""} ${d === today ? "today" : ""}`}>
            {d && <><button className="cx-daynum" onClick={() => openNew(d)} aria-label={`Shoot baru ${d}`}>{Number(d.slice(8))}<Plus size={12} /></button>
              {list.slice(0, 3).map(x => <button key={x.key} className={`sc-ev ${x.kind}`} style={{ "--c": x.color } as React.CSSProperties} onClick={x.onClick} title={`${x.time} ${x.label}`}>{x.time && <i>{x.time}</i>}<span>{x.kind === "shoot" ? "📷 " : ""}{x.label}</span></button>)}
              {list.length > 3 && <small className="cx-more">+{list.length - 3} lagi</small>}</>}
          </div>; })}
        </div>
        {calErrors.map(e => <p key={e.email + e.error} className="x-error">{e.email ? `${e.email}: ` : ""}{e.error}</p>)}
      </section>
      <aside className="sc-side">
        <section className="panel sc-accounts">
          <h3><CalendarDays size={17} /> Google Calendar</h3>
          {accounts.map(a => <div key={a.id} className="sc-acct"><i style={{ background: a.color }} /><span><b>{a.email}</b>{a.is_default ? <small><Star size={11} /> default untuk shoot baru</small> : <button className="cx-link" onClick={() => makeDefault(a)}>Jadikan default</button>}</span>
            <button className="cx-icon" onClick={() => setHidden(h => h.includes(a.id) ? h.filter(x => x !== a.id) : [...h, a.id])} aria-label={hidden.includes(a.id) ? "Tampilkan" : "Sembunyikan"}>{hidden.includes(a.id) ? <EyeOff size={15} /> : <Eye size={15} />}</button>
            {isAdmin && <button className="cx-icon" onClick={() => disconnect(a)} aria-label={`Lepas ${a.email}`}><Trash2 size={14} /></button>}</div>)}
          {!accounts.length && <p className="cx-hint">Belum ada akun. Hubungkan satu atau beberapa akun Google (mis. akun project dan akun pribadi); event-nya tampil di kalender ini dan shoot baru bisa langsung masuk ke kalender akun pilihan.</p>}
          {isAdmin && (hasClient ? <button className="outline-button cx-wide" disabled={busy === "connect"} onClick={connect}><Link2 size={15} /> {accounts.length ? "Tambah akun Google" : "Hubungkan Google Calendar"}</button>
            : <div className="sc-setup"><b>Sekali saja: siapkan OAuth Google</b><ol><li>Google Cloud Console → aktifkan <i>Google Calendar API</i>.</li><li>OAuth consent screen → External → tambahkan email Anda sebagai Test user (atau Publish).</li><li>Credentials → OAuth client ID → Web application. Authorized redirect URI:</li></ol><div className="ad-copy"><code>{REDIRECT}</code><button className="cx-link" onClick={() => navigator.clipboard?.writeText(REDIRECT).then(() => notify("Redirect URI disalin."))}><Copy size={13} /> Salin</button></div><p className="cx-hint">Simpan Client ID &amp; Secret di Settings → AI &amp; Models.</p></div>)}
        </section>
        <section className="panel sc-upcoming">
          <h3>Shoot mendatang <span className="muted-chip">{upcoming.length}</span></h3>
          {!rows ? <p className="x-empty">Memuat…</p> : !upcoming.length ? <p className="x-empty">Belum ada shoot terjadwal.</p> : upcoming.map(r => { const s = sync[r.id]; const stale = s?.eventId && s.start !== r.data.shootDate; return <div key={r.id} className="sc-row">
            <button className="sc-row-main" onClick={() => openGallery(r.id)}><b>{fmtShoot(r.data.shootDate)}</b><span>{r.data.title}</span><small>{r.data.client?.contact ?? r.data.client?.company ?? ""}{s?.location ? <> · <MapPin size={11} /> {s.location}</> : null}</small></button>
            <div className="sc-row-side"><em className={`dl-phase ${PHASE_CLASS[r.data.phase]}`}>{PHASE_SHORT[r.data.phase]}</em>
              {accounts.length > 0 && (s?.eventId && !stale ? <a className="sc-synced" href={s.link} target="_blank" rel="noreferrer" title={s.email}><Check size={12} /> Calendar</a> : <button className="cx-link" disabled={busy === r.id} onClick={() => sendRow(r)}>{busy === r.id ? <Loader2 size={12} className="lg-spin" /> : stale ? <RefreshCw size={12} /> : <Plus size={12} />} {stale ? "Perbarui" : "Ke Calendar"}</button>)}</div>
          </div>; })}
        </section>
      </aside>
    </div>

    {picked && <div className="modal-backdrop" onClick={() => setPicked(null)}><div className="quick-modal sc-detail" role="dialog" aria-label={picked.summary} onClick={e => e.stopPropagation()}>
      <button className="modal-close" onClick={() => setPicked(null)} aria-label="Tutup"><X size={18} /></button>
      <div className="sc-detail-head"><i style={{ background: picked.color }} /><div><h2>{picked.summary}</h2><p>{whenOf(picked)}</p></div></div>
      <dl className="sc-detail-list">
        {picked.location && <><dt><MapPin size={15} /></dt><dd><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(picked.location)}`} target="_blank" rel="noreferrer">{picked.location}</a></dd></>}
        {picked.meet && <><dt><Link2 size={15} /></dt><dd><a href={picked.meet} target="_blank" rel="noreferrer">Gabung Google Meet</a></dd></>}
        {(picked.guests ?? 0) > 0 && <><dt><Users size={15} /></dt><dd>{picked.guests} tamu diundang</dd></>}
        <dt><CalendarDays size={15} /></dt><dd>{picked.email}</dd>
      </dl>
      {picked.description && <p className="sc-detail-desc">{picked.description}</p>}
      <div className="cp-modal-actions">
        {picked.link && <a className="outline-button" href={picked.link} target="_blank" rel="noreferrer">Buka di Google Calendar</a>}
        <button className="primary-button" onClick={() => { const e = picked; const d = e.allDay ? e.start : dayOf(e.start); const t = e.allDay ? "10:00" : jkt(e.start, { hour: "2-digit", minute: "2-digit", hour12: false }).replace(".", ":"); const hours = e.allDay ? 2 : Math.max(0.5, Math.round(((Date.parse(e.end) - Date.parse(e.start)) / 36e5) * 2) / 2); setPicked(null); setForm({ client: "", wa: "", clientEmails: [], crew: [], invite: false, name: e.summary.replace(/^\[[^\]]*\]\s*/, ""), type: TYPES[0], date: d, time: t, hours, location: e.location, quota: 20, notes: e.description ?? "", account: "" }); }}><Plus size={15} /> Jadikan shoot</button>
      </div>
    </div></div>}
    {form && <div className="modal-backdrop" onClick={() => setForm(null)}><div className="quick-modal cp-modal" role="dialog" aria-label="Shoot baru" onClick={e => e.stopPropagation()}>
      <button className="modal-close" onClick={() => setForm(null)} aria-label="Tutup"><X size={18} /></button>
      <div className="cp-modal-head"><span className="modal-icon"><CalendarDays size={21} /></span><div><h2>Shoot baru</h2><p>Langsung jadi project di Photo Delivery{accounts.length ? " dan, bila dipilih, event di Google Calendar" : ""}. Tidak perlu lewat Photo Planner.</p></div></div>
      <div className="cx-form">
        <label className="cx-f"><span>Nama klien <b>*</b></span><input autoFocus value={form.client} onChange={e => setForm({ ...form, client: e.target.value })} placeholder="Bu Rina / PT Mosaic" /></label>
        <label className="cx-f"><span>WhatsApp</span><input value={form.wa} inputMode="tel" onChange={e => setForm({ ...form, wa: e.target.value })} placeholder="0812…" /></label>
        <div className="cx-f"><span>Email klien <small>bisa lebih dari satu</small></span><EmailChips value={form.clientEmails} onChange={v => setForm({ ...form, clientEmails: v })} placeholder="klien@email.com" /></div>
        <div className="cx-f"><span>Email fotografer / tim</span><EmailChips value={form.crew} onChange={v => setForm({ ...form, crew: v })} placeholder="fotografer@email.com" suggestions={crewBook} /></div>
        <label className="cx-f wide ad-check sc-invite"><input type="checkbox" checked={form.invite} disabled={!form.account || !(form.clientEmails.length + form.crew.length)} onChange={e => setForm({ ...form, invite: e.target.checked })} /><span>Kirim undangan Google Calendar ke {form.clientEmails.length + form.crew.length || "semua"} email di atas<small>{!form.account ? "Pilih akun Calendar di bawah dulu." : "Mereka menerima undangan & pengingat dari Google."}</small></span></label>
        <label className="cx-f"><span>Nama project / properti <b>*</b></span><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Villa Intragama Puncak" /></label>
        <label className="cx-f"><span>Tipe properti</span><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
        <label className="cx-f"><span>Tanggal <b>*</b></span><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
        <div className="cx-f"><span>Jam &amp; durasi</span><div className="cx-range"><input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} aria-label="Jam mulai" /><i>selama</i><div className="cx-unit"><input type="number" min={0.5} max={12} step={0.5} value={form.hours} onChange={e => setForm({ ...form, hours: Number(e.target.value) || 2 })} aria-label="Durasi" /><em>jam</em></div></div></div>
        <label className="cx-f wide"><span>Lokasi</span><input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Jl. Raya Puncak No. 12, Bogor (atau link Google Maps)" /></label>
        <label className="cx-f"><span>Kuota foto edit</span><div className="cx-unit"><input type="number" min={0} max={500} value={form.quota} onChange={e => setForm({ ...form, quota: Number(e.target.value) || 0 })} /><em>foto</em></div></label>
        <label className="cx-f"><span>Simpan ke Google Calendar</span><select value={form.account} onChange={e => setForm({ ...form, account: e.target.value })}><option value="">Jangan simpan ke Calendar</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.email}</option>)}</select></label>
        <label className="cx-f wide"><span>Catatan / brief singkat</span><textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Area: living, kamar, pool. Golden hour untuk eksterior." /></label>
      </div>
      <div className="cp-modal-actions"><button className="outline-button" onClick={() => setForm(null)}>Batal</button><button className="primary-button" disabled={busy === "new"} onClick={saveNew}>{busy === "new" ? <Loader2 size={15} className="lg-spin" /> : <Check size={15} />} Jadwalkan</button></div>
    </div></div>}
  </div>;
}


/** Several emails in one field: Enter, comma or space adds one; click a chip to remove it. */
function EmailChips({ value, onChange, placeholder, suggestions = [] }: { value: string[]; onChange: (v: string[]) => void; placeholder: string; suggestions?: string[] }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const parts = raw.split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
    const bad = parts.filter(x => !isEmail(x));
    if (bad.length) notify(`Email belum valid: ${bad.join(", ")}`);
    const next = [...new Set([...value, ...parts.filter(isEmail)])];
    if (next.length !== value.length) onChange(next);
    setDraft(bad.join(" "));
  };
  const left = suggestions.filter(x => !value.includes(x)).slice(0, 4);
  return <div className="sc-emails">
    <div className="cx-chipsel">{value.map(e => <button type="button" key={e} className="active" onClick={() => onChange(value.filter(x => x !== e))} aria-label={`Hapus ${e}`}>{e} <X size={12} /></button>)}
      <input type="email" value={draft} placeholder={value.length ? "+ email lain" : placeholder} autoComplete="off" onChange={e => { const v = e.target.value; if (/[\s,;]$/.test(v)) add(v); else setDraft(v); }} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (draft.trim()) add(draft); } if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1)); }} onBlur={() => draft.trim() && add(draft)} onPaste={e => { const t = e.clipboardData.getData("text"); if (/[\s,;]/.test(t.trim())) { e.preventDefault(); add(t); } }} /></div>
    {left.length > 0 && <div className="sc-suggest">{left.map(x => <button type="button" key={x} onClick={() => onChange([...value, x])}><Plus size={11} /> {x}</button>)}</div>}
  </div>;
}
