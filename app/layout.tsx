import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FORIOR Creator OS — Dashboard",
  description: "Personal Brand Content Command Center"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
