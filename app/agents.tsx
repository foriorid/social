"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Pause, Play, RotateCcw, Sparkles, Trash2, Zap } from "lucide-react";
import { askAI } from "./lib/ai";
import { PIPELINE, applyStep, nextStep, parsePlan, stepPrompt, type StepKind } from "./lib/flow";
import { addApproval, getSettings, readStored, useSettings, useTasks, writeStored, type Task } from "./lib/store";
import { AiButton, AiError, ApprovalList, ModelRouterPanel, notify, runAgentTask, useAI, useAiReady } from "./modules";
import { patchCampaign, patchItem, readPlan, usePlan } from "./plan-data";

const setTasks = (fn: (old: Task[]) => Task[]) => writeStored<Task[]>("tasks", fn, []);
const stepOf = (kind: StepKind) => PIPELINE.find(s => s.kind === kind)!;
const isOpen = (t: Task) => t.status === "queued" || t.status === "running";

/** Queue the next step a content item needs. `chain` keeps going until the item reaches approval. */
export function enqueue(campaignId: string, day: number, chain: boolean, kind?: StepKind): boolean {
  const campaign = readPlan().campaigns.find(c => c.id === campaignId);
  const item = campaign?.items.find(x => x.day === day);
  const step = kind ?? (item ? nextStep(item) : null);
  if (!campaign || !step || (step !== "plan" && !item)) return false;
  if (readStored<Task[]>("tasks", []).some(t => t.campaignId === campaignId && t.day === day && isOpen(t))) return false;
  const title = step === "plan" ? `Judul campaign — ${campaign.name}` : `${stepOf(step).output} — ${item!.title}`;
  setTasks(old => [{ id: Date.now() + Math.random(), campaignId, day, kind: step, agent: stepOf(step).agent, title, status: "queued" as const, chain, at: new Date().toISOString() }, ...old].slice(0, 200));
  return true;
}

/** Queue the next `count` content items of a campaign that still need agent work. */
export function enqueueCampaign(campaignId: string, count: number): number {
  const campaign = readPlan().campaigns.find(c => c.id === campaignId);
  let added = 0;
  for (const item of campaign?.items ?? []) { if (added >= count) break; if (nextStep(item) && enqueue(campaignId, item.day, true)) added++; }
  return added;
}

async function runTask(task: Task) {
  const campaign = readPlan().campaigns.find(c => c.id === task.campaignId);
  if (!campaign) throw new Error("Campaign sudah dihapus.");
  const step = stepOf(task.kind);
  const role = step.agent.includes("/") ? (campaign.items.find(x => x.day === task.day)?.format === "Reels" ? "Video Editor" : "Graphic Designer") : step.agent;
  if (task.kind === "plan") {
    const rows = parsePlan(await askAI({ tier: step.tier, role, maxTokens: 6000, prompt: stepPrompt("plan", campaign, campaign.items[0]) }), campaign.items.length);
    patchCampaign(campaign.id, c => ({ ...c, items: c.items.map((x, i) => (rows[i] ? { ...x, ...rows[i] } : x)) }));
    return;
  }
  const item = campaign.items.find(x => x.day === task.day);
  if (!item) throw new Error("Konten sudah dihapus.");
  const answer = await askAI({ tier: step.tier, role, maxTokens: 6000, prompt: stepPrompt(task.kind, campaign, item) });
  const patch = applyStep(task.kind, item, answer);
  patchItem(campaign.id, item.day, patch);
  if (task.kind === "publish") {
    const done = { ...item, ...patch };
    addApproval({ title: `${done.format} — ${done.title}`, by: "Tim Agent", type: `${campaign.account} · siap review`, body: `Hook: ${done.hook}\n\nStoryboard:\n${(done.board ?? []).map(s => `• ${s.label} — ${s.visual}${s.text ? ` | "${s.text}"` : ""}`).join("\n")}\n\nCaption:\n${done.caption}\n\n${done.hashtags ?? ""}\n\nJadwal usulan: ${done.schedule ?? "-"}` });
  }
}

let autoStarted = 0; // content items picked up by automatic mode since the page was opened

