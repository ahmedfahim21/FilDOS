import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useConnection, usePublicClient, useWalletClient } from "wagmi";
import {
  type Abi,
  type Address,
  type Log,
  parseEventLogs,
} from "viem";
import { CONTRACT_ABI, CONTRACT_ADDRESS } from "@/utils/contracts";
import { isSupportedChain } from "@/utils/chains";
import type { FileEntry, FolderAccess } from "@/types";

const ABI = CONTRACT_ABI as Abi;

type RawFileEntry = {
  cid: string;
  filename: string;
  timestamp: bigint;
  owner: string;
  tags: readonly string[];
  encrypted: boolean;
  dataToEncryptHash: string;
  fileType: string;
};

const toFileEntry = (file: RawFileEntry): FileEntry => ({
  cid: file.cid,
  filename: file.filename,
  timestamp: file.timestamp,
  owner: file.owner,
  tags: [...file.tags],
  encrypted: file.encrypted,
  dataToEncryptHash: file.dataToEncryptHash,
  fileType: file.fileType,
});

const extractEventArg = <T = unknown>(
  logs: readonly Log[],
  eventName: string,
  argName: string
): T | null => {
  const parsed = parseEventLogs({ abi: ABI, eventName, logs: logs as Log[] });
  if (!parsed.length) return null;
  const args = parsed[0].args as Record<string, unknown>;
  return (args[argName] as T) ?? null;
};

/**
 * Lightweight base hook: wires up viem clients + read/write helpers without
 * instantiating any react-query state. Each exported hook below uses this and
 * registers exactly one useQuery or useMutation.
 */
const useContractIO = () => {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { address, chainId, isConnected } = useConnection();
  const queryClient = useQueryClient();

  const read = useCallback(
    async <T = unknown>(functionName: string, args: readonly unknown[] = []): Promise<T> => {
      if (!publicClient) throw new Error("Public client not initialized");
      // Pass `account` so eth_call carries the connected address as msg.sender.
      // The FolderNFT contract gates several reads on caller permissions; without
      // this the call is made as 0x0 and reverts with "Unauthorized".
      return (await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName,
        args,
        ...(address ? { account: address as Address } : {}),
      })) as T;
    },
    [publicClient, address]
  );

  const writeAndWait = useCallback(
    async (functionName: string, args: readonly unknown[]) => {
      if (!isConnected) {
        throw new Error("Please connect your wallet to perform this action");
      }
      if (!isSupportedChain(chainId)) {
        throw new Error(`Unsupported network. Current chain: ${chainId}`);
      }
      if (!walletClient) {
        throw new Error("Wallet client is not ready. Please wait a moment and try again.");
      }
      if (!publicClient) {
        throw new Error("Public client is not ready.");
      }
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName,
        args,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, receipt };
    },
    [isConnected, chainId, walletClient, publicClient]
  );

  return {
    publicClient,
    walletClient,
    address,
    chainId,
    isConnected,
    queryClient,
    isReady: !!publicClient,
    read,
    writeAndWait,
  };
};

// ============================================================================
// Read hooks
// ============================================================================

export const useFiles = (tokenId: string | number, enabled = true) => {
  const { isReady, read } = useContractIO();
  return useQuery({
    queryKey: ["folder-files", tokenId],
    queryFn: async () => {
      const files = await read<readonly RawFileEntry[]>("getFiles", [BigInt(tokenId)]);
      return files.map(toFileEntry);
    },
    enabled: enabled && isReady && !!tokenId,
  });
};

export const useFolderData = (tokenId: string | number) => {
  const { isReady, read } = useContractIO();
  return useQuery({
    queryKey: ["folder-data", tokenId],
    queryFn: async () => {
      const data = await read<{
        name: string;
        folderType: string;
        isPublic: boolean;
        owner: string;
        createdAt: bigint;
        viewingPrice: bigint;
      }>("getFolderData", [BigInt(tokenId)]);
      return {
        name: data.name,
        folderType: data.folderType,
        isPublic: data.isPublic,
        owner: data.owner,
        createdAt: data.createdAt,
        viewingPrice: data.viewingPrice,
      };
    },
    enabled: isReady && !!tokenId,
  });
};

