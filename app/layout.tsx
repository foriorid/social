import type { Metadata } from "next";
import "./globals.css";
import { THEME_BOOT } from "./lib/theme-boot";

export const metadata: Metadata = {
  // Absolute base for link-preview URLs (og:image etc.) on hub.forior.id.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://hub.forior.id"),
  title: "FORIOR Creator OS — Dashboard",
  description: "Personal Brand Content Command Center"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} /></head>
      <body>{children}</body>
    </html>
  );
}
