"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useViewingPrice, useSetViewingPrice } from "@/hooks/useContract";
import { Loader2 } from "lucide-react";

interface UpdatePriceDialogProps {
  children: React.ReactNode;
  folderId: string;
  folderName: string;
}

export default function UpdatePriceDialog({ 
  children, 
  folderId,
  folderName
}: UpdatePriceDialogProps) {
  const [open, setOpen] = useState(false);
  const [isFree, setIsFree] = useState(true);
  const [viewingPrice, setViewingPrice] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const { data: currentPrice, isLoading } = useViewingPrice(folderId);
  const { mutateAsync: setPrice } = useSetViewingPrice();

  // Initialize form with current price
  useEffect(() => {
    if (currentPrice !== undefined) {
      // currentPrice is already in USDFC units (6 decimals)
      const priceValue = Number(currentPrice) / 1_000_000; // Convert from 6 decimals to decimal
      setIsFree(priceValue === 0);
      setViewingPrice(priceValue > 0 ? priceValue.toString() : "");
    }
  }, [currentPrice]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFree && (!viewingPrice || parseFloat(viewingPrice) <= 0)) {
      alert("Please enter a valid viewing price");
      return;
    }

    setIsUpdating(true);
    try {
      const priceInUSDFC = isFree 
        ? BigInt(0) 
        : BigInt(Math.floor(parseFloat(viewingPrice) * 1_000_000));
      await setPrice({ tokenId: folderId, price: priceInUSDFC });
      setOpen(false);
    } catch (error) {
      console.error("Error updating price:", error);
      alert("Failed to update price. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Update Viewing Price</DialogTitle>
          <DialogDescription>
            Change the viewing price for &quot;{folderName}&quot;
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="current-price" className="text-right">
                  Current Price
                </Label>
                <div className="col-span-3 text-sm text-muted-foreground">
                  {currentPrice !== undefined
                    ? Number(currentPrice) === 0
                      ? "Free"
                      : `${(Number(currentPrice) / 1_000_000).toFixed(2)} USDFC`
                    : "Loading..."}
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="free" className="text-right">
                  Free Access
                </Label>
                <div className="col-span-3 flex items-center gap-2">
                  <Switch
                    id="free"
                    checked={isFree}
                    onCheckedChange={setIsFree}
                  />
                  <span className="text-sm text-muted-foreground">
                    {isFree ? "Anyone can view for free" : "Paid access only"}
                  </span>
                </div>
              </div>
              {!isFree && (
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="price" className="text-right">
                    New Price (USDFC)
                  </Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={viewingPrice}
                    onChange={(e) => setViewingPrice(e.target.value)}
                    className="col-span-3"
                    placeholder="Enter price in USDFC"
                    required={!isFree}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isUpdating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isUpdating}>
                {isUpdating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Price"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
