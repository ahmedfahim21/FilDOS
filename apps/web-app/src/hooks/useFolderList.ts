import { useQueries } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { type Abi } from "viem";
import { CONTRACT_ABI, CONTRACT_ADDRESS } from "@/utils/contracts";
import type { FolderInfo } from "@/types";

const ABI = CONTRACT_ABI as Abi;

/**
 * Custom hook to fetch folder data for multiple folder token IDs
 * This hook uses React Query's useQueries to dynamically fetch folder data
 * for any number of folders without hardcoding limits
 */
export const useFolderList = (tokenIds: (string | number)[]) => {
  const publicClient = usePublicClient();

  // Use useQueries to dynamically create queries for each token ID
  const queries = useQueries({
    queries: tokenIds.map((tokenId) => ({
      queryKey: ["folder-data", tokenId],
      queryFn: async (): Promise<FolderInfo> => {
        if (!publicClient) throw new Error("Public client not initialized");
        const data = (await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: ABI,
          functionName: "getFolderData",
          args: [BigInt(tokenId)],
        })) as {
          name: string;
          folderType: string;
          isPublic: boolean;
          owner: string;
          createdAt: bigint;
          viewingPrice: bigint;
        };
        return {
          name: data.name,
          folderType: data.folderType,
          isPublic: data.isPublic,
          owner: data.owner,
          createdAt: data.createdAt,
          viewingPrice: data.viewingPrice,
        };
      },
      enabled: !!publicClient && !!tokenId,
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minutes
    })),
  });

  // Calculate loading and error states
  const isLoading = queries.some((query) => query.isLoading);
  const hasError = queries.some((query) => query.error);
  const errors = queries.filter((query) => query.error).map((query) => query.error);

  // Check if all queries are done (either success or error)
  const isComplete = queries.every((query) => !query.isLoading);

  // Count successful queries
  const successCount = queries.filter((query) => query.isSuccess).length;

  // Transform the results into a map for easy access
  const folderDataMap = new Map<string, FolderInfo>();
  queries.forEach((query, index) => {
    if (query.data && tokenIds[index]) {
      const tokenId = typeof tokenIds[index] === 'number'
        ? tokenIds[index].toString()
        : tokenIds[index] as string;
      folderDataMap.set(tokenId, query.data);
    }
  });

  // Convert map to array for easier iteration in components
  const folders = Array.from(folderDataMap.entries()).map(([tokenId, data]) => ({
    tokenId,
    ...data,
  }));

  return {
    folderDataMap,
    folders,
    isLoading,
    isComplete,
    hasError,
    errors,
    successCount,
    totalCount: tokenIds.length,
  };
};
