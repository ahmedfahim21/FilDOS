"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Share } from "lucide-react";
import { useSharedFolders } from "@/hooks/useContract";
import { useFolderList } from "@/hooks/useFolderList";
import Header from "@/components/header";
import FileGrid from "@/components/file-grid";
import FileList from "@/components/file-list";
import { FileItem } from "@/types";
import { ConnectWalletPrompt } from "@/components/not-connected";
import { useConnection } from "wagmi";

const formatDate = (timestamp: bigint) => {
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
};

export default function SharedFolders() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const router = useRouter();

  const { address, isConnected } = useConnection();
  const { data: sharedFolders, isLoading: foldersLoading, error: foldersError } = useSharedFolders();
  const { folderDataMap, isLoading: folderDataLoading, hasError: folderDataError } = useFolderList(sharedFolders || []);

  // Transform contract data to FileItem format - only shared folders
  const files: FileItem[] = (sharedFolders || []).map((tokenId: string) => {
    const folderData = folderDataMap.get(tokenId);
    const isLoading = folderDataLoading && !folderData;
    const hasError = folderDataError && !folderData;
    
    return {
      id: tokenId,
      name: isLoading ? "Loading..." : hasError ? `Folder ${tokenId}` : folderData?.name || `Folder ${tokenId}`,
      type: "folder" as const,
      folderType: folderData?.folderType || "",
      modified: isLoading ? "Loading..." : hasError ? "Unknown" : formatDate(folderData?.createdAt || BigInt(0)),
      owner: folderData?.owner || "Unknown",
      shared: true, // All folders in this view are shared
      tokenId,
      tags: [], // Add empty tags array
    };
  });

  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles(prev => 
      prev.includes(fileId) 
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  const handleFolderClick = (folderId?: string, url?: string) => {
    if (folderId) {
      router.push(`/folder/${folderId}`);
    } else if (url) {
      window.open(url, '_blank');
    }
  };

  // Get current folder data for breadcrumb
  // Only show loading if folders are loading AND there's no error (error means 0 shared folders, show empty state instead)
  const isLoading = (foldersLoading && !foldersError) || folderDataLoading;
  const hasError = folderDataError;

  if (!isConnected) {
    return <ConnectWalletPrompt 
      description="Please connect your wallet to access folders shared with you by other users."
    />;
  }

  return (
    <div>
      <Header isFilePage={true} viewMode={viewMode} setViewMode={setViewMode} />
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-3 sm:p-4 border-b bg-muted/30">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <Share className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                <h2 className="text-base sm:text-lg font-medium">Shared With Me</h2>
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground">
                {files.length} folder{files.length !== 1 ? 's' : ''} shared with you
              </div>
            </div>
          </div>
          
          {/* Error state */}
          {hasError && (
            <div className="flex items-center justify-center p-6 sm:p-8">
              <div className="text-center">
                <div className="text-destructive mb-2 text-sm sm:text-base">⚠️ Error</div>
                <p className="text-muted-foreground text-sm">
                  Something went wrong loading shared folders
                </p>
              </div>
            </div>
          )}
          
          {/* Loading state */}
          {isLoading && !hasError && (
            <div className="flex items-center justify-center p-6 sm:p-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <div className="space-y-1">
                  {foldersLoading && (
                    <p className="text-muted-foreground text-sm">Loading shared folders...</p>
                  )}
                  {folderDataLoading && (
                    <p className="text-muted-foreground text-sm">Loading folder details...</p>
                  )}
                  {!foldersLoading && !folderDataLoading && (
                    <p className="text-muted-foreground text-sm">Loading...</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* File view */}
          {!isLoading && !hasError && (
            <>
              {files.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-6 sm:p-12 text-center">
                  <Users className="w-12 h-12 sm:w-16 sm:h-16 text-muted-foreground mb-4" />
                  <h3 className="text-base sm:text-lg font-medium text-foreground mb-2">No shared folders yet</h3>
                  <p className="text-sm sm:text-base text-muted-foreground mb-4">
                    Folders that others share with you will appear here.
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground max-w-full px-4">
                    Ask others to share their folders with your wallet address:<br />
                    <code className="bg-muted px-2 py-1 rounded text-xs mt-2 inline-block break-all max-w-full">
                      {address}
                    </code>
                  </p>
                </div>
              ) : (
                <>
                  {viewMode === "grid" ? (
                    <FileGrid 
                      files={files} 
                      selectedFiles={selectedFiles}
                      onToggleSelection={toggleFileSelection}
                      onFolderClick={handleFolderClick}
                    />
                  ) : (
                    <FileList
                      files={files} 
                      selectedFiles={selectedFiles}
                      onToggleSelection={toggleFileSelection}
                      onFolderClick={handleFolderClick}
                    />
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
