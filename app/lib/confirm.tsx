"use client";

// Hub-styled confirmation dialog, used instead of the browser's window.confirm (which looks like Safari/Chrome, not Hub).
// `await confirmDialog("Hapus …?")` resolves true on confirm, false on cancel / Escape / tapping outside.
import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

type Opts = { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };
/** Destructive actions read as such: the first word becomes the red button ("Hapus", "Keluarkan", …). */
const DANGER = /^(Hapus|Keluarkan|Lepas|Tarik|Nonaktifkan|Kosongkan|Ganti)\b/i;

export function confirmDialog(message: string, opts: Opts = {}): Promise<boolean> {
  if (typeof document === "undefined") return Promise.resolve(false);
  const word = DANGER.exec(message.trim())?.[1];
  const o: Required<Opts> = {
    title: opts.title ?? (word ? `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}?` : "Konfirmasi"),
    confirmLabel: opts.confirmLabel ?? (word ? `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}` : "Lanjutkan"),
    cancelLabel: opts.cancelLabel ?? "Batal",
    danger: opts.danger ?? (!!word && !/^Ganti/i.test(word))
  };
  return new Promise(resolve => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (v: boolean) => { root.unmount(); host.remove(); resolve(v); };
    root.render(<Dialog message={message} o={o} done={done} />);
  });
}

function Dialog({ message, o, done }: { message: string; o: Required<Opts>; done: (v: boolean) => void }) {
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ok.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") done(false); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [done]);
  return <div className="cf-back" onClick={() => done(false)}>
    <div className="cf-box" role="alertdialog" aria-modal="true" aria-labelledby="cf-t" aria-describedby="cf-m" onClick={e => e.stopPropagation()}>
      <span className={`cf-ic${o.danger ? " danger" : ""}`} aria-hidden="true">{o.danger
        ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6M14 11v6" /></svg>
        : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>}</span>
      <h3 id="cf-t">{o.title}</h3>
      <p id="cf-m">{message}</p>
      <div className="cf-actions">
        <button type="button" className="outline-button" onClick={() => done(false)}>{o.cancelLabel}</button>
        <button type="button" ref={ok} className={`primary-button${o.danger ? " cf-danger" : ""}`} onClick={() => done(true)}>{o.confirmLabel}</button>
      </div>
    </div>
  </div>;
}
