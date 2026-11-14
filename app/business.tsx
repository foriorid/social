"use client";

// FORIOR (business) workspace pages: the project-first dashboard, the Photo Planner slot and Calendar.
import { useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, Copy, ExternalLink, Images, Link2, RefreshCw } from "lucide-react";
import { readCloud, supabase } from "./lib/cloud";
import { notify } from "./modules";
import { stageOf } from "./lib/flow";
import { useApprovals } from "./lib/store";
import { PHASE_CLASS, fmtShoot, nextActionOf } from "./delivery";
import { usePlan } from "./plan-data";
import { PHASE_SHORT, newGallery, slugify, uniqueSlug, type Gallery } from "../supabase/functions/gallery/delivery";

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
  const list = (rows ?? []).map(r => ({ ...r, next: nextActionOf(r.data) })).sort((a, b) => a.next.rank - b.next.rank);
  const active = list.filter(r => r.data.phase !== "Done");
  const action = list.filter(r => r.next.rank <= 3);
  const openRev = list.reduce((n, r) => n + r.data.revisions.filter(x => x.status === "Open").length, 0);
  const done = list.filter(r => r.data.phase === "Done").length;
  const upcoming = upcomingShoots(rows ?? []);
  const items = plan.campaigns.flatMap(c => c.items);
  const stage = (s: string) => items.filter(i => stageOf(i.status) === s).length;
  return <div className="module-page biz-page">
    <section className="biz-stats">
      <button className="panel" onClick={() => go("Photo Delivery")}><Images size={18} /><b>{rows ? active.length : "…"}</b><small>Delivery berjalan</small></button>
      <button className="panel hot" onClick={() => go("Photo Delivery")}><Clock3 size={18} /><b>{rows ? action.length : "…"}</b><small>Butuh tindakan</small></button>
      <button className="panel" onClick={() => go("Photo Delivery")}><RefreshCw size={18} /><b>{rows ? openRev : "…"}</b><small>Revisi terbuka</small></button>
      <button className="panel" onClick={() => go("Photo Delivery")}><CheckCircle2 size={18} /><b>{rows ? done : "…"}</b><small>Selesai</small></button>
    </section>

    <section className="panel biz-card">
      <div className="biz-head"><h2>Photo Delivery — butuh tindakan</h2><button className="outline-button" onClick={() => go("Photo Delivery")}>Semua galeri <ArrowRight size={15} /></button></div>
      {error && <p className="x-error">{error}</p>}
      {!rows ? <p className="x-empty">Memuat galeri…</p> : !list.length ? <p className="x-empty">Belum ada galeri. Buat atau impor di Photo Delivery.</p> :
        <div className="biz-list">{list.slice(0, 8).map(r => <button key={r.id} className={`biz-row ${r.next.rank <= 1 ? "urgent" : ""}`} onClick={() => openGallery(r.id)}>
          <b>{r.data.title}</b><em className={`dl-phase ${PHASE_CLASS[r.data.phase]}`}>{PHASE_SHORT[r.data.phase]}</em><span>{r.next.text}</span><ArrowRight size={16} />
        </button>)}</div>}
    </section>

    <div className="biz-two">
      <section className="panel biz-card"><div className="biz-head"><h2>Jadwal shoot</h2><button className="outline-button" onClick={() => go("Calendar")}>Semua jadwal <ArrowRight size={15} /></button></div>
        {upcoming.length ? <div className="biz-list">{upcoming.slice(0, 3).map(r => <button key={r.id} className="biz-row biz-shoot" onClick={() => openGallery(r.id)}><b>{fmtShoot(r.data.shootDate)}</b><span>{r.data.title}</span><ArrowRight size={16} /></button>)}</div>
          : <p className="x-empty">Belum ada shoot terjadwal. Buat rencana di Photo Planner atau isi jadwal di detail project.</p>}</section>
      <section className="panel biz-card"><div className="biz-head"><h2>Sosmed FORIOR</h2><button className="outline-button" onClick={() => go("Content Plan")}>Content Plan <ArrowRight size={15} /></button></div>
        <div className="biz-mini"><span><b>{plan.campaigns.length}</b>campaign</span><span><b>{stage("Draft") + stage("Brief Siap") + stage("Produksi")}</b>dikerjakan</span><span><b>{stage("Review")}</b>review</span><span><b>{approvals.filter(a => a.status === "pending").length}</b>menunggu approval</span></div>
      </section>
    </div>
  </div>;
}

const dayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
/** Projects with a shoot from today on, soonest first. */
const upcomingShoots = (rows: Row[]) => rows.filter(r => r.data.shootDate && new Date(r.data.shootDate).getTime() >= dayStart()).sort((a, b) => a.data.shootDate!.localeCompare(b.data.shootDate!));

type PlannerPlan = { clientName: string; clientWhatsapp?: string; propertyType: string; propertyName?: string; size?: string; areas?: string[]; details?: string; estimatedPhotos?: number; packageName?: string; packagePrice?: string; packageCount?: number; shootDate?: string; shootTime?: string };

/** Turns a Photo Planner plan into a project (gallery) in the active workspace. Nothing is typed twice. */
async function createProjectFromPlan(plan: PlannerPlan): Promise<string> {
  const ws = readCloud().workspaceId;
  if (!ws) throw new Error("Workspace belum dimuat.");
  const title = (plan.propertyName || `${plan.propertyType} ${plan.clientName}`).slice(0, 120);
  const { data: existing } = await supabase.from("galleries").select("slug").eq("workspace_id", ws);
  const taken = new Set((existing ?? []).map(r => r.slug as string));
  for (let attempt = 0; attempt < 4; attempt++) {
    const id = crypto.randomUUID();
    const slug = uniqueSlug(slugify(title), taken);
    const g: Gallery = {
      ...newGallery({ id, slug, title, client: { contact: plan.clientName, whatsapp: plan.clientWhatsapp ?? "" }, selectionLimit: plan.packageCount ?? 0 }),
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
        reply(true, "Project dibuat di Photo Delivery."); setCreated(id); notify("Project dibuat dari Photo Planner.");
      } catch (err) { reply(false, err instanceof Error ? err.message : String(err)); }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  const copy = () => navigator.clipboard?.writeText(src).then(() => notify("Link Photo Planner disalin."), () => notify("Browser menolak akses clipboard. Salin manual."));
  return <div className="module-page planner-layout">
    <aside className="panel planner-side">
      <h2>Photo Planner</h2>
      <p>Susun rencana shoot bersama klien: tipe properti, area, estimasi foto, paket, dan jadwal. Simpan sebagai project, dan brief serta jadwalnya langsung masuk ke Photo Delivery.</p>
      <ol className="planner-steps"><li>Isi rencana di panel kanan</li><li>Di langkah Jadwal, tekan <b>Simpan sebagai project</b></li><li>Project muncul di Photo Delivery dan Jadwal Shoot</li></ol>
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

/** Jadwal Shoot: shoots planned on projects (from Photo Planner or the project detail), soonest first. */
export function CalendarPage({ openGallery, go }: { openGallery: (id: string) => void; go: (nav: string) => void }) {
  const { rows, error } = useWorkspaceGalleries();
  const upcoming = upcomingShoots(rows ?? []);
  const past = (rows ?? []).filter(r => r.data.shootDate && new Date(r.data.shootDate).getTime() < dayStart()).sort((a, b) => b.data.shootDate!.localeCompare(a.data.shootDate!)).slice(0, 10);
  const row = (r: Row) => <button key={r.id} className="biz-row biz-shoot" onClick={() => openGallery(r.id)}><b>{fmtShoot(r.data.shootDate)}</b><span>{r.data.title}{r.data.client?.contact ? ` · ${r.data.client.contact}` : ""}</span><em className={`dl-phase ${PHASE_CLASS[r.data.phase]}`}>{PHASE_SHORT[r.data.phase]}</em><ArrowRight size={16} /></button>;
  return <div className="module-page biz-page">
    <section className="panel biz-card">
      <div className="biz-head"><h2>Shoot mendatang</h2><button className="primary-button" onClick={() => go("Photo Planner")}><CalendarDays size={15} /> Rencana baru</button></div>
      {error && <p className="x-error">{error}</p>}
      {!rows ? <p className="x-empty">Memuat jadwal…</p> : upcoming.length ? <div className="biz-list">{upcoming.map(row)}</div> : <p className="x-empty">Belum ada shoot terjadwal. Buat rencana di Photo Planner, atau isi “Jadwal shoot” di detail project.</p>}
    </section>
    {past.length > 0 && <section className="panel biz-card"><div className="biz-head"><h2>Shoot sebelumnya</h2></div><div className="biz-list">{past.map(row)}</div></section>}
  </div>;
}
