// Pure rules for the quotation share feature. No Deno, no DOM, no browser APIs, so the same
// module runs in the edge function, in the Next route handler and under `node --test`.
// Everything here works on the HTML *string*: DOMParser does not exist in the test runner,
// and a DOM-based version could not be tested at all.

/** 3-63 chars. `mytepro` (7) must pass, so this is looser than review_links' {6,88}. */
const SLUG = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
export function isSlug(s: string): boolean {
  return typeof s === "string" && SLUG.test(s) && !s.includes("--");
}

// Link-preview fetchers and search crawlers. They must still be served the page (they are the
// ones that need the OG tags) but must never count as a client opening the quotation: an open
// count that ticks the moment the link is sent is worse than no count at all.
const CRAWLERS = [
  "whatsapp", "facebookexternalhit", "facebookcatalog", "twitterbot", "telegrambot",
  "slackbot", "linkedinbot", "discordbot", "googlebot", "bingbot", "applebot",
  "skypeuripreview", "embedly", "quora link preview", "vkshare", "redditbot", "pinterest"
];
const CRAWLER_HINT = /bot|crawler|spider|preview|fetcher/;
export function isCrawler(ua: string | null): boolean {
  if (!ua) return true; // no user agent is not a person on a phone
  const s = ua.toLowerCase();
  return CRAWLERS.some(c => s.includes(c)) || CRAWLER_HINT.test(s);
}

export function escapeAttr(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type QuoteMeta = { title: string; description: string; image: string | null; url: string };

/** Open Graph tags for the WhatsApp preview card, plus noindex. Never trusts the stored values. */
export function injectMeta(html: string, meta: QuoteMeta): string {
  const tag = (attr: "property" | "name", key: string, value: string) =>
    `<meta ${attr}="${key}" content="${escapeAttr(value)}">`;
  const tags = [
    tag("property", "og:type", "website"),
    tag("property", "og:title", meta.title),
    tag("property", "og:description", meta.description),
    ...(meta.image ? [tag("property", "og:image", meta.image)] : []),
    tag("property", "og:url", meta.url),
    tag("name", "twitter:card", "summary_large_image"),
    tag("name", "robots", "noindex, nofollow")
  ].join("");
  const i = html.toLowerCase().indexOf("</head>");
  // A hand-edited or truncated file may have no </head>; it still has to come back whole.
  return i === -1 ? tags + html : html.slice(0, i) + tags + html.slice(i);
}

export type ImagePart = { path: string; mime: string; base64: string };
export type Extraction = { html: string; images: ImagePart[] };

const EXT: Record<string, string> = { jpeg: "jpg", jpg: "jpg", png: "png", webp: "webp", gif: "gif", "svg+xml": "svg", avif: "avif" };
const DATA_URI = /data:(image\/([a-z0-9.+-]+));base64,([A-Za-z0-9+/=]+)/gi;

/**
 * Lift every base64 image out of the document and point at `baseUrl/prefix/<n>.<ext>` instead.
 * This is what makes the file's own loading="lazy" work: a data URI is part of the document, so
 * the browser cannot defer something it has already downloaded.
 */
export function extractDataUris(html: string, baseUrl: string, prefix: string): Extraction {
  const images: ImagePart[] = [];
  const out = html.replace(DATA_URI, (_m, mime: string, subtype: string, base64: string) => {
    const ext = EXT[subtype.toLowerCase()] ?? "bin";
    const path = `${prefix}/${images.length + 1}.${ext}`;
    images.push({ path, mime, base64 });
    return `${baseUrl}/${path}`;
  });
  return { html: out, images };
}

export function titleOf(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? m[1].trim() : "";
}

// Only tags that *fetch* something. A plain <a href> is navigation and must not be reported:
// the sample quotation links to wa.me and www.forior.id, and neither is blocked by the CSP.
const SUBRESOURCE = /<(?:link|img|script|source|iframe|object|embed)\b[^>]*?\b(?:src|href|data)\s*=\s*["']([^"']+)["']/gi;
const CSS_URL = /(?:@import\s+(?:url\()?|url\()\s*["']?(https?:\/\/[^"')\s]+)/gi;

/** Hosts this document would fetch from, so the uploader can be warned about ones the CSP blocks. */
export function externalHosts(html: string): string[] {
  const hosts = new Set<string>();
  for (const re of [SUBRESOURCE, CSS_URL]) {
    re.lastIndex = 0;
    for (let m = re.exec(html); m; m = re.exec(html)) {
      if (!/^https?:\/\//i.test(m[1])) continue;
      try { hosts.add(new URL(m[1]).hostname); } catch { /* not a URL we can read */ }
    }
  }
  return [...hosts];
}
