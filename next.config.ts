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
  }
};

export default nextConfig;
