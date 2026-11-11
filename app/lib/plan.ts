// Content-plan data shared by Content Plan, Shared Plan (client view) and the dashboard pipeline.

export type Campaign = { id: number; account: string; name: string; period: string; goal: string };
export type Brief = { title?: string; hook?: string; format?: string; status?: string; client?: "approved" | "revision"; note?: string };
export type Slot = { day: number; title: string; format: string; pillar: string; status: string; hook: string; objective: string; client?: "approved" | "revision"; note?: string };

export const DEFAULT_ACCOUNTS = ["Alvian", "FORIOR", "Intragama Villa"];
export const DEFAULT_CAMPAIGNS: Campaign[] = [
  { id: 1, account: "Alvian", name: "Christmas & New Year 2026", period: "Dec 2026", goal: "Awareness & engagement" },
  { id: 2, account: "Alvian", name: "Valentine's Day 2027", period: "Feb 2027", goal: "Engagement" },
  { id: 3, account: "FORIOR", name: "Year-end Portfolio Campaign", period: "Dec 2026", goal: "Lead generation" },
  { id: 4, account: "Intragama Villa", name: "Festive Season Escape", period: "Dec 2026", goal: "Bookings" }
];
export const STATUSES = ["Planned", "Brief ready", "In production", "In review", "Scheduled", "Published"];
export const SLOTS = 30;

const TITLES = ["Holiday home tour: festive edition", "5 reasons to celebrate here", "A cozy Christmas morning", "New Year, new memories", "Behind the scenes: festive setup", "The perfect group getaway"];
const PILLARS = ["Brand story", "Education", "Property highlight", "Lifestyle"];

export const briefKey = (campaignId: number, day: number) => `${campaignId}:${day}`;

export function buildPlan(campaign: Campaign, briefs: Record<string, Brief>): Slot[] {
  return Array.from({ length: SLOTS }, (_, i) => {
    const base = TITLES[i % 6];
    const saved = briefs[briefKey(campaign.id, i + 1)] ?? {};
    return {
      day: i + 1,
      title: saved.title || base + (i >= 6 ? " · Part " + (Math.floor(i / 6) + 1) : ""),
      format: saved.format || (i % 3 === 1 ? "Carousel" : "Reels"),
      pillar: PILLARS[i % 4],
      status: saved.status || (i < 4 ? "Brief ready" : "Planned"),
      hook: saved.hook || "Susun hook utama untuk " + base.toLowerCase() + ".",
      objective: campaign.goal,
      client: saved.client,
      note: saved.note
    };
  });
}

/** Pipeline counts across every campaign, for the dashboard. */
export function pipelineCounts(campaigns: Campaign[], briefs: Record<string, Brief>): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(STATUSES.map(s => [s, 0]));
  for (const campaign of campaigns) for (const slot of buildPlan(campaign, briefs)) counts[slot.status] = (counts[slot.status] ?? 0) + 1;
  return counts;
}
