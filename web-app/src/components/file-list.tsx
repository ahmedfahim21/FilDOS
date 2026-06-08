"use client";

import {
  MoreVertical,
  Share,
  Globe,
  Info,
  DollarSign,
  MoveIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { FileItem } from "@/types";
import ShareFolderDialog from "@/components/share-folder-dialog";
import MakePublicDialog from "@/components/make-public-dialog";
import DetailsModal from "@/components/details-modal";
import FilePreviewModal from "@/components/preview-modal";
import UpdatePriceDialog from "@/components/update-price-dialog";
import MoveFileDialog from "@/components/move-file-dialog";
import { useState } from "react";
import Image from "next/image";

interface FileListProps {
  files: FileItem[];
  selectedFiles: string[];
  onToggleSelection: (fileId: string) => void;
  onFolderClick?: (folderId?: string, url?: string) => void;
  currentFolderId?: string; // Add current folder ID for move functionality
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

export default function FileList({ files, selectedFiles, onToggleSelection, onFolderClick, currentFolderId }: FileListProps) {
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [clickTimeout, setClickTimeout] = useState<NodeJS.Timeout | null>(null);
  const [clickCount, setClickCount] = useState(0);
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const allSelected = files.length > 0 && selectedFiles.length === files.length;

  const handleFileClick = (file: FileItem) => {
    if (file.type === "folder" && onFolderClick && file.tokenId) {
      onFolderClick(file.tokenId);
    } else if (file.type !== "folder") {
      setPreviewFile(file);
      setIsPreviewOpen(true);
    }
  };

  const handleRowClick = (file: FileItem, e: React.MouseEvent | React.TouchEvent) => {
    // Don't handle click if it's on a button or dropdown menu
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[role="menu"]')) {
      return;
    }
    
    e.stopPropagation();
    
    // Reset if clicking a different file
    if (lastClickedId !== file.id) {
      if (clickTimeout) {
        clearTimeout(clickTimeout);
        setClickTimeout(null);
      }
      setClickCount(0);
      setLastClickedId(file.id);
    }

    // Clear existing timeout
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      setClickTimeout(null);
    }

    const newClickCount = clickCount + 1;
    setClickCount(newClickCount);

    if (newClickCount === 1) {
      // First click - wait to see if there's a second click
      const timeout = setTimeout(() => {
        // Single click - toggle selection
        onToggleSelection(file.id);
        setClickCount(0);
        setLastClickedId(null);
      }, 300); // 300ms delay to detect double click
      setClickTimeout(timeout);
    } else if (newClickCount === 2) {
      // Double click - open file/folder
      setClickCount(0);
      setLastClickedId(null);
      handleFileClick(file);
    }
  };

  const handleSelectAll = () => {
    if (allSelected) {
      files.forEach(file => {
        if (selectedFiles.includes(file.id)) {
          onToggleSelection(file.id);
        }
      });
    } else {
      files.forEach(file => {
        if (!selectedFiles.includes(file.id)) {
          onToggleSelection(file.id);
        }
      });
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6">

        <div className="bg-background border border-border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead className="w-12"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-32">Owner</TableHead>
                <TableHead className="w-32">Last modified</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => {
                const logoSrc = getFileLogo(file.type);
                const isSelected = selectedFiles.includes(file.id);

                return (
                  <TableRow
                    key={file.id}
                    className={`hover:bg-muted/50 cursor-pointer select-none ${
                      isSelected ? "bg-muted" : ""
                    }`}
                    onClick={(e) => handleRowClick(file, e)}
                    onTouchEnd={(e) => handleRowClick(file, e)}
                  >
                    <TableCell>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggleSelection(file.id)}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      />
                    </TableCell>
                    <TableCell>
                      <Image 
                        src={logoSrc} 
                        alt={file.type} 
                        width={20} 
                        height={20}
                      />
                    </TableCell>
                    <TableCell className="font-base">
                      <div className="flex items-center gap-2">
                        <span>{file.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {file.owner.slice(0, 6) + "..." + file.owner.slice(-4)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {file.modified}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <DetailsModal file={file}>
                              <div className="flex items-center cursor-pointer p-1 font-light">
                                <Info className="w-4 h-4 mr-2" />
                                Details
                              </div>
                            </DetailsModal>
                          </DropdownMenuItem>
                          {file.type !== "folder" && currentFolderId && file.cid && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem asChild>
                                <MoveFileDialog
                                  fileName={file.name}
                                  fileCid={file.cid}
                                  currentFolderId={currentFolderId}
                                >
                                  <div className="flex items-center cursor-pointer p-1 font-light">
                                    <MoveIcon className="w-4 h-4 mr-2" />
                                    Move
                                  </div>
                                </MoveFileDialog>
                              </DropdownMenuItem>
                            </>
                          )}
                          {file.type === "folder" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem asChild>
                                <ShareFolderDialog
                                  folderId={file.tokenId || file.id}
                                  folderName={file.name}
                                >
                                  <div className="flex items-center cursor-pointer p-1 font-light">
                                    <Share className="w-4 h-4 mr-2" />
                                    Share
                                  </div>
                                </ShareFolderDialog>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem asChild>
                                <MakePublicDialog
                                  folderId={file.tokenId || file.id}
                                  folderName={file.name}
                                  isCurrentlyPublic={file.shared}
                                >
                                  <div className="flex items-center cursor-pointer p-1 font-light">
                                    <Globe className="w-4 h-4 mr-2" />
                                    {file.shared ? "Make Private" : "Make Public"}
                                  </div>
                                </MakePublicDialog>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem asChild>
                                <UpdatePriceDialog
                                  folderId={file.tokenId || file.id}
                                  folderName={file.name}
                                >
                                  <div className="flex items-center cursor-pointer p-1 font-light">
                                    <DollarSign className="w-4 h-4 mr-2" />
                                    Update Price
                                  </div>
                                </UpdatePriceDialog>
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
      
      <FilePreviewModal
        file={previewFile}
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewFile(null);
        }}
      />
    </div>
  );
}
