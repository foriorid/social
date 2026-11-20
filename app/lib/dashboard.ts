// Business dashboard: the few pure rules behind "Fokus hari ini", the agenda and the greeting. Unit-tested.

export const greeting = (hour: number) => (hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 18 ? "Selamat sore" : "Selamat malam");

export type AgendaItem = { key: string; start: string; title: string; where?: string; color: string; source: "project" | "google"; galleryId?: string; allDay?: boolean };

const dayKey = (iso: string) => iso.slice(0, 10);
/**
 * Upcoming shoots from projects and connected Google Calendars, soonest first, within `days`.
 * A Google event already created from a project (same day, title contains the project's) is shown once.
 */
export function mergeAgenda(projects: AgendaItem[], events: AgendaItem[], now: Date, days = 14): AgendaItem[] {
  const from = new Date(now); from.setHours(0, 0, 0, 0);
  const until = from.getTime() + days * 864e5;
  const inRange = (a: AgendaItem) => { const t = new Date(a.allDay ? `${a.start}T00:00:00` : a.start).getTime(); return t >= from.getTime() && t < until; };
  const p = projects.filter(inRange);
  const dup = (e: AgendaItem) => p.some(x => dayKey(x.start) === dayKey(e.start) && e.title.toLowerCase().includes(x.title.toLowerCase()));
  return [...p, ...events.filter(inRange).filter(e => !dup(e))].sort((a, b) => a.start.localeCompare(b.start));
}

export type Focus = { tone: "warn" | "info" | "ok"; text: string; nav: string; galleryId?: string };
/** At most three things worth doing today, most urgent first. */
export function focusItems(input: {
  actions: { id: string; title: string; text: string; rank: number }[];
  agenda: AgendaItem[];
  quotes: { title: string; lastOpen?: string; answers: number }[];
  now: Date;
}): Focus[] {
  const out: Focus[] = [];
  for (const a of input.actions.filter(a => a.rank <= 1).slice(0, 2)) out.push({ tone: "warn", text: `${a.title}: ${a.text}`, nav: "Photo Delivery", galleryId: a.id });
  const tomorrow = new Date(input.now); tomorrow.setHours(0, 0, 0, 0); tomorrow.setDate(tomorrow.getDate() + 2);
  const soon = input.agenda.find(e => new Date(e.allDay ? `${e.start}T00:00:00` : e.start).getTime() < tomorrow.getTime());
  if (soon) {
    const today = dayKey(soon.start) === dayKey(new Date(input.now.getTime() - input.now.getTimezoneOffset() * 6e4).toISOString());
    out.push({ tone: "info", text: `Shoot ${today ? "hari ini" : "besok"}${soon.allDay ? "" : ` ${soon.start.slice(11, 16)}`} · ${soon.title}`, nav: "Calendar", galleryId: soon.galleryId });
  }
  const day = 864e5;
  const q = input.quotes.find(x => x.answers > 0) ?? input.quotes.find(x => x.lastOpen && input.now.getTime() - Date.parse(x.lastOpen) < day);
  if (q) out.push({ tone: "ok", text: q.answers > 0 ? `Klien menjawab penawaran ${q.title}` : `Penawaran ${q.title} baru dibuka`, nav: "Penawaran" });
  return out.slice(0, 3);
}
