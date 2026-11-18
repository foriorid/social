import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // No `output: "export"`: /quote/<slug> is a route handler that must run on the server,
  // because Supabase refuses to serve rendered HTML from *.supabase.co (see docs/superpowers/specs).
  // GitHub Pages serves the repo under /social; Vercel (VERCEL=1 at build) serves it at the domain root.
  basePath: process.env.NEXT_BASE_PATH ?? (process.env.VERCEL ? "" : "/social"),
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  // The client form public/photo-planner.html is linked as /photo-planner (app/business.tsx, and links
  // already sent to clients). Static hosting used to map that to the .html file by itself; a server
  // build does not, so map it explicitly.
  async rewrites() {
    return [{ source: "/photo-planner", destination: "/photo-planner.html" }];
  }
};

export default nextConfig;
