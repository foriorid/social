"use client";

import { useMemo, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, CalendarDays,
  Camera, Check, CheckCircle2, ChevronDown, CircleHelp, Clapperboard,
  Command, Compass, FileText, Film, FolderOpen, Goal, Home, Image as ImageIcon,
  Instagram, Lightbulb, Menu, MessageCircle, MoreHorizontal, Play, Plus,
  Search, Send, Settings, Sparkles, Target, Users, Video, X, Youtube,
  ChartNoAxesCombined, Clock3, Layers3, BriefcaseBusiness, TrendingUp, Bookmark,
  Hash, Eye, Flame, WandSparkles, PlusCircle, ChevronRight, Filter, CirclePlay,
  MessageSquareText, ChartLine, Lightbulb as LightbulbIcon, Cloud, Database, UploadCloud, Music2, UserCircle2, UserPlus, History, ShieldCheck, Info, ExternalLink, FolderPlus, MessageCircle, AtSign, Zap
} from "lucide-react";

type Platform = "All channels" | "Instagram" | "TikTok" | "YouTube";
type Range = "Last 7 Days" | "Last 30 Days" | "Last 90 Days";

const navGroups = [
  {
    label: "WORKSPACE",
    items: [
      { name: "Dashboard", icon: Home },
      { name: "Research & Insight", icon: Compass },
      { name: "Content Plan", icon: CalendarDays },
      { name: "Production Studio", icon: Clapperboard, expandable: true }
    ]
  },
  {
    label: "MANAGEMENT",
    items: [
      { name: "AI Agent Team", icon: Sparkles },
      { name: "Analytics", icon: ChartNoAxesCombined },
      { name: "Asset Library", icon: ImageIcon },
      { name: "Team & Workflow", icon: Users }
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

function ImageTile({ kind, className = "" }: { kind: string; className?: string }) {
  const backgrounds: Record<string, string> = {
    villa: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1000&q=85",
    living: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=85",
    bedroom: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=800&q=85",
    camera: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=800&q=85"
  };
  return <div className={`image-tile ${className}`} style={{ backgroundImage: `url("${backgrounds[kind] || backgrounds.villa}")` }} />;
}



function ResearchPage() {
  const [tab, setTab] = useState("Bedah Akun");
  const [profile, setProfile] = useState("https://instagram.com/alvian.indonesia");
  const [analysed, setAnalysed] = useState("@alvian.indonesia");
  const [bankQuery, setBankQuery] = useState("");
  const [savedHooks, setSavedHooks] = useState<string[]>(["Kenapa foto interior yang bagus bisa mengubah persepsi harga properti?"]);
  const [addedIdeas, setAddedIdeas] = useState<string[]>([]);
  const auditIdeas = [
    { title: "Before/after kamar dalam 15 detik", type: "Reels", tag: "pola before/after", desc: "Hook visual di detik pertama, tanpa narasi panjang." },
    { title: "Berapa biaya foto interior profesional?", type: "Carousel", tag: "celah: harga", desc: "Jawab pertanyaan yang sering dicari calon klien." },
    { title: "Listing ini laku 9 hari setelah difoto ulang", type: "TikTok", tag: "celah: hasil bisnis", desc: "Hubungkan kualitas visual dengan hasil pemasaran properti." }
  ];
  const hooks = [
    { category: "Curiosity", hook: "Kenapa foto interior yang bagus bisa mengubah persepsi harga properti?", format: "Reels" },
    { category: "Problem / Solution", hook: "Jangan lakukan 3 hal ini saat memotret ruangan kecil.", format: "Carousel" },
    { category: "Contrarian", hook: "Lensa wide bukan selalu solusi untuk foto interior.", format: "Reels" },
    { category: "Storytelling", hook: "Awalnya saya kira ruangan ini sulit difoto, sampai menemukan sudut ini.", format: "Reels" },
    { category: "Authority", hook: "Ini checklist yang saya pakai sebelum memotret sebuah villa.", format: "Carousel" },
    { category: "Business", hook: "Apa yang sebenarnya dibeli klien saat menyewa fotografer properti?", format: "Carousel" }
  ];
  const filteredHooks = hooks.filter(x => `${x.hook} ${x.category} ${x.format}`.toLowerCase().includes(bankQuery.toLowerCase()));
  const handleAudit = () => {
    const match = profile.match(/@([^/?]+)/);
    setAnalysed(match ? `@${match[1]}` : profile.replace(/^https?:\/\//, ""));
  };
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
          <div className="audit-input-row"><input value={profile} onChange={e=>setProfile(e.target.value)} placeholder="https://instagram.com/username"/><button className="primary-button" onClick={handleAudit}><WandSparkles size={15}/> Bedah akun</button></div>
          <div className="recent-profiles"><span>Terakhir dibedah:</span>{["@alvian.indonesia","@kreator.sejenis","@kompetitor.foto"].map(v=><button key={v} onClick={()=>{setProfile(`https://instagram.com/${v.slice(1)}`);setAnalysed(v);}}>{v}</button>)}</div>
        </section>
        <div className="audit-result-heading"><div><h3>Hasil bedah: {analysed}</h3><span className="channel-chip">Instagram</span><span className="muted-chip">30 posting terakhir</span></div><span className="audit-cost">Biaya bedah ± Rp 900 <button className="outline-button" onClick={()=>alert("Akun ditambahkan ke watchlist (simulasi).")}>+ Pantau akun ini</button></span></div>
        <div className="audit-grid">
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
            {auditIdeas.map(idea=><article className="adapt-idea" key={idea.title}><span className="adapt-meta">{idea.type} · {idea.tag}</span><b>{idea.title}</b><p>{idea.desc}</p><button onClick={()=>setAddedIdeas(old=>old.includes(idea.title)?old:[...old,idea.title])}>{addedIdeas.includes(idea.title)?<Check size={13}/>:<Plus size={13}/>} {addedIdeas.includes(idea.title)?"Ditambahkan":"Tambah ke plan"}</button></article>)}
          </section>
        </div>
      </>}
      {tab === "Bank Ide & Hook" && <section className="panel hook-bank-panel">
        <div className="hook-bank-header"><div><h3>Bank Ide & Hook</h3><p>Kumpulan opening, angle, dan format yang bisa dipakai ulang atau dikembangkan menjadi konten.</p></div><button className="primary-button" onClick={()=>alert("AI Hook Generator dibuka (simulasi).")}><WandSparkles size={15}/> Generate hooks</button></div>
        <div className="hook-tools"><div className="search-field"><Search size={15}/><input value={bankQuery} onChange={e=>setBankQuery(e.target.value)} placeholder="Cari hook, kategori, atau format..."/></div><span className="muted-chip">{filteredHooks.length} hooks</span></div>
        <div className="hook-bank-grid">{filteredHooks.map((item,i)=><article className="hook-card" key={item.hook}><div><span className="hook-category">{item.category}</span><span className="hook-format">{item.format}</span></div><h4>“{item.hook}”</h4><div className="hook-card-footer"><span>Hook #{String(i+1).padStart(2,"0")}</span><button className={savedHooks.includes(item.hook)?"saved":""} onClick={()=>setSavedHooks(old=>old.includes(item.hook)?old.filter(x=>x!==item.hook):[...old,item.hook])}><Bookmark size={14} fill={savedHooks.includes(item.hook)?"currentColor":"none"}/>{savedHooks.includes(item.hook)?"Saved":"Save hook"}</button><button onClick={()=>alert("Hook disalin ke draft konten (simulasi).")}><CopyIcon/> Use hook</button></div></article>)}</div>
      </section>}
      {(tab === "Radar Tren" || tab === "Kompetitor & Kreator") && <div className="research-placeholder-grid">
        <section className="panel"><div className="panel-heading"><div><TrendingUp size={19}/><h3>{tab === "Radar Tren" ? "Radar tren niche property" : "Creator & competitor watchlist"}</h3></div><span className="insight-badge">Sample data</span></div>
          {(tab === "Radar Tren" ? ["Interior before-after","+42%","Lighting tutorial","+36%","Villa walkthrough","+28%","Property marketing","+19%"] : ["Property Creator ID","+18%","Home Visual Journal","+12%","Interior Lens Studio","+9%"]).reduce((acc:any,v:any,i:any,a:any)=>{if(i%2===0) acc.push([v,a[i+1]]);return acc;},[]).map((r:string[],i:number)=><div className="watch-row" key={r[0]}><span className="watch-number">0{i+1}</span><b>{r[0]}</b><em>{r[1]}</em></div>)}
        </section>
        <section className="research-tip"><span><LightbulbIcon size={19}/></span><div><b>Researcher recommendation</b><p>Adaptasi pola kreatif, bukan menyalin konten. Cari sudut pandang yang sesuai pengalaman dan positioning Alvian atau brief klien.</p></div></section>
      </div>}
      <div className="module-footer">Data ilustrasi untuk UI preview · Analisis akun live memerlukan koneksi sumber data/API yang sesuai.</div>
    </div>
  );
}

function CopyIcon() { return <FileText size={13}/>; }


function ContentPlanPage({ onOpenProduction, initialIdea="" }: { onOpenProduction:(brief:{title:string;account:string;campaign:string;format:string;hook:string})=>void; initialIdea?:string }) {
  const [accounts,setAccounts]=useState(["Alvian","FORIOR","Intragama Villa"]);
  const [account,setAccount]=useState("Alvian");
  const [campaigns,setCampaigns]=useState([{id:1,account:"Alvian",name:"Christmas & New Year 2026",period:"Dec 2026",goal:"Awareness & engagement"},{id:2,account:"Alvian",name:"Valentine's Day 2027",period:"Feb 2027",goal:"Engagement"},{id:3,account:"FORIOR",name:"Year-end Portfolio Campaign",period:"Dec 2026",goal:"Lead generation"},{id:4,account:"Intragama Villa",name:"Festive Season Escape",period:"Dec 2026",goal:"Bookings"}]);
  const [campaignId,setCampaignId]=useState<number|null>(null);
  const [selected,setSelected]=useState(0);
  const [filter,setFilter]=useState("All");
  const [showAccount,setShowAccount]=useState(false),[showCampaign,setShowCampaign]=useState(false),[showDetail,setShowDetail]=useState(false);
  const [accountName,setAccountName]=useState(""),[campaignName,setCampaignName]=useState(""),[campaignPeriod,setCampaignPeriod]=useState("Dec 2026"),[campaignGoal,setCampaignGoal]=useState("Awareness & engagement");
  const [briefOverrides,setBriefOverrides]=useState<Record<number,{title?:string;hook?:string;format?:string}>>({});
  const [briefDraft,setBriefDraft]=useState({title:"",hook:"",format:"Reels"});
  const activeCampaign=campaigns.find(c=>c.id===campaignId);
  const visibleCampaigns=campaigns.filter(c=>c.account===account);
  const titles=["Holiday home tour: festive edition","5 reasons to celebrate here","A cozy Christmas morning","New Year, new memories","Behind the scenes: festive setup","The perfect group getaway"];
  const baseContent=Array.from({length:30},(_,i)=>({day:i+1,title:i===0&&initialIdea?initialIdea:(titles[i%6]+(i>=6?" · Part "+(Math.floor(i/6)+1):"")),format:i%3===1?"Carousel":"Reels",pillar:["Brand story","Education","Property highlight","Lifestyle"][i%4],status:i<4?"Brief ready":"Planned",hook:i===0&&initialIdea?"Follow up dari komentar/mention audiens: "+initialIdea:"Susun hook utama untuk "+titles[i%6].toLowerCase()+".",objective:activeCampaign?.goal||"Awareness",publish:"Dec "+String(i+1).padStart(2,"0")}));
  const content=baseContent.map(item=>({...item,...(briefOverrides[item.day]||{})}));
  const current=content[selected]||content[0];
  const filtered=content.filter(x=>filter==="All"||x.format===filter);
  return <div className="module-page content-plan-v2">
    <div className="plan-v2-toolbar"><div><span className="agent-badge"><i/> CONTENT PLANNER</span><span className="muted-chip">{accounts.length} accounts · {campaigns.length} campaigns</span></div><div><button className="outline-button" onClick={()=>setShowAccount(true)}><Plus size={13}/> Add account</button><button className="primary-button" onClick={()=>setShowCampaign(true)}><Plus size={14}/> New campaign</button></div></div>
    <section className="plan-v2-account-bar"><div><label>ACCOUNT / BRAND</label><div className="plan-v2-account-list">{accounts.map(a=><button key={a} className={account===a?"active":""} onClick={()=>{setAccount(a);setCampaignId(null);setSelected(0);}}>{a}</button>)}</div></div><span className="muted-chip">{visibleCampaigns.length} campaigns in {account}</span></section>
    {!activeCampaign ? <><div className="plan-v2-section-head"><div><h2>Campaigns</h2><p>Setiap akun memiliki campaign sendiri. Setiap campaign berisi 30 content plan.</p></div></div><div className="plan-v2-campaign-grid">{visibleCampaigns.map(c=><button className="plan-v2-campaign-card" key={c.id} onClick={()=>{setCampaignId(c.id);setSelected(0);}}><span>CAMPAIGN · {c.period}</span><b>{c.name}</b><small>{c.goal}</small><div><span><CalendarDays size={13}/> 30 content plans</span><span>Open campaign <ArrowRight size={13}/></span></div></button>)}{visibleCampaigns.length===0&&<div className="panel plan-v2-empty">Belum ada campaign untuk akun ini. Buat campaign pertama.</div>}</div></> : <>
      <div className="plan-v2-breadcrumb"><button onClick={()=>setCampaignId(null)}>{account} / Campaigns</button><ChevronRight size={13}/><b>{activeCampaign.name}</b></div>
      <section className="plan-v2-campaign-hero"><div><span>CAMPAIGN · {activeCampaign.period}</span><h2>{activeCampaign.name}</h2><p>{activeCampaign.goal} · 30 content plans</p></div><div className="plan-v2-progress"><b>30</b><span>content slots</span><i><em/></i></div></section>
      <section className="panel plan-v2-content-panel"><div className="plan-v2-section-head"><div><h2>Content plan</h2><p>Setiap item memiliki brief sendiri dan bisa diteruskan ke Production Studio.</p></div><button className="outline-button" onClick={()=>{setSelected(0);setBriefDraft({title:"",hook:"",format:"Reels"});setShowDetail(true);}}><Plus size={13}/> Edit first brief</button></div>
        <div className="plan-v2-content-tools"><div>{["All","Reels","Carousel"].map(v=><button key={v} className={filter===v?"active":""} onClick={()=>setFilter(v)}>{v}</button>)}</div><span>{filtered.length} of 30 content slots</span></div>
        <div className="plan-v2-content-layout"><div className="plan-v2-content-list">{filtered.map(item=><button key={item.day} className={selected===item.day-1?"active":""} onClick={()=>setSelected(item.day-1)}><span>{String(item.day).padStart(2,"0")}</span><div><b>{item.title}</b><small>{item.format} · {item.pillar}</small><em>{item.status}</em></div><ChevronRight size={14}/></button>)}</div>
          <div className="plan-v2-brief"><div className="plan-v2-brief-head"><div><span>CONTENT BRIEF · {String(current.day).padStart(2,"0")}/30</span><h3>{current.title}</h3><small>{current.format} · {current.pillar} · {current.publish}</small></div><button className="outline-button" onClick={()=>{setBriefDraft({title:current.title,hook:current.hook,format:current.format});setShowDetail(true);}}><FileText size={13}/> Edit brief</button></div>
            <div className="plan-v2-brief-fields"><div><label>OBJECTIVE</label><b>{current.objective}</b></div><div><label>FORMAT</label><b>{current.format}</b></div><div><label>STATUS</label><b>{current.status}</b></div></div><div className="plan-v2-hook"><label>HOOK / CORE MESSAGE</label><p>{current.hook}</p></div>
            <div className="plan-v2-mapping"><Sparkles size={15}/><div><b>Production Studio mapping</b><small>Account, campaign, title, format, objective, and hook are passed as the production brief.</small></div></div><button className="primary-button plan-v2-open-production" onClick={()=>onOpenProduction({title:current.title,account,campaign:activeCampaign.name,format:current.format,hook:current.hook})}>Open in Production Studio <ArrowRight size={14}/></button>
          </div>
        </div>
      </section></>}
    {showAccount&&<div className="modal-backdrop" onClick={()=>setShowAccount(false)}><div className="quick-modal plan-v2-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setShowAccount(false)}><X size={18}/></button><span className="modal-icon"><Users size={21}/></span><h2>Add account</h2><p>Tambahkan brand atau akun baru.</p><label>ACCOUNT NAME</label><input value={accountName} onChange={e=>setAccountName(e.target.value)} placeholder="Contoh: Pawon Cabin"/><button className="primary-button" onClick={()=>{if(accountName.trim()&&!accounts.includes(accountName.trim())){setAccounts(v=>[...v,accountName.trim()]);setAccount(accountName.trim());setAccountName("");setShowAccount(false);}}}>Add account</button></div></div>}
    {showCampaign&&<div className="modal-backdrop" onClick={()=>setShowCampaign(false)}><div className="quick-modal plan-v2-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setShowCampaign(false)}><X size={18}/></button><span className="modal-icon"><CalendarDays size={21}/></span><h2>Create campaign</h2><p>Campaign dibuat di dalam akun yang dipilih.</p><label>ACCOUNT</label><select value={account} onChange={e=>setAccount(e.target.value)}>{accounts.map(a=><option key={a}>{a}</option>)}</select><label>CAMPAIGN NAME</label><input value={campaignName} onChange={e=>setCampaignName(e.target.value)} placeholder="Contoh: Ramadan Campaign"/><label>PERIOD</label><input value={campaignPeriod} onChange={e=>setCampaignPeriod(e.target.value)}/><label>OBJECTIVE</label><select value={campaignGoal} onChange={e=>setCampaignGoal(e.target.value)}><option>Awareness & engagement</option><option>Lead generation</option><option>Bookings</option><option>Sales conversion</option></select><button className="primary-button" onClick={()=>{if(campaignName.trim()){const id=Math.max(0,...campaigns.map(c=>c.id))+1;setCampaigns(v=>[...v,{id,account,name:campaignName.trim(),period:campaignPeriod,goal:campaignGoal}]);setCampaignId(id);setCampaignName("");setShowCampaign(false);}}}>Create campaign · 30 content slots</button></div></div>}
    {showDetail&&<div className="modal-backdrop" onClick={()=>setShowDetail(false)}><div className="quick-modal plan-v2-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setShowDetail(false)}><X size={18}/></button><span className="modal-icon"><FileText size={21}/></span><h2>Content brief</h2><p>Brief akan menjadi sumber field untuk Production Studio.</p><label>CONTENT TITLE</label><input value={briefDraft.title} onChange={e=>setBriefDraft(v=>({...v,title:e.target.value}))}/><label>HOOK / CORE MESSAGE</label><textarea value={briefDraft.hook} onChange={e=>setBriefDraft(v=>({...v,hook:e.target.value}))} rows={3}/><label>FORMAT</label><select value={briefDraft.format} onChange={e=>setBriefDraft(v=>({...v,format:e.target.value}))}><option>Reels</option><option>Carousel</option><option>Feed</option></select><button className="primary-button" onClick={()=>{setBriefOverrides(v=>({...v,[current.day]:{title:briefDraft.title,hook:briefDraft.hook,format:briefDraft.format}}));setShowDetail(false);}}>Save brief</button></div></div>}
    <div className="module-footer">Account, campaign, and brief interactions are frontend prototype state. Persistent storage will be connected in the backend phase.</div>
  </div>;
}

function ProductionStudioPage({ initialTab="Feed & Carousel", brief }: {initialTab?:string;brief?:{title:string;account:string;campaign:string;format:string;hook:string}|null}) {
  const [tab,setTab]=useState(initialTab);
  const [selectedSlide,setSelectedSlide]=useState(0);
  const [format,setFormat]=useState("Carousel 4:5");
  const [headline,setHeadline]=useState(brief?.title||"5 Hal yang Membuat Foto Interior Terlihat Profesional");
  const [caption,setCaption]=useState(brief?.hook||"Visual yang baik dimulai dari detail yang tepat.");
  const [assetTab,setAssetTab]=useState("Project assets");
  const [saved,setSaved]=useState(false);
  const slideTitles=["Cover","The right angle","Lighting matters","Details tell stories","Final result","Call to action"];
  const isVideo=tab==="Reels & Video";
  const slides=[
    ["Cover","Hero photo + headline besar, maksimal 2 baris."],
    ["The right angle","Perlihatkan perbandingan sudut kamera dan distorsi."],
    ["Lighting matters","Tunjukkan arah cahaya dan hasil exposure."],
    ["Details tell stories","Close-up material, texture, dan styling."],
    ["Final result","Tampilkan hasil foto final dengan komposisi bersih."],
    ["Call to action","Simpan tips ini dan follow untuk insight berikutnya."]
  ];
  return <div className="module-page production-page">
    <div className="studio-nav-row"><div className="studio-tabs">{["Feed & Carousel","Reels & Video","Templates","Asset Library"].map(v=><button key={v} className={tab===v?"active":""} onClick={()=>setTab(v)}>{v==="Feed & Carousel"?<Layers3 size={15}/>:v==="Reels & Video"?<Film size={15}/>:v==="Templates"?<ImageIcon size={15}/>:<FolderOpen size={15}/>} {v}</button>)}</div><div className="production-top-actions"><span className="agent-badge"><i/> Creative agents ready</span><button className="primary-button module-action" onClick={()=>alert("New production project dibuat (simulasi).")}><Plus size={15}/> New project</button></div></div>
    {tab==="Feed & Carousel" && <>
      <div className="studio-project-bar"><div><span>PROJECT</span><b>{brief?`${brief.account} · ${brief.title}`:"Alvian · Interior Photography Tips"}</b><small>{brief?`${brief.campaign} · ${brief.format} · mapped from Content Plan`:"Instagram carousel · Draft saved 2 minutes ago"}</small></div><div><span className="studio-save-state">{saved?"All changes saved":"Unsaved changes"}</span><button className="outline-button" onClick={()=>setSaved(true)}><Check size={13}/> Save draft</button><button className="primary-button" onClick={()=>alert("Konten diajukan ke approval (simulasi).")}>Submit for review <ArrowRight size={14}/></button></div></div>
      <div className="creative-workspace">
        <aside className="slide-manager panel"><div className="studio-panel-head"><div><b>Slides</b><small>6 slides · 4:5 format</small></div><button onClick={()=>setSelectedSlide(0)}><Plus size={15}/></button></div>
          {slideTitles.map((title,i)=><button className={`slide-thumb ${selectedSlide===i?"active":""}`} key={title} onClick={()=>setSelectedSlide(i)}><span className="thumb-number">{String(i+1).padStart(2,"0")}</span><span className="thumb-preview"><span>{i===0?"FORIOR":i===5?"SAVE & SHARE":`0${i} / INTERIOR`}</span><b>{title}</b></span><MoreHorizontal size={14}/></button>)}
          <button className="add-slide-button" onClick={()=>setSelectedSlide(slideTitles.length-1)}><Plus size={14}/> Add new slide</button>
        </aside>
        <section className="canvas-area panel"><div className="canvas-toolbar"><div><span>CANVAS</span><b>{format}</b></div><div><button onClick={()=>setFormat(format==="Carousel 4:5"?"Square 1:1":"Carousel 4:5")}>{format==="Carousel 4:5"?"4:5":"1:1"} <ChevronDown size={13}/></button><button onClick={()=>alert("Zoom control (simulasi).")}>−</button><span>75%</span><button onClick={()=>alert("Zoom control (simulasi).")}>+</button></div></div>
          <div className={`design-canvas ${format==="Square 1:1"?"square":""}`}><ImageTile kind={selectedSlide===2?"camera":selectedSlide===3?"bedroom":"living"} className="design-canvas-photo"/><div className="design-canvas-shade"/><div className="design-canvas-brand">FORIOR <span>INTERIOR PHOTOGRAPHY</span></div><div className="design-canvas-copy"><small>PHOTOGRAPHY NOTES · 0{selectedSlide+1}</small><h2>{selectedSlide===0?headline:slides[selectedSlide][0]}</h2><p>{selectedSlide===0?caption:slides[selectedSlide][1]}</p></div><div className="design-canvas-footer"><span>ALVIAN · FORIOR</span><b>{String(selectedSlide+1).padStart(2,"0")} / 06</b></div></div>
          <div className="canvas-pagination"><button onClick={()=>setSelectedSlide(Math.max(0,selectedSlide-1))} disabled={selectedSlide===0}>Previous slide</button><span>Slide {selectedSlide+1} of 6</span><button onClick={()=>setSelectedSlide(Math.min(5,selectedSlide+1))} disabled={selectedSlide===5}>Next slide <ArrowRight size={13}/></button></div>
        </section>
        <aside className="creative-assistant panel"><div className="assistant-heading"><span><WandSparkles size={17}/></span><div><b>AI Creative Assistant</b><small>Design & copy partner</small></div></div>
          <div className="assistant-section"><label>CONTENT COPY</label><span>Headline</span><textarea value={headline} onChange={e=>setHeadline(e.target.value)} rows={3}/><span>Supporting text</span><textarea value={caption} onChange={e=>setCaption(e.target.value)} rows={2}/><button className="assistant-action" onClick={()=>setHeadline("Jangan Abaikan 5 Detail Ini Saat Memotret Interior")}><Sparkles size={13}/> Generate headline</button></div>
          <div className="assistant-section"><label>DESIGN SUGGESTIONS</label><div className="suggestion-item"><span className="suggestion-dot"/> Use a stronger visual hook on cover</div><div className="suggestion-item"><span className="suggestion-dot"/> Keep headline within 2 lines</div><div className="suggestion-item"><span className="suggestion-dot"/> Increase contrast on slide 03</div></div>
          <div className="assistant-section"><label>ASSET LIBRARY</label><div className="asset-switch"><button className={assetTab==="Project assets"?"active":""} onClick={()=>setAssetTab("Project assets")}>Project</button><button className={assetTab==="Brand kit"?"active":""} onClick={()=>setAssetTab("Brand kit")}>Brand kit</button></div><div className="asset-mini-grid"><ImageTile kind="living"/><ImageTile kind="bedroom"/><ImageTile kind="camera"/></div><small className="asset-note">{assetTab==="Project assets"?"24 project photos available":"FORIOR brand colors, logo & typography"}</small></div>
        </aside>
      </div>
    </>}
    {isVideo && <div className="video-editor-layout">
      <aside className="video-workflow panel"><b>VIDEO WORKFLOW</b>{["Script & hook","Scene planning","Footage selection","Timeline editor","Subtitles & audio","Thumbnail & export"].map((v,i)=><button className={i===selectedSlide?"active":""} key={v} onClick={()=>setSelectedSlide(i)}><span>{String(i+1).padStart(2,"0")}</span>{v}<ChevronRight size={13}/></button>)}</aside>
      <section className="video-main panel"><div className="video-project-head"><div><span>REELS PROJECT</span><h3>Behind the Shoot — Villa Puncak</h3><small>Instagram Reels · 9:16 · 00:32</small></div><span className="status-production">Editing</span></div><div className="video-preview-wrap"><div className="video-preview"><ImageTile kind="villa"/><div className="video-preview-overlay"><span>FORIOR FILMS</span><b>Behind the<br/>Shoot.</b><small>VILLA PUNCAK · 2026</small></div><button><Play size={22} fill="currentColor"/></button></div></div><div className="timeline-head"><b>Timeline</b><span>00:00 / 00:32</span></div><div className="timeline-ruler"><span>00:00</span><span>00:08</span><span>00:16</span><span>00:24</span><span>00:32</span></div><div className="timeline-track"><span className="track-label">VIDEO</span><div className="track-blocks"><i/><i/><i/><i/></div></div><div className="timeline-track audio"><span className="track-label">AUDIO</span><div className="audio-wave"><i/></div></div><div className="timeline-track"><span className="track-label">TEXT</span><div className="text-block">Behind the Shoot · Villa Puncak</div></div></section>
      <aside className="video-ai panel"><div className="assistant-heading"><span><WandSparkles size={17}/></span><div><b>AI Video Editor</b><small>Editing co-pilot</small></div></div><label>SELECTED STEP</label><h4>{["Script & hook","Scene planning","Footage selection","Timeline editor","Subtitles & audio","Thumbnail & export"][selectedSlide]}</h4><p>AI dapat membantu merapikan alur cerita, memilih footage, menyusun subtitle, dan menyarankan pacing video.</p><button className="assistant-action" onClick={()=>alert("AI menyusun rekomendasi untuk tahap ini (simulasi).")}><Sparkles size={13}/> Generate suggestion</button><div className="assistant-section"><label>QUICK TOOLS</label>{["Auto captions","Remove silence","Suggest B-roll","Generate thumbnail"].map(v=><button className="quick-tool" key={v} onClick={()=>alert(`${v} (simulasi).`)}>{v}<ArrowRight size={13}/></button>)}</div><button className="primary-button export-button" onClick={()=>alert("Export preview (simulasi).")}>Export video <ArrowRight size={14}/></button></aside>
    </div>}
    {tab==="Templates"&&<section className="template-gallery">{["Editorial Minimal","Property Showcase","Educational Carousel","Before / After","Luxury Villa Reel","Photography Tips"].map((v,i)=><article className="panel template-card" key={v}><div className={`template-art template-art-${i+1}`}><span>FORIOR</span><b>{v}</b><small>CREATIVE TEMPLATE</small></div><h3>{v}</h3><p>{i%2===0?"Carousel · 6 slides":"Reels · 9:16"}</p><button className="outline-button" onClick={()=>setTab(i%2===0?"Feed & Carousel":"Reels & Video")}>Use template <ArrowRight size={13}/></button></article>)}</section>}
    {tab==="Asset Library"&&<section className="panel asset-library-page"><div className="panel-heading"><div><FolderOpen size={19}/><h3>Asset Library</h3></div><button className="primary-button" onClick={()=>alert("Upload asset (simulasi).")}><Plus size={14}/> Upload assets</button></div><p className="panel-subtitle">Kelola foto, footage, logo, dan materi brand untuk produksi konten.</p><div className="asset-library-grid">{["living","bedroom","camera","villa","living","bedroom","camera","villa"].map((v,i)=><article key={i}><ImageTile kind={v}/><b>{["Living room wide","Master bedroom","Camera setup","Villa exterior"][i%4]}</b><small>{i%2===0?"Photo · JPG":"Project asset · JPG"}</small></article>)}</div></section>}
    <div className="module-footer">Production workspace preview · AI generation, rendering, media processing, and export require backend services.</div>
  </div>;
}


function AIAgentTeamPage() {
  const [selectedAgent,setSelectedAgent]=useState("Creative Strategist");
  const [teamFilter,setTeamFilter]=useState("All agents");
  const [showAssign,setShowAssign]=useState(false);
  const [task,setTask]=useState("Create a 30-day content plan for Intragama Villa");
  const [agentMode,setAgentMode]=useState("Approval required");
  const [running,setRunning]=useState(false);
  const [approved,setApproved]=useState<string[]>([]);
  const agentList=[
    {name:"Research Analyst",role:"Riset akun, tren, kompetitor",group:"Strategy",icon:Search,status:"Working",task:"Menganalisis 3 akun kreator properti",load:"78%",color:"purple",desc:"Mengumpulkan insight dari akun publik, membaca pola format, engagement, topik, dan peluang konten yang relevan."},
    {name:"Creative Strategist",role:"Positioning, content pillars & campaign",group:"Strategy",icon:Target,status:"Ready",task:"Menyiapkan arah campaign bulanan",load:"42%",color:"purple",desc:"Menerjemahkan tujuan bisnis menjadi strategi konten, content pillars, campaign angle, dan brief yang bisa dieksekusi tim."},
    {name:"Content Writer",role:"Hook, script, caption & copywriting",group:"Creative",icon:FileText,status:"Ready",task:"Menulis 6 hook Reels",load:"35%",color:"pink",desc:"Menulis hook, storyboard, voice-over, caption, CTA, dan variasi copy sesuai tone of voice Alvian, FORIOR, atau klien."},
    {name:"Graphic Designer",role:"Feed, carousel & visual direction",group:"Creative",icon:Layers3,status:"Working",task:"Mendesain carousel photography tips",load:"64%",color:"pink",desc:"Menyusun layout feed dan carousel dari brand kit serta aset terpilih di Asset Library."},
    {name:"Video Editor",role:"Reels, TikTok & short-form video",group:"Creative",icon:Film,status:"Ready",task:"Menunggu footage terpilih",load:"18%",color:"pink",desc:"Membantu scene selection, rough cut, pacing, subtitle, audio, thumbnail, dan export brief."},
    {name:"Social Media Manager",role:"Calendar, scheduling & channel ops",group:"Publishing",icon:CalendarDays,status:"Working",task:"Menyusun jadwal publikasi minggu ini",load:"56%",color:"blue",desc:"Mengelola kalender publikasi, distribusi lintas platform, campaign status, dan rekomendasi waktu posting."},
    {name:"Community Manager",role:"Comment, DM & audience engagement",group:"Publishing",icon:MessageCircle,status:"Ready",task:"Menyiapkan balasan FAQ",load:"22%",color:"blue",desc:"Menyusun draft balasan komentar dan DM, mengelompokkan pertanyaan leads, dan menjaga respons sesuai brand voice."},
    {name:"Workflow Coordinator",role:"Approval, handoff & quality control",group:"Operations",icon:CheckCircle2,status:"Ready",task:"4 konten menunggu approval",load:"30%",color:"green",desc:"Mengatur handoff antar-agent, checklist kualitas, approval manusia, dan status pekerjaan agar tidak ada konten terbit tanpa persetujuan."}
  ];
  const selected=agentList.find(a=>a.name===selectedAgent)||agentList[1];
  const SelectedAgentIcon=selected.icon;
  const filtered=agentList.filter(a=>teamFilter==="All agents"||a.group===teamFilter);
  const approvals=[
    {title:"Carousel — 5 Tips Foto Interior",by:"Graphic Designer",time:"10 min ago",type:"Visual review"},
    {title:"Reels — Behind the Shoot Villa",by:"Video Editor",time:"32 min ago",type:"Final cut"},
    {title:"Caption — Intragama Weekend Escape",by:"Content Writer",time:"1 hour ago",type:"Copy review"},
    {title:"November content calendar",by:"Social Media Manager",time:"Yesterday",type:"Plan approval"}
  ];
  return <div className="module-page agent-team-page">
    <div className="agent-team-topline"><div><span className="agent-badge"><i/> 8 agents available</span><span className="muted-chip">Human approval enabled</span></div><button className="primary-button" onClick={()=>setShowAssign(true)}><Plus size={15}/> Assign new task</button></div>
    <section className="agent-command-panel">
      <div className="agent-command-copy"><span className="module-eyebrow"><Sparkles size={14}/> AI WORKFORCE COMMAND</span><h2>Your creative team, ready to work.</h2><p>Berikan objective. Agent akan membagi pekerjaan sesuai peran, menggunakan aset yang relevan, lalu mengirim hasil untuk approval Anda.</p><div className="agent-command-controls"><select value={agentMode} onChange={e=>setAgentMode(e.target.value)}><option>Approval required</option><option>Draft only</option><option>Auto-run internal tasks</option></select><button onClick={()=>setShowAssign(true)}><Sparkles size={14}/> Create task</button></div></div>
      <div className="agent-command-orbit"><div className="orbit-ring orbit-one"/><div className="orbit-ring orbit-two"/><div className="orbit-core"><Sparkles size={27}/><b>FORIOR</b><small>AGENT OS</small></div>{agentList.slice(0,6).map((a,i)=><span className={`orbit-node node-${i+1}`} key={a.name}>{i===0?<Search size={15}/>:i===1?<Target size={15}/>:i===2?<FileText size={15}/>:i===3?<Layers3 size={15}/>:i===4?<Film size={15}/>:<CalendarDays size={15}/>}</span>)}</div>
    </section>
    <div className="agent-overview-grid"><div className="agent-overview-card"><span>Active agents</span><b>8</b><small>All roles online</small></div><div className="agent-overview-card"><span>Tasks in progress</span><b>5</b><small>Across 3 workspaces</small></div><div className="agent-overview-card"><span>Waiting approval</span><b>{approvals.length-approved.length}</b><small>Human review queue</small></div><div className="agent-overview-card"><span>Completed this week</span><b>24</b><small>+18% from last week</small></div></div>
    <div className="agent-main-grid">
      <section className="panel agent-roster-panel"><div className="agent-section-heading"><div><h3>AI Agent Team</h3><p>Spesialis virtual yang bekerja sebagai satu social media agency.</p></div><button className="quiet-action" onClick={()=>setTeamFilter("All agents")}>View all <ArrowRight size={13}/></button></div>
        <div className="agent-filter-tabs">{["All agents","Strategy","Creative","Publishing","Operations"].map(v=><button key={v} className={teamFilter===v?"active":""} onClick={()=>setTeamFilter(v)}>{v}</button>)}</div>
        <div className="agent-roster-grid">{filtered.map(agent=>{const Icon=agent.icon;return <button key={agent.name} className={`agent-roster-card ${selectedAgent===agent.name?"selected":""}`} onClick={()=>setSelectedAgent(agent.name)}><div className={`agent-avatar ${agent.color}`}><Icon size={18}/></div><div className="agent-roster-info"><b>{agent.name}</b><small>{agent.role}</small><span className={agent.status==="Working"?"agent-working":"agent-ready"}><i/>{agent.status}</span></div><ChevronRight size={15}/></button>})}</div>
      </section>
      <section className="panel agent-detail-panel"><div className="agent-section-heading"><div><h3>Agent profile</h3><p>Role, responsibility & current activity.</p></div><span className="agent-ready"><i/> Online</span></div><div className={`agent-detail-avatar ${selected.color}`}><SelectedAgentIcon size={25}/></div><h2>{selected.name}</h2><span className="agent-role-label">{selected.role}</span><p className="agent-description">{selected.desc}</p><div className="agent-detail-stats"><div><span>Current workload</span><b>{selected.load}</b></div><div className="agent-load-track"><i style={{width:selected.load}}/></div></div><div className="agent-current-task"><label>CURRENT TASK</label><b>{selected.task}</b><span>{selected.status==="Working"?"In progress":"Ready for assignment"}</span></div><button className="agent-assign-button" onClick={()=>setShowAssign(true)}><Plus size={14}/> Assign task to this agent</button></section>
    </div>
    <section className="panel approval-queue-panel"><div className="agent-section-heading"><div><h3>Approval queue</h3><p>Semua output AI perlu persetujuan manusia sebelum dipublikasikan.</p></div><span className="approval-count">{approvals.length-approved.length} pending</span></div><div className="approval-list">{approvals.map(item=><div className="approval-row" key={item.title}><span className="approval-file-icon"><FileText size={16}/></span><div className="approval-item-copy"><b>{item.title}</b><small>{item.by} · {item.type}</small></div><span className="approval-time">{item.time}</span>{approved.includes(item.title)?<span className="approved-label"><Check size={13}/> Approved</span>:<button onClick={()=>setApproved(old=>[...old,item.title])}>Review <ArrowRight size={13}/></button>}</div>)}</div></section>
    {showAssign&&<div className="modal-backdrop" onClick={()=>setShowAssign(false)}><div className="quick-modal assign-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setShowAssign(false)}><X size={18}/></button><span className="modal-icon"><Sparkles size={22}/></span><h2>Assign a task</h2><p>Task akan masuk ke workflow agent dan hasilnya tetap menunggu approval.</p><label>OBJECTIVE / TASK</label><textarea value={task} onChange={e=>setTask(e.target.value)} rows={3}/><label>ASSIGN TO</label><select value={selectedAgent} onChange={e=>setSelectedAgent(e.target.value)}>{agentList.map(a=><option key={a.name}>{a.name}</option>)}</select><label>WORKSPACE</label><select><option>Intragama Villa · Client Project</option><option>Alvian · Personal Brand</option><option>FORIOR · Brand Account</option></select><button className="primary-button" onClick={()=>{setRunning(true);setTimeout(()=>{setRunning(false);setShowAssign(false);},500);}} disabled={running}>{running?"Assigning…":"Assign task to agent"}</button></div></div>}
    <div className="module-footer">Agent team preview · Actual model routing, tools, memory, usage limits, and execution permissions will be configured in the backend.</div>
  </div>;
}

function AssetLibraryPage() {
  const [folders,setFolders]=useState([{name:"Intragama Villa",url:"https://drive.google.com/drive/folders/example"},{name:"FORIOR Portfolio",url:"https://drive.google.com/drive/folders/example"},{name:"Alvian Personal Brand",url:"https://drive.google.com/drive/folders/example"}]);
  const [active,setActive]=useState("Intragama Villa"),[showAdd,setShowAdd]=useState(false),[folderTitle,setFolderTitle]=useState(""),[driveUrl,setDriveUrl]=useState(""),[query,setQuery]=useState("");
  const selected=folders.find(f=>f.name===active);
  return <div className="module-page asset-v2-page">
    <div className="asset-v2-toolbar"><div><span className="agent-badge"><i/> ASSET LIBRARY</span><span className="muted-chip">Google Drive folders</span></div><button className="primary-button" onClick={()=>setShowAdd(true)}><Plus size={14}/> Add folder</button></div>
    <section className="asset-v2-intro"><div><span>ONE PLACE FOR YOUR CREATIVE ASSETS</span><h2>Connect folders from Google Drive.</h2><p>Tambahkan nama folder dan URL Google Drive. Creator OS akan menggunakan folder tersebut sebagai sumber asset.</p></div><div className="asset-v2-drive-icon"><Cloud size={28}/><b>Google Drive</b><small>Folder source</small></div></section>
    <section className="panel asset-v2-browser"><div className="asset-v2-browser-head"><div><h3>Connected folders</h3><p>{folders.length} folders configured · Fetch requires Google Drive authorization</p></div><div className="asset-v2-search"><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search folders"/></div></div>
      <div className="asset-v2-layout"><aside className="asset-v2-folder-list">{folders.filter(f=>f.name.toLowerCase().includes(query.toLowerCase())).map(f=><button key={f.name} className={active===f.name?"active":""} onClick={()=>setActive(f.name)}><FolderOpen size={15}/><span>{f.name}</span><ChevronRight size={13}/></button>)}</aside>
      <div className="asset-v2-folder-detail">{selected?<><div className="asset-v2-folder-icon"><FolderOpen size={25}/></div><h3>{selected.name}</h3><p>Google Drive folder source</p><label>FOLDER URL</label><a href={selected.url} target="_blank" rel="noreferrer">{selected.url}</a><div className="asset-v2-fetch-note"><Info size={15}/><span><b>Drive fetch belum terhubung.</b> Untuk membaca file otomatis, perlu Google OAuth + Drive API di backend. URL folder saja belum memberikan akses ke file privat.</span></div><button className="outline-button" onClick={()=>window.open(selected.url,"_blank","noopener,noreferrer")}><ExternalLink size={13}/> Open Google Drive</button></>:<div className="plan-v2-empty">Pilih folder dari daftar.</div>}</div></div>
    </section>
    {showAdd&&<div className="modal-backdrop" onClick={()=>setShowAdd(false)}><div className="quick-modal plan-v2-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setShowAdd(false)}><X size={18}/></button><span className="modal-icon"><FolderPlus size={21}/></span><h2>Add Google Drive folder</h2><p>Isi dua field berikut untuk mendaftarkan folder sumber asset.</p><label>FOLDER TITLE</label><input value={folderTitle} onChange={e=>setFolderTitle(e.target.value)} placeholder="Contoh: Christmas Campaign Assets"/><label>GOOGLE DRIVE FOLDER URL</label><input value={driveUrl} onChange={e=>setDriveUrl(e.target.value)} placeholder="https://drive.google.com/drive/folders/..."/><button className="primary-button" onClick={()=>{if(folderTitle.trim()&&driveUrl.startsWith("https://drive.google.com/")){setFolders(v=>[...v,{name:folderTitle.trim(),url:driveUrl.trim()}]);setActive(folderTitle.trim());setFolderTitle("");setDriveUrl("");setShowAdd(false);}}}>Save folder</button></div></div>}
    <div className="module-footer">Folder name and URL are currently saved in page state only. Automatic file listing requires Google Drive OAuth, API credentials, and a secure backend.</div>
  </div>;
}

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
    <div className="analytics-toolbar"><div><span className="agent-badge"><i/> Performance overview</span><span className="muted-chip">Illustrative data</span></div><div><select value={channel} onChange={e=>setChannel(e.target.value)}><option>All channels</option><option>Instagram</option><option>TikTok</option><option>YouTube</option></select><select value={period} onChange={e=>setPeriod(e.target.value)}><option>Last 7 days</option><option>Last 30 days</option><option>Last 90 days</option></select><button className="outline-button" onClick={()=>alert("Report export akan tersedia setelah analytics provider terhubung.")}><FileText size={14}/> Export report</button></div></div>
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
    <div className="module-footer">Analytics preview · Metrics are illustrative. Live platform metrics require authorized Instagram, TikTok, and YouTube data connections.</div>
  </div>;
}

function SettingsPage() {
  const [tab,setTab]=useState("Workspace");
  const [workspaceName,setWorkspaceName]=useState("Alvian · Personal Brand");
  const [brandName,setBrandName]=useState("Alvian Indonesia");
  const [handle,setHandle]=useState("@alvian.indonesia");
  const [tone,setTone]=useState("Educative, warm & confident");
  const [defaultApproval,setDefaultApproval]=useState(true);
  const [emailNotif,setEmailNotif]=useState(true);
  const [approvalNotif,setApprovalNotif]=useState(true);
  const [weeklyReport,setWeeklyReport]=useState(false);
  const [model,setModel]=useState("Auto · Cost efficient");
  const [provider,setProvider]=useState("OpenAI");
  const [saved,setSaved]=useState(false);
  const tabs=["Workspace","Brand identity","Social accounts","AI & Models","Notifications","Security"];
  const Toggle=({checked,onChange}:{checked:boolean;onChange:(v:boolean)=>void})=><button className={`settings-toggle ${checked?"on":""}`} onClick={()=>onChange(!checked)} aria-pressed={checked}><i/></button>;
  return <div className="module-page settings-page">
    <div className="settings-toolbar"><div><span className="agent-badge"><i/> Workspace configuration</span><span className="muted-chip">Owner access</span></div><button className="primary-button" onClick={()=>{setSaved(true);setTimeout(()=>setSaved(false),1800);}}><Check size={14}/>{saved?"Saved (preview)":"Save changes"}</button></div>
    <div className="settings-layout"><aside className="panel settings-nav"><div className="settings-profile"><span className="avatar avatar-main">A</span><div><b>Alvian</b><small>Owner · Personal Brand</small></div></div>{tabs.map(t=><button key={t} className={tab===t?"active":""} onClick={()=>setTab(t)}>{t==="Workspace"?<BriefcaseBusiness size={15}/>:t==="Brand identity"?<Sparkles size={15}/>:t==="Social accounts"?<Instagram size={15}/>:t==="AI & Models"?<WandSparkles size={15}/>:t==="Notifications"?<Bell size={15}/>:<ShieldCheck size={15}/>}{t}<ChevronRight size={13}/></button>)}</aside>
      <section className="panel settings-content"><div className="settings-content-heading"><div><h3>{tab}</h3><p>Configure how FORIOR Creator OS works for your team.</p></div><span className="muted-chip">Changes are local preview</span></div>
        {tab==="Workspace"&&<><div className="settings-field"><label>WORKSPACE NAME</label><input value={workspaceName} onChange={e=>setWorkspaceName(e.target.value)}/><small>This name appears in the workspace switcher.</small></div><div className="settings-field"><label>WORKSPACE TYPE</label><select><option>Personal Brand</option><option>Business Workspace</option><option>Client Project</option></select></div><div className="settings-field"><label>DEFAULT TIMEZONE</label><select><option>Asia/Jakarta (GMT+7)</option><option>Asia/Makassar (GMT+8)</option><option>Asia/Jayapura (GMT+9)</option></select></div><div className="settings-divider"/><div className="settings-option-row"><div><b>Require approval before publishing</b><small>Content must be approved by workspace owner before scheduling or publishing.</small></div><Toggle checked={defaultApproval} onChange={setDefaultApproval}/></div></>}
        {tab==="Brand identity"&&<><div className="settings-field"><label>BRAND / CREATOR NAME</label><input value={brandName} onChange={e=>setBrandName(e.target.value)}/></div><div className="settings-field"><label>PRIMARY SOCIAL HANDLE</label><input value={handle} onChange={e=>setHandle(e.target.value)}/></div><div className="settings-field"><label>BRAND VOICE</label><select value={tone} onChange={e=>setTone(e.target.value)}><option>Educative, warm & confident</option><option>Premium, minimal & aspirational</option><option>Friendly, conversational & witty</option><option>Professional & informative</option></select></div><div className="settings-field"><label>BRAND GUIDELINES</label><textarea rows={4} defaultValue="Educative but not patronizing. Confident without overclaiming. Friendly and helpful. Keep visual communication premium, minimal, and authentic."/></div><div className="settings-option-row"><div><b>Use workspace brand kit in production</b><small>Apply approved logo, colors, and typography to generated assets.</small></div><Toggle checked={true} onChange={()=>{}}/></div></>}
        {tab==="Social accounts"&&<div className="connected-accounts">{[{name:"Instagram",user:"@alvian.indonesia",icon:Instagram},{name:"TikTok",user:"@alvian.indonesia",icon:Music2},{name:"YouTube",user:"Alvian Indonesia",icon:Youtube}].map(a=>{const Icon=a.icon;return <div className="connected-account-row" key={a.name}><span><Icon size={18}/></span><div><b>{a.name}</b><small>{a.user}</small></div><em>Not connected</em><button className="outline-button" onClick={()=>alert("OAuth connection will be configured in backend.")}>Connect</button></div>})}<p>Social account connections will use official OAuth permissions. Passwords are never stored in this workspace.</p></div>}
        {tab==="AI & Models"&&<><div className="settings-field"><label>AI PROVIDER</label><select value={provider} onChange={e=>setProvider(e.target.value)}><option>OpenAI</option><option>Anthropic</option><option>Google Gemini</option><option>Multi-provider routing</option></select></div><div className="settings-field"><label>MODEL ROUTING PRESET</label><select value={model} onChange={e=>setModel(e.target.value)}><option>Auto · Cost efficient</option><option>Balanced · Quality & cost</option><option>Premium · Best quality</option><option>Manual per agent</option></select></div><div className="model-routing-cards"><article><span>LIGHT TASKS</span><b>Classification, tagging, summaries</b><small>Use smaller, low-cost models.</small></article><article><span>CREATIVE TASKS</span><b>Hooks, scripts, content strategy</b><small>Use capable text models only when needed.</small></article><article><span>VISUAL TASKS</span><b>Image and video production</b><small>Call specialized media tools on demand.</small></article></div><div className="settings-option-row"><div><b>Fallback to a lower-cost model</b><small>Retry eligible tasks with an efficient model when limits are reached.</small></div><Toggle checked={true} onChange={()=>{}}/></div><p className="settings-security-note"><ShieldCheck size={15}/> API keys will be stored server-side in encrypted secrets, never in the browser.</p></>}
        {tab==="Notifications"&&<>{[{title:"Email notifications",desc:"Important workspace activity and invitations.",value:emailNotif,change:setEmailNotif},{title:"Approval reminders",desc:"Notify reviewers when content needs their attention.",value:approvalNotif,change:setApprovalNotif},{title:"Weekly performance report",desc:"Receive a summary of content and channel performance.",value:weeklyReport,change:setWeeklyReport}].map(n=><div className="settings-option-row" key={n.title}><div><b>{n.title}</b><small>{n.desc}</small></div><Toggle checked={n.value} onChange={n.change}/></div>)}</>}
        {tab==="Security"&&<><div className="security-summary"><ShieldCheck size={22}/><div><b>Workspace security</b><small>Security controls will be enforced by the backend.</small></div></div>{[{t:"Role-based access control",d:"Restrict projects, assets, and settings by team role."},{t:"Session management",d:"Review active sessions and revoke access."},{t:"Activity audit log",d:"Track approvals, edits, exports, and integration changes."},{t:"Two-factor authentication",d:"Require an additional verification step for team members."}].map(item=><div className="settings-option-row" key={item.t}><div><b>{item.t}</b><small>{item.d}</small></div><span className="muted-chip">Planned</span></div>)}</>}
      </section>
    </div>
    <div className="module-footer">Settings preview · Controls are interactive UI state only. Persistence, encrypted secrets, OAuth, and access enforcement are backend tasks.</div>
  </div>;
}

export default function DashboardPage() {
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [platform, setPlatform] = useState<Platform>("All channels");
  const [range, setRange] = useState<Range>("Last 30 Days");
  const [showRange, setShowRange] = useState(false);
  const [showPlatform, setShowPlatform] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [workspace, setWorkspace] = useState("Alvian · Personal Brand");
  const [mobileNav, setMobileNav] = useState(false);
  const [quickAction, setQuickAction] = useState("");
  const [showAllAgents, setShowAllAgents] = useState(false);\n  const [studioBrief,setStudioBrief] = useState<{title:string;account:string;campaign:string;format:string;hook:string}|null>(null);\n  const [pendingIdea,setPendingIdea] = useState("");

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

  return (
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
                      {item.expandable && <ChevronDown className="nav-chevron" size={14} />}
                    </button>
                    {item.expandable && (activeNav === item.name || ["Feed & Carousel","Reels & Video","Templates"].includes(activeNav)) && (
                      <div className="sub-nav">
                        <button className={activeNav==="Feed & Carousel"?"active":""} onClick={() => {setActiveNav("Feed & Carousel");setMobileNav(false);}}>Feed & Carousel</button>
                        <button className={activeNav==="Reels & Video"?"active":""} onClick={() => {setActiveNav("Reels & Video");setMobileNav(false);}}>Reels & Video</button>
                        <button className={activeNav==="Templates"?"active":""} onClick={() => {setActiveNav("Templates");setMobileNav(false);}}>Templates</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className={`nav-item ${activeNav==="Automation"?"active":""}`} onClick={() => setActiveNav("Automation")}><Zap size={18} /><span>Automation</span></button>
          <button className="nav-item" onClick={() => setActiveNav("Settings")}><Settings size={18} /><span>Settings</span></button>
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

          <div className="top-actions">
            <div className="dropdown-wrap">
              <button className="select-button" onClick={() => setShowRange(!showRange)}><CalendarDays size={16} /> {range} <ChevronDown size={15} /></button>
              {showRange && <div className="floating-menu">
                {(["Last 7 Days", "Last 30 Days", "Last 90 Days"] as Range[]).map((v) => <button key={v} onClick={() => { setRange(v); setShowRange(false); }}>{v}{range === v && <Check size={14} />}</button>)}
              </div>}
            </div>
            <div className="dropdown-wrap">
              <button className="platform-filter" onClick={() => setShowPlatform(!showPlatform)}>
                <Instagram className="ig-brand" size={21} />
                <span className="tt-brand">♪</span>
                <Youtube className="yt-brand" size={22} />
                <Plus size={17} className="plus-platform" />
              </button>
              {showPlatform && <div className="floating-menu platform-menu">
                {(["All channels", "Instagram", "TikTok", "YouTube"] as Platform[]).map((v) => <button key={v} onClick={() => { setPlatform(v); setShowPlatform(false); }}>{v}{platform === v && <Check size={14} />}</button>)}
              </div>}
            </div>
            <div className="dropdown-wrap">
              <button className={`icon-button ${showNotifications ? "selected" : ""}`} onClick={() => setShowNotifications(!showNotifications)} aria-label="Notifications"><Bell size={19} /><i /></button>
              {showNotifications && <div className="floating-menu notification-menu">
                <b>Notifications</b>
                <p><span className="notice-dot" /> 2 konten menunggu approval.</p>
                <p><span className="notice-dot" /> AI Strategist menyelesaikan rekomendasi mingguan.</p>
                <p><span className="notice-dot" /> Jadwal Reels besok pukul 13.00.</p>
              </div>}
            </div>
            <div className="avatar avatar-profile">A</div>
          </div>
        </header>

        {activeNav !== "Dashboard" && activeNav !== "Research & Insight" && activeNav !== "Content Plan" && activeNav !== "Production Studio" && activeNav !== "Feed & Carousel" && activeNav !== "Reels & Video" && activeNav !== "Templates" && activeNav !== "Asset Library" && activeNav !== "AI Agent Team" && activeNav !== "Automation" && (
          <div className="section-notice">
            <div><b>{activeNav}</b><span>Preview navigasi — modul ini akan dikembangkan pada tahap berikutnya.</span></div>
            <button onClick={() => setActiveNav("Dashboard")}>Kembali ke Dashboard <ArrowRight size={15} /></button>
          </div>
        )}

        {activeNav === "Research & Insight" ? <ResearchPage /> : activeNav === "Content Plan" ? <ContentPlanPage initialIdea={pendingIdea} onOpenProduction={(brief)=>{setStudioBrief(brief);setActiveNav(brief.format==="Reels"?"Reels & Video":"Feed & Carousel");}} /> : activeNav === "AI Agent Team" ? <AIAgentTeamPage /> : activeNav === "Asset Library" ? <AssetLibraryPage /> : activeNav === "Analytics" ? <AnalyticsPage onAddToPlan={(idea)=>{setPendingIdea(idea);setActiveNav("Content Plan");}} /> : activeNav === "Automation" ? <div className="module-page automation-simple"><section className="panel automation-simple-card"><span className="automation-simple-icon"><Zap size={24}/></span><div><h2>Automation</h2><p>Atur pengingat dan workflow sederhana. Trigger otomatis akan diaktifkan setelah backend tersedia.</p></div><button className="primary-button" onClick={()=>setQuickAction("Create automation")}><Plus size={14}/> New automation</button></section><div className="automation-simple-grid"><article><Clock3 size={18}/><b>Content reminder</b><p>Pengingat jadwal konten yang akan tayang.</p><span>Coming soon</span></article><article><MessageCircle size={18}/><b>Approval reminder</b><p>Pengingat untuk brief yang menunggu review.</p><span>Coming soon</span></article></div></div> : activeNav === "Settings" ? <SettingsPage /> : ["Production Studio","Feed & Carousel","Reels & Video","Templates"].includes(activeNav) ? <ProductionStudioPage key={activeNav} brief={studioBrief} initialTab={activeNav === "Reels & Video" ? "Reels & Video" : activeNav === "Templates" ? "Templates" : "Feed & Carousel"} /> : <div className="dashboard-content">
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
                <button onClick={() => setQuickAction("Brief konten Behind the Shoot: Villa Puncak")}>Lihat Brief <ArrowRight size={15} /></button>
              </div>
            </article>

            <article className="pipeline-card panel">
              <div className="panel-heading"><div><Layers3 size={20} /><h3>Content Pipeline</h3></div><button className="text-link" onClick={() => setActiveNav("Content Plan")}>View details <ArrowRight size={15} /></button></div>
              <div className="pipeline-steps">
                {pipelineSteps.map((step, i) => {
                  const Icon = step.icon;
                  return <div className="pipeline-step-wrap" key={step.label}>
                    <div className={`pipeline-step ${step.current ? "current" : ""} ${step.done ? "done" : ""}`}>
                      <Icon size={19} /><span>{step.label}</span><b>{step.count}</b>
                    </div>
                    {i < 4 && <ArrowRight className="step-arrow" size={14} />}
                  </div>;
                })}
              </div>
              <div className="pipeline-foot"><span><i className="dot purple-dot" /> 6 konten sedang dikerjakan</span><span>4 menunggu approval</span></div>
            </article>
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
              <button className="insight-link" onClick={() => setQuickAction("Analisis insight Behind the Scene")}>Lihat rekomendasi <ArrowRight size={14} /></button>
            </article>
          </section>

          <footer className="dashboard-footer">
            <span>FORIOR Creator OS <i>·</i> Dashboard Preview</span>
            <span>Data ilustrasi untuk UI preview <i>·</i> Last synced just now</span>
          </footer>
        </div>}
      </section>

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
