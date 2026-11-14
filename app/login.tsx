"use client";

// Gate screens shown before the app: sign-in (invite only), choosing a password from an invite/reset link,
// a short loading state, and the message for an account that belongs to no workspace yet.
import { useState } from "react";
import { Image as ImageIcon, Info, Layers, Loader2, Lock, Users } from "lucide-react";
import { sendPasswordReset, setNewPassword, signInWithEmail, signInWithPassword, signOut } from "./lib/cloud";

function Brand({ light = false }: { light?: boolean }) {
  return <div className={`lg-brand ${light ? "light" : ""}`}><span className="lg-mark" aria-hidden="true"><i /><i /></span><span><b>FORIOR</b><small>Hub</small></span></div>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="lg-page">
    <div className="lg-bg" aria-hidden="true" /><div className="lg-scrim" aria-hidden="true" />
    <aside className="lg-side">
      <Brand light />
      <div className="lg-pitch">
        <span className="lg-eyebrow">FORIOR HUB</span>
        <h1>Create better property visuals, <span>together.</span></h1>
        <p>Workspace untuk mengelola project, konten, dan photo delivery dari FORIOR.</p>
        <ul>
          <li><Layers size={18} aria-hidden="true" /> Project &amp; photo delivery</li>
          <li><ImageIcon size={18} aria-hidden="true" /> Content plan &amp; produksi</li>
          <li><Users size={18} aria-hidden="true" /> Kolaborasi tim</li>
        </ul>
      </div>
      <small className="lg-copy"><Lock size={13} aria-hidden="true" /> Private workspace · Invitation only</small>
    </aside>
    <section className="lg-main"><div className="lg-mobile-head"><Brand light /><p>Akses hanya dengan undangan.</p></div>{children}</section>
  </main>;
}

const validEmail = (v: string) => /^\S+@\S+\.\S+$/.test(v.trim());

export function LoginScreen() {
  const [mode, setMode] = useState<"password" | "link" | "reset">("password");
  const [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setNotice("");
    if (!validEmail(email)) return setError("Email belum valid.");
    setBusy(true);
    try {
      if (mode === "password") { if (!password) throw new Error("Isi kata sandi."); await signInWithPassword(email.trim(), password); }
      else if (mode === "link") { await signInWithEmail(email.trim()); setNotice(`Link masuk dikirim ke ${email.trim()}. Buka dari perangkat ini.`); }
      else { await sendPasswordReset(email.trim()); setNotice(`Jika ${email.trim()} terdaftar, link untuk membuat kata sandi baru sudah dikirim.`); }
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  };
  return <Shell>
    <form className="lg-card" onSubmit={submit} noValidate>
      <div className="lg-head"><h2>{mode === "reset" ? "Lupa kata sandi" : "Masuk"}</h2><p>{mode === "reset" ? "Kami kirim link untuk membuat kata sandi baru." : "Gunakan akun yang diundang ke FORIOR Hub."}</p></div>
      {mode !== "reset" && <div className="lg-seg" role="group" aria-label="Cara masuk">
        <button type="button" className={mode === "password" ? "active" : ""} aria-pressed={mode === "password"} onClick={() => { setMode("password"); setError(""); setNotice(""); }}>Kata sandi</button>
        <button type="button" className={mode === "link" ? "active" : ""} aria-pressed={mode === "link"} onClick={() => { setMode("link"); setError(""); setNotice(""); }}>Link via email</button>
      </div>}
      <label className="lg-field">Email<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="nama@forior.id" autoFocus /></label>
      {mode === "password" && <label className="lg-field"><span className="lg-label-row">Kata sandi <button type="button" className="lg-link" onClick={() => { setMode("reset"); setError(""); setNotice(""); }}>Lupa kata sandi?</button></span><input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>}
      {error && <p className="lg-error" role="alert">{error}</p>}
      {notice && <p className="lg-ok" role="status">{notice}</p>}
      <button type="submit" className="lg-submit" disabled={busy}>{busy && <Loader2 size={17} className="lg-spin" />}{mode === "password" ? "Masuk" : mode === "link" ? "Kirim link masuk" : "Kirim link reset"}</button>
      {mode === "reset" ? <button type="button" className="lg-link lg-back" onClick={() => { setMode("password"); setError(""); setNotice(""); }}>← Kembali ke masuk</button>
        : <div className="lg-note"><Info size={17} aria-hidden="true" /><span>Belum punya akses? Minta undangan ke admin FORIOR. Tidak ada pendaftaran publik.</span></div>}
    </form>
  </Shell>;
}

/** After an invite or reset link: the session exists, but the user must choose a password first. */
export function SetPasswordScreen({ email }: { email: string | null }) {
  const [pw, setPw] = useState(""), [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    if (pw.length < 8) return setError("Kata sandi minimal 8 karakter.");
    if (pw !== pw2) return setError("Kedua kata sandi tidak sama.");
    setBusy(true);
    try { await setNewPassword(pw); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  };
  return <Shell>
    <form className="lg-card" onSubmit={submit} noValidate>
      <div className="lg-head"><h2>Buat kata sandi</h2><p>{email ? <>Untuk <b>{email}</b>. </> : null}Dipakai untuk masuk berikutnya.</p></div>
      <input type="email" autoComplete="username" value={email ?? ""} readOnly hidden />
      <label className="lg-field">Kata sandi baru<input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} autoFocus /></label>
      <label className="lg-field">Ulangi kata sandi<input type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} /></label>
      {error && <p className="lg-error" role="alert">{error}</p>}
      <button type="submit" className="lg-submit" disabled={busy}>{busy && <Loader2 size={17} className="lg-spin" />}Simpan &amp; lanjutkan</button>
    </form>
  </Shell>;
}

export function GateLoading() {
  return <main className="lg-loading" aria-busy="true"><Brand /><Loader2 size={26} className="lg-spin" /><span>Memeriksa akses…</span></main>;
}

export function NoWorkspaceScreen({ email, error }: { email: string | null; error?: string }) {
  return <Shell>
    <div className="lg-card">
      <div className="lg-head"><h2>Belum ada workspace</h2><p>Akun {email ? <b>{email}</b> : "ini"} belum menjadi anggota workspace mana pun. Minta admin FORIOR mengundang Anda.</p></div>
      {error && <p className="lg-error">{error}</p>}
      <button type="button" className="lg-submit" onClick={() => signOut()}>Keluar</button>
    </div>
  </Shell>;
}
