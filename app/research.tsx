"use client";

import { AlertTriangle, BarChart3, Check, Clock3, Film, Images, Lightbulb, Plus, Sparkles, Target, TrendingUp } from "lucide-react";
import type { Audit } from "./lib/flow";

const FORMAT_ICON: Record<string, typeof Film> = { Reels: Film, TikTok: Film, Carousel: Images, Foto: Images };
const iconFor = (format: string) => FORMAT_ICON[format] ?? Sparkles;

/** Old audits were stored as plain text; show them as readable paragraphs and bullets. */
export function LegacyAudit({ text }: { text: string }) {
  return <div className="r-legacy">{text.split(/\n{2,}/).map((block, i) => {
    const lines = block.split("\n").map(l => l.replace(/\*\*/g, "").trim()).filter(Boolean);
    const bullets = lines.filter(l => /^[-*•]\s/.test(l));
    return <div key={i}>{lines.filter(l => !/^[-*•]\s/.test(l)).map((l, j) => <p key={j} className={j === 0 && /^\d\)|^#/.test(l) ? "r-legacy-h" : ""}>{l.replace(/^#+\s*/, "")}</p>)}{bullets.length > 0 && <ul>{bullets.map((b, j) => <li key={j}>{b.replace(/^[-*•]\s/, "")}</li>)}</ul>}</div>;
  })}</div>;
}

export function AuditView({ audit, added, onAdd }: { audit: Audit; added: string[]; onAdd: (idea: string) => void }) {
  const p = audit.profile;
  const metrics = [["Frekuensi posting", p.frequency, Clock3], ["Rata-rata engagement", p.engagement, BarChart3], ["Jam posting dominan", p.bestTime, Clock3]] as const;
  return <div className="r-audit">
    {audit.summary && <section className="r-summary"><span className="r-summary-icon"><Sparkles size={18} /></span><div><b>Ringkasan Agen Riset</b><p>{audit.summary}</p></div></section>}
    {audit.dataQuality !== "cukup" && <section className="r-warning"><AlertTriangle size={18} /><div><b>{audit.dataQuality === "kosong" ? "Data akun belum ada" : "Data akun masih terbatas"}</b><p>Analisis di bawah belum memakai angka nyata. Isi token Meta di Settings → AI & Models (untuk akun Instagram Business/Creator), atau tempel 10–20 caption beserta jumlah like/komentar di kolom Data tambahan.</p>{audit.missing.length > 0 && <ul>{audit.missing.map(m => <li key={m}>{m}</li>)}</ul>}</div></section>}
    <div className="r-grid">
      <section className="panel r-profile">
        <h3><Target size={17} /> Profil konten</h3>
        {metrics.map(([label, value, Icon]) => <div className="r-metric" key={label}><Icon size={15} /><span>{label}</span><b>{value || "—"}</b></div>)}
        <label>CAMPURAN FORMAT</label>
        {p.formats.length ? p.formats.map(f => <div className="r-bar" key={f.name}><div><span>{f.name}</span><b>{f.share}%</b></div><i><em style={{ width: f.share + "%" }} /></i></div>) : <p className="x-empty">Belum ada data format.</p>}
        <label>TOPIK YANG SERING MUNCUL</label>
        {p.topics.length ? <div className="r-chips">{p.topics.map(t => <span key={t}>{t}</span>)}</div> : <p className="x-empty">Belum ada data topik.</p>}
      </section>
      <section className="panel r-highlights">
        <h3><TrendingUp size={17} /> Yang menarik dari akun ini</h3>
        {audit.highlights.length ? <div className="r-cards">{audit.highlights.map(h => { const Icon = iconFor(h.format); return <article key={h.title}><span className="r-card-icon"><Icon size={20} /></span><div className="r-card-meta">{h.format && <em>{h.format}</em>}{h.signal && <em className="r-signal">{h.signal}</em>}</div><b>{h.title}</b><p>{h.why}</p></article>; })}</div> : <p className="x-empty">Belum bisa ditentukan tanpa data posting.</p>}
        {audit.gaps.length > 0 && <div className="r-gaps"><b><Lightbulb size={16} /> Celah & peluang</b><ul>{audit.gaps.map(g => <li key={g}>{g}</li>)}</ul></div>}
      </section>
      <section className="panel r-ideas">
        <h3><Lightbulb size={17} /> Ide konten untuk Anda</h3>
        {audit.ideas.map(i => { const label = `${i.format} — ${i.title}`; const done = added.includes(label); return <article key={i.title}><em>{i.format}</em><b>{i.title}</b>{i.angle && <p>{i.angle}</p>}<button className={done ? "outline-button" : "primary-button"} onClick={() => onAdd(label)} disabled={done}>{done ? <><Check size={14} /> Di inbox ide</> : <><Plus size={14} /> Tambah ke plan</>}</button></article>; })}
      </section>
    </div>
  </div>;
}
