"use client";

import { useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Tag, Search, Filter, FileText, Image as ImageIcon, Video, Archive, Code } from "lucide-react";
import { useSearchMyFilesByTag } from "@/hooks/useContract";
import Header from "@/components/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import FileGrid from "@/components/file-grid";
import FileList from "@/components/file-list";
import type { FileEntry } from "@/types";
import { ConnectWalletPrompt } from "@/components/not-connected";
import { useConnection } from "wagmi";

// Convert FileEntry to FileItem format for compatibility with existing components
interface FileItem {
  id: string;
  name: string;
  folderType: string;
  type: "folder" | "document" | "image" | "video" | "pdf" | "audio" | "presentation" | "spreadsheet" | "other";
  size?: string;
  modified: string;
  owner: string;
  shared: boolean;
  tokenId?: string;
  cid?: string;
  tags?: string[];
}

const formatDate = (timestamp: bigint) => {
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
};

const getFileTypeFromTags = (tags: string[]): FileItem['type'] => {
  if (tags.includes('images') || tags.includes('design')) return 'image';
  if (tags.includes('videos')) return 'video';
  if (tags.includes('documents') || tags.includes('pdf')) return 'document';
  if (tags.includes('audio')) return 'audio';
  if (tags.includes('presentations')) return 'presentation';
  if (tags.includes('spreadsheets')) return 'spreadsheet';
  return 'other';
};

const getTagIcon = (tag: string) => {
  if (['images', 'design'].includes(tag)) return <ImageIcon className="h-4 w-4" />;
  if (['videos', 'audio'].includes(tag)) return <Video className="h-4 w-4" />;
  if (['documents', 'spreadsheets', 'presentations', 'markup'].includes(tag)) return <FileText className="h-4 w-4" />;
  if (['code', 'web', 'notebooks', 'databases'].includes(tag)) return <Code className="h-4 w-4" />;
  if (['archives', 'binary', 'applications'].includes(tag)) return <Archive className="h-4 w-4" />;
  return <Tag className="h-4 w-4" />;
};

const getTagColor = (tag: string) => {
  if (['images', 'design'].includes(tag)) return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800';
  if (['videos', 'audio'].includes(tag)) return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800';
  if (['documents', 'spreadsheets', 'presentations', 'markup'].includes(tag)) return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800';
  if (['code', 'web', 'notebooks', 'databases'].includes(tag)) return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800';
  if (['archives', 'binary', 'applications'].includes(tag)) return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800';
  if (['embeds'].includes(tag)) return 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800';
  return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700';
};

