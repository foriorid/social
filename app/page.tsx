"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, CalendarDays,
  Camera, Check, CheckCircle2, ChevronDown, CircleHelp, Clapperboard,
  Command, Compass, FileText, Film, FolderOpen, Goal, Home, Image as ImageIcon,
  Instagram, Lightbulb, Menu, MessageCircle, MoreHorizontal, Play, Plus,
  Search, Send, Settings, Sparkles, Target, Users, Video, X, Youtube,
  ChartNoAxesCombined, Clock3, Layers3, BriefcaseBusiness, TrendingUp, Bookmark,
  Hash, Eye, Flame, WandSparkles, PlusCircle, ChevronRight, Filter, CirclePlay,
  MessageSquareText, ChartLine, Lightbulb as LightbulbIcon, Cloud, Database, UploadCloud, Music2, UserCircle2, UserPlus, History, ShieldCheck, Info, ExternalLink, FolderPlus, AtSign, Zap
} from "lucide-react";

import { AiButton, AiCostBadge, AiError, ApiSettingsTab, ApprovalList, InboxLeadsPage, ModelRouterPanel, notify, runAgentTask, useAI } from "./modules";
import { AiSetupError, askAI, fetchInstagramPosts } from "./lib/ai";
import { parseIdeas, parseLines, parseProfile } from "./lib/logic";
import { addApproval, addIdea, useApprovals, useIdeas, useLeads, useSettings, useStored, useTasks } from "./lib/store";

import { ImageTile } from "./ui";
import { AuditView, LegacyAudit } from "./research";
import { auditPrompt, parseAudit, type Audit } from "./lib/flow";
import { PublicCampaignPage, migrateLegacyPlan, usePlan, type CampaignData } from "./plan-data";
import { AgentsPage, useAgentRunner } from "./agents";
import { startCloud } from "./lib/cloud";
import { AssetLibraryPage } from "./assets";
import { ContentPlanPage } from "./plan";
import { StudioPage } from "./studio";

type Platform = "All channels" | "Instagram" | "TikTok" | "YouTube";
type Range = "Last 7 Days" | "Last 30 Days" | "Last 90 Days";

const navGroups = [
  {
    label: "WORKSPACE",
    items: [
      { name: "Dashboard", icon: Home },
      { name: "Research & Insight", icon: Compass },
      { name: "Content Plan", icon: CalendarDays },
      { name: "Production Studio", icon: Clapperboard }
    ]
  },
  {
    label: "MANAGEMENT",
    items: [
      { name: "AI Agent Team", icon: Sparkles },
      { name: "Analytics", icon: ChartNoAxesCombined },
      { name: "Asset Library", icon: ImageIcon },
      { name: "Inbox & Leads", icon: MessageCircle },
    ]
  }
];

const schedules = [
  { day: "Rab, 11 Nov", time: "10:00", platform: "Instagram", type: "Feed", title: "Interior Details — Living Area", color: "green" },
  { day: "Kam, 12 Nov", time: "13:00", platform: "TikTok", type: "Reels", title: "Behind the Shoot — Lighting Setup", color: "green" },
  { day: "Sab, 14 Nov", time: "19:00", platform: "Instagram", type: "Carousel", title: "Tips: Komposisi Foto Interior", color: "green" }
];

const agents = [
  { name: "Researcher", role: "Riset tren & ide konten", icon: Search },
  { name: "Strategist", role: "Susun strategi & plan", icon: Target },
  { name: "Writer", role: "Script, caption & copy", icon: FileText },
  { name: "Designer", role: "Desain feed & carousel", icon: Layers3 },
  { name: "Video Editor", role: "Editing & post-production", icon: Film }
];

const contentCards = [
  { title: "Kenapa Pakai Flash di Siang Hari?", type: "Reels", metric: "420K", growth: "+68%", image: "living" },
  { title: "5 Tips Foto Interior Profesional", type: "Carousel", metric: "32.4K", growth: "+41%", image: "bedroom" },
  { title: "Behind the Scene: Shooting Villa", type: "Reels", metric: "180K", growth: "+56%", image: "camera" }
];

const pipelineSteps: Array<{ label: string; count: string; icon: typeof Lightbulb; current?: boolean; done?: boolean }> = [
  { label: "Ide", count: "18", icon: Lightbulb },
  { label: "Produksi", count: "6", icon: Camera, current: true },
  { label: "Review", count: "5", icon: CheckCircle2 },
  { label: "Terjadwal", count: "10", icon: CalendarDays },
  { label: "Published", count: "28", icon: CheckCircle2, done: true }
];

function BrandMark() {
  return (
    <div className="brand-lockup">
      <div className="brand-symbol"><span /><span /></div>
      <div><strong>FORIOR</strong><small>Creator OS</small></div>
    </div>
  );
}

function MiniLine({ variant = "one" }: { variant?: string }) {
  const paths: Record<string, string> = {
    one: "M2 30 C18 25 18 19 31 22 S50 13 64 17 S83 7 98 10 S117 2 130 5",
    two: "M2 28 C16 26 22 12 36 17 S55 24 68 13 S89 15 102 7 S119 11 130 3",
    three: "M2 27 C16 18 23 25 37 19 S54 21 69 11 S86 17 100 8 S116 8 130 2"
  };
  return (
    <svg className="mini-line" viewBox="0 0 132 34" aria-hidden="true">
      <path d={paths[variant]} fill="none" stroke="#A779FF" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === "TikTok") return <span className="platform-icon tiktok">♪</span>;
  if (platform === "YouTube") return <span className="platform-icon youtube"><Play size={11} fill="currentColor" /></span>;
  return <span className="platform-icon instagram"><Instagram size={15} /></span>;
}

