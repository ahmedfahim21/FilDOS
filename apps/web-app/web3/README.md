# FilDOS Smart Contracts

Decentralized file storage on Filecoin with NFT-based folder ownership, access control, and paid viewing.

## 🏗️ Overview

ERC-721 NFTs represent folders. Each folder stores file metadata, access permissions, and optional paid viewing for public folders.

## 📄 Contract: FILDOS.sol

### Core Features

- **ERC-721 NFT**: Each folder is an NFT with transferable ownership
- **File Indexing**: Store file metadata (CID, filename, tags, encryption info) on-chain
- **Access Control**: Owner-only, selective sharing, or public with optional pricing
- **Paid Public Access**: Set USDFC price for viewing public folders
- **Encryption Support**: Lit Protocol integration for encrypted files
- **Tag-Based Search**: Query files by tags across folders

## 🗂️ Key Functions

### Folder Management
- `mintFolder(name, type)` - Create new folder NFT
- `setFolderPublic(tokenId, isPublic, viewingPrice)` - Make public with optional price
- `getFolderData(tokenId)` - Get folder metadata
- `getFoldersOwnedBy(owner)` - List user's folders
- `getPublicFolders()` - List all public folders

### File Operations
- `addFile(tokenId, cid, filename, tags, encrypted, hash, fileType)` - Add file to folder
- `getFiles(tokenId)` - Get all files in folder
- `removeFile(tokenId, cid)` - Remove file
- `moveFile(fromId, toId, cid)` - Move between folders
- `searchFilesByTag(tokenId, tag)` - Search by tag

### Access Control
- `shareFolder(tokenId, grantee, canRead, canWrite)` - Grant selective access
- `revokeShare(shareId)` - Revoke access
- `getFolderSharees(tokenId)` - List users with access
- `canRead(tokenId, user)` - Check read permission
- `canWrite(tokenId, user)` - Check write permission

### Paid Viewing
- `setViewingPrice(tokenId, price)` - Update price for public folder (USDFC, 6 decimals)
- `payForViewAccess(tokenId)` - Pay to gain read access (requires ERC20 approval)
- `hasPaidViewAccess(tokenId, viewer)` - Check if user has paid
- `getViewingPrice(tokenId)` - Get folder price

## 🔐 Access Logic

**Private Folder**: Only owner + shared users can access  
**Public Free (price=0)**: Anyone can view  
**Public Paid (price>0)**: Must pay USDFC to owner for access  
**Selective Sharing**: Grant read/write to specific addresses  

Owner always has full access. Shares don't apply to public folders—use pricing instead.

## 🛠️ Development

```bash
npm install
npx hardhat compile
npx hardhat ignition deploy ignition/modules/FILDOS.ts --network calibration
```

### Network: Filecoin Calibration
- Chain ID: 314159
- RPC: https://api.calibration.node.glif.io/rpc/v1
- Explorer: https://calibration.filfox.info/

### Environment
```env
PRIVATE_KEY=your_private_key
CALIBRATION_RPC_URL=https://api.calibration.node.glif.io/rpc/v1
```

## 📊 Data Structures

```solidity
struct FolderInfo {
    string name;
    string folderType;
    bool isPublic;
    address owner;
    uint256 createdAt;
    uint256 viewingPrice;
}

struct FileEntry {
    string cid;
    string filename;
    uint256 timestamp;
    address owner;
    string[] tags;
    bool encrypted;
    string dataToEncryptHash;
    string fileType;
}

struct Share {
    uint256 folderId;
    address grantee;
    bool canRead;
    bool canWrite;
}
```

## 🎯 Use Cases

1. **Private Storage**: User-only folders with encrypted files
2. **Team Collaboration**: Shared folders with read/write permissions
3. **Public Dataset**: Free public folder (viewingPrice=0)
4. **Premium Content**: Paid public access (viewingPrice>0 USDFC)
5. **Encrypted Archives**: Lit Protocol encrypted files with access control

## 🛠️ Tech Stack

- Solidity 0.8.20
- OpenZeppelin (ERC721Enumerable, Ownable, EnumerableSet)
- Hardhat + TypeScript
- Filecoin FEVM
- IERC20 (USDFC payment token)

## 📈 Events

```solidity
event FolderMinted(uint256 tokenId, address owner, string name, string folderType)
event FileAdded(uint256 tokenId, string cid, string filename, ...)
event FolderPublicityChanged(uint256 tokenId, bool isPublic)
event ViewingPriceSet(uint256 tokenId, uint256 price)
event ViewAccessPurchased(uint256 tokenId, address viewer, uint256 amount)
event ShareCreated(uint256 shareId, uint256 folderId, address grantee, ...)
```
