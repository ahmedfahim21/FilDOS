"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Folder, Minus, Loader2 } from "lucide-react";
import { useModal } from "@/providers/ModalProvider";

interface CreateFolderModalProps {
  onCreateFolder: (name: string, folderType?: string, viewingPrice?: string) => Promise<void>;
  modalId: string;
}

export default function CreateFolderModal({ 
  onCreateFolder,
  modalId 
}: CreateFolderModalProps) {
  const [folderName, setFolderName] = useState("");
  const [folderType, setFolderType] = useState("personal");
  const [isCreating, setIsCreating] = useState(false);
  const { minimizeModal, updateModalMetadata, closeModal } = useModal();

  useEffect(() => {
    updateModalMetadata(modalId, {
      title: folderName ? `Creating "${folderName}"` : "Create Folder",
      status: isCreating ? "Creating..." : undefined,
      preventClose: isCreating,
    });
  }, [modalId, folderName, isCreating, updateModalMetadata]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) return;

    setIsCreating(true);
    try {
      await onCreateFolder(
        folderName.trim(), 
        folderType, 
        "0"
      );
      closeModal(modalId);
    } catch (error) {
      console.error("Error creating folder:", error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-start justify-between mb-4 pr-8">
        <div className="space-y-1">
          <h2 className="text-lg sm:text-xl flex items-center gap-2 leading-none font-medium py-2">
            <Folder className="h-5 w-5 sm:h-6 sm:w-6" />
            Create New Folder
          </h2>
          <p className="text-sm text-muted-foreground">
            Create a new folder NFT to organize your files.
          </p>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => minimizeModal(modalId)} 
          className="h-8 w-8 shrink-0"
        >
          <Minus className="h-4 w-4" />
        </Button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input
              id="name"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              className="col-span-3"
              placeholder="Enter folder name"
              required
              disabled={isCreating}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="type" className="text-right">
              Type
            </Label>
            <select
              id="type"
              value={folderType}
              onChange={(e) => setFolderType(e.target.value)}
              disabled={isCreating}
              className="col-span-3 flex h-9 w-full rounded-sm border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="personal">Personal</option>
              <option value="work">Work</option>
              <option value="agent">For Agent</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => closeModal(modalId)}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isCreating || !folderName.trim()}>
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Folder"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
