// Type definitions for FilDOS MCP

export interface FolderInfo {
  tokenId: string;
  name: string;
  folderType: string;
  isPublic: boolean;
  owner: string;
  createdAt: string;
}

export interface FileInfo {
  cid: string;
  filename: string;
  tags: string[];
  timestamp: string;
  owner: string;
}

export interface UploadResult {
  pieceCid: string;
  fileSize: number;
  txHash: string;
  fileName: string;
}

export interface EnvConfig {
  PRIVATE_KEY: string;
  RPC_URL: string;
  CONTRACT_ADDRESS: string;
  NETWORK_ID: string;
  AI_SERVICE_URL: string;
}
