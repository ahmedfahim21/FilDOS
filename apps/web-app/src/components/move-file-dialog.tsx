"use client";

import { useState } from "react";
import { MoveIcon, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useOwnedFolders, useMoveFile } from "@/hooks/useContract";
import { useFolderList } from "@/hooks/useFolderList";

interface MoveFileDialogProps {
  children: React.ReactNode;
  fileName: string;
  fileCid: string;
  currentFolderId: string;
}

export default function MoveFileDialog({ 
  children, 
  fileName, 
  fileCid,
  currentFolderId 
}: MoveFileDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: ownedFolderIds, isLoading: loadingFolderIds } = useOwnedFolders();
  const { folders, isLoading: loadingFolderData } = useFolderList(ownedFolderIds || []);
  const moveFile = useMoveFile();

  // Filter out the current folder from the list
  const availableFolders = folders.filter(
    (folder) => folder.tokenId !== currentFolderId
  );

  const handleMove = async () => {
    if (!selectedFolderId) {
      alert("Please select a destination folder");
      return;
    }

    setIsSubmitting(true);
    try {
      await moveFile.mutateAsync({
        fromTokenId: currentFolderId,
        toTokenId: selectedFolderId,
        cid: fileCid,
      });
      
      setOpen(false);
      setSelectedFolderId("");
    } catch (error) {
      console.error("Error moving file:", error);
      alert("Failed to move file. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MoveIcon className="w-5 h-5" />
            Move File
          </DialogTitle>
          <DialogDescription>
            Move &quot;{fileName}&quot; to another folder
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {loadingFolderIds || loadingFolderData ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-sm text-muted-foreground">Loading folders...</div>
            </div>
          ) : availableFolders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No other folders available
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Create a new folder to move files
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Select destination folder</Label>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {availableFolders.map((folder) => (
                    <div
                      key={folder.tokenId}
                      className={`flex items-center space-x-3 p-3 border rounded-md cursor-pointer transition-colors ${
                        selectedFolderId === folder.tokenId
                          ? "bg-primary/10 border-primary"
                          : "hover:bg-muted/50 border-border"
                      }`}
                      onClick={() => setSelectedFolderId(folder.tokenId)}
                    >
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          selectedFolderId === folder.tokenId
                            ? "border-primary bg-primary"
                            : "border-muted-foreground/30"
                        }`}
                      >
                        {selectedFolderId === folder.tokenId && (
                          <Check className="w-3 h-3 text-primary-foreground" />
                        )}
                      </div>
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="font-medium truncate text-sm">{folder.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {folder.folderType}
                          {folder.isPublic && " • Public"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleMove}
                  disabled={!selectedFolderId || isSubmitting}
                >
                  {isSubmitting ? "Moving..." : "Move File"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