function ResearchPage() {
  const [tab, setTab] = useState("Bedah Akun");
  const [profile, setProfile] = useState("https://instagram.com/alvian.indonesia");
  const [analysed, setAnalysed] = useState("@alvian.indonesia");
  const [bankQuery, setBankQuery] = useState("");
  const [savedHooks, setSavedHooks] = useStored<string[]>("savedHooks",["Kenapa foto interior yang bagus bisa mengubah persepsi harga properti?"]);
  const [addedIdeas]=useIdeas();
  const [platform,setPlatform]=useState("Instagram");
  const [notes,setNotes]=useState("");
  const [auditError,setAuditError]=useState("");
  const [audits,setAudits]=useStored<Record<string,string|Audit>>("audits",{});
  const [watchlist,setWatchlist]=useStored<string[]>("watchlist",["@alvian.indonesia","@kreator.sejenis","@kompetitor.foto"]);
  const [customHooks,setCustomHooks]=useStored<{category:string;hook:string;format:string}[]>("customHooks",[]);
  const [trendNote,setTrendNote]=useStored<string>("trendNote","");
  const ai=useAI();
  const auditIdeas = [
    { title: "Before/after kamar dalam 15 detik", type: "Reels", tag: "pola before/after", desc: "Hook visual di detik pertama, tanpa narasi panjang." },
    { title: "Berapa biaya foto interior profesional?", type: "Carousel", tag: "celah: harga", desc: "Jawab pertanyaan yang sering dicari calon klien." },
    { title: "Listing ini laku 9 hari setelah difoto ulang", type: "TikTok", tag: "celah: hasil bisnis", desc: "Hubungkan kualitas visual dengan hasil pemasaran properti." }
  ];
  const hooks = [
    ...customHooks,
    { category: "Curiosity", hook: "Kenapa foto interior yang bagus bisa mengubah persepsi harga properti?", format: "Reels" },
    { category: "Problem / Solution", hook: "Jangan lakukan 3 hal ini saat memotret ruangan kecil.", format: "Carousel" },
    { category: "Contrarian", hook: "Lensa wide bukan selalu solusi untuk foto interior.", format: "Reels" },
    { category: "Storytelling", hook: "Awalnya saya kira ruangan ini sulit difoto, sampai menemukan sudut ini.", format: "Reels" },
    { category: "Authority", hook: "Ini checklist yang saya pakai sebelum memotret sebuah villa.", format: "Carousel" },
    { category: "Business", hook: "Apa yang sebenarnya dibeli klien saat menyewa fotografer properti?", format: "Carousel" }
  ];
  const filteredHooks = hooks.filter(x => `${x.hook} ${x.category} ${x.format}`.toLowerCase().includes(bankQuery.toLowerCase()));
  const handleAudit = () => {
    const parsed = parseProfile(profile);
    if (!parsed) { setAuditError("Link belum dikenali. Gunakan link profil instagram.com atau tiktok.com."); return; }
    setAuditError(""); setAnalysed(parsed.handle); setPlatform(parsed.platform);
    ai.run("audit", async () => {
      let data = notes.trim(), source = "catatan yang ditempel pengguna";
      if (parsed.platform === "Instagram") {
        try {
          const result = await fetchInstagramPosts(parsed.handle.slice(1));
          data = `Followers: ${result.followers}\n` + result.posts.map(x => `[${x.date}] ${x.type} · ${x.likes} suka · ${x.comments} komentar · ${x.caption.slice(0, 300)}`).join("\n") + (data ? `\nCatatan pengguna: ${data}` : "");
          source = "posting publik terakhir dari Meta API";
        } catch (error) { if (!(error instanceof AiSetupError)) throw error; /* no Meta token: analyse from notes/positioning; the view explains what data is missing */ }
      }
      if (!data) data = "(tidak ada data posting; analisis hanya dari nama akun dan positioning)";
      const result = parseAudit(await askAI({ tier: "creative", role: "Research Analyst", maxTokens: 6000, prompt: auditPrompt(parsed.platform, parsed.handle, source, data) }));
      setAudits(old => ({ ...old, [parsed.handle]: result }));
    });
  };
  const audit = audits[analysed];
  const generateHooks = () => ai.run("hooks", async () => {
    const text = await askAI({ tier: "creative", role: "Content Writer", prompt: "Tulis 6 hook pembuka konten baru tentang fotografi interior & properti untuk audiens agen properti, pemilik unit sewa, dan desainer interior. Satu per baris dengan format: Kategori | Reels atau Carousel | kalimat hook. Tanpa penomoran, tanpa teks lain." });
    const rows = parseLines(text).map(l => l.split("|").map(x => x.trim())).filter(r => r.length === 3 && r[2]);
    if (!rows.length) throw new Error("Jawaban model tidak sesuai format. Coba lagi.");
    setCustomHooks(old => [...rows.map(r => ({ category: r[0], format: r[1], hook: r[2] })), ...old]);
  });
  const analyseTrends = () => ai.run("trend", async () => { setTrendNote(await askAI({ tier: "creative", role: "Research Analyst", prompt: "Berdasarkan pengetahuanmu tentang konten media sosial niche fotografi interior dan properti di Indonesia, tulis 5 arah konten yang layak diuji bulan ini. Untuk tiap arah: nama, alasan singkat, dan format yang cocok. Nyatakan dengan jelas bahwa ini rekomendasi dari pengetahuan umum, bukan data tren real-time." })); });
  return (
    <div className="module-page">
      <div className="research-tabs-line">
        {["Bedah Akun", "Radar Tren", "Kompetitor & Kreator", "Bank Ide & Hook"].map(v => <button key={v} className={tab===v?"active":""} onClick={()=>setTab(v)}>{v}</button>)}
      </div>
      {tab === "Bedah Akun" && <>
        <section className="panel audit-input-panel">
          <h3>Bedah akun Instagram / TikTok</h3>
          <p>Tempel link profil — akun Anda sendiri, kompetitor, atau kreator sejenis. Agen Riset akan merangkum pola posting, konten unggulan, dan peluang ide yang bisa diadaptasi.</p>
          <label>LINK PROFIL</label>
          <div className="audit-input-row"><input value={profile} onChange={e=>setProfile(e.target.value)} placeholder="https://instagram.com/username"/><AiButton className="primary-button" label="Bedah akun" busyLabel="Membedah…" busy={ai.busy==="audit"} onClick={handleAudit}/></div>
          <label htmlFor="audit-notes">DATA TAMBAHAN (opsional)</label><textarea id="audit-notes" className="x-textarea" rows={3} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Tempel caption, judul konten, atau catatan pengamatan tentang akun ini. Wajib untuk TikTok dan untuk Instagram tanpa token Meta."/>
          {auditError&&<p className="x-error" role="alert">{auditError}</p>}<AiError message={ai.error}/>
          <div className="recent-profiles"><span>Terakhir dibedah:</span>{watchlist.map(v=><button key={v} onClick={()=>{setProfile(`https://instagram.com/${v.slice(1)}`);setAnalysed(v);setPlatform("Instagram");}}>{v}</button>)}</div>
        </section>
        <div className="audit-result-heading"><div><h3>Hasil bedah: {analysed}</h3><span className="channel-chip">{platform}</span><span className="muted-chip">{audit?"Hasil analisis AI":"Contoh tampilan — belum dibedah"}</span></div><span className="audit-cost"><button className="outline-button" onClick={()=>setWatchlist(old=>old.includes(analysed)?old.filter(x=>x!==analysed):[...old,analysed])}>{watchlist.includes(analysed)?"Dipantau ✓":"+ Pantau akun ini"}</button></span></div>
        {audit&&typeof audit==="object"&&<AuditView audit={audit} added={addedIdeas} onAdd={addIdea}/>}
        {audit&&typeof audit==="string"&&<section className="panel"><h3>Analisis {analysed}</h3><LegacyAudit text={audit}/><div className="x-ideas"><label>IDE DARI ANALISIS INI</label>{parseIdeas(audit).map(idea=><div key={idea}><span>{idea}</span><button className="outline-button" onClick={()=>addIdea(idea)}>{addedIdeas.includes(idea)?"Di inbox ide ✓":"Tambah ke plan"}</button></div>)}</div><p className="x-empty">Hasil lama. Tekan “Bedah akun” lagi untuk tampilan baru.</p></section>}
        {!audit&&<div className="audit-grid">
          <section className="panel profile-analysis">
            <h3>Profil konten</h3>
            <div className="profile-metric"><span>Frekuensi posting</span><b>4,2 / minggu</b></div>
            <div className="profile-metric"><span>Rata-rata engagement</span><b>5,8%</b></div>
            <div className="profile-metric"><span>Jam posting dominan</span><b>18.00–20.00</b></div>
            <label>CAMPURAN FORMAT</label>
            {[["Reels","55%"],["Carousel","35%"],["Foto tunggal","10%"]].map(([n,v])=><div className="format-bar-row" key={n}><div><span>{n}</span><b>{v}</b></div><div className="format-track"><i style={{width:v}}/></div></div>)}
            <label>TOPIK YANG PALING SERING</label><div className="topic-tags">{["before/after","tips lighting","tur properti","BTS"].map(t=><span key={t}>{t}</span>)}</div>
          </section>
          <section className="panel audit-top-content">
            <h3>6 top konten yang menarik dari akun ini</h3><p className="panel-subtitle">Konten dengan sinyal performa dan pola kreatif yang layak dipelajari.</p>
            <div className="top-content-grid">
              {[
                ["living","ER 11,2%","Reels before/after 15 detik","Hook visual di detik pertama, tanpa narasi."],
                ["bedroom","Simpan tinggi","Carousel “kesalahan umum”","Judul angka + 1 poin per slide."],
                ["camera","Komentar tinggi","BTS setup alat","Memancing pertanyaan soal gear & harga."],
                ["villa","Share tinggi","Villa walkthrough","Opening dengan establishing shot."],
                ["living","ER 8,9%","Tips sudut ruangan","Satu masalah, satu solusi visual."],
                ["bedroom","Simpan tinggi","Checklist sebelum foto","Format checklist mudah disimpan."]
              ].map((x,i)=><article className="top-content-card" key={i}><ImageTile kind={x[0]} className="top-content-image"/><span className="performance-chip">{x[1]}</span><b>{i+1}. {x[2]}</b><p>{x[3]}</p></article>)}
            </div>
            <div className="audit-gap-note"><b>Celah & peluang:</b> akun ini jarang membahas harga, proses kerja dengan klien, dan hasil bisnis (unit lebih cepat laku). Tiga topik itu bisa menjadi pembeda Anda.</div>
          </section>
          <section className="panel audit-ideas-panel">
            <div className="audit-ideas-heading"><h3>Ide konten untuk Anda</h3><span className="insight-badge">Adaptasi</span></div>
            {auditIdeas.map(idea=><article className="adapt-idea" key={idea.title}><span className="adapt-meta">{idea.type} · {idea.tag}</span><b>{idea.title}</b><p>{idea.desc}</p><button onClick={()=>addIdea(idea.title)}>{addedIdeas.includes(idea.title)?<Check size={13}/>:<Plus size={13}/>} {addedIdeas.includes(idea.title)?"Ditambahkan":"Tambah ke plan"}</button></article>)}
          </section>
        </div>}
      </>}
      {tab === "Bank Ide & Hook" && <section className="panel hook-bank-panel">
        <div className="hook-bank-header"><div><h3>Bank Ide & Hook</h3><p>Kumpulan opening, angle, dan format yang bisa dipakai ulang atau dikembangkan menjadi konten.</p></div><AiButton className="primary-button" label="Generate hooks" busyLabel="Menulis hook…" busy={ai.busy==="hooks"} onClick={generateHooks}/></div><AiError message={ai.error}/>
        <div className="hook-tools"><div className="search-field"><Search size={15}/><input value={bankQuery} onChange={e=>setBankQuery(e.target.value)} placeholder="Cari hook, kategori, atau format..."/></div><span className="muted-chip">{filteredHooks.length} hooks</span></div>
        <div className="hook-bank-grid">{filteredHooks.map((item,i)=><article className="hook-card" key={item.hook}><div><span className="hook-category">{item.category}</span><span className="hook-format">{item.format}</span></div><h4>“{item.hook}”</h4><div className="hook-card-footer"><span>Hook #{String(i+1).padStart(2,"0")}</span><button className={savedHooks.includes(item.hook)?"saved":""} onClick={()=>setSavedHooks(old=>old.includes(item.hook)?old.filter(x=>x!==item.hook):[...old,item.hook])}><Bookmark size={14} fill={savedHooks.includes(item.hook)?"currentColor":"none"}/>{savedHooks.includes(item.hook)?"Saved":"Save hook"}</button><button onClick={()=>{addIdea(item.hook);notify("Hook masuk ke inbox ide di Content Plan.");}}><CopyIcon/> Use hook</button></div></article>)}</div>
      </section>}
      {(tab === "Radar Tren" || tab === "Kompetitor & Kreator") && <div className="research-placeholder-grid">
        <section className="panel"><div className="panel-heading"><div><TrendingUp size={19}/><h3>{tab === "Radar Tren" ? "Radar tren niche property" : "Creator & competitor watchlist"}</h3></div><span className="insight-badge">Sample data</span></div>
          {(tab === "Radar Tren" ? ["Interior before-after","+42%","Lighting tutorial","+36%","Villa walkthrough","+28%","Property marketing","+19%"] : ["Property Creator ID","+18%","Home Visual Journal","+12%","Interior Lens Studio","+9%"]).reduce((acc:any,v:any,i:any,a:any)=>{if(i%2===0) acc.push([v,a[i+1]]);return acc;},[]).map((r:string[],i:number)=><div className="watch-row" key={r[0]}><span className="watch-number">0{i+1}</span><b>{r[0]}</b><em>{r[1]}</em></div>)}
        </section>
        <section className="research-tip"><span><LightbulbIcon size={19}/></span><div><b>Researcher recommendation</b><p>Adaptasi pola kreatif, bukan menyalin konten. Cari sudut pandang yang sesuai pengalaman dan positioning Alvian atau brief klien.</p>{tab==="Radar Tren"&&<><AiButton className="outline-button" label="Minta rekomendasi arah konten" busy={ai.busy==="trend"} onClick={analyseTrends}/><AiError message={ai.error}/>{trendNote&&<pre className="x-output">{trendNote}</pre>}</>}</div></section>
      </div>}
      <div className="module-footer">Daftar tren dan contoh tampilan adalah ilustrasi. Hasil bedah akun dan hook buatan AI tersimpan di browser ini.</div>
    </div>
  );
}

function CopyIcon() { return <FileText size={13}/>; }


function AnalyticsPage({ onAddToPlan }: {onAddToPlan:(idea:string)=>void}) {
  const [period,setPeriod]=useState("Last 30 days");
  const [channel,setChannel]=useState("All channels");
  const [metric,setMetric]=useState("Reach");
  const [reportTab,setReportTab]=useState("Top content");
  const chartValues=period==="Last 7 days"?[28,42,36,55,48,68,74]:period==="Last 90 days"?[22,35,31,48,45,58,55,70,64,82,76,92]:[24,31,29,44,39,55,49,63,59,73,68,88];
  const max=Math.max(...chartValues);
  const topContent=[
    {title:"Behind the Shoot: Villa Puncak",format:"Reels",reach:"186.4K",eng:"9.8%",saves:"2.4K",change:"+42%",type:"video"},
    {title:"5 Detail Interior yang Sering Terlewat",format:"Carousel",reach:"142.8K",eng:"8.6%",saves:"3.1K",change:"+31%",type:"carousel"},
    {title:"Before / After Living Area",format:"Reels",reach:"98.2K",eng:"7.9%",saves:"1.8K",change:"+24%",type:"video"},
    {title:"How I Light a Small Bedroom",format:"Carousel",reach:"76.5K",eng:"7.1%",saves:"1.2K",change:"+18%",type:"carousel"}
  ];
  return <div className="module-page analytics-page">
    <div className="analytics-toolbar"><div><span className="agent-badge"><i/> Performance overview</span><span className="muted-chip">Illustrative data</span></div><div><select value={channel} onChange={e=>setChannel(e.target.value)}><option>All channels</option><option>Instagram</option><option>TikTok</option><option>YouTube</option></select><select value={period} onChange={e=>setPeriod(e.target.value)}><option>Last 7 days</option><option>Last 30 days</option><option>Last 90 days</option></select><button className="outline-button" onClick={()=>window.print()}><FileText size={14}/> Export report</button></div></div>
    <section className="analytics-highlight"><div><span className="module-eyebrow"><ChartNoAxesCombined size={14}/> PERSONAL BRAND PERFORMANCE</span><h2>Make every post count.</h2><p>Ringkasan performa konten Alvian lintas platform untuk membantu menentukan apa yang perlu dibuat berikutnya.</p></div><div className="analytics-highlight-stat"><span>Total reach</span><b>1.24M</b><small><ArrowUpRight size={13}/> 32% vs previous period</small></div></section>
    <div className="analytics-kpi-grid">
      {[{name:"Reach",value:channel==="TikTok"?"842K":"1.24M",delta:"+32%",note:"Unique accounts reached",icon:Eye},{name:"Engagement rate",value:"6.8%",delta:"+1.9 pp",note:"Interactions per reach",icon:Activity},{name:"Followers",value:channel==="Instagram"?"80.2K":"128.4K",delta:"+24%",note:"Net audience growth",icon:Users},{name:"Profile visits",value:"42.6K",delta:"+18%",note:"Visits from content",icon:UserCircle2}].map(k=>{const Icon=k.icon;return <div className="analytics-kpi" key={k.name}><span className="analytics-kpi-icon"><Icon size={17}/></span><small>{k.name}</small><b>{k.value}</b><em><ArrowUpRight size={12}/>{k.delta}</em><span>{k.note}</span></div>})}
    </div>
    <section className="analytics-main-grid">
      <div className="panel performance-chart-panel"><div className="analytics-section-head"><div><h3>Performance trend</h3><p>Track your content momentum over time.</p></div><select value={metric} onChange={e=>setMetric(e.target.value)}><option>Reach</option><option>Engagement</option><option>Followers</option><option>Profile visits</option></select></div><div className="chart-legend"><span><i className="legend-purple"/>{metric}</span><span><i className="legend-pale"/>Previous period</span></div><div className="analytics-chart"><div className="chart-y-labels"><span>150K</span><span>100K</span><span>50K</span><span>0</span></div><div className="chart-plot"><div className="chart-grid-lines"><i/><i/><i/><i/></div><div className="chart-bars">{chartValues.map((v,i)=><div className="chart-bar-wrap" key={i}><div className="chart-bar" style={{height:`${v/max*86}%`}}/><small>{period==="Last 7 days"?["M","T","W","T","F","S","S"][i]:period==="Last 90 days"?["Aug","Aug","Sep","Sep","Oct","Oct","Oct","Nov","Nov","Nov","Nov","Nov"][i]:["Oct 13","Oct 16","Oct 19","Oct 22","Oct 25","Oct 28","Oct 31","Nov 03","Nov 06","Nov 08","Nov 09","Nov 10"][i]}</small></div>)}</div></div></div><div className="chart-insight-strip"><span><Sparkles size={15}/></span><p><b>Strongest momentum</b> — Konten behind-the-scenes menunjukkan kenaikan reach dan save rate paling konsisten pada periode ini.</p><button onClick={()=>setReportTab("Insights")}>View insight <ArrowRight size={13}/></button></div></div>
      <div className="panel channel-performance-panel"><div className="analytics-section-head"><div><h3>Channel performance</h3><p>Audience and engagement by platform.</p></div><button className="quiet-action">Details <ArrowRight size={13}/></button></div>{[{name:"Instagram",sub:"@alvian.indonesia",value:"80.2K",growth:"+24%",width:"82%",icon:Instagram},{name:"TikTok",sub:"@alvian.indonesia",value:"48.2K",growth:"+18%",width:"61%",icon:Music2},{name:"YouTube",sub:"Alvian Indonesia",value:"12.8K",growth:"+9%",width:"28%",icon:Youtube}].map(c=>{const Icon=c.icon;return <div className="channel-stat" key={c.name}><div className="channel-stat-top"><span className="channel-brand-icon"><Icon size={16}/></span><div><b>{c.name}</b><small>{c.sub}</small></div><strong>{c.value}</strong><em>{c.growth}</em></div><div className="channel-progress"><i style={{width:c.width}}/></div></div>})}<div className="channel-note"><Lightbulb size={15}/><span>Instagram menjadi channel utama untuk portfolio dan edukasi visual. TikTok membantu discovery.</span></div></div>
    </section>
    <section className="panel analytics-content-panel"><div className="analytics-section-head"><div><h3>Content performance</h3><p>Understand which creative formats deserve more focus.</p></div><div className="analytics-tab-switch">{["Top content","Insights"].map(t=><button className={reportTab===t?"active":""} key={t} onClick={()=>setReportTab(t)}>{t}</button>)}</div></div>{reportTab==="Top content"? <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>Content</th><th>Format</th><th>Reach</th><th>Engagement</th><th>Saves</th><th>Growth</th></tr></thead><tbody>{topContent.map((item,i)=><tr key={item.title}><td><span className="rank-number">0{i+1}</span><b>{item.title}</b></td><td><span className="content-format-pill">{item.format}</span></td><td>{item.reach}</td><td>{item.eng}</td><td>{item.saves}</td><td className="positive">{item.change}</td></tr>)}</tbody></table></div>:<div className="analytics-insight-grid"><article><span><Flame size={16}/></span><b>Behind the scenes wins</b><p>Konten proses pemotretan dan BTS memiliki retention lebih baik daripada konten promosi langsung.</p></article><article><span><Bookmark size={16}/></span><b>Carousel drives saves</b><p>Konten edukasi dengan 5–7 slide menghasilkan save rate yang lebih tinggi.</p></article><article><span><Clock3 size={16}/></span><b>Test posting windows</b><p>Uji konsistensi slot 18.00–20.00 WIB dan bandingkan hasil per format.</p></article></div>}</section>
    <section className="panel analytics-community-panel"><div className="analytics-section-head"><div><h3>Comments & mentions to follow up</h3><p>Conversation signals that may deserve a dedicated content response.</p></div><span className="muted-chip">Community inbox · sample data</span></div><div className="analytics-community-list">{[{from:"@interiorlover",channel:"Instagram comment",text:"Bisa bahas bagaimana foto ruangan kecil tetap terlihat luas?",idea:"Tips foto ruangan kecil agar terlihat luas"},{from:"@propertyhunter",channel:"Instagram mention",text:"Ada tips memilih angle untuk foto villa dengan banyak area?",idea:"Cara memilih angle foto villa dengan banyak area"},{from:"@designjournal",channel:"TikTok comment",text:"Boleh buat breakdown lighting untuk interior yang minim cahaya?",idea:"Lighting setup untuk interior minim cahaya"}].map((item,i)=><article className="analytics-community-item" key={item.from}><span className="analytics-community-icon">{i===1?<AtSign size={16}/>:<MessageCircle size={16}/>}</span><div><b>{item.from} <small>{item.channel}</small></b><p>{item.text}</p><em>Content request</em></div><button className="outline-button" onClick={()=>onAddToPlan(item.idea)}><Plus size={12}/> Add to content plan</button></article>)}</div></section>
    <div className="module-footer">Angka di halaman ini masih ilustrasi. Metrik asli membutuhkan koneksi resmi ke API Instagram, TikTok, dan YouTube.</div>
  </div>;
}

function SettingsPage() {
  const [integrationValues,setIntegrationValues]=useState<Record<string,string>>({});
  const [tab,setTab]=useState("Workspace");
  const [workspaceName,setWorkspaceName]=useState("Alvian · Personal Brand");
  const [settings,setSettings]=useSettings();
  const brandName=settings.brandName,handle=settings.handle;
  const setBrandName=(v:string)=>setSettings(o=>({...o,brandName:v})),setHandle=(v:string)=>setSettings(o=>({...o,handle:v}));
  const [tone,setTone]=useState("Educative, warm & confident");
  const defaultApproval=settings.requireApproval,setDefaultApproval=(v:boolean)=>setSettings(o=>({...o,requireApproval:v}));
  const [emailNotif,setEmailNotif]=useState(true);
  const [approvalNotif,setApprovalNotif]=useState(true);
  const [weeklyReport,setWeeklyReport]=useState(false);
  const [model,setModel]=useState("Auto · Cost efficient");
  const [provider,setProvider]=useState("OpenAI");
  const [saved,setSaved]=useState(false);
  const tabs=["Workspace","Brand identity","Social accounts","AI & Models","Integrations & API","Notifications","Security"];
  const Toggle=({checked,onChange}:{checked:boolean;onChange:(v:boolean)=>void})=><button className={`settings-toggle ${checked?"on":""}`} onClick={()=>onChange(!checked)} aria-pressed={checked}><i/></button>;
  return <div className="module-page settings-page">
    <div className="settings-toolbar"><div><span className="agent-badge"><i/> Workspace configuration</span><span className="muted-chip">Owner access</span></div><button className="primary-button" onClick={()=>{setSaved(true);setTimeout(()=>setSaved(false),1800);}}><Check size={14}/>{saved?"Tersimpan":"Save changes"}</button></div>
    <div className="settings-layout"><aside className="panel settings-nav"><div className="settings-profile"><span className="avatar avatar-main">A</span><div><b>Alvian</b><small>Owner · Personal Brand</small></div></div>{tabs.map(t=><button key={t} className={tab===t?"active":""} onClick={()=>setTab(t)}>{t==="Workspace"?<BriefcaseBusiness size={15}/>:t==="Brand identity"?<Sparkles size={15}/>:t==="Social accounts"?<Instagram size={15}/>:t==="AI & Models"?<WandSparkles size={15}/>:t==="Integrations & API"?<Database size={15}/>:t==="Notifications"?<Bell size={15}/>:<ShieldCheck size={15}/>}{t}<ChevronRight size={13}/></button>)}</aside>
      <section className="panel settings-content"><div className="settings-content-heading"><div><h3>{tab}</h3><p>Configure how FORIOR Creator OS works for your team.</p></div><span className="muted-chip">Brand & AI tersimpan di browser ini</span></div>
        {tab==="Workspace"&&<><div className="settings-field"><label>WORKSPACE NAME</label><input value={workspaceName} onChange={e=>setWorkspaceName(e.target.value)}/><small>This name appears in the workspace switcher.</small></div><div className="settings-field"><label>WORKSPACE TYPE</label><select><option>Personal Brand</option><option>Business Workspace</option><option>Client Project</option></select></div><div className="settings-field"><label>DEFAULT TIMEZONE</label><select><option>Asia/Jakarta (GMT+7)</option><option>Asia/Makassar (GMT+8)</option><option>Asia/Jayapura (GMT+9)</option></select></div><div className="settings-divider"/><div className="settings-option-row"><div><b>Require approval before publishing</b><small>Content must be approved by workspace owner before scheduling or publishing.</small></div><Toggle checked={defaultApproval} onChange={setDefaultApproval}/></div></>}
        {tab==="Brand identity"&&<><div className="settings-field"><label>BRAND / CREATOR NAME</label><input value={brandName} onChange={e=>setBrandName(e.target.value)}/></div><div className="settings-field"><label>PRIMARY SOCIAL HANDLE</label><input value={handle} onChange={e=>setHandle(e.target.value)}/></div><div className="settings-field"><label>BRAND VOICE</label><select value={tone} onChange={e=>setTone(e.target.value)}><option>Educative, warm & confident</option><option>Premium, minimal & aspirational</option><option>Friendly, conversational & witty</option><option>Professional & informative</option></select></div><div className="settings-field"><label>BRAND GUIDELINES</label><textarea rows={4} value={settings.brandVoice} onChange={e=>setSettings(o=>({...o,brandVoice:e.target.value}))}/><small>Dipakai sebagai gaya bahasa di setiap permintaan AI.</small></div><div className="settings-option-row"><div><b>Use workspace brand kit in production</b><small>Apply approved logo, colors, and typography to generated assets.</small></div><Toggle checked={true} onChange={()=>{}}/></div></>}
        {tab==="Social accounts"&&<div className="connected-accounts">{[{name:"Instagram",user:"@alvian.indonesia",icon:Instagram},{name:"TikTok",user:"@alvian.indonesia",icon:Music2},{name:"YouTube",user:"Alvian Indonesia",icon:Youtube}].map(a=>{const Icon=a.icon;return <div className="connected-account-row" key={a.name}><span><Icon size={18}/></span><div><b>{a.name}</b><small>{a.user}</small></div><em>Not connected</em><button className="outline-button" onClick={()=>notify("Koneksi akun lewat OAuth resmi membutuhkan server. Untuk bedah akun Instagram, isi token Meta di tab AI & Models.")}>Connect</button></div>})}<p>Social account connections will use official OAuth permissions. Passwords are never stored in this workspace.</p></div>}
        {tab==="AI & Models"&&<ApiSettingsTab/>}
        {tab==="Integrations & API"&&<div className="integration-settings"><div className="integration-warning"><ShieldCheck size={18}/><div><b>Credential fields are ready for setup</b><p>Semua field sengaja dikosongkan. Nilai yang diketik di sini hanya berada di memori halaman saat ini dan belum dikirim atau disimpan. Setelah backend dan encrypted secret vault tersedia, penyimpanan aman dapat diaktifkan.</p></div></div><p className="x-ok">API key Anthropic dan token Meta yang sudah berfungsi (tersimpan di browser ini) ada di tab “AI & Models”. Field di bawah belum terhubung.</p><h4>AI providers</h4>{[{key:"openai",label:"OpenAI API Key",placeholder:"sk-..."},{key:"anthropic",label:"Anthropic API Key",placeholder:"sk-ant-..."},{key:"gemini",label:"Google Gemini API Key",placeholder:"AIza..."}].map(f=><div className="settings-field" key={f.key}><label>{f.label}</label><input type="password" autoComplete="off" value={integrationValues[f.key]||""} onChange={e=>setIntegrationValues(v=>({...v,[f.key]:e.target.value}))} placeholder={f.placeholder}/></div>)}<h4>Database & storage</h4>{[{key:"supabaseUrl",label:"Supabase Project URL",placeholder:"https://your-project.supabase.co"},{key:"supabaseAnon",label:"Supabase Anon / Publishable Key",placeholder:""},{key:"supabaseService",label:"Supabase Service Role Key (server only)",placeholder:""},{key:"googleClientId",label:"Google OAuth Client ID",placeholder:""},{key:"googleClientSecret",label:"Google OAuth Client Secret",placeholder:""}].map(f=><div className="settings-field" key={f.key}><label>{f.label}</label><input type="password" autoComplete="off" value={integrationValues[f.key]||""} onChange={e=>setIntegrationValues(v=>({...v,[f.key]:e.target.value}))} placeholder={f.placeholder}/></div>)}<h4>Social platform APIs</h4>{[{key:"metaAppId",label:"Meta App ID"},{key:"metaAppSecret",label:"Meta App Secret"},{key:"tiktokClientKey",label:"TikTok Client Key"},{key:"tiktokClientSecret",label:"TikTok Client Secret"},{key:"youtubeClientId",label:"YouTube OAuth Client ID"},{key:"youtubeClientSecret",label:"YouTube OAuth Client Secret"}].map(f=><div className="settings-field" key={f.key}><label>{f.label}</label><input type="password" autoComplete="off" value={integrationValues[f.key]||""} onChange={e=>setIntegrationValues(v=>({...v,[f.key]:e.target.value}))} placeholder=""/></div>)}<div className="integration-warning subtle"><Info size={17}/><div><b>Important security note</b><p>Jangan simpan service-role key atau secret di browser. Semua credential harus dipindahkan ke server-side environment variables atau encrypted vault sebelum fitur API diaktifkan.</p></div></div></div>}
        {tab==="Notifications"&&<>{[{title:"Email notifications",desc:"Important workspace activity and invitations.",value:emailNotif,change:setEmailNotif},{title:"Approval reminders",desc:"Notify reviewers when content needs their attention.",value:approvalNotif,change:setApprovalNotif},{title:"Weekly performance report",desc:"Receive a summary of content and channel performance.",value:weeklyReport,change:setWeeklyReport}].map(n=><div className="settings-option-row" key={n.title}><div><b>{n.title}</b><small>{n.desc}</small></div><Toggle checked={n.value} onChange={n.change}/></div>)}</>}
        {tab==="Security"&&<><div className="security-summary"><ShieldCheck size={22}/><div><b>Workspace security</b><small>Security controls will be enforced by the backend.</small></div></div>{[{t:"Role-based access control",d:"Restrict projects, assets, and settings by team role."},{t:"Session management",d:"Review active sessions and revoke access."},{t:"Activity audit log",d:"Track approvals, edits, exports, and integration changes."},{t:"Two-factor authentication",d:"Require an additional verification step for team members."}].map(item=><div className="settings-option-row" key={item.t}><div><b>{item.t}</b><small>{item.d}</small></div><span className="muted-chip">Planned</span></div>)}</>}
      </section>
    </div>
    <div className="module-footer">Brand, approval, dan API key tersimpan di browser ini. OAuth akun sosial, tim, dan keamanan berbasis peran membutuhkan server.</div>
  </div>;
}

export default function DashboardPage() {
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [platform, setPlatform] = useState<Platform>("All channels");
  const [range, setRange] = useState<Range>("Last 30 Days");
  const [showRange, setShowRange] = useState(false);
  const [showPlatform, setShowPlatform] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [workspace, setWorkspace] = useState("Alvian · Personal Brand");
  const [mobileNav, setMobileNav] = useState(false);
  const [quickAction, setQuickAction] = useState("");
  const [showAllAgents, setShowAllAgents] = useState(false);
  const [studioTarget,setStudioTarget] = useState<{campaignId:string;day:number}|null>(null);
  const [plan] = usePlan();
  useAgentRunner();
  useEffect(()=>{migrateLegacyPlan();startCloud();},[]);
  const [toast,setToast] = useStored<string>("toast","");
  const [approvals] = useApprovals();
  const [ideas] = useIdeas();
  const [leads] = useLeads();
  const counts: Record<string,number> = {};
  plan.campaigns.forEach(c=>c.items.forEach(i=>{counts[i.status]=(counts[i.status]||0)+1;}));
  const pendingApprovals = approvals.filter(a=>a.status==="pending").length;
  const liveCounts: Record<string,number> = { "Ide": ideas.length, "Produksi": (counts["Brief ready"]||0)+(counts["In production"]||0), "Review": (counts["In review"]||0)+pendingApprovals, "Terjadwal": counts["Scheduled"]||0, "Published": counts["Published"]||0 };
  const [tasks] = useTasks();
  const failedTasks = tasks.filter(t=>t.status==="failed").length, runningTasks = tasks.filter(t=>t.status==="queued"||t.status==="running").length;
  const newLeads = leads.filter(l=>l.status==="Baru").length;
  const notices = [
    pendingApprovals>0 && { text:`${pendingApprovals} hasil menunggu approval Anda.`, nav:"AI Agent Team" },
    failedTasks>0 && { text:`${failedTasks} tugas agen gagal — perlu dicoba lagi.`, nav:"AI Agent Team" },
    runningTasks>0 && { text:`${runningTasks} tugas agen sedang berjalan atau antre.`, nav:"AI Agent Team" },
    newLeads>0 && { text:`${newLeads} lead baru belum dibalas.`, nav:"Inbox & Leads" }
  ].filter(Boolean) as { text:string; nav:string }[];

  const [publicCampaign,setPublicCampaign] = useState<CampaignData|null>(null);
  useEffect(()=>{const token=window.location.hash.startsWith("#share=")?window.location.hash.slice(7):"";if(token){try{const data=JSON.parse(decodeURIComponent(escape(atob(token))));if(data&&data.name&&Array.isArray(data.items))setPublicCampaign(data);}catch{}}},[]);
  const metrics = useMemo(() => {
    if (platform === "TikTok") return [
      { label: "Reach", value: "842K", change: "+28%", icon: Users, line: "two" },
      { label: "Engagement Rate", value: "7.4%", change: "+1.2 pp", icon: Activity, line: "three" },
      { label: "Followers", value: "48.2K", change: "+18%", icon: Users, line: "one" }
    ];
    if (platform === "YouTube") return [
      { label: "Reach", value: "196K", change: "+14%", icon: Users, line: "one" },
      { label: "Engagement Rate", value: "5.2%", change: "+0.8 pp", icon: Activity, line: "two" },
      { label: "Followers", value: "12.8K", change: "+9%", icon: Users, line: "three" }
    ];
    return [
      { label: "Reach", value: "1.24M", change: "+32%", icon: Users, line: "one" },
      { label: "Engagement Rate", value: "6.8%", change: "+1.9 pp", icon: Activity, line: "two" },
      { label: "Followers", value: "128.4K", change: "+24%", icon: Users, line: "three" }
    ];
  }, [platform]);

  const visibleSchedules = schedules.filter((item) => platform === "All channels" || item.platform === platform);

  return publicCampaign ? <PublicCampaignPage data={publicCampaign}/> : (
    <main className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <BrandMark />
          <button className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={18} /></button>
        </div>

        <div className="workspace-wrap">
          <span className="eyebrow">WORKSPACE</span>
          <button className="workspace-switch" onClick={() => setShowWorkspace(!showWorkspace)}>
            <div className="avatar avatar-main">A</div>
            <span><b>{workspace.startsWith("Alvian") ? "Alvian" : "FORIOR"}</b><small>{workspace.startsWith("Alvian") ? "Personal Brand" : "Business Workspace"}</small></span>
            <ChevronDown size={16} />
          </button>
          {showWorkspace && (
            <div className="floating-menu workspace-menu">
              {["Alvian · Personal Brand", "FORIOR · Business"].map((item) => (
                <button key={item} onClick={() => { setWorkspace(item); setShowWorkspace(false); }}>
                  <span>{item}</span>{workspace === item && <Check size={15} />}
                </button>
              ))}
            </div>
          )}
        </div>

        <nav className="side-nav">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="eyebrow nav-label">{group.label}</span>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.name}>
                    <button className={`nav-item ${activeNav === item.name ? "active" : ""}`} onClick={() => { setActiveNav(item.name); setMobileNav(false); }}>
                      <Icon size={18} strokeWidth={1.8} />
                      <span>{item.name}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className={`nav-item ${activeNav==="Automation"?"active":""}`} onClick={() => { setActiveNav("Automation"); setMobileNav(false); }}><Zap size={18} /><span>Automation</span></button>
          <button className={`nav-item ${activeNav==="Settings"?"active":""}`} onClick={() => { setActiveNav("Settings"); setMobileNav(false); }}><Settings size={18} /><span>Settings</span></button>
          <div className="sidebar-version">
            <div className="brand-symbol small"><span /><span /></div>
            <span><b>FORIOR Creator OS</b><small>Dashboard Preview · V5</small></span>
          </div>
        </div>
      </aside>

      {mobileNav && <button className="mobile-backdrop" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}

      <section className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={21} /></button>
          <div className="page-heading">
            <span>{activeNav === "Dashboard" ? "Good Afternoon," : "WORKSPACE / ALVIAN"}</span>
            <h1>{activeNav === "Dashboard" ? <>Alvian <span className="wave">👋</span></> : activeNav}</h1>
            <p>{activeNav === "Dashboard" ? "Personal Brand Content Command Center" : "Personal Brand Content Workspace"}</p>
          </div>

          {(activeNav === "Dashboard") && <div className="top-filters">
            <div className="dropdown-wrap">
              <button className="select-button" aria-label={`Rentang waktu: ${range}`} aria-expanded={showRange} onClick={() => { setShowRange(!showRange); setShowPlatform(false); setShowNotifications(false); setShowProfile(false); }}><CalendarDays size={16} /> <span className="select-label">{range}</span> <ChevronDown size={15} /></button>
              {showRange && <div className="floating-menu">
                {(["Last 7 Days", "Last 30 Days", "Last 90 Days"] as Range[]).map((v) => <button key={v} onClick={() => { setRange(v); setShowRange(false); }}>{v}{range === v && <Check size={14} />}</button>)}
              </div>}
            </div>
            <div className="dropdown-wrap">
              <button className="platform-filter" aria-label={`Kanal: ${platform}`} aria-expanded={showPlatform} onClick={() => { setShowPlatform(!showPlatform); setShowRange(false); setShowNotifications(false); setShowProfile(false); }}>
                <Instagram className="ig-brand" size={21} />
                <span className="tt-brand">♪</span>
                <Youtube className="yt-brand" size={22} />
                <ChevronDown size={15} className="plus-platform" />
              </button>
              {showPlatform && <div className="floating-menu platform-menu">
                {(["All channels", "Instagram", "TikTok", "YouTube"] as Platform[]).map((v) => <button key={v} onClick={() => { setPlatform(v); setShowPlatform(false); }}>{v}{platform === v && <Check size={14} />}</button>)}
              </div>}
            </div>
          </div>}
          <div className="top-account">
            <div className="dropdown-wrap">
              <button className={`icon-button ${showNotifications ? "selected" : ""}`} aria-label={`Notifikasi${notices.length ? `, ${notices.length} baru` : ""}`} aria-expanded={showNotifications} onClick={() => { setShowNotifications(!showNotifications); setShowProfile(false); setShowRange(false); setShowPlatform(false); }}><Bell size={19} />{notices.length > 0 && <i />}</button>
              {showNotifications && <div className="floating-menu notification-menu">
                <b>Notifikasi</b>
                {!notices.length && <p>Tidak ada yang perlu ditindaklanjuti.</p>}
                {notices.map(n => <button key={n.text} onClick={() => { setActiveNav(n.nav); setShowNotifications(false); }}><span className="notice-dot" /><span>{n.text}</span></button>)}
              </div>}
            </div>
            <div className="dropdown-wrap">
              <button className="avatar avatar-profile" aria-label="Menu profil" aria-expanded={showProfile} onClick={() => { setShowProfile(!showProfile); setShowNotifications(false); setShowRange(false); setShowPlatform(false); }}>A</button>
              {showProfile && <div className="floating-menu profile-menu">
                <div className="profile-head"><b>{workspace.split(" · ")[0]}</b><small>{workspace.split(" · ")[1] ?? ""}</small></div>
                {["Alvian · Personal Brand", "FORIOR · Business"].map(w => <button key={w} onClick={() => { setWorkspace(w); setShowProfile(false); }}>{w}{workspace === w && <Check size={14} />}</button>)}
                <button onClick={() => { setActiveNav("Settings"); setShowProfile(false); }}>Settings<Settings size={14} /></button>
              </div>}
            </div>
          </div>
        </header>

        {activeNav !== "Dashboard" && activeNav !== "Research & Insight" && activeNav !== "Content Plan" && activeNav !== "Production Studio" && activeNav !== "Feed & Carousel" && activeNav !== "Reels & Video" && activeNav !== "Templates" && activeNav !== "Asset Library" && activeNav !== "AI Agent Team" && activeNav !== "Analytics" && activeNav !== "Asset Library" && activeNav !== "Settings" && activeNav !== "Automation" && activeNav !== "Inbox & Leads" && (
          <div className="section-notice">
            <div><b>{activeNav}</b><span>Preview navigasi — modul ini akan dikembangkan pada tahap berikutnya.</span></div>
            <button onClick={() => setActiveNav("Dashboard")}>Kembali ke Dashboard <ArrowRight size={15} /></button>
          </div>
        )}

        {activeNav === "Research & Insight" ? <ResearchPage /> : activeNav === "Content Plan" ? <ContentPlanPage onOpenStudio={(campaignId,day)=>{setStudioTarget({campaignId,day});setActiveNav("Production Studio");}} onShare={(data)=>{const token=btoa(unescape(encodeURIComponent(JSON.stringify(data))));const link=window.location.origin+window.location.pathname+"#share="+token;navigator.clipboard?.writeText(link);window.open(link,"_blank","noopener,noreferrer");}} /> : activeNav === "AI Agent Team" ? <AgentsPage /> : activeNav === "Asset Library" ? <AssetLibraryPage /> : activeNav === "Analytics" ? <AnalyticsPage onAddToPlan={(idea)=>{addIdea(idea);notify("Ide masuk ke inbox ide di Content Plan.");setActiveNav("Content Plan");}} /> : activeNav === "Inbox & Leads" ? <InboxLeadsPage /> : activeNav === "Automation" ? <div className="module-page automation-simple"><section className="panel automation-simple-card"><span className="automation-simple-icon"><Zap size={24}/></span><div><h2>Automation</h2><p>Atur pengingat dan workflow sederhana. Trigger otomatis akan diaktifkan setelah backend tersedia.</p></div><button className="primary-button" onClick={()=>setQuickAction("Create automation")}><Plus size={14}/> New automation</button></section><div className="automation-simple-grid"><article><Clock3 size={18}/><b>Content reminder</b><p>Pengingat jadwal konten yang akan tayang.</p><span>Coming soon</span></article><article><MessageCircle size={18}/><b>Approval reminder</b><p>Pengingat untuk brief yang menunggu review.</p><span>Coming soon</span></article></div></div> : activeNav === "Settings" ? <SettingsPage /> : activeNav === "Production Studio" ? <StudioPage target={studioTarget} onOpenPlan={()=>setActiveNav("Content Plan")} /> : <div className="dashboard-content">
          <section className="metrics-row">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <article className="metric-card" key={metric.label}>
                  <div className="metric-top"><span className="metric-icon"><Icon size={18} /></span><span className="metric-label">{metric.label}</span></div>
                  <div className="metric-bottom"><div><strong>{metric.value}</strong><span className="positive"><ArrowUpRight size={15} /> {metric.change}</span></div><MiniLine variant={metric.line} /></div>
                </article>
              );
            })}
            <article className="goal-card">
              <div className="goal-kicker"><Goal size={17} /> GOAL · Q4 2026</div>
              <h2>Grow Personal Brand</h2>
              <p>+50K Followers</p>
              <div className="progress-line"><span /></div>
              <b>68%</b>
            </article>
          </section>

          <section className="feature-row">
            <article className="featured-card">
              <ImageTile kind="villa" className="feature-image" />
              <div className="feature-overlay" />
              <div className="feature-content">
                <span className="pill pill-light">Next Content</span>
                <h2>Behind the Shoot:<br />Villa Puncak</h2>
                <p>Proses pemotretan &<br />setup lighting</p>
                <button onClick={() => setActiveNav("Content Plan")}>Lihat Brief <ArrowRight size={15} /></button>
              </div>
            </article>

            <article className="pipeline-card panel">
              <div className="panel-heading"><div><Layers3 size={20} /><h3>Content Pipeline</h3></div><button className="text-link" onClick={() => setActiveNav("Content Plan")}>View details <ArrowRight size={15} /></button></div>
              <div className="pipeline-steps">
                {pipelineSteps.map((step, i) => {
                  const Icon = step.icon;
                  return <div className="pipeline-step-wrap" key={step.label}>
                    <div className={`pipeline-step ${step.current ? "current" : ""} ${step.done ? "done" : ""}`}>
                      <Icon size={19} /><span>{step.label}</span><b>{liveCounts[step.label]}</b>
                    </div>
                    {i < 4 && <ArrowRight className="step-arrow" size={14} />}
                  </div>;
                })}
              </div>
              <div className="pipeline-foot"><span><i className="dot purple-dot" /> {liveCounts["Produksi"]} konten sedang dikerjakan</span><span>{pendingApprovals} menunggu approval</span></div>
            </article>
          </section>

          <section className="x-dash-row">
            <article className="panel"><div className="panel-heading"><div><CheckCircle2 size={19} /><h3>Butuh keputusan Anda</h3></div><button className="text-link" onClick={() => setActiveNav("AI Agent Team")}>Semua approval <ArrowRight size={15} /></button></div><ApprovalList limit={3} empty="Tidak ada yang menunggu. Hasil agent dan konten yang diajukan akan muncul di sini." /></article>
            <article className="panel"><div className="panel-heading"><div><MessageCircle size={19} /><h3>Leads FORIOR dari sosmed</h3></div><button className="text-link" onClick={() => setActiveNav("Inbox & Leads")}>Buka inbox <ArrowRight size={15} /></button></div><div className="x-leads"><div><b>{leads.length}</b><span>total lead</span></div><div><b>{leads.filter(l=>l.status==="Baru").length}</b><span>belum dibalas</span></div><div><b>{leads.filter(l=>l.status==="Deal").length}</b><span>deal</span></div></div><AiCostBadge /></article>
          </section>

          <section className="bottom-row">
            <article className="panel calendar-panel">
              <div className="panel-heading"><div><CalendarDays size={19} /><h3>Content Calendar</h3></div><button className="text-link" onClick={() => setActiveNav("Content Plan")}>Lihat kalender <ArrowRight size={15} /></button></div>
              <div className="schedule-list">
                {(visibleSchedules.length ? visibleSchedules : schedules).map((item) => (
                  <div className="schedule-item" key={item.title}>
                    <div className="schedule-date"><b>{item.day}</b><small>{item.time} WIB</small></div>
                    <PlatformIcon platform={item.platform} />
                    <div className="schedule-copy"><b>{item.type} <span>·</span> {item.title}</b><small>{item.platform}</small></div>
                    <span className="status status-green">Terjadwal</span>
                  </div>
                ))}
                {!visibleSchedules.length && <small className="muted">Tidak ada jadwal untuk filter ini.</small>}
              </div>
            </article>

            <article className="panel agents-panel">
              <div className="panel-heading"><div><Sparkles size={20} /><h3>AI Agent Team</h3><span className="running"><i /> Running</span></div><button className="text-link" onClick={() => setActiveNav("AI Agent Team")}>Lihat tim <ArrowRight size={15} /></button></div>
              <div className="agent-grid">
                {(showAllAgents ? agents : agents.slice(0, 5)).map((agent) => {
                  const Icon = agent.icon;
                  return <div className="agent-item" key={agent.name}><span className="agent-icon"><Icon size={17} /></span><div><b>{agent.name}</b><small>{agent.role}</small></div><span className="agent-check"><Check size={11} /></span></div>;
                })}
              </div>
              <div className="agent-foot"><span>5 agents aktif</span><button onClick={() => setShowAllAgents(!showAllAgents)}>{showAllAgents ? "Ringkas" : "Lihat aktivitas"} <ArrowRight size={13} /></button></div>
            </article>

            <article className="panel insight-panel">
              <div className="panel-heading"><div><ChartNoAxesCombined size={19} /><h3>Key Insight</h3></div><span className="insight-badge">AI Insight</span></div>
              <div className="insight-body"><span className="bulb"><Lightbulb size={24} /></span><div><b>Behind the Scene</b><p>Reels dengan tema behind the scene memiliki engagement <strong>+68%</strong> lebih tinggi.</p></div></div>
              <button className="insight-link" onClick={() => setActiveNav("Analytics")}>Lihat rekomendasi <ArrowRight size={14} /></button>
            </article>
          </section>

          <footer className="dashboard-footer">
            <span>FORIOR Creator OS <i>·</i> Dashboard Preview</span>
            <span>Reach, engagement, dan followers masih ilustrasi <i>·</i> pipeline, approval, dan leads adalah data Anda</span>
          </footer>
        </div>}
      </section>

      <nav className="f-bottomnav" aria-label="Navigasi cepat">
        {[["Dashboard","Beranda",Home],["Content Plan","Plan",CalendarDays],["Production Studio","Studio",Clapperboard],["AI Agent Team","Agen",Sparkles]].map(([nav,label,Icon]: any) => <button key={nav} className={activeNav===nav?"active":""} onClick={() => setActiveNav(nav)}><Icon size={20} /><span>{label}</span>{nav==="AI Agent Team" && pendingApprovals>0 && <i>{pendingApprovals}</i>}</button>)}
        <button onClick={() => setMobileNav(true)}><Menu size={20} /><span>Menu</span></button>
      </nav>

      {toast && <div className="x-toast" role="status"><span>{toast}</span><button onClick={() => setToast("")} aria-label="Tutup pesan"><X size={16} /></button></div>}

      {quickAction && (
        <div className="modal-backdrop" onClick={() => setQuickAction("")}>
          <div className="quick-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setQuickAction("")}><X size={18} /></button>
            <span className="modal-icon"><Sparkles size={22} /></span>
            <h2>{quickAction}</h2>
            <p>Ini adalah contoh interaksi dashboard. Modul dan data detail akan dihubungkan pada tahap integrasi berikutnya.</p>
            <button className="primary-button" onClick={() => setQuickAction("")}>Mengerti</button>
          </div>
        </div>
      )}
    </main>
  );
}
