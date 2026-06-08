import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Shared With Me'
}

export default function SharedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
