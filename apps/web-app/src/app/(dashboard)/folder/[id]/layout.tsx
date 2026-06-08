import type { Metadata } from 'next'
import { getFolderDataForMetadata } from '@/utils/serverMetadata'

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  
  // Try to fetch the folder name from the contract
  const folderData = await getFolderDataForMetadata(id);
  const title = folderData?.name || `Folder ${id}`;
  
  return {
    title
  }
}

export default function FolderLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
