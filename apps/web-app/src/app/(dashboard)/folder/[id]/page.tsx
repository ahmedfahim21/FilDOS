"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Upload, ArrowLeft, Lock, BrainCircuit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/header";
import FileGrid from "@/components/file-grid";
import FileList from "@/components/file-list";
import { useFiles, useFolderData, useCanRead } from "@/hooks/useContract";
import SearchDialog from "@/components/search-dialog";
import { FileItem } from "@/types";
import { ConnectWalletPrompt } from "@/components/not-connected";
import { useConnection } from "wagmi";
import { getFileTypeFromExtension } from "@/utils/fileClassification";
import { useModal } from "@/providers/ModalProvider";

const formatDate = (timestamp: bigint) => {
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

export default function FolderPage() {
  const params = useParams();
  const router = useRouter();
  const folderId = params.id as string;
  const { openModal } = useModal();

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  const { isConnected, address } = useConnection();
  const { data: folderFiles, isLoading: filesLoading, error: filesError } = useFiles(folderId, true);
  const { data: folderData, isLoading: folderDataLoading, error: folderDataError } = useFolderData(folderId);
  const { data: canRead, isLoading: canReadLoading } = useCanRead(folderId, address);

  // Prevent hydration mismatches by ensuring client-side rendering
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Transform contract data to FileItem format
  const files: FileItem[] = folderFiles ? folderFiles.map(file => ({
    id: file.cid,
    name: file.filename,
    type: getFileTypeFromExtension(file.filename),
    folderType: "",
    modified: formatDate(file.timestamp),
    owner: file.owner,
    shared: false,
    cid: file.cid,
    tags: file.tags,
    encrypted: file.encrypted,
    dataToEncryptHash: file.dataToEncryptHash,
    fileType: file.fileType,
    tokenId: Array.isArray(params.id) ? params.id[0] : params.id, // Add tokenId so preview modal can fetch metadata
  })) : [];

  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles(prev =>
      prev.includes(fileId)
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  const handleFileClick = (folderId?: string, url?: string) => {
    if (url) {
      window.open(url, '_blank');
    }
  };

  const handleBackToRoot = () => {
    router.push("/");
  };

  const isLoading = filesLoading || folderDataLoading;
  const hasError = filesError || folderDataError;

  // Show loading state during hydration to prevent mismatch
  if (!isMounted) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return <ConnectWalletPrompt
      description="Please connect your wallet to access your folders and files."
    />;
  }

  // Check if user has access to this folder
  const isOwner = folderData?.owner?.toLowerCase() === address?.toLowerCase();
  const needsPayment = folderData?.isPublic &&
    folderData?.viewingPrice &&
    folderData.viewingPrice > BigInt(0) &&
    !canRead &&
    !isOwner;

  // Show payment required screen for paid folders without access
  if (!canReadLoading && needsPayment && folderData) {
    return (
      <div>
        <Header isFilePage={true} viewMode={viewMode} setViewMode={setViewMode} />
        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 flex flex-col overflow-hidden">
            <div className="flex flex-col items-center justify-center p-6 sm:p-12 text-center min-h-[60vh]">
              <h3 className="text-xl sm:text-2xl font-semibold text-foreground mb-2">Payment Required</h3>
              <p className="text-sm sm:text-base text-muted-foreground mb-1">
                This folder requires a one-time payment to access.
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground mb-6">
                After payment, you&apos;ll have permanent read access to all contents.
              </p>

              <div className="bg-muted/50 p-4 sm:p-6 rounded-lg border max-w-md w-full mb-6">
                <div className="text-xs sm:text-sm text-muted-foreground mb-2">Dataset</div>
                <div className="text-base sm:text-lg font-semibold mb-4">{folderData.name}</div>
                <div className="text-xs sm:text-sm text-muted-foreground mb-1">Owner</div>
                <div className="font-mono text-xs sm:text-sm text-foreground mb-4">
                  {folderData.owner.slice(0, 6)}...{folderData.owner.slice(-4)}
                </div>
              </div>

              {/* <PayAccessDialog
                folderId={folderId}
                folderName={folderData.name}
                viewingPrice={folderData.viewingPrice}
                onSuccess={() => window.location.reload()}
              >
                <Button size="lg" className="min-w-[200px] w-full sm:w-auto">
                  Pay to Access
                </Button>
              </PayAccessDialog> */}

              <Button
                variant="ghost"
                className="mt-4 w-full sm:w-auto"
                onClick={handleBackToRoot}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to My Drive
              </Button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // Show access denied for private folders
  if (!canReadLoading && !canRead && !isOwner && folderData) {
    return (
      <div>
        <Header isFilePage={true} viewMode={viewMode} setViewMode={setViewMode} />
        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 flex flex-col overflow-hidden">
            <div className="flex flex-col items-center justify-center p-6 sm:p-12 text-center min-h-[60vh]">
              <Lock className="w-16 h-16 sm:w-20 sm:h-20 text-muted-foreground mb-4" />
              <h3 className="text-xl sm:text-2xl font-semibold text-foreground mb-2">Access Denied</h3>
              <p className="text-sm sm:text-base text-muted-foreground mb-6">
                You don&apos;t have permission to access this folder.
              </p>
              <Button
                onClick={handleBackToRoot}
                className="w-full sm:w-auto"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to My Drive
              </Button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header isFilePage={true} viewMode={viewMode} setViewMode={setViewMode} />
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Upload Button - Always visible at the top */}
          <div className="p-3 sm:p-4 border-b bg-background">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="text-base sm:text-lg font-medium">Folder Content</h2>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                <SearchDialog folderId={folderId}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="whitespace-nowrap"
                  >
                    <BrainCircuit className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Search</span>
                  </Button>
                </SearchDialog>
                <Button
                  variant="secondary"
                  size="sm"
                  className="whitespace-nowrap"
                  onClick={() => openModal("EMBEDDING", { folderId, files })}
                >
                  <Upload className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Embed</span>
                </Button>
                <Button
                    className="bg-primary hover:bg-secondary text-white whitespace-nowrap"
                    size="sm"
                    onClick={() => openModal("UPLOAD", { folderId })}
                  >
                    <Upload className="w-4 h-4 sm:mr-2" />
                    <span>Upload Files</span>
                  </Button>
              </div>
            </div>
          </div>

          {/* Navigation breadcrumb */}
          <div className="p-3 sm:p-4 border-b">
            <button
              onClick={handleBackToRoot}
              className="text-primary hover:text-secondary-foreground text-xs sm:text-sm flex items-center"
            >
              <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
              Back to My Drive
            </button>
            <h2 className="text-base sm:text-lg font-medium mt-2 break-words">
              {folderDataLoading
                ? "Loading folder..."
                : folderData?.name || `Folder ${folderId}`
              }
            </h2>
            {folderData && (
              <div className="text-xs sm:text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
                <Badge className="capitalize text-xs">{folderData.folderType}</Badge>
                {folderData.isPublic && (
                  <Badge variant="secondary" className="text-xs">
                    Public
                  </Badge>
                )}
                <span className="text-xs sm:text-sm">Created {formatDate(folderData.createdAt)}</span>
              </div>
            )}
          </div>

          {/* Error state */}
          {hasError && (
            <div className="flex items-center justify-center p-6 sm:p-8">
              <div className="text-center">
                <div className="text-red-600 mb-2 text-sm sm:text-base">⚠️ Error</div>
                <p className="text-gray-600 text-sm">
                  {filesError?.message || folderDataError?.message || "Something went wrong"}
                </p>
              </div>
            </div>
          )}

          {/* Loading state */}
          {isLoading && !hasError && (
            <div className="flex items-center justify-center p-6 sm:p-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              </div>
            </div>
          )}

          {/* File view */}
          {!isLoading && !hasError && (
            <>
              {files.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-6 sm:p-12 text-center">
                  <Upload className="w-12 h-12 sm:w-16 sm:h-16 text-gray-400 mb-4" />
                  <h3 className="text-base sm:text-lg font-medium text-foreground mb-2">
                    No files in this folder
                  </h3>
                  <p className="text-sm sm:text-base text-gray-600 mb-4">
                    This folder is empty. Upload files to get started.
                  </p>
                </div>
              ) : (
                <>
                  {viewMode === "grid" ? (
                    <FileGrid
                      files={files}
                      selectedFiles={selectedFiles}
                      onToggleSelection={toggleFileSelection}
                      onFolderClick={handleFileClick}
                      currentFolderId={Array.isArray(params.id) ? params.id[0] : params.id}
                    />
                  ) : (
                    <FileList
                      files={files}
                      selectedFiles={selectedFiles}
                      onToggleSelection={toggleFileSelection}
                      onFolderClick={handleFileClick}
                      currentFolderId={Array.isArray(params.id) ? params.id[0] : params.id}
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
