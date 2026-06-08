import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { encryptFileWithLit, initLitClient } from "@/lib/litClient";
import { config } from "@/config";
import { calculateStorageMetrics } from "@/utils";
import { usePayment } from "./usePayment";
import { useConnection } from "wagmi";
import { useSynapse } from "@/providers/SynapseProvider";
import { useAddFile } from "./useContract";
import { classifyFile } from "@/utils/fileClassification";

export type UploadedInfo = {
  fileName?: string;
  fileSize?: number;
  pieceCid?: string;
  txHash?: string;
  encrypted?: boolean;
  dataToEncryptHash?: string;
  fileType?: string;
  // Metadata from Lit encryption
  encryptedMetadata?: {
    dataToEncryptHash: string;
    originalFileName: string;
    originalFileSize: number;
    originalFileType: string;
    encryptedAt: number;
  };
};

/**
 * Hook to upload a file to the Filecoin network using Synapse.
 * Also automatically adds the file to a folder contract after upload.
 */
export const useFileUpload = (folderId: string) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [uploadedInfo, setUploadedInfo] = useState<UploadedInfo | null>(null);
  const [isAddingToContract, setIsAddingToContract] = useState(false);
  const [contractAddError, setContractAddError] = useState<string | null>(null);
  const { address, chainId } = useConnection();
  const { mutation: paymentMutation } = usePayment();
  const queryClient = useQueryClient();
  const { getSynapse } = useSynapse();
  const addFile = useAddFile();

  const mutation = useMutation({
    mutationKey: ["file-upload", address],
    mutationFn: async ({ file, encrypt = false }: { file: File; encrypt?: boolean }) => {
      if (!address) throw new Error("Address not found");
      setProgress(0);
      setUploadedInfo(null);
      setStatus("Initializing file upload to Filecoin...");

      let fileToUpload = file;
      let encryptedMetadata: UploadedInfo["encryptedMetadata"];

      // Optional encryption step
      if (encrypt) {
        setStatus("Initializing Lit Protocol...");
        setProgress(5);

        try {
          await initLitClient();
          setStatus("Encrypting file with Lit Protocol...");
          setProgress(10);

          const encrypted = await encryptFileWithLit(file, folderId);

          // Convert ciphertext to a Blob/File for upload
          const encryptedBlob = new Blob([encrypted.ciphertext], {
            type: "application/octet-stream"
          });
          fileToUpload = new File([encryptedBlob], `${file.name}.encrypted`, {
            type: "application/octet-stream"
          });

          encryptedMetadata = {
            dataToEncryptHash: encrypted.dataToEncryptHash,
            originalFileName: encrypted.originalFileName,
            originalFileSize: encrypted.originalFileSize,
            originalFileType: encrypted.originalFileType,
            encryptedAt: encrypted.encryptedAt,
          };

          setStatus("File encrypted successfully...");
          setProgress(15);
        } catch (error) {
          console.error("Encryption error:", error);
          throw new Error(`Encryption failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Convert File → Uint8Array bytes for the SDK upload path
      const arrayBuffer = await fileToUpload.arrayBuffer();
      const uint8ArrayBytes = new Uint8Array(arrayBuffer);

      // Ensure synapse instance is available
      const synapse = await getSynapse();

      setStatus("Checking USDFC balance and storage allowances...");
      setProgress(encrypt ? 20 : 5);
      const { isSufficient, depositNeeded } =
        await calculateStorageMetrics(synapse, config, file.size);
      if (!isSufficient) {
        setStatus(
          "Insufficient storage balance, setting up your storage configuration..."
        );
        await paymentMutation.mutateAsync({
          depositAmount: depositNeeded
        });
        setStatus("Storage configuration setup complete...");
      }

      setStatus("Setting up storage service and dataset...");
      setProgress(encrypt ? 30 : 25);

      let storageService;
      try {
        storageService = await synapse.storage.createContext({
          withCDN: true,
          callbacks: {
            onDataSetResolved: (info) => {
              console.log("Dataset resolved:", info);
              setStatus("Existing dataset found and resolved...");
              setProgress(encrypt ? 35 : 30);
            },
            onProviderSelected: (provider) => {
              console.log("Storage provider selected:", provider);
              setStatus(`Storage provider selected (id ${provider.id})`);
              setProgress(encrypt ? 40 : 35);
            },
          },
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("recordKeeper address not allowed") || errorMessage.includes("403")) {
          throw new Error(
            "Storage not set up. Please visit the Storage Manager to buy storage capacity before uploading files."
          );
        }
        throw error;
      }

      setStatus("Uploading file to storage provider...");
      setProgress(encrypt ? 60 : 55);

      // Upload file to storage provider
      const uploadResult = await storageService.upload(uint8ArrayBytes, {
        onStored: (_providerId, piece) => {
          setStatus(`Piece CID generated`);
          setUploadedInfo((prev) => ({
            ...prev,
            fileName: encrypt ? file.name : fileToUpload.name,
            fileSize: file.size,
            pieceCid: piece.toV1().toString(),
            encrypted: encrypt,
            fileType: file.type || "application/octet-stream",
            dataToEncryptHash: encryptedMetadata?.dataToEncryptHash || "",
            encryptedMetadata: encryptedMetadata,
          }));
          setProgress(80);
        },
        onPiecesAdded: (transaction) => {
          setStatus("Transaction submitted to chain...");
          setUploadedInfo((prev) => ({
            ...prev,
            txHash: transaction,
          }));
          setProgress(85);
        },
        onPiecesConfirmed: () => {
          setStatus("Data pieces confirmed on chain...");
          setProgress(90);
        },
      });

      setProgress(encrypt ? 88 : 85);
      const finalUploadInfo: UploadedInfo = {
        fileName: encrypt ? file.name : fileToUpload.name,
        fileSize: file.size,
        pieceCid: uploadResult.pieceCid.toV1().toString(),
        encrypted: encrypt,
        fileType: file.type || "application/octet-stream",
        dataToEncryptHash: encryptedMetadata?.dataToEncryptHash || "",
        encryptedMetadata: encryptedMetadata,
      };

      setUploadedInfo(finalUploadInfo);
      setStatus("File stored on Filecoin...");

      // Add file to contract - do this INSIDE mutationFn
      setProgress(90);
        setIsAddingToContract(true);
        setContractAddError(null);

        // Add a small delay to ensure state updates
        await new Promise(resolve => setTimeout(resolve, 500));

        try {
          setStatus("Organizing file in your folder...");
          setProgress(92);
          const tags = classifyFile(file);

          if (!finalUploadInfo.pieceCid || !finalUploadInfo.fileName) {
            throw new Error("Missing required upload information (CID or filename)");
          }

          await addFile.mutateAsync({
            tokenId: folderId,
            cid: finalUploadInfo.pieceCid,
            filename: finalUploadInfo.fileName,
            tags: tags,
            encrypted: finalUploadInfo.encrypted || false,
            dataToEncryptHash: finalUploadInfo.encryptedMetadata?.dataToEncryptHash || "",
            fileType: finalUploadInfo.encrypted && finalUploadInfo.encryptedMetadata
              ? finalUploadInfo.encryptedMetadata.originalFileType
              : (finalUploadInfo.fileType || file.type || "application/octet-stream"),
          });

          setStatus("File uploaded successfully!");
          setProgress(100);
        } catch (error) {
          console.error("❌ Error adding file to contract:", error);
          const errorMessage = error instanceof Error ? error.message : "Failed to add file to folder";

          // Check if user rejected the transaction
          if (errorMessage.includes("user rejected") || errorMessage.includes("User denied")) {
            setContractAddError("Transaction cancelled. File uploaded but not added to folder. Please reset and try again.");
          } else {
            setContractAddError(errorMessage);
          }
          setProgress(100); // Complete even on error so modal can close
        } finally {
          setIsAddingToContract(false);
        }

      // Return the upload info
      return finalUploadInfo;
    },
    onSuccess: (uploadInfo, variables) => {
      console.log("File upload mutation successful:", uploadInfo, variables);
      queryClient.invalidateQueries({
        queryKey: ["balances", address, config, chainId],
      });
      queryClient.invalidateQueries({
        queryKey: ["datasets", address, chainId],
      });
    },
    onError: (error) => {
      console.error("Upload failed:", error);
      setStatus(`Upload failed: ${error.message || "Please try again"}`);
      setProgress(0);
    },
  });

  const handleReset = () => {
    setProgress(0);
    setUploadedInfo(null);
    setStatus("");
    setIsAddingToContract(false);
    setContractAddError(null);
  };

  return {
    uploadFileMutation: mutation,
    progress,
    uploadedInfo,
    handleReset,
    status,
    isAddingToContract,
    contractAddError,
  };
};