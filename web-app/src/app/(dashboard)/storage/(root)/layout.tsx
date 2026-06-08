import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Storage Management'
}

export default function StorageRootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
