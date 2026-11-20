"use client";

import { useSyncExternalStore } from "react";

/**
 * The open page lives in the URL hash ("#/penawaran", "#/photo-delivery/<id>") so a refresh keeps it
 * and the phone's back gesture steps back inside the Hub. Other hash uses ("#share=", auth tokens) don't start with "#/".
 */
export const slugOf = (nav: string) => nav.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function parseRoute(hash: string): { slug: string; id: string | null } {
  if (!hash.startsWith("#/")) return { slug: "", id: null };
  const [slug = "", id = ""] = hash.slice(2).split("/");
  return { slug, id: id ? decodeURIComponent(id) : null };
}

const subs = new Set<() => void>();
const notifyAll = () => subs.forEach(f => f());
if (typeof window !== "undefined") window.addEventListener("popstate", notifyAll);

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const snap = () => window.location.hash;

/** Moves to a page (and optionally a detail id). `replace` swaps the history entry instead of adding one. */
export function navigate(nav: string, id: string | null = null, replace = false) {
  const hash = `#/${slugOf(nav)}${id ? "/" + encodeURIComponent(id) : ""}`;
  if (hash === window.location.hash) return;
  const url = window.location.pathname + window.location.search + hash;
  if (replace) window.history.replaceState(null, "", url); else window.history.pushState({ from: window.location.hash }, "", url);
  notifyAll();
}

/** Leaves a detail view for its list: steps back when the list is the previous entry, otherwise swaps to it. */
export function goBack(nav: string) {
  if (window.history.state?.from === `#/${slugOf(nav)}`) window.history.back(); else navigate(nav, null, true);
}

/** The detail id of `nav` from the URL, and a setter that opens one (null goes back to the list). */
export function useDetail(nav: string): [string | null, (id: string | null) => void] {
  const r = useRoute();
  return [r.slug === slugOf(nav) ? r.id : null, id => (id ? navigate(nav, id) : goBack(nav))];
}

export function useRoute() {
  return parseRoute(useSyncExternalStore(subscribe, snap, () => ""));
}
