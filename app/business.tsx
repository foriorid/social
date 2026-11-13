"use client";

// FORIOR (business) workspace pages: the project-first dashboard, the Photo Planner slot and Calendar.
import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, ExternalLink, FileCode2, Images, MessageSquare, RefreshCw } from "lucide-react";
import { readCloud, supabase } from "./lib/cloud";
import { stageOf } from "./lib/flow";
import { useApprovals } from "./lib/store";
import { PHASE_CLASS, nextActionOf } from "./delivery";
import { usePlan } from "./plan-data";
import { PHASE_SHORT, type Gallery } from "../supabase/functions/gallery/delivery";

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
      <section className="panel biz-card"><div className="biz-head"><h2>Jadwal shoot</h2><button className="outline-button" onClick={() => go("Calendar")}>Calendar <ArrowRight size={15} /></button></div><p className="x-empty">Calendar masih di app.forior.id sampai modulnya dipindah ke sini.</p></section>
      <section className="panel biz-card"><div className="biz-head"><h2>Sosmed FORIOR</h2><button className="outline-button" onClick={() => go("Content Plan")}>Content Plan <ArrowRight size={15} /></button></div>
        <div className="biz-mini"><span><b>{plan.campaigns.length}</b>campaign</span><span><b>{stage("Brief") + stage("Produksi")}</b>dikerjakan</span><span><b>{stage("Draft")}</b>draft</span><span><b>{approvals.filter(a => a.status === "pending").length}</b>menunggu approval</span></div>
      </section>
    </div>
  </div>;
}

/** Photo Planner: Alvian's existing HTML tool, served from /photo-planner.html once the file is added. */
export function PhotoPlannerPage() {
  const src = (typeof window === "undefined" ? "" : window.location.pathname.replace(/\/$/, "")) + "/photo-planner.html";
  const [state, setState] = useState<"checking" | "ready" | "missing">("checking");
  useEffect(() => { fetch(src, { method: "HEAD" }).then(r => setState(r.ok && (r.headers.get("content-type") ?? "").includes("html") ? "ready" : "missing")).catch(() => setState("missing")); }, [src]);
  if (state === "ready") return <div className="module-page planner-page"><iframe className="planner-frame" src={src} title="Photo Planner" /></div>;
  return <div className="module-page"><section className="panel dl-empty"><FileCode2 size={28} /><h3>{state === "checking" ? "Memuat Photo Planner…" : "Photo Planner siap dipasang"}</h3>
    {state === "missing" && <p>Menu sudah tersedia. Kirim file HTML Photo Planner Anda; file itu dipasang sebagai <code>photo-planner.html</code> dan langsung tampil di halaman ini.</p>}</section></div>;
}

export function CalendarPage() {
  return <div className="module-page"><section className="panel dl-empty"><CalendarDays size={28} /><h3>Calendar segera pindah ke sini</h3><p>Jadwal shoot masih dikelola di Workspace lama sampai modul Calendar dipindahkan (tahap E).</p>
    <a className="primary-button" href="https://app.forior.id" target="_blank" rel="noreferrer"><ExternalLink size={15} /> Buka Calendar di app.forior.id</a>
    <small className="dl-hint"><MessageSquare size={13} /> Data tetap di app.forior.id; tidak ada yang diubah dari sini.</small></section></div>;
}
