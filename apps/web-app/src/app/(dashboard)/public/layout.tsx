import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Data Marketplace'
}

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
