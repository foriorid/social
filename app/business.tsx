"use client";

// FORIOR (business) workspace pages: the project-first dashboard, the Photo Planner slot and Calendar.
import { navigate } from "./lib/hashnav";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, Copy, ExternalLink, FileText, Images, Link2, Plus, RefreshCw } from "lucide-react";
import { activeWorkspace, readCloud, supabase } from "./lib/cloud";
import { notify, useCloud } from "./modules";
import { stageOf } from "./lib/flow";
import { useApprovals, useStored } from "./lib/store";
import { focusItems, mergeAgenda } from "./lib/dashboard";
import { shortIdr, totals, type Quote } from "./lib/quote";
import type { CalEvent } from "../supabase/functions/gcal/gcal";
import { PHASE_CLASS, fmtShoot, nextActionOf } from "./delivery";
import { usePlan } from "./plan-data";
import { PHASE_SHORT, driveThumb, newGallery, slugify, uniqueSlug, type Gallery } from "../supabase/functions/gallery/delivery";

type Row = { id: string; data: Gallery; updated_at: string };

function useWorkspaceGalleries() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    supabase.from("galleries").select("id, data, updated_at").eq("workspace_id", readCloud().workspaceId ?? "").order("updated_at", { ascending: false })
      .then(({ data, error }) => { if (error) setError(error.message); setRows((data ?? []) as Row[]); });
  }, []);
  return { rows, error };
}

