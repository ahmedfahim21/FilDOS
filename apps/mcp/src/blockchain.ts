import { ethers } from "ethers";
import { env } from './config.js';

export const FOLDER_CONTRACT_ABI = [
  "function mintFolder(string memory name, string memory folderType) external returns (uint256)",
  "function getFolderData(uint256 tokenId) external view returns (tuple(string name, string folderType, bool isPublic, address owner, uint256 createdAt))",
  "function addFile(uint256 tokenId, string memory cid, string memory filename, string[] memory tags) external",
  "function getFiles(uint256 tokenId) external view returns (tuple(string cid, string filename, uint256 timestamp, address owner, string[] tags)[])",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)",
  "function searchMyFilesByTag(string calldata tag) external returns (tuple(string cid, string filename, uint256 timestamp, address owner, string[] tags)[])",
  "function getFoldersOwnedBy(address owner) external view returns (uint256[] memory)"
];

// Initialize
export const provider = new ethers.JsonRpcProvider(env.RPC_URL);
export const wallet = new ethers.Wallet(env.PRIVATE_KEY, provider);
export const contract = new ethers.Contract(env.CONTRACT_ADDRESS, FOLDER_CONTRACT_ABI, wallet);

console.error("🔗 Blockchain initialized:");
console.error("- Wallet address:", wallet.address);
console.error("- Contract address:", env.CONTRACT_ADDRESS);
console.error("- RPC URL:", env.RPC_URL);
