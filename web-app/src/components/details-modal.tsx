"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Calendar,
  User,
  Globe,
  Tag,
  Link,
  Copy,
  Check,
} from "lucide-react";
import { FileItem } from "@/types";
import Image from "next/image";

interface DetailsModalProps {
  file: FileItem;
  children: React.ReactNode;
}

const getFileLogo = (type: FileItem["type"]) => {
  switch (type) {
    case "folder":
      return "/logos/folder.png";
    case "document":
      return "/logos/document.png";
    case "image":
      return "/logos/image.png";
    case "video":
      return "/logos/video.png";
    case "pdf":
      return "/logos/pdf.png";
    case "audio":
      return "/logos/audio.png";
    case "presentation":
      return "/logos/ppt.png";
    case "spreadsheet":
      return "/logos/excel.png";
    case "other":
      return "/logos/other.png";
    default:
      return "/logos/other.png";
  }
};

export default function DetailsModal({ file, children }: DetailsModalProps) {
  const [open, setOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  
  const logoSrc = getFileLogo(file.type);
  const fileUrl = file.type !== "folder" && file.cid 
    ? `https://${file.owner}.calibration.filcdn.io/${file.cid}` 
    : null;

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error("Failed to copy: ", err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 sm:gap-3">
            <Image 
              src={logoSrc} 
              alt={file.type} 
              width={20} 
              height={20}
              className="sm:w-6 sm:h-6 flex-shrink-0"
            />
            <span className="break-all line-clamp-2 text-sm sm:text-base">{file.name}</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 sm:space-y-6">
          {/* General Information */}
          <div className="space-y-3 sm:space-y-4">
            <h3 className="text-base sm:text-lg font-medium">General Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              
              <div className="space-y-2">
                <label className="text-xs sm:text-sm font-medium text-muted-foreground">Type</label>
                <p className="text-xs sm:text-sm bg-muted/30 p-2 rounded border border-border capitalize">{file.type}</p>
              </div>
              
              {file.size && (
                <div className="space-y-2">
                  <label className="text-xs sm:text-sm font-medium text-muted-foreground">Size</label>
                  <p className="text-xs sm:text-sm bg-muted/30 p-2 rounded border border-border">{file.size}</p>
                </div>
              )}
              
              <div className="space-y-2">
                <label className="text-xs sm:text-sm font-medium text-muted-foreground">Last Modified</label>
                <p className="text-xs sm:text-sm bg-muted/30 p-2 rounded border border-border flex items-center gap-2">
                  <Calendar className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                  <span className="truncate">{file.modified}</span>
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Ownership & Permissions */}
          <div className="space-y-3 sm:space-y-4">
            <h3 className="text-base sm:text-lg font-medium">Ownership & Permissions</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <label className="text-xs sm:text-sm font-medium text-muted-foreground">Owner</label>
                <div className="flex items-center gap-2">
                  <p className="text-xs sm:text-sm bg-muted/30 p-2 rounded border border-border flex-1 break-all max-w-full">
                    {file.owner}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(file.owner, "owner")}
                    className="h-8 w-8 p-0 flex-shrink-0"
                  >
                    {copiedField === "owner" ? (
                      <Check className="w-4 h-4 text-primary" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-xs sm:text-sm font-medium text-muted-foreground">Visibility</label>
                <div className="flex items-center gap-2">
                  {file.shared ? (
                    <Badge variant="secondary" className="text-xs">
                      <Globe className="w-3 h-3 mr-1" />
                      Public
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      <User className="w-3 h-3 mr-1" />
                      Private
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Blockchain Information */}
          <div className="space-y-3 sm:space-y-4">
            <h3 className="text-base sm:text-lg font-medium">Blockchain Information</h3>
            
            <div className="grid grid-cols-1 gap-3 sm:gap-4">
              {file.tokenId && (
                <div className="space-y-2">
                  <label className="text-xs sm:text-sm font-medium text-muted-foreground">Token ID</label>
                  <div className="flex items-center gap-2">
                    <p className="text-xs sm:text-sm bg-muted/30 p-2 rounded border border-border flex-1 break-all max-w-full">
                      {file.tokenId}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(file.tokenId!, "tokenId")}
                      className="h-8 w-8 p-0 flex-shrink-0"
                    >
                      {copiedField === "tokenId" ? (
                        <Check className="w-4 h-4 text-primary" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
              
              {file.cid && (
                <div className="space-y-2">
                  <label className="text-xs sm:text-sm font-medium text-muted-foreground">Content ID (CID)</label>
                  <div className="flex items-center gap-2">
                    <p className="text-xs sm:text-sm bg-muted/30 p-2 rounded border border-border flex-1 break-all max-w-full">
                      {file.cid}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(file.cid!, "cid")}
                      className="h-8 w-8 p-0 flex-shrink-0"
                    >
                      {copiedField === "cid" ? (
                        <Check className="w-4 h-4 text-primary" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* File Access (for non-folders) */}
          {file.type !== "folder" && fileUrl && (
            <>
              <Separator />
              <div className="space-y-3 sm:space-y-4">
                <h3 className="text-base sm:text-lg font-medium">File Access</h3>
                
                <div className="space-y-2">
                  <label className="text-xs sm:text-sm font-medium text-muted-foreground">IPFS/Filecoin URL</label>
                  <div className="flex items-center gap-2">
                    <p className="text-xs sm:text-sm bg-muted/30 p-2 rounded border border-border flex-1 break-all max-w-full">
                      {fileUrl}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(fileUrl, "url")}
                      className="h-8 w-8 p-0 flex-shrink-0"
                    >
                      {copiedField === "url" ? (
                        <Check className="w-4 h-4 text-primary" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(fileUrl, "_blank")}
                    className="flex items-center gap-2 text-xs sm:text-sm"
                  >
                    <Link className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span>Open File</span>
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* Tags/Metadata (if available) */}
          {file.tags && file.tags.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3 sm:space-y-4">
                <h3 className="text-base sm:text-lg font-medium">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {file.tags.map((tag, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      <Tag className="w-3 h-3 mr-1 flex-shrink-0" />
                      <span className="break-all">{tag}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