export function BusinessDashboard({ go, openGallery }: { go: (nav: string) => void; openGallery: (id: string) => void }) {
  const { rows, error } = useWorkspaceGalleries();
  const [plan] = usePlan();
  const [approvals] = useApprovals();
  const [cloud] = useCloud();
  const isEditor = activeWorkspace(cloud)?.role === "editor";
  const [quotes] = useStored<Quote[]>("quotes", []);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [qstats, setQstats] = useState<Record<string, { n: number; last: string; answers: number }>>({});

  useEffect(() => {
    const from = new Date(); from.setHours(0, 0, 0, 0);
    supabase.functions.invoke("gcal", { body: { action: "events", workspaceId: readCloud().workspaceId, timeMin: from.toISOString(), timeMax: new Date(from.getTime() + 14 * 864e5).toISOString() } })
      .then(({ data }) => setEvents((data as { events?: CalEvent[] } | null)?.events ?? []), () => { /* no calendar connected: projects only */ });
  }, []);
  const published = quotes.filter(q => q.publishedAt && q.slug).map(q => q.slug);
  const key = published.join(",");
  useEffect(() => {
    if (isEditor || !published.length) return;
    Promise.all([
      supabase.from("quote_opens").select("slug, at").in("slug", published).order("at", { ascending: false }).limit(2000),
      supabase.from("quote_answers").select("slug").in("slug", published).limit(500)
    ]).then(([o, a]) => {
      const m: Record<string, { n: number; last: string; answers: number }> = {};
      for (const r of o.data ?? []) { const x = m[r.slug] ?? { n: 0, last: r.at, answers: 0 }; x.n++; m[r.slug] = x; }
      for (const r of a.data ?? []) { const x = m[r.slug] ?? { n: 0, last: "", answers: 0 }; x.answers++; m[r.slug] = x; }
      setQstats(m);
    });
  }, [key, isEditor]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = (rows ?? []).map(r => ({ ...r, next: nextActionOf(r.data) })).sort((a, b) => a.next.rank - b.next.rank);
  const active = list.filter(r => r.data.phase !== "Done");
  const action = list.filter(r => r.next.rank <= 3);
  const openRev = list.reduce((n, r) => n + r.data.revisions.filter(x => x.status === "Open").length, 0);
  const selecting = active.filter(r => r.data.phase === "Client Selection").length;
  const items = plan.campaigns.flatMap(c => c.items);
  const stage = (st: string) => items.filter(i => stageOf(i.status) === st).length;
  const now = new Date();
  const agenda = mergeAgenda(
    (rows ?? []).filter(r => r.data.shootDate).map(r => ({ key: r.id, start: r.data.shootDate!, title: r.data.title, where: r.data.plan?.propertyType, color: "#6a3fd0", source: "project" as const, galleryId: r.id })),
    events.map(e => ({ key: e.id, start: e.start, title: e.summary, where: e.location, color: e.color, source: "google" as const, allDay: e.allDay })), now);
  const week = agenda.filter(a => new Date(a.allDay ? `${a.start}T00:00:00` : a.start).getTime() < now.getTime() + 7 * 864e5);
  const sentQuotes = quotes.filter(q => q.publishedAt).sort((a, b) => (qstats[b.slug]?.last || b.publishedAt || "").localeCompare(qstats[a.slug]?.last || a.publishedAt || ""));
  const opened = sentQuotes.filter(q => qstats[q.slug]?.n).length, answered = sentQuotes.filter(q => qstats[q.slug]?.answers).length;
  const focus = focusItems({ actions: list.map(r => ({ id: r.id, title: r.data.title, text: r.next.text, rank: r.next.rank })), agenda,
    quotes: isEditor ? [] : sentQuotes.map(q => ({ title: q.client.name || q.title, lastOpen: qstats[q.slug]?.last, answers: qstats[q.slug]?.answers ?? 0 })), now });
  const thumbOf = (g: Gallery, w = 640) => { const p = g.finalPhotos[0] ?? g.draftPhotos[0] ?? g.previewPhotos.find(x => x.selected) ?? g.previewPhotos[0]; return p ? driveThumb(p.id, w) : ""; };
  const hero = list.filter(r => r.data.phase === "Done").map(r => thumbOf(r.data, 1400)).find(Boolean) ?? list.map(r => thumbOf(r.data, 1400)).find(Boolean);
  const dayLabel = (iso: string, allDay?: boolean) => { const d = new Date(allDay ? `${iso}T00:00:00` : iso); return { dow: d.toLocaleDateString("id-ID", { weekday: "short" }), day: d.getDate(), time: allDay ? "Sepanjang hari" : d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) }; };
  const ago = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 6e4); return m < 60 ? `${Math.max(1, m)} mnt lalu` : m < 1440 ? `${Math.round(m / 60)} jam lalu` : `${Math.round(m / 1440)} hari lalu`; };

  return <div className="module-page bd-page">
    <section className={`bd-hero${hero ? " photo" : ""}`}>
      {hero && <img src={hero} alt="" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = "none"; }} />}
      <div className="bd-hero-t">
        <small>FOKUS HARI INI</small>
        <h2>{focus.length ? <>{focus.length} hal butuh <span>perhatian</span></> : <>Create, deliver, <span>grow.</span></>}</h2>
        <div className="bd-chips">{focus.length ? focus.map((f, k) => <button key={k} className={`bd-chip ${f.tone}`} onClick={() => (f.galleryId ? openGallery(f.galleryId) : go(f.nav))}>{f.tone === "warn" ? <Clock3 size={13} /> : f.tone === "info" ? <CalendarDays size={13} /> : <CheckCircle2 size={13} />}<span>{f.text}</span></button>)
          : <span className="bd-chip ok"><CheckCircle2 size={13} /><span>Tidak ada yang mendesak. Saatnya cari klien baru.</span></span>}</div>
        <div className="bd-qa">{!isEditor && <button className="primary-button" onClick={() => navigate("Penawaran", "new")}><Plus size={15} /> Penawaran baru</button>}<button className="outline-button" onClick={() => navigate("Calendar", "new")}><Plus size={15} /> Project / shoot</button></div>
      </div>
    </section>

    <section className="bd-kpis">
      <button className="bd-kpi" onClick={() => go("Photo Delivery")}><span className="ic p"><Images size={18} /></span><span><b>{rows ? active.length : "…"}</b><small>Project berjalan</small><em>{selecting ? `${selecting} di tahap pemilihan` : openRev ? `${openRev} revisi terbuka` : "Semua lancar"}</em></span></button>
      <button className="bd-kpi" onClick={() => go("Photo Delivery")}><span className="ic w"><Clock3 size={18} /></span><span><b>{rows ? action.length : "…"}</b><small>Butuh tindakan</small><em className="w">{action[0] ? action[0].data.title : "Tidak ada"}</em></span></button>
      {isEditor ? <button className="bd-kpi" onClick={() => go("Photo Delivery")}><span className="ic b"><RefreshCw size={18} /></span><span><b>{rows ? openRev : "…"}</b><small>Revisi terbuka</small><em>{openRev ? "Perlu dikerjakan" : "Aman"}</em></span></button>
        : <button className="bd-kpi" onClick={() => go("Penawaran")}><span className="ic b"><FileText size={18} /></span><span><b>{sentQuotes.length}</b><small>Penawaran aktif</small><em className="g">{sentQuotes.length ? `${opened} dibuka · ${answered} dijawab` : "Belum ada yang dikirim"}</em></span></button>}
      <button className="bd-kpi" onClick={() => go("Calendar")}><span className="ic g"><CalendarDays size={18} /></span><span><b>{week.length}</b><small>Shoot 7 hari</small><em>{week[0] ? `Berikutnya ${dayLabel(week[0].start, week[0].allDay).dow}, ${dayLabel(week[0].start, week[0].allDay).day}` : "Belum ada jadwal"}</em></span></button>
    </section>

    <div className="bd-grid">
      <section className="panel bd-card bd-delivery">
        <div className="bd-head"><span className="bd-hi"><Images size={18} /></span><div><h3>Projects</h3><small>Urut dari yang paling butuh tindakan</small></div><button className="bd-link" onClick={() => go("Photo Delivery")}>Semua project <ArrowRight size={14} /></button></div>
        {error && <p className="x-error">{error}</p>}
        {!rows ? <p className="x-empty">Memuat galeri…</p> : !active.length ? <p className="x-empty">Belum ada project berjalan. Buat atau impor di Projects.</p> :
          <div className="bd-dl">{active.slice(0, 8).map(r => { const t = thumbOf(r.data); return <button key={r.id} className={`bd-dc${t ? "" : " empty"}`} onClick={() => openGallery(r.id)}>
            <i className="bd-dc-img">{t ? <img src={t} alt="" loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = "none"; }} /> : null}</i>
            <span><b>{r.data.title}</b><small>{r.next.text}</small><em className={`dl-phase ${PHASE_CLASS[r.data.phase]}`}>{PHASE_SHORT[r.data.phase]}</em></span></button>; })}</div>}
      </section>

      <div className="bd-side">
        <section className="panel bd-card">
          <div className="bd-head"><div><h3>Jadwal Shoot</h3><small>Project{events.length ? " & Google Calendar" : ""}</small></div><button className="bd-link" onClick={() => go("Calendar")}>Kalender <ArrowRight size={14} /></button></div>
          {agenda.length ? agenda.slice(0, 4).map(a => { const d = dayLabel(a.start, a.allDay); return <button key={a.key} className="bd-row" onClick={() => (a.galleryId ? openGallery(a.galleryId) : go("Calendar"))}>
            <span className="bd-date"><small>{d.dow}</small><b>{d.day}</b></span><span className="bd-x"><b>{a.title}</b><small>{[d.time, a.where].filter(Boolean).join(" · ")}</small></span><i style={{ background: a.color }} /></button>; })
            : <p className="x-empty">Belum ada shoot 2 minggu ke depan.</p>}
        </section>
        {!isEditor && <section className="panel bd-card">
          <div className="bd-head"><div><h3>Penawaran</h3><small>Status terbaru dari klien</small></div><button className="bd-link" onClick={() => go("Penawaran")}>Semua <ArrowRight size={14} /></button></div>
          {sentQuotes.length ? sentQuotes.slice(0, 3).map(q => { const st = qstats[q.slug]; return <button key={q.id} className="bd-row" onClick={() => go("Penawaran")}>
            <span className="bd-x"><b>{[q.client.name, q.eyebrow].filter(Boolean).join(" · ") || q.title}</b><small>{st?.n ? `Dibuka ${st.n}× · ${ago(st.last)}` : `Terkirim ${ago(q.publishedAt!)}`}</small></span>
            {st?.answers ? <em className="bd-st a">{st.answers} jawaban</em> : st?.n ? <em className="bd-st o">Dibuka</em> : <em className="bd-st s">Belum dibuka</em>}<span className="bd-pr">{shortIdr(totals(q).grand)}</span></button>; })
            : <p className="x-empty">Belum ada penawaran terkirim.</p>}
        </section>}
        <section className="panel bd-card">
          <div className="bd-head"><div><h3>Sosmed FORIOR</h3><small>Content Plan</small></div><button className="bd-link" onClick={() => go("Content Plan")}>Content Plan <ArrowRight size={14} /></button></div>
          <div className="bd-mini"><span><b>{plan.campaigns.length}</b>campaign</span><span><b>{stage("Draft") + stage("Brief Siap") + stage("Produksi")}</b>dikerjakan</span><span><b>{stage("Review")}</b>review</span><span><b>{approvals.filter(a => a.status === "pending").length}</b>approval</span></div>
        </section>
      </div>
    </div>
  </div>;
}

const dayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
/** Projects with a shoot from today on, soonest first. */
const upcomingShoots = (rows: Row[]) => rows.filter(r => r.data.shootDate && new Date(r.data.shootDate).getTime() >= dayStart()).sort((a, b) => a.data.shootDate!.localeCompare(b.data.shootDate!));

export type PlannerPlan = { clientName: string; clientWhatsapp?: string; clientEmail?: string; propertyType: string; propertyName?: string; size?: string; areas?: string[]; details?: string; estimatedPhotos?: number; packageName?: string; packagePrice?: string; packageCount?: number; shootDate?: string; shootTime?: string };

/** Turns a Photo Planner plan into a project (gallery) in the active workspace. Nothing is typed twice. */
export async function createProjectFromPlan(plan: PlannerPlan): Promise<string> {
  const ws = readCloud().workspaceId;
  if (!ws) throw new Error("Workspace belum dimuat.");
  const title = (plan.propertyName || `${plan.propertyType} ${plan.clientName}`).slice(0, 120);
  const { data: existing } = await supabase.from("galleries").select("slug").eq("workspace_id", ws);
  const taken = new Set((existing ?? []).map(r => r.slug as string));
  for (let attempt = 0; attempt < 4; attempt++) {
    const id = crypto.randomUUID();
    const slug = uniqueSlug(slugify(title), taken);
    const g: Gallery = {
      ...newGallery({ id, slug, title, client: { contact: plan.clientName, whatsapp: plan.clientWhatsapp ?? "", ...(plan.clientEmail ? { email: plan.clientEmail } : {}) }, selectionLimit: plan.packageCount ?? 0 }),
      shootDate: plan.shootDate ? `${plan.shootDate}T${plan.shootTime || "10:00"}` : undefined,
      plan: { source: "planner", propertyType: plan.propertyType, propertyName: plan.propertyName, size: plan.size, areas: plan.areas, details: plan.details, estimatedPhotos: plan.estimatedPhotos, packageName: plan.packageName, packagePrice: plan.packagePrice }
    };
    const { error } = await supabase.from("galleries").insert({ id, slug, data: g, workspace_id: ws });
    if (!error) return id;
    if (!/duplicate/i.test(error.message)) throw new Error(error.message);
    taken.add(slug); // slug used by another workspace: try the next suffix
  }
  throw new Error("Gagal membuat permalink unik. Coba lagi.");
}

