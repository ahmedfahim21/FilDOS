import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Import Data'
}

export default function ImportLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}