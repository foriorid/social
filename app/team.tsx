"use client";

// Settings › Anggota tim: invite people to the business workspace, change roles, remove members.
// Invites produce a sign-in link that is shared by copy or WhatsApp (no email service needed);
// the link lands on "Buat kata sandi", then the person is inside the workspace.
import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, Loader2, MessageCircle, UserPlus, Users, X } from "lucide-react";
import { activeWorkspace, callServer, switchWorkspace, type Role } from "./lib/cloud";
import { notify, useCloud } from "./modules";

type Member = { userId: string; email: string; role: Role; joinedAt: string; active: boolean; self: boolean };
const ROLE_LABEL: Record<Role, string> = { owner: "Owner", admin: "Admin", editor: "Editor" };
const ROLE_HELP: Record<Role, string> = {
  owner: "Semua akses, kelola anggota, API key dan biaya.",
  admin: "Semua modul kerja, undang & kelola Editor.",
  editor: "Kerjakan konten & delivery. Tanpa API key, biaya, hapus galeri, atau kelola anggota."
};
const appUrl = () => window.location.origin + window.location.pathname;

function InviteLink({ email, link, onClose }: { email: string; link: string; onClose: () => void }) {
  const text = `Halo, Anda diundang ke FORIOR Hub. Buka link ini untuk membuat kata sandi dan masuk: ${link}`;
  const copy = () => navigator.clipboard?.writeText(link).then(() => notify("Link undangan disalin."), () => notify("Browser menolak akses clipboard. Salin manual."));
  return <div className="tm-link" role="status">
    <div className="tm-link-head"><b>Link undangan untuk {email}</b><button className="dl-icon" onClick={onClose} aria-label="Tutup"><X size={16} /></button></div>
    <p>Kirim link ini ke yang bersangkutan. Link sekali pakai; bila kedaluwarsa, buat link baru dari daftar anggota.</p>
    <div className="dl-linkbox"><input readOnly value={link} aria-label="Link undangan" onFocus={e => e.currentTarget.select()} /><button onClick={copy} aria-label="Salin link"><Copy size={15} /></button></div>
    <div className="x-row"><button className="outline-button" onClick={copy}><Copy size={15} /> Salin link</button><a className="outline-button dl-wa" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"><MessageCircle size={15} /> Kirim via WhatsApp</a></div>
  </div>;
}

export function TeamSettings() {
  const [cloud] = useCloud();
  const ws = activeWorkspace(cloud);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState("");
  const [email, setEmail] = useState(""), [role, setRole] = useState<Role>("editor");
  const [busy, setBusy] = useState(""), [shared, setShared] = useState<{ email: string; link: string } | null>(null);
  const me = ws?.role ?? "editor";
  const canManage = me === "owner" || me === "admin";

  const load = useCallback(async () => {
    try { setMembers((await callServer<{ members: Member[] }>("members.list")).members); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setMembers([]); }
  }, []);
  useEffect(() => { if (ws?.kind === "business") load(); }, [ws?.kind, load]);

  if (ws?.kind !== "business") {
    const biz = cloud.workspaces.find(w => w.kind === "business");
    return <div className="tm-empty"><Users size={26} /><h3>Workspace pribadi</h3><p>Workspace {ws?.name ?? "ini"} hanya untuk Anda dan tidak bisa mengundang anggota. Tim diundang ke workspace {biz?.name ?? "bisnis"}.</p>{biz && <button className="primary-button" onClick={() => switchWorkspace(biz.id)}>Pindah ke {biz.name}</button>}</div>;
  }

  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); setError(""); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(""); } };
  const invite = (e: React.FormEvent) => {
    e.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(addr)) return setError("Email belum valid.");
    run("invite", async () => {
      const r = await callServer<{ link: string | null; existingAccount: boolean }>("members.invite", { email: addr, role, redirectTo: appUrl() });
      setEmail("");
      if (r.link) setShared({ email: addr, link: r.link }); else notify(`${addr} sudah punya akun dan kini menjadi anggota. Minta dia masuk seperti biasa.`);
      await load();
    });
  };
  const relink = (m: Member) => run(`link:${m.userId}`, async () => { const r = await callServer<{ link: string }>("members.link", { userId: m.userId, redirectTo: appUrl() }); setShared({ email: m.email, link: r.link }); });
  const changeRole = (m: Member, next: Role) => run(`role:${m.userId}`, async () => { await callServer("members.role", { userId: m.userId, role: next }); notify(`${m.email} sekarang ${ROLE_LABEL[next]}.`); await load(); });
  const remove = (m: Member) => { if (!window.confirm(`Keluarkan ${m.email} dari ${ws.name}? Aksesnya langsung dicabut; konten yang ia buat tetap ada.`)) return; run(`rm:${m.userId}`, async () => { await callServer("members.remove", { userId: m.userId }); notify(`${m.email} dikeluarkan.`); await load(); }); };
  const manageable = (m: Member) => canManage && !m.self && m.role !== "owner" && (me === "owner" || m.role === "editor");

  return <div className="tm">
    {canManage && <form className="tm-invite" onSubmit={invite} noValidate>
      <div><h4>Undang anggota</h4><p>Anggota baru mendapat link untuk membuat kata sandi. Bagikan link itu lewat WhatsApp atau salin.</p></div>
      <div className="tm-invite-row">
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nama@forior.id" autoComplete="off" /></label>
        <label>Peran<select value={role} onChange={e => setRole(e.target.value as Role)}><option value="editor">Editor</option>{me === "owner" && <option value="admin">Admin</option>}</select></label>
        <button type="submit" className="primary-button" disabled={busy === "invite"}>{busy === "invite" ? <Loader2 size={15} className="lg-spin" /> : <UserPlus size={15} />} Buat undangan</button>
      </div>
      <small className="dl-hint">{ROLE_HELP[role]}</small>
    </form>}
    {shared && <InviteLink email={shared.email} link={shared.link} onClose={() => setShared(null)} />}
    {error && <p className="x-error">{error}</p>}
    <div className="tm-list-head"><h4>Anggota {ws.name}</h4>{members && <span className="muted-chip">{members.filter(m => m.active).length} aktif · {members.filter(m => !m.active).length} belum masuk</span>}</div>
    {!members ? <p className="x-empty">Memuat anggota…</p> : <div className="tm-list">{members.map(m => <div key={m.userId} className="tm-row">
      <span className="tm-avatar">{m.email.charAt(0).toUpperCase()}</span>
      <span className="tm-who"><b>{m.email}{m.self && <em> · Anda</em>}</b><small>{ROLE_HELP[m.role]}</small></span>
      {manageable(m) ? <select className="tm-role" value={m.role} disabled={busy === `role:${m.userId}`} onChange={e => changeRole(m, e.target.value as Role)} aria-label={`Peran ${m.email}`}><option value="editor">Editor</option>{(me === "owner" || m.role === "admin") && <option value="admin">Admin</option>}</select> : <span className="tm-role-chip">{ROLE_LABEL[m.role]}</span>}
      <span className={`dl-badge ${m.active ? "green" : "orange"}`}>{m.active ? "Aktif" : "Belum masuk"}</span>
      <span className="tm-actions">
        {canManage && !m.active && !m.self && <button className="outline-button" onClick={() => relink(m)} disabled={busy === `link:${m.userId}`}><Link2 size={14} /> Link baru</button>}
        {manageable(m) && <button className="outline-button x-danger" onClick={() => remove(m)} disabled={busy === `rm:${m.userId}`}>Keluarkan</button>}
      </span>
    </div>)}</div>}
  </div>;
}