/** Photo Planner: the client-facing planning tool, shown here in dashboard mode where a plan becomes a project. */
export function PhotoPlannerPage({ openGallery }: { openGallery: (id: string) => void }) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const base = typeof window === "undefined" ? "" : window.location.origin + window.location.pathname.replace(/\/$/, "");
  // Vercel serves exported .html files without the extension; GitHub Pages needs it.
  const src = `${base}/photo-planner${typeof window !== "undefined" && window.location.hostname.endsWith("github.io") ? ".html" : ""}`;
  const [created, setCreated] = useState<string | null>(null);
  useEffect(() => {
    const onMessage = async (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow || e.data?.type !== "forior-planner:save") return;
      const reply = (ok: boolean, message: string) => frame.current?.contentWindow?.postMessage({ type: "forior-planner:saved", ok, message }, window.location.origin);
      try {
        const id = await createProjectFromPlan(e.data.plan as PlannerPlan);
        reply(true, "Project dibuat di Projects."); setCreated(id); notify("Project dibuat dari Photo Planner.");
      } catch (err) { reply(false, err instanceof Error ? err.message : String(err)); }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  const copy = () => navigator.clipboard?.writeText(src).then(() => notify("Link Photo Planner disalin."), () => notify("Browser menolak akses clipboard. Salin manual."));
  return <div className="module-page planner-layout">
    <aside className="panel planner-side">
      <h2>Photo Planner</h2>
      <p>Susun rencana shoot bersama klien: tipe properti, area, estimasi foto, paket, dan jadwal. Simpan sebagai project, dan brief serta jadwalnya langsung masuk ke Projects.</p>
      <ol className="planner-steps"><li>Isi rencana di panel kanan</li><li>Di langkah Jadwal, tekan <b>Simpan sebagai project</b></li><li>Project muncul di Projects dan Jadwal Shoot</li></ol>
      {created && <div className="planner-created"><CheckCircle2 size={18} /><span>Project dibuat.</span><button className="primary-button" onClick={() => openGallery(created)}>Buka project <ArrowRight size={15} /></button></div>}
      <div className="planner-share">
        <b>Link untuk klien</b>
        <small>Klien bisa mengisi sendiri tanpa login; hasilnya dikirim ke WhatsApp FORIOR.</small>
        <div className="dl-linkbox"><input readOnly value={src} aria-label="Link Photo Planner untuk klien" onFocus={e => e.currentTarget.select()} /><button onClick={copy} aria-label="Salin link"><Copy size={15} /></button></div>
        <div className="x-row"><button className="outline-button" onClick={copy}><Link2 size={15} /> Salin link</button><a className="outline-button" href={src} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Buka versi klien</a></div>
      </div>
    </aside>
    <div className="planner-frame-wrap"><iframe ref={frame} className="planner-frame" src={src} title="Photo Planner" /></div>
  </div>;
}
