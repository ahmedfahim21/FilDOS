"use client";

import { useState } from "react";
import { Share, Users, Eye, Edit, X, Lock, Globe, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useShareFolder, useFolderSharees, useRevokeShare, useFolderData } from "@/hooks/useContract";
import { useConnection } from "wagmi";

// Format USDFC (6 decimals) to readable string
const formatUSDFC = (amount: bigint) => {
  const value = Number(amount) / 1_000_000; // 6 decimals
  return value.toFixed(2);
};

interface ShareFolderDialogProps {
  children: React.ReactNode;
  folderId: string;
  folderName: string;
}

export default function ShareFolderDialog({ children, folderId, folderName }: ShareFolderDialogProps) {
  const [open, setOpen] = useState(false);
  const [granteeAddress, setGranteeAddress] = useState("");
  const [canRead, setCanRead] = useState(true);
  const [canWrite, setCanWrite] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { address } = useConnection();
  const shareFolder = useShareFolder();
  const revokeShare = useRevokeShare();
  const { data: sharees } = useFolderSharees(folderId);
  const { data: folderData } = useFolderData(folderId);

  const handleShare = async () => {
    if (!granteeAddress.trim()) {
      alert("Please enter a valid wallet address");
      return;
    }

    if (granteeAddress.toLowerCase() === address?.toLowerCase()) {
      alert("You cannot share a folder with yourself");
      return;
    }

    setIsSubmitting(true);
    try {
      await shareFolder.mutateAsync({
        tokenId: folderId,
        grantee: granteeAddress,
        canRead,
        canWrite,
      });
      
      // Reset form
      setGranteeAddress("");
      setCanRead(true);
      setCanWrite(false);
      
    } catch (error) {
      console.error("Error sharing folder:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokeShare = async (shareId: string) => {
    const sharee = sharees?.sharees[sharees.shareIds.indexOf(shareId)];
    if (!confirm(`Are you sure you want to revoke access for ${sharee?.slice(0, 6)}...${sharee?.slice(-4)}?`)) {
      return;
    }

    try {
      await revokeShare.mutateAsync({ shareId });
    } catch (error) {
      console.error("Error revoking share:", error);
      alert("Failed to revoke access. Please try again.");
    }
  };

  const isValidAddress = (address: string) => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share className="w-5 h-5" />
            Share Folder
          </DialogTitle>
          <DialogDescription>
            Manage access to &quot;{folderName}&quot;
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Who Has Access Section */}
          <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
            <Label className="flex items-center gap-2 text-xs font-medium">
              <Users className="w-4 h-4" />
              Who Has Access
            </Label>
            
            <div className="space-y-2">
              {/* Owner */}
              {folderData && (
                <div className="flex items-center justify-between p-2 bg-background rounded-md">
                  <div className="flex items-center gap-2">
                    <Crown className="w-3 h-3 text-primary" />
                    <span 
                      className="font-mono text-xs cursor-help" 
                      title={folderData.owner}
                    >
                      {folderData.owner.slice(0, 6)}...{folderData.owner.slice(-4)}
                    </span>
                    <Badge variant="secondary" className="text-xs">Owner</Badge>
                  </div>
                </div>
              )}

              {/* Public Access */}
              {folderData?.isPublic && (
                <div className="flex items-center justify-between p-2 bg-background rounded-md">
                  <div className="flex items-center gap-2">
                    <Globe className="w-3 h-3 text-secondary" />
                    <span className="text-xs">Public Access</span>
                    {folderData.viewingPrice > 0 ? (
                      <Badge variant="outline" className="text-xs">
                        ${formatUSDFC(folderData.viewingPrice)} USDFC
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Free</Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Private Access */}
              {folderData && !folderData.isPublic && (
                <div className="flex items-center justify-between p-2 bg-background rounded-md">
                  <div className="flex items-center gap-2">
                    <Lock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Private Folder</span>
                  </div>
                </div>
              )}

              {/* Shared Users */}
              {sharees && sharees.sharees.length > 0 && (
                <>
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-2">Shared with {sharees.sharees.length} user{sharees.sharees.length > 1 ? 's' : ''}</p>
                  </div>
                  {sharees.sharees.map((sharee, index) => (
                    <div
                      key={sharees.shareIds[index]}
                      className="flex items-center justify-between p-2 bg-background rounded-md"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span 
                          className="font-mono text-xs truncate cursor-help"
                          title={sharee}
                        >
                          {sharee.slice(0, 6)}...{sharee.slice(-4)}
                        </span>
                        <div className="flex gap-1">
                          {sharees.canReadList[index] && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0">
                              <Eye className="w-3 h-3" />
                            </Badge>
                          )}
                          {sharees.canWriteList[index] && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0">
                              <Edit className="w-3 h-3" />
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleRevokeShare(sharees.shareIds[index])}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </>
              )}

              {/* No shared users */}
              {(!sharees || sharees.sharees.length === 0) && folderData && !folderData.isPublic && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground">Not shared with anyone yet</p>
                </div>
              )}
            </div>
          </div>

          {/* Add New Share Section */}
          <div className="space-y-2">
            <Label htmlFor="grantee">Share with</Label>
            <Input
              id="grantee"
              type="text"
              placeholder="0x..."
              value={granteeAddress}
              onChange={(e) => setGranteeAddress(e.target.value)}
              className={`${
                granteeAddress && !isValidAddress(granteeAddress) 
                  ? "border-destructive focus:border-destructive" 
                  : ""
              }`}
            />
            {granteeAddress && !isValidAddress(granteeAddress) && (
              <p className="text-sm text-destructive">Please enter a valid Ethereum address</p>
            )}
          </div>

          <div className="space-y-3">
            <Label>Permissions</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="canRead"
                  checked={canRead}
                  onCheckedChange={(checked) => setCanRead(checked === true)}
                />
                <Label htmlFor="canRead" className="flex items-center gap-2 text-sm">
                  <Eye className="w-4 h-4" />
                  Can view folder and files
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="canWrite"
                  checked={canWrite}
                  onCheckedChange={(checked) => setCanWrite(checked === true)}
                />
                <Label htmlFor="canWrite" className="flex items-center gap-2 text-sm">
                  <Edit className="w-4 h-4" />
                  Can add and modify files
                </Label>
              </div>
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
              onClick={handleShare}
              disabled={!granteeAddress || !isValidAddress(granteeAddress) || (!canRead && !canWrite) || isSubmitting}
            >
              {isSubmitting ? "Sharing..." : "Share Folder"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
