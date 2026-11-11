import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  // GitHub Pages serves the repo under /social; Vercel (VERCEL=1 at build) serves it at the domain root.
  basePath: process.env.NEXT_BASE_PATH ?? (process.env.VERCEL ? "" : "/social"),
  trailingSlash: true,
  images: {
    unoptimized: true
  }
};

export default nextConfig;