export const useFolderAccess = (tokenId: string | number, user?: string) => {
  const { isReady, read, address } = useContractIO();
  const target = (user || address) as Address | undefined;
  return useQuery({
    queryKey: ["folder-access", tokenId, target],
    queryFn: async () => {
      const [canRead, canWrite, isOwner] = await read<readonly [boolean, boolean, boolean]>(
        "getFolderAccess",
        [BigInt(tokenId), target!]
      );
      return { canRead, canWrite, isOwner } as FolderAccess;
    },
    enabled: isReady && !!tokenId && !!target,
  });
};

export const useOwnedFolders = (owner?: string) => {
  const { isReady, read, address } = useContractIO();
  const target = (owner || address) as Address | undefined;
  return useQuery({
    queryKey: ["owned-folders", target],
    queryFn: async () => {
      const folders = await read<readonly bigint[]>("getFoldersOwnedBy", [target!]);
      return folders.map((id) => id.toString());
    },
    enabled: isReady && !!target,
  });
};

export const usePublicFolders = () => {
  const { isReady, read } = useContractIO();
  return useQuery({
    queryKey: ["public-folders"],
    queryFn: async () => {
      const folders = await read<readonly bigint[]>("getPublicFolders");
      return folders.map((id) => id.toString());
    },
    enabled: isReady,
  });
};

export const useSharedFolders = (user?: string) => {
  const { isReady, read, address } = useContractIO();
  const target = (user || address) as Address | undefined;
  return useQuery({
    queryKey: ["shared-folders", target],
    queryFn: async () => {
      const folders = await read<readonly bigint[]>("getFoldersSharedTo", [target!]);
      return folders.map((id) => id.toString());
    },
    enabled: isReady && !!target,
  });
};

export const useCanRead = (tokenId: string | number, user?: string) => {
  const { isReady, read, address } = useContractIO();
  const target = (user || address) as Address | undefined;
  return useQuery({
    queryKey: ["can-read", tokenId, target],
    queryFn: () => read<boolean>("canRead", [BigInt(tokenId), target!]),
    enabled: isReady && !!tokenId && !!target,
  });
};

export const useCanWrite = (tokenId: string | number, user?: string) => {
  const { isReady, read, address } = useContractIO();
  const target = (user || address) as Address | undefined;
  return useQuery({
    queryKey: ["can-write", tokenId, target],
    queryFn: () => read<boolean>("canWrite", [BigInt(tokenId), target!]),
    enabled: isReady && !!tokenId && !!target,
  });
};

export const useFileCount = (tokenId: string | number) => {
  const { isReady, read } = useContractIO();
  return useQuery({
    queryKey: ["file-count", tokenId],
    queryFn: async () => Number(await read<bigint>("getFileCount", [BigInt(tokenId)])),
    enabled: isReady && !!tokenId,
  });
};

export const useFileExists = (tokenId: string | number, cid: string) => {
  const { isReady, read } = useContractIO();
  return useQuery({
    queryKey: ["file-exists", tokenId, cid],
    queryFn: () => read<boolean>("fileExists", [BigInt(tokenId), cid]),
    enabled: isReady && !!tokenId && !!cid,
  });
};

export const useSearchFilesByTag = (tokenId: string | number, tag: string, enabled = true) => {
  const { isReady, read } = useContractIO();
  return useQuery({
    queryKey: ["search-files-by-tag", tokenId, tag],
    queryFn: async () => {
      const files = await read<readonly RawFileEntry[]>(
        "searchFilesByTag",
        [BigInt(tokenId), tag]
      );
      return files.map(toFileEntry);
    },
    enabled: enabled && isReady && !!tokenId && !!tag,
  });
};

export const useSearchFilesByTagAcrossFolders = (
  folderIds: (string | number)[],
  tag: string,
  enabled = true
) => {
  const { isReady, read } = useContractIO();
  return useQuery({
    queryKey: ["search-files-across-folders", folderIds, tag],
    queryFn: async () => {
      const files = await read<readonly RawFileEntry[]>(
        "searchFilesByTagAcrossFolders",
        [folderIds.map((id) => BigInt(id)), tag]
      );
      return files.map(toFileEntry);
    },
    enabled: enabled && isReady && folderIds.length > 0 && !!tag,
  });
};

export const useSearchMyFilesByTag = (tag: string, enabled = true) => {
  const { isReady, read, address } = useContractIO();
  return useQuery({
    queryKey: ["search-my-files-by-tag", address, tag],
    queryFn: async () => {
      const files = await read<readonly RawFileEntry[]>("searchMyFilesByTag", [tag]);
      return files.map(toFileEntry);
    },
    enabled: enabled && isReady && !!address && !!tag,
  });
};

