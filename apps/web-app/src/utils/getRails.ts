import { Synapse } from "@filoz/synapse-sdk";

export const getRails = async (synapse: Synapse, railIDs: number[]) => {
  const results = await Promise.all(
    railIDs.map((railId) =>
      synapse.payments.getRail({ railId: BigInt(railId) })
    )
  );

  return results.map((rail, index) => ({ railId: railIDs[index], ...rail }));
};