/** Mount once at the app root: runs queued tasks one at a time and, in automatic mode, feeds the queue. */
export function useAgentRunner() {
  const [tasks] = useTasks();
  const [settings] = useSettings();
  const [plan] = usePlan();
  const ready = useAiReady();
  const busy = useRef(false);
  useEffect(() => { setTasks(old => (old.some(t => t.status === "running") ? old.map(t => (t.status === "running" ? { ...t, status: "queued" } : t)) : old)); }, []); // a reload interrupts a running call
  useEffect(() => {
    if (busy.current) return;
    const next = [...tasks].reverse().find(t => t.status === "queued");
    if (!next) {
      if (!settings.autoRun || !ready || autoStarted >= settings.autoLimit) return;
      for (const c of plan.campaigns) {
        if (!c.auto) continue;
        const item = c.items.find(x => nextStep(x) && !tasks.some(t => t.campaignId === c.id && t.day === x.day && t.status === "failed"));
        if (item && enqueue(c.id, item.day, true)) { autoStarted++; return; }
      }
      return;
    }
    busy.current = true;
    setTasks(old => old.map(t => (t.id === next.id ? { ...t, status: "running" } : t)));
    runTask(next).then(() => {
      setTasks(old => old.map(t => (t.id === next.id ? { ...t, status: "done", error: undefined } : t)));
      if (next.chain && next.kind !== "plan") enqueue(next.campaignId, next.day, true);
    }).catch(error => {
      setTasks(old => old.map(t => (t.id === next.id ? { ...t, status: "failed", error: error instanceof Error ? error.message : String(error) } : t)));
    }).finally(() => { busy.current = false; setTasks(old => [...old]); });
  }, [tasks, settings.autoRun, ready, settings.autoLimit, plan]);
}

const STATUS_TEXT: Record<Task["status"], string> = { queued: "Antre", running: "Dikerjakan…", done: "Selesai", failed: "Gagal" };
const FREE_AGENTS = [{ name: "Research Analyst", group: "Strategy" }, { name: "Creative Strategist", group: "Strategy" }, { name: "Content Writer", group: "Creative" }, { name: "Graphic Designer", group: "Creative" }, { name: "Video Editor", group: "Creative" }, { name: "Social Media Manager", group: "Publishing" }, { name: "Community Manager", group: "Publishing" }];

