"use client";

import { useState, useEffect } from "react";
import { Lock, AlertCircle, CheckCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useConnection, usePublicClient, useWalletClient } from "wagmi";
import { erc20Abi } from "viem";
import { CONTRACT_ABI, CONTRACT_ADDRESS } from "@/utils/contracts";
import { usePaymentToken } from "@/hooks/useContract";

interface PayAccessDialogProps {
  children: React.ReactNode;
  folderId: string;
  folderName: string;
  viewingPrice: bigint;
  onSuccess?: () => void;
}

const formatPrice = (price: bigint) => {
  // USDFC has 6 decimals
  const priceInUSDFC = Number(price) / 1_000_000;
  return priceInUSDFC.toFixed(2);
};

export default function PayAccessDialog({
  children,
  folderId,
  folderName,
  viewingPrice,
  onSuccess
}: PayAccessDialogProps) {
  const [open, setOpen] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(true);
  const [isCheckingAllowance, setIsCheckingAllowance] = useState(false);
  const [hasCheckedAllowance, setHasCheckedAllowance] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isPaying, setIsPaying] = useState(false);

  const { address, isConnected } = useConnection();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { data: paymentTokenAddress } = usePaymentToken();

  // Check allowance when dialog opens or after approval
  useEffect(() => {
    if (!open) {
      setHasCheckedAllowance(false);
      setNeedsApproval(true);
      return;
    }

    if (hasCheckedAllowance || isCheckingAllowance) {
      return;
    }

    const checkAllowance = async () => {
      if (!address || !paymentTokenAddress || !publicClient) {
        return;
      }

      setIsCheckingAllowance(true);
      try {
        const allowance = await publicClient.readContract({
          address: paymentTokenAddress,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, CONTRACT_ADDRESS],
        });

        setNeedsApproval(allowance < viewingPrice);
        setHasCheckedAllowance(true);
      } catch (error) {
        console.error("Error checking allowance:", error);
        setNeedsApproval(true);
      } finally {
        setIsCheckingAllowance(false);
      }
    };

    checkAllowance();
  }, [open, address, paymentTokenAddress, publicClient, viewingPrice, hasCheckedAllowance, isCheckingAllowance]);

  const handleApprove = async () => {
    if (!paymentTokenAddress || !walletClient || !publicClient) return;
    setIsApproving(true);
    try {
      const hash = await walletClient.writeContract({
        address: paymentTokenAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [CONTRACT_ADDRESS, viewingPrice],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setHasCheckedAllowance(false);
      setNeedsApproval(false);
    } catch (error) {
      console.error("Approval failed:", error);
    } finally {
      setIsApproving(false);
    }
  };

  const handlePayment = async () => {
    if (!walletClient || !publicClient) return;
    setIsPaying(true);
    try {
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "payForViewAccess",
        args: [BigInt(folderId)],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setOpen(false);
      onSuccess?.();
    } catch (error) {
      console.error("Payment failed:", error);
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Lock className="w-5 h-5 text-primary" />
            Pay for Access
          </DialogTitle>
          <DialogDescription className="text-sm">
            Purchase access to {folderName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Price Info - Compact */}
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
            <span className="text-sm font-medium text-foreground">Access Price</span>
            <span className="text-lg font-semibold text-primary">
              {formatPrice(viewingPrice)} USDFC
            </span>
          </div>

          {/* Payment Steps - Compact */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
            <div className={`flex items-center gap-1.5 ${needsApproval && !isCheckingAllowance ? "text-primary font-medium" : needsApproval ? "" : "text-green-600"}`}>
              {!needsApproval ? (
                <CheckCircle className="w-3.5 h-3.5" />
              ) : (
                <div className={`w-1.5 h-1.5 rounded-full ${needsApproval && !isCheckingAllowance ? "bg-primary" : "bg-muted"}`} />
              )}
              <span>Approve</span>
            </div>
            <div className="flex-1 h-px bg-border" />
            <div className={`flex items-center gap-1.5 ${!needsApproval && !isCheckingAllowance ? "text-primary font-medium" : ""}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${!needsApproval && !isCheckingAllowance ? "bg-primary" : "bg-muted"}`} />
              <span>Payment</span>
            </div>
          </div>

          {/* Step 1: Approval Widget */}
          {isConnected && paymentTokenAddress && needsApproval && !isCheckingAllowance && (
            <div className="space-y-2 mx-auto flex">
              <Button
                onClick={handleApprove}
                disabled={isApproving}
                className="w-full"
              >
                {isApproving ? "Approving..." : "Approve Token Spending"}
              </Button>
            </div>
          )}

          {/* Step 2: Payment Widget */}
          {isConnected && !needsApproval && !isCheckingAllowance && (
            <div className="space-y-2 mx-auto flex">
              <Button
                onClick={handlePayment}
                disabled={isPaying}
                className="w-full"
              >
                {isPaying ? "Processing..." : `Complete Payment (${formatPrice(viewingPrice)} USDFC)`}
              </Button>
            </div>
          )}

          {/* Checking allowance */}
          {isCheckingAllowance && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 bg-muted/30 rounded-lg">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span>Checking allowance...</span>
            </div>
          )}

          {/* No wallet connected */}
          {!isConnected && (
            <Alert className="border-yellow-200 bg-yellow-50 py-3">
              <AlertCircle className="w-4 h-4 text-yellow-600" />
              <div className="ml-2 text-sm text-yellow-800">
                Connect your wallet to proceed
              </div>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
