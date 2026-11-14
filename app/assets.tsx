"use client";

import { useEffect, useState } from "react";
import { ChevronRight, ExternalLink, FolderOpen, FolderPlus, Link2, RefreshCw, Search, Trash2, X } from "lucide-react";
import { callServer, isSignedIn, readCloudKeys } from "./lib/cloud";
import { driveFolderId } from "./lib/flow";
import { getSettings, useSettings, useStored } from "./lib/store";
import { useCloud } from "./modules";
import { notify } from "./modules";
import { patchItem, readPlan, usePlan, type AssetRef } from "./plan-data";
import { stockFile, type StockFile } from "./lib/stock";

export type DriveFolder = { name: string; url: string; id: string };
export type DriveFile = { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; webViewLink?: string };

const FOLDER_MIME = "application/vnd.google-apps.folder";
const kindOf = (mime: string) => (mime === FOLDER_MIME ? "Folder" : mime.startsWith("image/") ? "Foto" : mime.startsWith("video/") ? "Video" : mime.startsWith("audio/") ? "Audio" : "Lainnya");
/** Public thumbnail endpoint; works for files in folders shared as "anyone with the link". */
export const driveThumb = (id: string, width = 480) => `https://drive.google.com/thumbnail?id=${id}&sz=w${width}`;
const sizeText = (bytes?: string) => { const n = Number(bytes); return !n ? "" : n > 1e9 ? (n / 1e9).toFixed(1) + " GB" : n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.ceil(n / 1e3) + " KB"; };
export const toRef = (f: DriveFile): AssetRef => ({ id: f.id, name: f.name, url: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`, thumb: driveThumb(f.id), kind: kindOf(f.mimeType) });

/** Lists a Drive folder with the user's Google API key. Nothing is copied: files stay in Drive. */
export async function listDriveFolder(folderId: string): Promise<DriveFile[]> {
  if (isSignedIn() && readCloudKeys().google) return (await callServer<{ files: DriveFile[] }>("drive", { folderId })).files;
  const key = getSettings().googleApiKey.trim();
  if (!key) throw new Error("Google API key belum diisi. Buka Settings → AI & Models.");
  const files: DriveFile[] = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({ q: `'${folderId}' in parents and trashed = false`, fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink)", pageSize: "1000", orderBy: "folder,name", supportsAllDrives: "true", includeItemsFromAllDrives: "true", key });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch("https://www.googleapis.com/drive/v3/files?" + params);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message ? `Google Drive: ${data.error.message}` : `Google Drive error ${response.status}`);
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken ?? "";
  } while (pageToken && files.length < 5000);
  return files;
}

/** Walks a campaign stock folder (up to 3 levels, 2000 files); subfolder names become tags. */
export async function indexStock(folderId: string, onProgress?: (n: number) => void): Promise<StockFile[]> {
  const out: StockFile[] = [];
  const queue: { id: string; path: string[] }[] = [{ id: folderId, path: [] }];
  while (queue.length && out.length < 2000) {
    const { id, path } = queue.shift()!;
    for (const f of await listDriveFolder(id)) {
      if (f.mimeType === FOLDER_MIME) { if (path.length < 3) queue.push({ id: f.id, path: [...path, f.name] }); continue; }
      const s = stockFile(f, path); if (s) out.push(s);
    }
    onProgress?.(out.length);
  }
  return out;
}

function useFolders() { return useStored<DriveFolder[]>("driveFolders", []); }

/** Folder browser shared by the Asset Library page and the pickers in Content Plan / Studio. */
export function DriveBrowser({ onPick, pickLabel }: { onPick?: (ref: AssetRef) => void; pickLabel?: string }) {
  const [folders, setFolders] = useFolders();
  const [settings] = useSettings();
  const [cloud] = useCloud();
  const [trail, setTrail] = useState<{ id: string; name: string }[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [query, setQuery] = useState(""), [type, setType] = useState("Semua");
  const [selected, setSelected] = useState<DriveFile | null>(null);
  const [showAdd, setShowAdd] = useState(false), [name, setName] = useState(""), [url, setUrl] = useState(""), [addError, setAddError] = useState("");
  const [plan] = usePlan();
  const [linkCampaign, setLinkCampaign] = useState(""), [linkDay, setLinkDay] = useState(1);
  const current = trail[trail.length - 1];
  const load = (id: string) => { setState("loading"); setError(""); listDriveFolder(id).then(list => { setFiles(list); setState("idle"); }).catch(e => { setFiles([]); setError(e instanceof Error ? e.message : String(e)); setState("error"); }); };
  useEffect(() => { if (current) load(current.id); else setFiles([]); }, [current?.id, settings.googleApiKey, cloud.keys.google]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = files.filter(f => (type === "Semua" || kindOf(f.mimeType) === type || kindOf(f.mimeType) === "Folder") && f.name.toLowerCase().includes(query.toLowerCase()));
  const add = () => { const id = driveFolderId(url); if (!name.trim()) return setAddError("Isi nama folder."); if (!id) return setAddError("Link bukan folder Google Drive. Contoh: https://drive.google.com/drive/folders/…"); setFolders(old => [...old.filter(f => f.id !== id), { name: name.trim(), url: url.trim(), id }]); setTrail([{ id, name: name.trim() }]); setName(""); setUrl(""); setAddError(""); setShowAdd(false); };
  const campaign = plan.campaigns.find(c => c.id === linkCampaign) ?? plan.campaigns[0];
  const link = (f: DriveFile) => { if (!campaign) return; const item = readPlan().campaigns.find(c => c.id === campaign.id)?.items.find(x => x.day === linkDay); if (!item) return; const ref = toRef(f); patchItem(campaign.id, linkDay, { assets: [...(item.assets ?? []).filter(a => a.id !== ref.id), ref] }); notify(`Ditautkan ke konten ${linkDay}: ${item.title}`); };

  return <div className="f-drive">
    {!settings.googleApiKey && !cloud.keys.google && <p className="x-error">Google API key belum diisi. Isi di Settings → AI & Models, lalu bagikan folder Drive sebagai “Siapa saja yang memiliki link”.</p>}
    <div className="f-drive-bar">
      <div className="f-chips" role="tablist" aria-label="Folder Drive">{folders.map(f => <button key={f.id} className={trail[0]?.id === f.id ? "active" : ""} onClick={() => { setTrail([{ id: f.id, name: f.name }]); setSelected(null); }}><FolderOpen size={15} /> {f.name}</button>)}<button onClick={() => setShowAdd(true)}><FolderPlus size={15} /> Tambah folder</button></div>
    </div>
    {!folders.length && <p className="x-empty">Belum ada folder. Tambahkan folder Google Drive berisi foto dan footage Anda. File tetap di Drive — aplikasi hanya menyimpan tautannya.</p>}
    {current && <>
      <div className="f-trail">{trail.map((t, i) => <span key={t.id}>{i > 0 && <ChevronRight size={14} />}<button onClick={() => setTrail(trail.slice(0, i + 1))}>{t.name}</button></span>)}<button className="outline-button" onClick={() => load(current.id)} aria-label="Muat ulang"><RefreshCw size={14} /></button><a className="outline-button" href={`https://drive.google.com/drive/folders/${current.id}`} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Drive</a>{trail.length === 1 && <button className="outline-button x-danger" aria-label="Lepas folder" onClick={() => { setFolders(old => old.filter(f => f.id !== current.id)); setTrail([]); }}><Trash2 size={14} /></button>}</div>
      <div className="f-drive-tools"><div className="search-field"><Search size={15} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari nama file" aria-label="Cari nama file" /></div><div className="f-chips">{["Semua", "Foto", "Video", "Audio", "Lainnya"].map(t => <button key={t} className={type === t ? "active" : ""} onClick={() => setType(t)}>{t}</button>)}</div></div>
      {state === "loading" && <p className="x-empty">Memuat isi folder…</p>}
      {state === "error" && <p className="x-error">{error} Pastikan folder dibagikan “Siapa saja yang memiliki link” dan Drive API aktif untuk key Anda.</p>}
      {state === "idle" && !shown.length && <p className="x-empty">Tidak ada file yang cocok di folder ini.</p>}
      <div className="f-files">{shown.map(f => kindOf(f.mimeType) === "Folder"
        ? <button key={f.id} className="f-file folder" onClick={() => { setTrail([...trail, { id: f.id, name: f.name }]); setSelected(null); }}><span className="f-thumb"><FolderOpen size={28} /></span><b>{f.name}</b><small>Folder</small></button>
        : <button key={f.id} className={`f-file ${selected?.id === f.id ? "active" : ""}`} onClick={() => (onPick ? onPick(toRef(f)) : setSelected(f))}><span className="f-thumb"><img src={driveThumb(f.id, 320)} alt="" loading="lazy" referrerPolicy="no-referrer" /></span><b>{f.name}</b><small>{kindOf(f.mimeType)}{sizeText(f.size) && ` · ${sizeText(f.size)}`}</small>{onPick && <em>{pickLabel ?? "Pilih"}</em>}</button>)}</div>
    </>}
    {selected && !onPick && <div className="f-sheet-backdrop" onClick={() => setSelected(null)}><aside className="f-sheet" role="dialog" aria-label="Detail aset" onClick={e => e.stopPropagation()}>
      <div className="f-sheet-head"><h3>{selected.name}</h3><button className="modal-close" onClick={() => setSelected(null)} aria-label="Tutup"><X size={18} /></button></div>
      <img className="f-preview" src={driveThumb(selected.id, 1000)} alt={selected.name} referrerPolicy="no-referrer" />
      <dl className="f-meta"><div><dt>Jenis</dt><dd>{kindOf(selected.mimeType)}</dd></div><div><dt>Ukuran</dt><dd>{sizeText(selected.size) || "—"}</dd></div><div><dt>Diubah</dt><dd>{selected.modifiedTime ? new Date(selected.modifiedTime).toLocaleDateString("id-ID", { dateStyle: "medium" }) : "—"}</dd></div><div><dt>Lokasi</dt><dd>Google Drive / {trail.map(t => t.name).join(" / ")}</dd></div></dl>
      <a className="outline-button" href={selected.webViewLink ?? `https://drive.google.com/file/d/${selected.id}/view`} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Buka di Google Drive</a>
      {campaign && <div className="f-link"><label htmlFor="lcamp">TAUTKAN KE KONTEN</label><select id="lcamp" value={campaign.id} onChange={e => { setLinkCampaign(e.target.value); setLinkDay(1); }}>{plan.campaigns.map(c => <option key={c.id} value={c.id}>{c.account} — {c.name}</option>)}</select><select aria-label="Konten" value={linkDay} onChange={e => setLinkDay(Number(e.target.value))}>{campaign.items.map(x => <option key={x.day} value={x.day}>{String(x.day).padStart(2, "0")} · {x.title}</option>)}</select><button className="primary-button" onClick={() => link(selected)}><Link2 size={15} /> Tautkan</button></div>}
    </aside></div>}
    {showAdd && <div className="modal-backdrop" onClick={() => setShowAdd(false)}><div className="quick-modal plan-v2-modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setShowAdd(false)} aria-label="Tutup"><X size={18} /></button><span className="modal-icon"><FolderPlus size={21} /></span><h2>Tambah folder Google Drive</h2><p>Bagikan folder sebagai “Siapa saja yang memiliki link”, lalu tempel link-nya. Tidak ada file yang diunggah ke aplikasi ini.</p><label htmlFor="dname">NAMA FOLDER</label><input id="dname" value={name} onChange={e => setName(e.target.value)} placeholder="Contoh: Shooting Kemang Nov 2026" /><label htmlFor="durl">LINK FOLDER</label><input id="durl" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" />{addError && <p className="x-error">{addError}</p>}<button className="primary-button" onClick={add}>Simpan folder</button></div></div>}
  </div>;
}