export function AgentsPage() {
  const [tasks] = useTasks();
  const [settings, setSettings] = useSettings();
  const [plan] = usePlan();
  const ready = useAiReady();
  const [campaignId, setCampaignId] = useState(plan.campaigns[0]?.id ?? "");
  const [count, setCount] = useState(3);
  const [freeTask, setFreeTask] = useState(""), [freeAgent, setFreeAgent] = useState("Content Writer");
  const ai = useAI();
  const campaign = plan.campaigns.find(c => c.id === campaignId) ?? plan.campaigns[0];
  const open = tasks.filter(isOpen).length, failed = tasks.filter(t => t.status === "failed").length;
  const waiting = campaign ? campaign.items.filter(x => nextStep(x)).length : 0;
  return <div className="module-page f-page">
    <section className="panel f-mode">
      <div><span className="module-eyebrow"><Sparkles size={14} /> CARA KERJA TIM</span><h2>{settings.autoRun ? "Mode otomatis aktif" : "Mode manual"}</h2><p>{settings.autoRun ? "Agen menggarap campaign yang ditandai otomatis, satu konten demi satu, sampai tahap approval. Berjalan selama aplikasi ini terbuka." : "Agen hanya bekerja saat Anda memberi tugas. Hasilnya selalu berhenti di approval Anda."}</p></div>
      <div className="f-mode-controls">
        <button className={settings.autoRun ? "outline-button" : "primary-button"} onClick={() => setSettings(o => ({ ...o, autoRun: !o.autoRun }))}>{settings.autoRun ? <><Pause size={15} /> Matikan otomatis</> : <><Zap size={15} /> Nyalakan otomatis</>}</button>
        <label htmlFor="autolimit">Maks. konten otomatis per sesi</label><input id="autolimit" type="number" min={1} max={100} value={settings.autoLimit} onChange={e => setSettings(o => ({ ...o, autoLimit: Math.max(1, Number(e.target.value) || 1) }))} />
      </div>
      {!ready && <p className="x-error">API key belum diisi. Buka Settings → AI & Models agar agen bisa bekerja.</p>}
    </section>

    <section className="panel"><div className="agent-section-heading"><div><h3>Urutan kerja</h3><p>Setiap konten melewati langkah yang sama. Tugas tiap agen tetap dan jelas.</p></div></div>
      <ol className="f-pipeline">{PIPELINE.map((s, i) => <li key={s.kind}><span className="f-step-no">{i + 1}</span><b>{s.agent}</b><p>{s.job}</p><small>Mulai: {s.trigger}</small><small>Hasil: {s.output}</small><em>{s.kind === "approval" ? "Manusia" : s.tier === "creative" ? settings.creativeModel : settings.lightModel}</em></li>)}</ol>
    </section>

    <section className="panel"><div className="agent-section-heading"><div><h3>Beri tugas ke tim</h3><p>Pilih campaign, lalu tentukan berapa konten yang digarap sampai siap review.</p></div><span className="muted-chip">{waiting} konten belum selesai digarap</span></div>
      {campaign ? <div className="f-assign">
        <div className="settings-field"><label htmlFor="acamp">CAMPAIGN</label><select id="acamp" value={campaign.id} onChange={e => setCampaignId(e.target.value)}>{plan.campaigns.map(c => <option key={c.id} value={c.id}>{c.account} — {c.name}</option>)}</select></div>
        <div className="settings-field"><label htmlFor="acount">JUMLAH KONTEN</label><select id="acount" value={count} onChange={e => setCount(Number(e.target.value))}>{[1, 3, 5, 10, 30].map(n => <option key={n} value={n}>{n} konten berikutnya</option>)}</select></div>
        <div className="x-row"><button className="primary-button" onClick={() => { const n = enqueueCampaign(campaign.id, count); notify(n ? `${n} konten masuk antrean agen.` : "Tidak ada konten yang perlu digarap di campaign ini."); }}><Play size={15} /> Jalankan sampai approval</button>
          <button className="outline-button" onClick={() => notify(enqueue(campaign.id, 0, false, "plan") ? "Strategist menyusun ulang judul campaign." : "Tugas untuk campaign ini masih berjalan.")}>Susun ulang judul campaign</button>
          <button className={campaign.auto ? "primary-button" : "outline-button"} aria-pressed={!!campaign.auto} onClick={() => patchCampaign(campaign.id, c => ({ ...c, auto: !c.auto }))}>{campaign.auto ? <><Check size={15} /> Otomatis untuk campaign ini</> : "Tandai otomatis"}</button></div>
      </div> : <p className="x-empty">Belum ada campaign. Buat di Content Plan.</p>}
    </section>

    <section className="panel"><div className="agent-section-heading"><div><h3>Antrean & riwayat tugas</h3><p>{open} berjalan/antre · {failed} gagal · dikerjakan satu per satu agar hemat biaya.</p></div>{tasks.some(t => t.status === "done") && <button className="outline-button" onClick={() => setTasks(old => old.filter(t => t.status !== "done"))}>Bersihkan yang selesai</button>}</div>
      {!tasks.length && <p className="x-empty">Belum ada tugas. Jalankan dari sini atau dari tombol agen di Content Plan.</p>}
      <div className="x-approvals">{tasks.slice(0, 40).map(t => <article className="x-approval" key={t.id}><div className="x-approval-head"><span className="approval-file-icon"><Sparkles size={16} /></span><div><b>{t.title}</b><small>{t.agent} · {new Date(t.at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</small></div><span className={`x-status f-${t.status}`}>{STATUS_TEXT[t.status]}</span></div>
        {t.error && <p className="x-error">{t.error}</p>}
        {(t.status === "failed" || t.status === "queued") && <div className="x-row">{t.status === "failed" && <button className="outline-button" onClick={() => setTasks(old => old.map(x => (x.id === t.id ? { ...x, status: "queued", error: undefined } : x)))}><RotateCcw size={14} /> Coba lagi</button>}<button className="outline-button x-danger" onClick={() => setTasks(old => old.filter(x => x.id !== t.id))}><Trash2 size={14} /> Hapus</button></div>}
      </article>)}</div>
    </section>

    <section className="panel"><div className="agent-section-heading"><div><h3>Tugas bebas</h3><p>Untuk permintaan di luar alur konten, misalnya ide campaign atau balasan FAQ. Hasil masuk ke approval.</p></div></div>
      <div className="f-assign"><div className="settings-field x-wide"><label htmlFor="ftask">TUGAS</label><textarea id="ftask" rows={3} value={freeTask} onChange={e => setFreeTask(e.target.value)} placeholder="Contoh: Buat 5 ide konten untuk promosi paket foto apartemen akhir tahun." /></div>
        <div className="settings-field"><label htmlFor="fagent">AGEN</label><select id="fagent" value={freeAgent} onChange={e => setFreeAgent(e.target.value)}>{FREE_AGENTS.map(a => <option key={a.name}>{a.name}</option>)}</select></div>
        <AiButton className="primary-button" label="Kerjakan" busyLabel={`${freeAgent} bekerja…`} busy={ai.busy === "free"} onClick={() => { if (!freeTask.trim()) return; ai.run("free", async () => { const out = await runAgentTask(FREE_AGENTS.find(a => a.name === freeAgent)!, freeTask, getSettings().brandName); addApproval({ title: freeTask.slice(0, 90), by: freeAgent, type: "Tugas bebas", body: out }); setFreeTask(""); notify("Hasil masuk ke antrean approval."); }); }} /></div>
      <AiError message={ai.error} />
    </section>

    <section className="panel"><div className="agent-section-heading"><div><h3>Approval</h3><p>Tidak ada yang dijadwalkan tanpa persetujuan Anda.</p></div></div><ApprovalList empty="Belum ada hasil yang menunggu." /></section>
    <ModelRouterPanel />
  </div>;
}