export const useFolderTags = (tokenId: string | number) => {
  const { isReady, read } = useContractIO();
  return useQuery({
    queryKey: ["folder-tags", tokenId],
    queryFn: () => read<readonly string[]>("getFolderTags", [BigInt(tokenId)]),
    enabled: isReady && !!tokenId,
  });
};

export const useSearchFilesByMultipleTags = (
  tokenId: string | number,
  tags: string[],
  enabled = true
) => {
  const { isReady, read } = useContractIO();
  return useQuery({
    queryKey: ["search-files-by-multiple-tags", tokenId, tags],
    queryFn: async () => {
      const files = await read<readonly RawFileEntry[]>(
        "searchFilesByMultipleTags",
        [BigInt(tokenId), tags]
      );
      return files.map(toFileEntry);
    },
    enabled: enabled && isReady && !!tokenId && tags.length > 0,
  });
};

export const useViewingPrice = (tokenId: string | number) => {
  const { isReady, read } = useContractIO();
  return useQuery({
    queryKey: ["viewing-price", tokenId],
    queryFn: () => read<bigint>("getViewingPrice", [BigInt(tokenId)]),
    enabled: isReady && !!tokenId,
  });
};

export const useHasPaidViewAccess = (tokenId: string | number, viewer?: string) => {
  const { isReady, read, address } = useContractIO();
  const target = (viewer || address) as Address | undefined;
  return useQuery({
    queryKey: ["has-paid-view-access", tokenId, target],
    queryFn: () => read<boolean>("hasPaidViewAccess", [BigInt(tokenId), target!]),
    enabled: isReady && !!tokenId && !!target,
  });
};

export const usePaymentToken = () => {
  const { isReady, read } = useContractIO();
  return useQuery({
    queryKey: ["payment-token"],
    queryFn: () => read<Address>("paymentToken"),
    enabled: isReady,
  });
};

export const useFolderSharees = (tokenId: string | number) => {
  const { isReady, read } = useContractIO();
  return useQuery({
    queryKey: ["folder-sharees", tokenId],
    queryFn: async () => {
      const [shareIds, sharees, canReadList, canWriteList] = await read<
        readonly [readonly bigint[], readonly string[], readonly boolean[], readonly boolean[]]
      >("getFolderSharees", [BigInt(tokenId)]);
      return {
        shareIds: shareIds.map((id) => id.toString()),
        sharees: [...sharees],
        canReadList: [...canReadList],
        canWriteList: [...canWriteList],
      };
    },
    enabled: isReady && !!tokenId,
  });
};

// ============================================================================
// Write hooks
// ============================================================================

export const useMintFolder = () => {
  const { writeAndWait, queryClient } = useContractIO();
  return useMutation({
    mutationFn: async ({ name, folderType }: { name: string; folderType: string }) => {
      const { receipt } = await writeAndWait("mintFolder", [name, folderType]);
      const tokenIdRaw = extractEventArg<bigint>(receipt.logs, "FolderMinted", "tokenId");
      const tokenId = tokenIdRaw != null ? tokenIdRaw.toString() : null;
      return { receipt, tokenId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owned-folders"] });
      queryClient.invalidateQueries({ queryKey: ["public-folders"] });
    },
  });
};

export const useAddFile = () => {
  const { writeAndWait, queryClient } = useContractIO();
  return useMutation({
    mutationFn: async ({
      tokenId,
      cid,
      filename,
      tags,
      encrypted = false,
      dataToEncryptHash = "",
      fileType = "",
    }: {
      tokenId: string | number;
      cid: string;
      filename: string;
      tags: string[];
      encrypted?: boolean;
      dataToEncryptHash?: string;
      fileType?: string;
    }) => {
      const { receipt } = await writeAndWait("addFile", [
        BigInt(tokenId),
        cid,
        filename,
        tags,
        encrypted,
        dataToEncryptHash,
        fileType,
      ]);
      return receipt;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["folder-files", variables.tokenId] });
      queryClient.invalidateQueries({ queryKey: ["file-count", variables.tokenId] });
      queryClient.invalidateQueries({ queryKey: ["folder-tags", variables.tokenId] });
    },
  });
};

