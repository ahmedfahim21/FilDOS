
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { Inter, Space_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";

// Inter — UI · interface · display, matching the desktop app's font-sans
// (see .claude/brand-guidelines.md). Variable font: all weights in one file.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
});

export const metadata: Metadata = {
  title: {
    default: "FilDOS - The AI-Native File Browser",
    template: "%s | FilDOS",
  },
  description:
    "FilDOS is an AI-native file browser for your PC. Search your files by meaning instead of filenames — private, fast, and fully on-device.",
  keywords: [
    "FilDOS",
    "file browser",
    "file manager",
    "AI file search",
    "semantic search",
    "on-device AI",
    "desktop app",
    "local-first",
    "file organization",
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
    title: "FilDOS - The AI-Native File Browser",
    description:
      "FilDOS is an AI-native file browser for your PC. Search your files by meaning instead of filenames — private, fast, and fully on-device.",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "FilDOS - The AI-Native File Browser",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FilDOS - The AI-Native File Browser",
    description:
      "FilDOS is an AI-native file browser for your PC. Search your files by meaning instead of filenames — private, fast, and fully on-device.",
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
    <html
      lang="en"
      className={`${inter.variable} ${spaceMono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