export function AssetLibraryPage() {
  const [folders] = useFolders();
  const [plan] = usePlan();
  const withStock = plan.campaigns.filter(c => c.stock?.files.length);
  const [pick, setPick] = useState(""), [tag, setTag] = useState(""), [kind, setKind] = useState("Semua");
  const campaign = withStock.find(c => c.id === pick) ?? withStock[0];
  const usedIn: Record<string, string[]> = {};
  for (const x of campaign?.items ?? []) for (const sc of x.board ?? []) if (sc.assetId) (usedIn[sc.assetId] ??= []).includes(`#${x.day}`) || usedIn[sc.assetId].push(`#${x.day}`);
  const files = (campaign?.stock?.files ?? []).filter(f => (kind === "Semua" || f.kind === kind) && (!tag || f.tags.includes(tag)));
  const tags = campaign ? [...new Set(campaign.stock!.files.flatMap(f => f.tags))].sort() : [];
  return <div className="module-page f-page">
    <section className="panel sk-lib"><div className="agent-section-heading"><div><h3>Stok campaign</h3><p>Folder Drive yang ditautkan ke tiap campaign (Content Plan → panel campaign → Stok materi). Dipakai untuk mengisi storyboard dan draft desain otomatis.</p></div></div>
      {!withStock.length ? <p className="x-empty">Belum ada campaign dengan folder stok. Tautkan di Content Plan → pilih campaign → Stok materi.</p> : <>
        <div className="sk-lib-bar"><select aria-label="Campaign" value={campaign?.id} onChange={e => { setPick(e.target.value); setTag(""); }}>{withStock.map(c => <option key={c.id} value={c.id}>{c.account} — {c.name} ({c.stock!.files.length})</option>)}</select>
          <div className="f-chips">{["Semua", "Foto", "Video", "Audio"].map(k => <button key={k} className={kind === k ? "active" : ""} onClick={() => setKind(k)}>{k}</button>)}</div></div>
        <div className="f-chips sk-tags"><button className={!tag ? "active" : ""} onClick={() => setTag("")}>Semua tag</button>{tags.map(t => <button key={t} className={tag === t ? "active" : ""} onClick={() => setTag(t)}>{t}</button>)}</div>
        <div className="f-files">{files.slice(0, 300).map(f => <a key={f.id} className="f-file" href={`https://drive.google.com/file/d/${f.id}/view`} target="_blank" rel="noreferrer"><span className="f-thumb">{f.kind === "Audio" ? <FolderOpen size={26} /> : <img src={driveThumb(f.id, 320)} alt="" loading="lazy" referrerPolicy="no-referrer" />}{usedIn[f.id] && <em className="sk-used">Dipakai {usedIn[f.id].join(", ")}</em>}</span><b>{f.name}</b><small>{f.kind}{f.path ? ` · ${f.path}` : ""}</small></a>)}</div>
        {files.length > 300 && <p className="cx-hint">Menampilkan 300 dari {files.length} file. Pakai filter tag.</p>}
      </>}
    </section>
    <section className="panel"><div className="agent-section-heading"><div><h3>Asset Library</h3><p>Semua aset diambil langsung dari Google Drive. Aplikasi hanya menyimpan tautan, jadi tidak ada file besar yang diunggah ke server.</p></div><span className="muted-chip">{folders.length} folder terhubung</span></div>
      <DriveBrowser />
    </section>
  </div>;
}
