import "./globals.css";
import { Analytics } from "@vercel/analytics/next"
import { ReactQueryProvider } from "@/providers/ReactQueryProvider";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { SynapseProvider } from "@/providers/SynapseProvider";
import { Inter } from 'next/font/google'
import type { Metadata } from 'next'
import { WagmiProvider } from "@/providers/WagmiProvider";
import { Web3AuthProvider } from "@/providers/Web3AuthProvider";
import { ModalProvider } from "@/providers/ModalProvider";
import { ModalManager } from "@/components/modal-manager";

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'FilDOS - AI-Native Decentralized Storage',
    template: '%s | FilDOS'
  },
  description: 'A Secure, AI-Native, Meaning-First Decentralized Drive built on Filecoin',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={inter.className}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Web3AuthProvider>

            <ReactQueryProvider>
              <WagmiProvider>
                <SynapseProvider>
                  <ModalProvider>
                    <main className="flex flex-col min-h-screen">
                      {children}
                    </main>
                    <ModalManager />
                  </ModalProvider>
                </SynapseProvider>
              </WagmiProvider>
            </ReactQueryProvider>
          </Web3AuthProvider>
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
