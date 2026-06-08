"use client";

import { useQuery } from "@tanstack/react-query";
import {
  DataSetPieceData,
  EnhancedDataSetInfo,
} from "@filoz/synapse-sdk";
import { getDataSet as getSpDataSet } from "@filoz/synapse-core/sp";
import { useConnection } from "wagmi";
import { DataSet } from "@/types";
import { getDatasetSizeMessage } from "@/utils/storageCalculations";
import { UnifiedSizeInfo as PieceSizeInfo } from "@/types";
import { getPieceInfoFromCidBytes } from "@/utils/storageCalculations";
import { useSynapse } from "@/providers/SynapseProvider";

/**
 * Hook to fetch and manage user datasets from Filecoin storage
 *
 * @description This hook demonstrates a complex data fetching workflow:
 * 1. Initialize Synapse and WarmStorage services
 * 2. Fetch approved providers and user datasets in parallel
 * 3. Map provider relationships and fetch provider details
 * 4. Enrich datasets with provider information and PDP data
 * 5. Handle errors gracefully while maintaining data integrity
 * 6. Implement caching and background refresh strategies
 */
export const useDatasets = () => {
  const { address, chainId } = useConnection();
  const { getSynapse } = useSynapse();
  return useQuery({
    enabled: !!address,
    queryKey: ["datasets", address, chainId],
    queryFn: async () => {
      const synapse = await getSynapse();

      // Fetch datasets for the connected client
      const datasets = await synapse.storage.findDataSets();

      // Fetch provider information for each dataset
      const providers = await Promise.all(
        datasets.map((dataset) => synapse.getProviderInfo(dataset.providerId))
      );

      // Fetch detailed dataset information (pieces) for each dataset via SP
      const datasetDataResults = await Promise.all(
        datasets.map(async (dataset: EnhancedDataSetInfo) => {
          const provider = providers.find((p) => p.id === dataset.providerId)!;
          const serviceURL = provider.pdp?.serviceURL || "";

          try {
            const data = await getSpDataSet({
              serviceURL,
              dataSetId: dataset.pdpVerifierDataSetId,
            }).then((data) => {
              // Reverse to show most recent uploads first in UI
              data.pieces.reverse();
              return data;
            });

            // Build pieces size map
            const pieces = data.pieces.reduce(
              (acc, piece: DataSetPieceData) => {
                acc[piece.pieceCid.toV1().toString()] =
                  getPieceInfoFromCidBytes(piece.pieceCid);
                return acc;
              },
              {} as Record<string, PieceSizeInfo>
            );

            const datasetSizeInfo = data.pieces.reduce((acc, piece: DataSetPieceData) => {
              acc.sizeInBytes += Number(pieces[piece.pieceCid.toV1().toString()].sizeBytes);
              acc.sizeInKiB += Number(pieces[piece.pieceCid.toV1().toString()].sizeKiB);
              acc.sizeInMiB += Number(pieces[piece.pieceCid.toV1().toString()].sizeMiB);
              acc.sizeInGB += Number(pieces[piece.pieceCid.toV1().toString()].sizeGiB);
              return acc;
            }, { sizeInBytes: 0, sizeInKiB: 0, sizeInMiB: 0, sizeInGB: 0, message: "" });

            return {
              ...dataset,
              ...datasetSizeInfo,
              message: getDatasetSizeMessage(datasetSizeInfo),
              serviceURL,
              data, // Contains pieces array with CIDs
              pieceSizes: pieces,
            } satisfies DataSet;
          } catch (error) {
            console.warn(
              `Failed to fetch dataset details for ${dataset.pdpVerifierDataSetId}:`,
              error
            );
            // Return dataset without detailed data but preserve basic info
            return {
              ...dataset,
              provider: provider,
              serviceURL: serviceURL,
            } as unknown as DataSet;
          }
        })
      );

      // Map results back to original dataset order
      const datasetsWithDetails = datasets.map((dataset) => {
        const dataResult = datasetDataResults.find(
          (result) =>
            result.pdpVerifierDataSetId === dataset.pdpVerifierDataSetId
        );
        return dataResult;
      });

      return datasetsWithDetails.filter((dataset) => !!dataset);
    },
  });
};