export const useMoveFile = () => {
  const { writeAndWait, queryClient } = useContractIO();
  return useMutation({
    mutationFn: async ({
      fromTokenId,
      toTokenId,
      cid,
    }: {
      fromTokenId: string | number;
      toTokenId: string | number;
      cid: string;
    }) => {
      const { receipt } = await writeAndWait("moveFile", [
        BigInt(fromTokenId),
        BigInt(toTokenId),
        cid,
      ]);
      return receipt;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["folder-files", variables.fromTokenId] });
      queryClient.invalidateQueries({ queryKey: ["folder-files", variables.toTokenId] });
    },
  });
};

export const useSetFolderPublic = () => {
  const { writeAndWait, queryClient } = useContractIO();
  return useMutation({
    mutationFn: async ({
      tokenId,
      isPublic,
      viewingPrice = 0,
    }: {
      tokenId: string | number;
      isPublic: boolean;
      viewingPrice?: bigint | number;
    }) => {
      const { receipt } = await writeAndWait("setFolderPublic", [
        BigInt(tokenId),
        isPublic,
        BigInt(viewingPrice),
      ]);
      return receipt;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["public-folders"] });
      queryClient.invalidateQueries({ queryKey: ["folder-data", variables.tokenId] });
      queryClient.invalidateQueries({ queryKey: ["viewing-price", variables.tokenId] });
    },
  });
};

export const useShareFolder = () => {
  const { writeAndWait, queryClient } = useContractIO();
  return useMutation({
    mutationFn: async ({
      tokenId,
      grantee,
      canRead,
      canWrite,
    }: {
      tokenId: string | number;
      grantee: string;
      canRead: boolean;
      canWrite: boolean;
    }) => {
      const { receipt } = await writeAndWait("shareFolder", [
        BigInt(tokenId),
        grantee as Address,
        canRead,
        canWrite,
      ]);
      const shareIdRaw = extractEventArg<bigint>(receipt.logs, "ShareCreated", "shareId");
      const shareId = shareIdRaw != null ? shareIdRaw.toString() : null;
      return { receipt, shareId };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["shared-folders", variables.grantee] });
      queryClient.invalidateQueries({ queryKey: ["folder-access", variables.tokenId, variables.grantee] });
      queryClient.invalidateQueries({ queryKey: ["folder-sharees", variables.tokenId] });
    },
  });
};

export const useRevokeShare = () => {
  const { writeAndWait, queryClient } = useContractIO();
  return useMutation({
    mutationFn: async ({ shareId }: { shareId: string | number }) => {
      const { receipt } = await writeAndWait("revokeShare", [BigInt(shareId)]);
      return receipt;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shared-folders"] });
      queryClient.invalidateQueries({ queryKey: ["folder-access"] });
      queryClient.invalidateQueries({ queryKey: ["folder-sharees"] });
    },
  });
};

export const useRemoveFile = () => {
  const { writeAndWait, queryClient } = useContractIO();
  return useMutation({
    mutationFn: async ({
      tokenId,
      cid,
    }: {
      tokenId: string | number;
      cid: string;
    }) => {
      const { receipt } = await writeAndWait("removeFile", [BigInt(tokenId), cid]);
      return receipt;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["folder-files", variables.tokenId] });
      queryClient.invalidateQueries({ queryKey: ["file-count", variables.tokenId] });
      queryClient.invalidateQueries({ queryKey: ["file-exists", variables.tokenId, variables.cid] });
      queryClient.invalidateQueries({ queryKey: ["folder-tags", variables.tokenId] });
    },
  });
};

export const useSetViewingPrice = () => {
  const { writeAndWait, queryClient } = useContractIO();
  return useMutation({
    mutationFn: async ({
      tokenId,
      price,
    }: {
      tokenId: string | number;
      price: bigint | string;
    }) => {
      const { receipt } = await writeAndWait("setViewingPrice", [
        BigInt(tokenId),
        BigInt(price),
      ]);
      return receipt;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["viewing-price", variables.tokenId] });
    },
  });
};

export const usePayForViewAccess = () => {
  const { writeAndWait, queryClient } = useContractIO();
  return useMutation({
    mutationFn: async ({ tokenId }: { tokenId: string | number }) => {
      const { receipt } = await writeAndWait("payForViewAccess", [BigInt(tokenId)]);
      return receipt;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["has-paid-view-access", variables.tokenId] });
      queryClient.invalidateQueries({ queryKey: ["can-read", variables.tokenId] });
      queryClient.invalidateQueries({ queryKey: ["folder-access", variables.tokenId] });
    },
  });
};
