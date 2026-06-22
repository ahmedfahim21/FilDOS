// Self-hosted brand fonts (no CDN, CSP-safe) — mirrors the desktop app.
// Space Grotesk: UI / display. Space Mono: wordmark, code, technical text.
import "@fontsource/space-grotesk/300.css";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";

const description =
  "FilDOS is an open-source, AI-native file explorer for macOS, Windows and Linux. Find files by meaning, organize with smart tags, and keep everything local-first and fast.";

export const metadata: Metadata = {
  title: {
    default: "FilDOS — The open-source, AI-native file explorer",
    template: "%s · FilDOS",
  },
  description,
  applicationName: "FilDOS",
  keywords: [
    "FilDOS",
    "file explorer",
    "file manager",
    "AI file manager",
    "semantic search",
    "open source",
    "desktop app",
    "macOS",
    "Windows",
    "Linux",
    "Electron",
    "local-first",
  ],
  authors: [{ name: "ArqosLabs" }],
  creator: "ArqosLabs",
  publisher: "ArqosLabs",
  metadataBase: new URL("https://fildos.cloud"),
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://fildos.cloud",
    siteName: "FilDOS",
    title: "FilDOS — The open-source, AI-native file explorer",
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: "FilDOS — The open-source, AI-native file explorer",
    description,
    creator: "@fildos_cloud",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
