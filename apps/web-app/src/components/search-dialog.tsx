"use client";

import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { AlertCircle, Search, Loader2, CheckCircle, BrainCircuit } from "lucide-react";
import Image from "next/image";
import { useAI } from "@/hooks/useAI";

type ResultType = "image" | "pdf" | "document" | "audio" | "video" | "spreadsheet" | "presentation" | "other" | "text";
import { Card, CardContent } from "./ui/card";

interface SearchDialogProps {
  children: React.ReactNode;
  folderId: string;
}

export default function SearchDialog({ children, folderId }: SearchDialogProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const {
    searchEmbeddings,
    isSearching,
    searchResults,
    searchStatus,
    searchError,
    resetSearch,
    isServerHealthy,
  } = useAI();

  const collection_name = useMemo(() => `Folder${folderId}`, [folderId]);

  // Use collections hook to check if collection exists
  const { getCollectionDetails } = useAI();
  const {
    data: collectionDetails,
    isLoading: isCollectionLoading,
  } = getCollectionDetails(collection_name, { enabled: open });

  const collectionExists = collectionDetails?.exists;

  const handleSearch = async () => {
    if (!query.trim() || !collectionExists) return;
    searchEmbeddings({
      query: query.trim(),
      collection_name,
    });
  };

  const getLogoSrc = (type: ResultType) => {
    switch (type) {
      case 'image':
        return '/logos/image.png';
      case 'pdf':
        return '/logos/pdf.png';
      case 'document':
        return '/logos/document.png';
      case 'audio':
        return '/logos/audio.png';
      case 'video':
        return '/logos/video.png';
      case 'spreadsheet':
        return '/logos/spreadsheet.png';
      case 'presentation':
        return '/logos/presentation.png';
      default:
        return '/logos/other.png';
    }
  };

  const handleResultClick = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const canSearch = isServerHealthy && query.trim();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BrainCircuit className="w-5 h-5" />
            Semantic Search
          </DialogTitle>
          <DialogDescription>
            Search through your folder files using natural language
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 p-2">
          {/* Server and Embed File Status */}
          <div className="space-y-3">
            {isCollectionLoading ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Checking Collection...
                </Badge>
              </div>
            ) : collectionExists ? (
              <div className="flex items-center gap-2">
                <Badge variant="default" className="text-xs">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Embeddings Found
                </Badge>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Badge variant="destructive" className="text-xs">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  No Embeddings
                </Badge>
                <span className="text-xs text-muted-foreground font-light">
                  Please embed for your folder files to enable semantic search.
                </span>
              </div>
            )}
          </div>

          {/* Search Input */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Input
                placeholder="Enter prompt to search your file"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && canSearch && handleSearch()}
                className="w-full"
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSearch}
                disabled={!canSearch || !collectionExists || isCollectionLoading || isSearching}
                className="flex-1"
              >
                {isSearching ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Search
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  resetSearch();
                  setQuery("");
                }}
              >
                Clear
              </Button>
            </div>
          </div>

          {/* Search Status */}
          {searchStatus && (
            <div className="p-3 bg-muted rounded">
              <p className="text-sm">{searchStatus}</p>
            </div>
          )}

          {/* Search Error */}
          {searchError && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
              <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
              <div className="text-sm text-destructive">
                {searchError.message}
              </div>
            </div>
          )}

          {/* Search Results */}
          {searchResults && searchResults.results.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">
                  Search Results ({searchResults.results.length})
                </h3>
                <Badge variant="secondary" className="text-xs">
                  {searchResults.total_results} files indexed
                </Badge>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto">
                {searchResults.results.map((result, index) => (
                  <Card
                    key={index}
                    className="cursor-pointer hover:bg-primary/10 hover:shadow-sm transition-shadow"
                    onClick={() => handleResultClick(result.url)}
                  >
                    <CardContent className="p-4">
                      <div className="flex flex-row items-center gap-3">
                        <div className="flex flex-row items-center justify-center gap-1">
                          <div className="w-8 h-8 flex items-center justify-center rounded-full bg-muted text-xs text-muted-foreground font-medium">
                            {index + 1}
                          </div>
                          <Image
                            src={getLogoSrc(result.type)}
                            alt={result.type}
                            width={28}
                            height={28}
                            className="mt-1 object-contain my-auto items-center"
                          />
                        </div>

                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-light truncate">
                              {result.filename}
                            </span>

                          {result.excerpt && (
                            <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                              {result.excerpt}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* No Results */}
          {searchResults && searchResults.results.length === 0 && (
            <div className="text-center p-6 text-muted-foreground">
              <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm">No results found for `${searchResults.query}`</p>
              <p className="text-xs mt-1">Try different keywords or check your embeddings</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
