/*
    This is the configuration for the upload dApp using Synapse.
    It is used to configure the storage capacity, the persistence period, and the minimum number of days of lockup needed so the app can notify to pay for more storage.
*/

export const config = {
  // The number of GB of storage capacity needed to be sufficient
  storageCapacity: 10,
  // The number of days of lockup needed to be sufficient
  persistencePeriod: 30,
  // The minimum number of days of lockup needed to be sufficient
  minDaysThreshold: 10,
  // Whether to use CDN for the storage for faster retrieval
  withCDN: true,
  // Synapse dataset namespace identifier (scopes datasets created by this app)
  synapseSource: "fildos",
  // Lit Protocol encryption: temporarily disabled.
  // Lit has deprecated the Datil/Naga generations our integration was built
  // against and the "Chipotle" successor requires a PKP-based redesign of
  // the encryption + sharing flow. Set NEXT_PUBLIC_LIT_ENCRYPTION=true to
  // surface the encryption toggle again once that work lands.
  encryptionEnabled: process.env.NEXT_PUBLIC_LIT_ENCRYPTION === "true",
  // AI server URL for embeddings and search
  aiServerUrl: process.env.NEXT_PUBLIC_AI_SERVER_URL || "http://localhost:5001",
} satisfies {
  storageCapacity: number;
  persistencePeriod: number;
  minDaysThreshold: number;
  withCDN: boolean;
  synapseSource: string;
  encryptionEnabled: boolean;
  aiServerUrl: string;
};
