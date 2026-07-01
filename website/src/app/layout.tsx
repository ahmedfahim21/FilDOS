
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "FilDOS - AI-Native Decentralized Storage",
    template: "%s | FilDOS",
  },
  description:
    "FilDOS is a secure, AI-native decentralized cloud storage solution that prioritizes meaning-first data organization and retrieval. Built on Filecoin with semantic search capabilities.",
  keywords: [
    "FilDOS",
    "decentralized storage",
    "AI storage",
    "Filecoin",
    "semantic search",
    "blockchain storage",
    "Web3 storage",
    "IPFS",
    "cloud storage",
    "data privacy",
  ],
  authors: [{ name: "ArqosLabs" }],
  creator: "ArqosLabs",
  publisher: "ArqosLabs",
  metadataBase: new URL("https://fildos.cloud"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://fildos.cloud",
    siteName: "FilDOS",
    title: "FilDOS - AI-Native Decentralized Storage",
    description:
      "A secure, AI-native, meaning-first decentralized drive built on Filecoin. Store, search, and share files by meaning rather than cryptic identifiers.",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "FilDOS - AI-Native Decentralized Storage",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FilDOS - AI-Native Decentralized Storage",
    description:
      "A secure, AI-native, meaning-first decentralized drive built on Filecoin. Store, search, and share files by meaning.",
    images: ["/opengraph-image.png"],
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
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
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
      <body
      >
        <main className="flex flex-col">
          {children}
        </main>
        <Analytics />
      </body>
    </html>
  );
}
