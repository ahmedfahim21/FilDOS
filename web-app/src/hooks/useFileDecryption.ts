import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { decryptFileWithLit, initLitClient } from "@/lib/litClient";
import { useConnection, useWalletClient } from "wagmi";

export const useFileDecryption = () => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const { address } = useConnection();
  const { data: walletClient } = useWalletClient();

  const mutation = useMutation({
    mutationKey: ["file-decryption", address],
    mutationFn: async ({
      ciphertext,
      dataToEncryptHash,
      metadata,
      tokenId,
    }: {
      ciphertext: string;
      dataToEncryptHash: string;
      metadata: {
        originalFileName: string;
        originalFileSize: number;
        originalFileType: string;
      };
      tokenId: string;
    }) => {
      if (!address) throw new Error("Address not found");
      if (!walletClient) throw new Error("Wallet client not available");

      // Reset state at the start of each new decryption
      setProgress(0);
      setStatus("Initializing Lit Protocol...");

      try {
        setProgress(10);
        await initLitClient();

        setStatus("Getting session signatures...");
        setProgress(25);

        setStatus("Decrypting file...");
        setProgress(50);

        const decryptedFile = await decryptFileWithLit(
          ciphertext,
          dataToEncryptHash,
          metadata,
          tokenId,
          walletClient
        );

        setStatus("Decryption complete!");
        setProgress(100);

        return decryptedFile;
      } catch (error) {
        console.error("Decryption error:", error);
        setProgress(0);
        setStatus("");
        throw new Error(
          `Decryption failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
    onSuccess: () => {
      // Keep the success state briefly before reset
      setTimeout(() => {
        setProgress(0);
        setStatus("");
      }, 1000);
    },
    onError: (error) => {
      console.error("Decryption failed:", error);
      setStatus(`❌ Decryption failed: ${error.message || "Please try again"}`);
      setProgress(0);
    },
  });

  const handleReset = () => {
    setProgress(0);
    setStatus("");
  };

  return {
    decryptFileMutation: mutation,
    progress,
    status,
    handleReset,
  };
};
