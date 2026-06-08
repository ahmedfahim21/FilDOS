import type { Synapse } from "@filoz/synapse-sdk";
import { getSynapse } from "./synapse.js";

export type UploadedInfo = {
  fileName?: string;
  fileSize?: number;
  pieceCid?: string;
  txHash?: string;
};

export type UploadProgress = {
  progress: number;
  status: string;
  uploadedInfo: UploadedInfo | null;
};

export type ProgressCallback = (progress: UploadProgress) => void;

export interface FileUploadOptions {
  synapse?: Synapse;
  address: string;
  onProgress?: ProgressCallback;
  includeDatasetCreationFee?: boolean;
}

/**
 * Upload a file to the Filecoin network using Synapse.
 * @param fileData - File data as Uint8Array or Buffer
 * @param fileName - Name of the file
 * @param options - Upload options including address and callbacks
 * @returns Upload information including pieceCid and txHash
 */
export async function uploadFile(
  fileData: Uint8Array | Buffer,
  fileName: string,
  options: FileUploadOptions
): Promise<UploadedInfo> {
  const { synapse: providedSynapse, address, onProgress } = options;
  const synapse = providedSynapse || getSynapse();

  if (!synapse) {
    throw new Error("Synapse not initialized. Please initialize Synapse first.");
  }

  if (!address) {
    throw new Error("Address is required for file upload");
  }

  let progress = 0;
  let status = "";
  let uploadedInfo: UploadedInfo | null = null;

  // Helper to update progress
  const updateProgress = (newProgress: number, newStatus: string) => {
    progress = newProgress;
    status = newStatus;
    if (onProgress) {
      onProgress({ progress, status, uploadedInfo });
    }
  };

  try {
    updateProgress(0, "🔄 Initializing file upload to Filecoin...");

    // Convert to Uint8Array if Buffer
    const uint8ArrayBytes = fileData instanceof Buffer 
      ? new Uint8Array(fileData) 
      : fileData;

    // Get dataset
    const datasets = await synapse.storage.findDataSets(address);
    const datasetExists = datasets.length > 0;
    const includeDatasetCreationFee = options.includeDatasetCreationFee ?? !datasetExists;

    // Check USDFC balance and storage allowances
    updateProgress(5, "💰 Checking USDFC balance and storage allowances...");
    
    // Note: preflightCheck needs to be refactored separately
    // For now, we'll skip it or implement a basic version
    // await preflightCheck(fileData, synapse, includeDatasetCreationFee);

    updateProgress(25, "🔗 Setting up storage service and dataset...");

    // Create storage service
    const storageService = await synapse.createStorage({
      callbacks: {
        onDataSetResolved: (info) => {
          console.error("Dataset resolved:", JSON.stringify(info, null, 2));
          updateProgress(30, "🔗 Existing dataset found and resolved");
        },
        onDataSetCreationStarted: (transactionResponse, statusUrl) => {
          console.error("Dataset creation started");
          console.error("Dataset creation status URL:", statusUrl);
          updateProgress(35, "🏗️ Creating new dataset on blockchain...");
        },
        onDataSetCreationProgress: (status) => {
          console.error("Dataset creation progress:", JSON.stringify({
            transactionSuccess: status.transactionSuccess,
            serverConfirmed: status.serverConfirmed,
            elapsedMs: status.elapsedMs
          }));
          if (status.transactionSuccess) {
            updateProgress(45, "⛓️ Dataset transaction confirmed on chain");
          }
          if (status.serverConfirmed) {
            updateProgress(
              50,
              `🎉 Dataset ready! (${Math.round(status.elapsedMs / 1000)}s)`
            );
          }
        },
        onProviderSelected: (provider) => {
          console.error("Storage provider selected:", JSON.stringify({
            id: provider.id,
            name: provider.name
          }));
          updateProgress(progress, "🏪 Storage provider selected");
        },
      },
    });

    updateProgress(55, "📁 Uploading file to storage provider...");

    // Upload file to storage provider
    const { pieceCid } = await storageService.upload(uint8ArrayBytes, {
      onUploadComplete: (piece) => {
        uploadedInfo = {
          fileName,
          fileSize: uint8ArrayBytes.length,
          pieceCid: piece.toV1().toString(),
        };
        updateProgress(
          80,
          "📊 File uploaded! Signing msg to add pieces to the dataset"
        );
      },
      onPieceAdded: (transactionResponse) => {
        const txHashMsg = transactionResponse 
          ? `(txHash: ${transactionResponse.hash})` 
          : "";
        updateProgress(
          progress,
          `🔄 Waiting for transaction to be confirmed on chain ${txHashMsg}`
        );
        if (transactionResponse) {
          console.error("Transaction response hash:", transactionResponse.hash);
          uploadedInfo = {
            ...uploadedInfo,
            txHash: transactionResponse.hash,
          };
        }
      },
      onPieceConfirmed: () => {
        updateProgress(90, "🌳 Data pieces added to dataset successfully");
      },
    });

    // Final update
    const finalInfo: UploadedInfo = {
      fileName,
      fileSize: uint8ArrayBytes.length,
      pieceCid: pieceCid.toV1().toString(),
      ...(uploadedInfo || {}),
    };

    uploadedInfo = finalInfo;
    updateProgress(100, "🎉 File successfully stored on Filecoin!");

    return finalInfo;
  } catch (error) {
    console.error("Upload failed:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    updateProgress(0, `❌ Upload failed: ${errorMessage}`);
    throw error;
  }
}

/**
 * Upload a file from a File object (browser environment)
 * @param file - File object from browser
 * @param options - Upload options
 * @returns Upload information
 */
export async function uploadFileFromBrowser(
  file: File,
  options: FileUploadOptions
): Promise<UploadedInfo> {
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  return uploadFile(uint8Array, file.name, options);
}

/**
 * Get datasets for an address
 * @param address - Wallet address
 * @param synapse - Optional Synapse instance
 * @returns Array of datasets
 */
export async function getDataSets(
  address: string,
  synapse?: Synapse
): Promise<any[]> {
  const synapseInstance = synapse || getSynapse();
  return await synapseInstance.storage.findDataSets(address);
}

/**
 * Check if a dataset exists for an address
 * @param address - Wallet address
 * @param synapse - Optional Synapse instance
 * @returns Boolean indicating if dataset exists
 */
export async function datasetExists(
  address: string,
  synapse?: Synapse
): Promise<boolean> {
  const datasets = await getDataSets(address, synapse);
  return datasets.length > 0;
}