export default function TaggedFilesPage() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();
  const params = useParams();
  const { isConnected } = useConnection();

  // Get the tag from the URL and decode it
  const tag = decodeURIComponent(params.tag as string);

  // Search for files with this tag across all owned folders
  const { 
    data: searchResults, 
    isLoading: searchLoading, 
    error: searchError 
  } = useSearchMyFilesByTag(tag, !!tag && isConnected);

  // Convert FileEntry to FileItem format
  const files: FileItem[] = useMemo(() => {
    if (!searchResults) return [];
    
    return searchResults
      .filter(file => {
        // Apply search filter if query exists
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        return (
          file.filename.toLowerCase().includes(query) ||
          file.tags.some(tag => tag.toLowerCase().includes(query))
        );
      })
      .map((file: FileEntry) => ({
        id: file.cid,
        name: file.filename,
        folderType: "file",
        type: getFileTypeFromTags(file.tags),
        modified: formatDate(file.timestamp),
        owner: file.owner,
        shared: false,
        cid: file.cid,
        tags: file.tags,
        encrypted: file.encrypted,
        dataToEncryptHash: file.dataToEncryptHash,
        fileType: file.fileType,
      }));
  }, [searchResults, searchQuery]);

  // Get all unique tags from the results for filtering
  const allTags = useMemo(() => {
    if (!searchResults) return [];
    const tagSet = new Set<string>();
    searchResults.forEach(file => {
      file.tags.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [searchResults]);

  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles(prev => 
      prev.includes(fileId) 
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  const handleFileClick = (url?: string) => {
    if (url) {
      window.open(url, '_blank');
    }
  };

  const handleBackClick = () => {
    router.back();
  };

  if (!isConnected) {
    return <ConnectWalletPrompt 
      description="Please connect your wallet to search and view your tagged files."
    />;
  }

  return (
    <div>
      <Header isFilePage={true} viewMode={viewMode} setViewMode={setViewMode} />
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Header with back button and tag info */}
          <div className="p-3 sm:p-4 border-b bg-muted/30">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleBackClick}
                className="flex items-center gap-2 self-start"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div className="flex items-center gap-2 flex-wrap">
                {getTagIcon(tag)}
                <h1 className="text-base sm:text-xl font-medium">Files tagged with</h1>
                <Badge 
                  variant="outline" 
                  className={`${getTagColor(tag)} text-xs sm:text-sm font-medium`}
                >
                  {tag}
                </Badge>
              </div>
            </div>

            {/* Search and filter bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search within tagged files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Badge variant="secondary" className="whitespace-nowrap self-start sm:self-center text-xs">
                {files.length} {files.length === 1 ? 'file' : 'files'}
              </Badge>
            </div>
          </div>

          {/* Related tags */}
          {allTags.length > 1 && (
            <div className="p-3 sm:p-4 border-b bg-background">
              <div className="flex items-center gap-2 mb-2">
                <Filter className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                <span className="text-xs sm:text-sm font-medium text-muted-foreground">Related tags:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {allTags
                  .filter(t => t !== tag) // Don't show the current tag
                  .slice(0, 10) // Limit to 10 tags
                  .map((relatedTag) => (
                    <Button
                      key={relatedTag}
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/tagged/${encodeURIComponent(relatedTag)}`)}
                      className={`${getTagColor(relatedTag)} border text-xs hover:opacity-80`}
                    >
                      <span className="flex items-center gap-1">
                        {getTagIcon(relatedTag)}
                        <span>{relatedTag}</span>
                      </span>
                    </Button>
                  ))}
                {allTags.length > 11 && (
                  <Badge variant="outline" className="text-xs">
                    +{allTags.length - 11} more
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Loading state */}
          {searchLoading && (
            <div className="flex items-center justify-center p-6 sm:p-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground text-sm sm:text-base">Searching files with tag &ldquo;{tag}&rdquo;...</p>
              </div>
            </div>
          )}

          {/* Error state */}
          {searchError && !searchResults && (
            <div className="flex flex-col items-center justify-center p-6 sm:p-12 text-center">
              <Tag className="w-12 h-12 sm:w-16 sm:h-16 text-muted-foreground mb-4" />
              <h3 className="text-base sm:text-lg font-medium text-foreground mb-2">
                No files found with tag &ldquo;{tag}&rdquo;
              </h3>
              <p className="text-sm sm:text-base text-muted-foreground mb-4 px-4">
                You don&apos;t have any files tagged with &ldquo;{tag}&rdquo; yet.
              </p>
              <Button onClick={handleBackClick} variant="outline" size="sm">
                Go Back
              </Button>
            </div>
          )}

          {/* Results */}
          {!searchLoading && !searchError && (
            <>
              {files.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-6 sm:p-12 text-center">
                  <Tag className="w-12 h-12 sm:w-16 sm:h-16 text-muted-foreground mb-4" />
                  <h3 className="text-base sm:text-lg font-medium text-foreground mb-2">
                    No files found with tag &ldquo;{tag}&rdquo;
                  </h3>
                  <p className="text-sm sm:text-base text-muted-foreground mb-4 px-4">
                    {searchQuery 
                      ? `No files match your search criteria within this tag.`
                      : `You don't have any files tagged with "${tag}" yet.`
                    }
                  </p>
                  <Button onClick={handleBackClick} variant="outline" size="sm">
                    Go Back
                  </Button>
                </div>
              ) : (
                <>
                  {viewMode === "grid" ? (
                    <FileGrid 
                      files={files} 
                      selectedFiles={selectedFiles}
                      onToggleSelection={toggleFileSelection}
                      onFolderClick={handleFileClick}
                    />
                  ) : (
                    <FileList
                      files={files} 
                      selectedFiles={selectedFiles}
                      onToggleSelection={toggleFileSelection}
                      onFolderClick={handleFileClick}
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
