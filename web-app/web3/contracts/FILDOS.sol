// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/// @title FolderNFT — ERC‑721 for SemanticDrive folders w/ Share Tokens
contract FolderNFT is ERC721Enumerable, Ownable {
    /* ────────────── TYPES & STORAGE ────────────── */

    using EnumerableSet for EnumerableSet.Bytes32Set;

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

    struct FolderInfo {
        string name;
        string folderType;
        bool isPublic;
        address owner;
        uint256 createdAt;
        uint256 viewingPrice;
    }

    // Folder → set of file CIDs (using bytes32 hashes for EnumerableSet)
    mapping(uint256 => EnumerableSet.Bytes32Set) private _folderFileCIDs;
    // CID hash → file details
    mapping(bytes32 => FileEntry) private _fileDetails;
    // Folder → its metadata
    mapping(uint256 => FolderInfo) private _folderInfo;

    // Share tokens
    uint256 private _nextShareId = 1;
    mapping(uint256 => Share) private _shares;
    mapping(address => uint256[]) private _sharesByGrantee;
    mapping(uint256 => uint256[]) private _sharesByFolder;
    
    // Paid access tracking: folderId => viewer => hasPaid
    mapping(uint256 => mapping(address => bool)) private _paidViewers;
    
    IERC20 public paymentToken;

    /* ────────────── ERRORS ────────────── */
    error NotFolderOwner(uint256 tokenId);
    error NotFolderAccess(uint256 tokenId);
    error FolderDoesNotExist(uint256 tokenId);
    error InvalidCID(string cid);
    error ShareNotFound(uint256 shareId);
    error NotShareOwner(uint256 shareId);
    error InsufficientPayment(uint256 required, uint256 provided);
    error ViewingPriceNotSet(uint256 tokenId);
    error InvalidPaymentToken();

    /* ────────────── EVENTS ────────────── */
    event FolderMinted(uint256 indexed tokenId, address indexed owner, string name, string folderType);
    event FileAdded(
        uint256 indexed tokenId,
        string cid,
        string filename,
        address indexed owner,
        string[] tags,
        bool encrypted,
        string dataToEncryptHash,
        string fileType
    );
    event FileRemoved(
        uint256 indexed tokenId,
        string cid,
        string filename,
        address indexed remover
    );
    event FileMoved(
        uint256 indexed fromTokenId,
        uint256 indexed toTokenId,
        string cid,
        string filename,
        address indexed mover,
        bool encrypted,
        string dataToEncryptHash,
        string fileType
    );
    event FolderTypeChanged(uint256 indexed tokenId, string newType);
    event FolderPublicityChanged(uint256 indexed tokenId, bool isPublic);
    event ShareCreated(
        uint256 indexed shareId,
        uint256 indexed folderId,
        address indexed grantee,
        bool canRead,
        bool canWrite
    );
    event ShareRevoked(uint256 indexed shareId);
    event FilesSearched(
        address indexed searcher,
        uint256 indexed folderId,
        string tag,
        uint256 resultsCount
    );
    event ViewingPriceSet(uint256 indexed tokenId, uint256 price);
    event ViewAccessPurchased(uint256 indexed tokenId, address indexed viewer, uint256 amount);
    event PaymentTokenSet(address indexed token);

    /* ────────────── CONSTRUCTOR ────────────── */
    constructor(address _paymentToken) ERC721("FolderNFT", "FDR") Ownable(msg.sender) {
        if (_paymentToken == address(0)) revert InvalidPaymentToken();
        paymentToken = IERC20(_paymentToken);
        emit PaymentTokenSet(_paymentToken);
    }

    /* ────────────── MINTING ────────────── */
    function mintFolder(string calldata name, string calldata folderType) external returns (uint256) {
        address to = msg.sender;
        uint256 newId = totalSupply() + 1;
        _safeMint(to, newId);
        
        _folderInfo[newId] = FolderInfo({
            name: name,
            folderType: folderType,
            isPublic: false,
            owner: to,
            createdAt: block.timestamp,
            viewingPrice: 0
        });
        
        emit FolderMinted(newId, to, name, folderType);
        return newId;
    }

    /* ────────────── INTERNAL HELPERS ────────────── */
    function _tokenExists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    /// @notice Safe version of canRead that returns false for non-existent tokens instead of reverting
    function _canReadSafe(uint256 tokenId, address user) internal view returns (bool) {
        if (!_tokenExists(tokenId)) return false;
        
        // Owner always has access
        if (ownerOf(tokenId) == user) return true;
        
        // Check active shares (for private/selectively shared folders)
        uint256[] storage shares_ = _sharesByGrantee[user];
        for (uint i = 0; i < shares_.length; ++i) {
            Share storage s = _shares[shares_[i]];
            if (s.folderId == tokenId && s.canRead) {
                return true;
            }
        }
        
        // For public folders
        if (_folderInfo[tokenId].isPublic) {
            // If no price set (price = 0), it's freely accessible
            if (_folderInfo[tokenId].viewingPrice == 0) {
                return true;
            }
            // If price is set, user must have paid
            return _paidViewers[tokenId][user];
        }
        
        return false;
    }

    /// @notice Safe version of canWrite that returns false for non-existent tokens instead of reverting
    function _canWriteSafe(uint256 tokenId, address user) internal view returns (bool) {
        if (!_tokenExists(tokenId)) return false;
        if (ownerOf(tokenId) == user) return true;

        uint256[] storage shares_ = _sharesByGrantee[user];
        for (uint i = 0; i < shares_.length; ++i) {
            Share storage s = _shares[shares_[i]];
            if (s.folderId == tokenId && s.canWrite) {
                return true;
            }
        }
        return false;
    }

    /// @notice Check if a file contains a specific tag
    function _fileHasTag(FileEntry memory file, string memory targetTag) internal pure returns (bool) {
        bytes32 targetTagHash = keccak256(bytes(targetTag));
        for (uint256 i = 0; i < file.tags.length; i++) {
            if (keccak256(bytes(file.tags[i])) == targetTagHash) {
                return true;
            }
        }
        return false;
    }

    /* ────────────── FILE INDEXING ────────────── */
    function addFile(
        uint256 tokenId,
        string calldata cid,
        string calldata filename,
        string[] calldata tags,
        bool encrypted,
        string calldata dataToEncryptHash,
        string calldata fileType
    ) external {
        if (!_tokenExists(tokenId)) revert FolderDoesNotExist(tokenId);
        if (!canWrite(tokenId, msg.sender)) revert NotFolderAccess(tokenId);
        if (bytes(cid).length == 0) revert InvalidCID(cid);

        // Create hash of CID for EnumerableSet
        bytes32 cidHash = keccak256(bytes(cid));
        
        // Check if file already exists in this folder
        EnumerableSet.Bytes32Set storage fileSet = _folderFileCIDs[tokenId];
        bool alreadyExists = fileSet.contains(cidHash);
        require(!alreadyExists, "File already exists in folder");

        // Store file details
        _fileDetails[cidHash] = FileEntry({
            cid: cid,
            filename: filename,
            timestamp: block.timestamp,
            owner: msg.sender,
            tags: tags,
            encrypted: encrypted,
            dataToEncryptHash: dataToEncryptHash,
            fileType: fileType
        });

        // Add to folder's file set
        _folderFileCIDs[tokenId].add(cidHash);

        emit FileAdded(tokenId, cid, filename, msg.sender, tags, encrypted, dataToEncryptHash, fileType);
    }

    /* ────────────── FILE MANAGEMENT ────────────── */
    function moveFile(
        uint256 fromTokenId,
        uint256 toTokenId,
        string calldata cid
    ) external {
        if (!_tokenExists(fromTokenId)) revert FolderDoesNotExist(fromTokenId);
        if (!_tokenExists(toTokenId)) revert FolderDoesNotExist(toTokenId);
        if (!canWrite(fromTokenId, msg.sender)) revert NotFolderAccess(fromTokenId);
        if (!canWrite(toTokenId, msg.sender)) revert NotFolderAccess(toTokenId);
        
        // Create hash of CID for EnumerableSet lookup
        bytes32 cidHash = keccak256(bytes(cid));
        
        // Check if file exists in source folder
        EnumerableSet.Bytes32Set storage sourceSet = _folderFileCIDs[fromTokenId];
        bool existsInSource = sourceSet.contains(cidHash);
        require(existsInSource, "File not found in source folder");
        
        // Check if file already exists in destination folder
        EnumerableSet.Bytes32Set storage destSet = _folderFileCIDs[toTokenId];
        bool existsInDest = destSet.contains(cidHash);
        require(!existsInDest, "File already exists in destination folder");
        
        // Get file details for the event
        FileEntry memory fileToMove = _fileDetails[cidHash];
        sourceSet.remove(cidHash);
        destSet.add(cidHash);
        
        emit FileMoved(fromTokenId, toTokenId, cid, fileToMove.filename, msg.sender, fileToMove.encrypted, fileToMove.dataToEncryptHash, fileToMove.fileType);
    }

    /// @notice Set folder public/private status and optionally set viewing price
    /// @param tokenId The folder NFT ID
    /// @param isPublic Whether the folder should be public
    /// @param viewingPrice Price in payment tokens (only relevant if isPublic=true, 0=free)
    function setFolderPublic(uint256 tokenId, bool isPublic, uint256 viewingPrice) external {
        if (!_tokenExists(tokenId)) revert FolderDoesNotExist(tokenId);
        if (ownerOf(tokenId) != msg.sender) revert NotFolderAccess(tokenId);
        
        _folderInfo[tokenId].isPublic = isPublic;
        
        if (isPublic) {
            _folderInfo[tokenId].viewingPrice = viewingPrice;
            emit ViewingPriceSet(tokenId, viewingPrice);
        } else {
            _folderInfo[tokenId].viewingPrice = 0;
        }
        
        emit FolderPublicityChanged(tokenId, isPublic);
    }

    /* ────────────── SHARE ACCESS ────────────── */

    /// @notice Create a share token granting read/write access
    function shareFolder(
        uint256 tokenId,
        address grantee,
        bool canRead_,
        bool canWrite_
    ) external returns (uint256) {
        if (!_tokenExists(tokenId)) revert FolderDoesNotExist(tokenId);
        if (ownerOf(tokenId) != msg.sender) revert NotFolderAccess(tokenId);
        require(grantee != address(0), "Invalid grantee");

        uint256 shareId = _nextShareId++;
        _shares[shareId] = Share({
            folderId: tokenId,
            grantee: grantee,
            canRead: canRead_,
            canWrite: canWrite_
        });
        _sharesByGrantee[grantee].push(shareId);
        _sharesByFolder[tokenId].push(shareId);

        emit ShareCreated(shareId, tokenId, grantee, canRead_, canWrite_);
        return shareId;
    }

    /// @notice Revoke an existing share immediately
    function revokeShare(uint256 shareId) external {
        Share storage s = _shares[shareId];
        if (s.folderId == 0) revert ShareNotFound(shareId);
        // only folder owner can revoke
        if (ownerOf(s.folderId) != msg.sender) revert NotShareOwner(shareId);

        // Remove from grantee's share list
        uint256[] storage granteeShares = _sharesByGrantee[s.grantee];
        for (uint i = 0; i < granteeShares.length; i++) {
            if (granteeShares[i] == shareId) {
                granteeShares[i] = granteeShares[granteeShares.length - 1];
                granteeShares.pop();
                break;
            }
        }
        
        // Remove from folder's share list
        uint256[] storage folderShares = _sharesByFolder[s.folderId];
        for (uint i = 0; i < folderShares.length; i++) {
            if (folderShares[i] == shareId) {
                folderShares[i] = folderShares[folderShares.length - 1];
                folderShares.pop();
                break;
            }
        }
        
        // Delete the share
        delete _shares[shareId];
        emit ShareRevoked(shareId);
    }

    /* ────────────── PAID VIEW ACCESS (EIP-3009) ────────────── */

    /// @notice Update the viewing price for an already-public folder (owner only)
    /// @param tokenId The folder NFT ID
    /// @param price Price in payment tokens (0 = free public viewing)
    function setViewingPrice(uint256 tokenId, uint256 price) external {
        if (!_tokenExists(tokenId)) revert FolderDoesNotExist(tokenId);
        if (ownerOf(tokenId) != msg.sender) revert NotFolderOwner(tokenId);
        
        // Only allow setting price for public folders
        require(_folderInfo[tokenId].isPublic, "Can only set price for public folders");
        
        _folderInfo[tokenId].viewingPrice = price;
        emit ViewingPriceSet(tokenId, price);
    }

    /// @notice Pay for view access (requires prior approval)
    /// @param tokenId The folder to gain access to
    function payForViewAccess(uint256 tokenId) external {
        if (!_tokenExists(tokenId)) revert FolderDoesNotExist(tokenId);
        
        uint256 price = _folderInfo[tokenId].viewingPrice;
        if (price == 0) revert ViewingPriceNotSet(tokenId);
        
        // Check if viewer already has access
        require(!_paidViewers[tokenId][msg.sender], "Already has paid access");
        
        address folderOwner = ownerOf(tokenId);
        
        // Transfer tokens from viewer to folder owner
        require(
            IERC20(address(paymentToken)).transferFrom(msg.sender, folderOwner, price),
            "Payment transfer failed"
        );
        
        // Grant paid view access
        _paidViewers[tokenId][msg.sender] = true;
        
        emit ViewAccessPurchased(tokenId, msg.sender, price);
    }

    /// @notice Check if an address has paid for view access
    function hasPaidViewAccess(uint256 tokenId, address viewer) public view returns (bool) {
        return _paidViewers[tokenId][viewer];
    }



    /* ────────────── GETTERS ────────────── */

    function canRead(uint256 tokenId, address user) public view returns (bool) {
        if (!_tokenExists(tokenId)) revert FolderDoesNotExist(tokenId);
        
        // Owner always has access
        if (ownerOf(tokenId) == user) return true;
        
        // Check active shares (for private/selectively shared folders)
        uint256[] storage shares_ = _sharesByGrantee[user];
        for (uint i = 0; i < shares_.length; ++i) {
            Share storage s = _shares[shares_[i]];
            if (s.folderId == tokenId && s.canRead) {
                return true;
            }
        }
        
        // For public folders
        if (_folderInfo[tokenId].isPublic) {
            // If no price set (price = 0), it's freely accessible
            if (_folderInfo[tokenId].viewingPrice == 0) {
                return true;
            }
            // If price is set, user must have paid
            return _paidViewers[tokenId][user];
        }
        
        return false;
    }

    function canWrite(uint256 tokenId, address user) public view returns (bool) {
        if (!_tokenExists(tokenId)) revert FolderDoesNotExist(tokenId);
        if (ownerOf(tokenId) == user) return true;

        uint256[] storage shares_ = _sharesByGrantee[user];
        for (uint i = 0; i < shares_.length; ++i) {
            Share storage s = _shares[shares_[i]];
            if (s.folderId == tokenId && s.canWrite) {
                return true;
            }
        }
        return false;
    }

    /// @notice Retrieve folder info
    function getFolderData(uint256 tokenId) external view returns (FolderInfo memory data_) {
        if (!_tokenExists(tokenId)) revert FolderDoesNotExist(tokenId);
        else data_ = _folderInfo[tokenId];
    }

    /// @notice Retrieve all files if caller can read
    function getFiles(uint256 tokenId) external view returns (FileEntry[] memory) {
        if (!_tokenExists(tokenId)) revert FolderDoesNotExist(tokenId);
        require(canRead(tokenId, msg.sender) || _folderInfo[tokenId].isPublic, "Unauthorized");
        
        // Get the number of files in the folder
        uint256 fileCount = _folderFileCIDs[tokenId].length();
        FileEntry[] memory files = new FileEntry[](fileCount);
        
        // Iterate through the set and populate the array
        for (uint256 i = 0; i < fileCount; i++) {
            bytes32 cidHash = _folderFileCIDs[tokenId].at(i);
            files[i] = _fileDetails[cidHash];
        }
        
        return files;
    }

    /// @notice Get the number of files in a folder
    function getFileCount(uint256 tokenId) external view returns (uint256) {
        if (!_tokenExists(tokenId)) revert FolderDoesNotExist(tokenId);
        require(canRead(tokenId, msg.sender) || _folderInfo[tokenId].isPublic, "Unauthorized");
        return _folderFileCIDs[tokenId].length();
    }

    /// @notice Check if a file exists in a folder
    function fileExists(uint256 tokenId, string calldata cid) external view returns (bool) {
        if (!_tokenExists(tokenId)) revert FolderDoesNotExist(tokenId);
        require(canRead(tokenId, msg.sender) || _folderInfo[tokenId].isPublic, "Unauthorized");
        bytes32 cidHash = keccak256(bytes(cid));
        // Refactored for stack depth
        EnumerableSet.Bytes32Set storage fileSet = _folderFileCIDs[tokenId];
        return fileSet.contains(cidHash);
    }

    /// @notice Remove a file from a folder
    function removeFile(uint256 tokenId, string calldata cid) external {
        if (!_tokenExists(tokenId)) revert FolderDoesNotExist(tokenId);
        if (!canWrite(tokenId, msg.sender)) revert NotFolderAccess(tokenId);
        
        bytes32 cidHash = keccak256(bytes(cid));
        // Refactored for stack depth
        EnumerableSet.Bytes32Set storage fileSet = _folderFileCIDs[tokenId];
        bool exists = fileSet.contains(cidHash);
        require(exists, "File not found in folder");
        
        // Get file details for the event before deletion
        FileEntry memory fileToRemove = _fileDetails[cidHash];
        
        // Remove from folder (reuse storage reference)
        fileSet.remove(cidHash);
        
        // Clean up file details if not referenced by any other folder
        delete _fileDetails[cidHash];
        
        emit FileRemoved(tokenId, cid, fileToRemove.filename, msg.sender);
    }

    /// @notice Search files by tag within a specific folder
    function searchFilesByTag(uint256 tokenId, string calldata tag) external returns (FileEntry[] memory) {
        if (!_tokenExists(tokenId)) revert FolderDoesNotExist(tokenId);
        require(canRead(tokenId, msg.sender) || _folderInfo[tokenId].isPublic, "Unauthorized");
        
        // Get all files in the folder first
        uint256 fileCount = _folderFileCIDs[tokenId].length();
        FileEntry[] memory matchingFiles = new FileEntry[](fileCount);
        uint256 matchCount = 0;
        
        // Search through files for the tag
        for (uint256 i = 0; i < fileCount; i++) {
            bytes32 cidHash = _folderFileCIDs[tokenId].at(i);
            FileEntry memory file = _fileDetails[cidHash];
            
            if (_fileHasTag(file, tag)) {
                matchingFiles[matchCount] = file;
                matchCount++;
            }
        }
        
        // Resize array to exact match count
        FileEntry[] memory results = new FileEntry[](matchCount);
        for (uint256 i = 0; i < matchCount; i++) {
            results[i] = matchingFiles[i];
        }
        
        emit FilesSearched(msg.sender, tokenId, tag, matchCount);
        return results;
    }

    /// @notice Search files by tag across multiple folders that the user has access to
    function searchFilesByTagAcrossFolders(
        uint256[] calldata folderIds, 
        string calldata tag
    ) external view returns (FileEntry[] memory) {
        // Estimate maximum possible results
        uint256 maxResults = 0;
        for (uint256 f = 0; f < folderIds.length; f++) {
            uint256 tokenId = folderIds[f];
            if (_tokenExists(tokenId) && (_canReadSafe(tokenId, msg.sender) || _folderInfo[tokenId].isPublic)) {
                maxResults += _folderFileCIDs[tokenId].length();
            }
        }
        
        FileEntry[] memory allMatches = new FileEntry[](maxResults);
        uint256 totalMatches = 0;
        
        // Search through each folder
        for (uint256 f = 0; f < folderIds.length; f++) {
            uint256 tokenId = folderIds[f];
            
            // Skip if folder doesn't exist or user can't read
            if (!_tokenExists(tokenId) || (!_canReadSafe(tokenId, msg.sender) && !_folderInfo[tokenId].isPublic)) {
                continue;
            }
            
            uint256 fileCount = _folderFileCIDs[tokenId].length();
            
            // Search files in this folder
            for (uint256 i = 0; i < fileCount; i++) {
                bytes32 cidHash = _folderFileCIDs[tokenId].at(i);
                FileEntry memory file = _fileDetails[cidHash];
                
                if (_fileHasTag(file, tag)) {
                    // Check for duplicates (same CID might be in multiple folders)
                    bool isDuplicate = false;
                    for (uint256 d = 0; d < totalMatches; d++) {
                        if (keccak256(bytes(allMatches[d].cid)) == keccak256(bytes(file.cid))) {
                            isDuplicate = true;
                            break;
                        }
                    }
                    
                    if (!isDuplicate) {
                        allMatches[totalMatches] = file;
                        totalMatches++;
                    }
                }
            }
        }
        
        // Resize to exact results
        FileEntry[] memory results = new FileEntry[](totalMatches);
        for (uint256 i = 0; i < totalMatches; i++) {
            results[i] = allMatches[i];
        }
        
        return results;
    }

    /// @notice Search files by tag across all folders owned by the caller
    function searchMyFilesByTag(string calldata tag) external view returns (FileEntry[] memory) {
        uint256 balance = balanceOf(msg.sender);
        uint256[] memory ownedFolders = new uint256[](balance);
        
        // Get all owned folders
        for (uint256 i = 0; i < balance; i++) {
            ownedFolders[i] = tokenOfOwnerByIndex(msg.sender, i);
        }
        
        // Manually search without emitting events (view function)
        uint256 maxResults = 0;
        for (uint256 f = 0; f < ownedFolders.length; f++) {
            uint256 tokenId = ownedFolders[f];
            if (_tokenExists(tokenId)) {
                maxResults += _folderFileCIDs[tokenId].length();
            }
        }
        
        FileEntry[] memory allMatches = new FileEntry[](maxResults);
        uint256 totalMatches = 0;
        
        // Search through each owned folder
        for (uint256 f = 0; f < ownedFolders.length; f++) {
            uint256 tokenId = ownedFolders[f];
            
            if (!_tokenExists(tokenId)) continue;
            
            uint256 fileCount = _folderFileCIDs[tokenId].length();
            
            // Search files in this folder
            for (uint256 i = 0; i < fileCount; i++) {
                bytes32 cidHash = _folderFileCIDs[tokenId].at(i);
                FileEntry memory file = _fileDetails[cidHash];
                
                if (_fileHasTag(file, tag)) {
                    // Check for duplicates
                    bool isDuplicate = false;
                    for (uint256 d = 0; d < totalMatches; d++) {
                        if (keccak256(bytes(allMatches[d].cid)) == keccak256(bytes(file.cid))) {
                            isDuplicate = true;
                            break;
                        }
                    }
                    
                    if (!isDuplicate) {
                        allMatches[totalMatches] = file;
                        totalMatches++;
                    }
                }
            }
        }
        
        // Resize to exact results
        FileEntry[] memory results = new FileEntry[](totalMatches);
        for (uint256 i = 0; i < totalMatches; i++) {
            results[i] = allMatches[i];
        }
        
        return results;
    }

    /// @notice Get all unique tags from files in a specific folder
    function getFolderTags(uint256 tokenId) external view returns (string[] memory) {
        if (!_tokenExists(tokenId)) revert FolderDoesNotExist(tokenId);
        require(canRead(tokenId, msg.sender) || _folderInfo[tokenId].isPublic, "Unauthorized");
        
        uint256 fileCount = _folderFileCIDs[tokenId].length();
        string[] memory allTags = new string[](fileCount * 10); // Estimate max tags
        uint256 uniqueTagCount = 0;
        
        // Collect all tags
        for (uint256 i = 0; i < fileCount; i++) {
            bytes32 cidHash = _folderFileCIDs[tokenId].at(i);
            FileEntry memory file = _fileDetails[cidHash];
            
            for (uint256 j = 0; j < file.tags.length; j++) {
                string memory tag = file.tags[j];
                
                // Check if tag is already in the list
                bool exists = false;
                for (uint256 k = 0; k < uniqueTagCount; k++) {
                    if (keccak256(bytes(allTags[k])) == keccak256(bytes(tag))) {
                        exists = true;
                        break;
                    }
                }
                
                if (!exists) {
                    allTags[uniqueTagCount] = tag;
                    uniqueTagCount++;
                }
            }
        }
        
        // Return array with exact size
        string[] memory uniqueTags = new string[](uniqueTagCount);
        for (uint256 i = 0; i < uniqueTagCount; i++) {
            uniqueTags[i] = allTags[i];
        }
        
        return uniqueTags;
    }

    /// @notice Search files that contain ALL specified tags within a folder
    function searchFilesByMultipleTags(
        uint256 tokenId, 
        string[] calldata tags
    ) external returns (FileEntry[] memory) {
        if (!_tokenExists(tokenId)) revert FolderDoesNotExist(tokenId);
        require(canRead(tokenId, msg.sender) || _folderInfo[tokenId].isPublic, "Unauthorized");
        
        uint256 fileCount = _folderFileCIDs[tokenId].length();
        FileEntry[] memory matchingFiles = new FileEntry[](fileCount);
        uint256 matchCount = 0;
        
        // Search through files
        for (uint256 i = 0; i < fileCount; i++) {
            bytes32 cidHash = _folderFileCIDs[tokenId].at(i);
            FileEntry memory file = _fileDetails[cidHash];
            
            // Check if file has ALL specified tags
            bool hasAllTags = true;
            for (uint256 j = 0; j < tags.length; j++) {
                if (!_fileHasTag(file, tags[j])) {
                    hasAllTags = false;
                    break;
                }
            }
            
            if (hasAllTags) {
                matchingFiles[matchCount] = file;
                matchCount++;
            }
        }
        
        // Resize array to exact match count
        FileEntry[] memory results = new FileEntry[](matchCount);
        for (uint256 i = 0; i < matchCount; i++) {
            results[i] = matchingFiles[i];
        }
        
        // Emit event with tag count
        emit FilesSearched(msg.sender, tokenId, "multiple-tags", matchCount);
        return results;
    }

    /// @notice Get folder access details for a user
    function getFolderAccess(uint256 tokenId, address user) external view returns (bool canRead_, bool canWrite_, bool isOwner) {
        if (!_tokenExists(tokenId)) revert FolderDoesNotExist(tokenId);
        
        isOwner = ownerOf(tokenId) == user;
        canRead_ = canRead(tokenId, user);
        canWrite_ = canWrite(tokenId, user);
        
        return (canRead_, canWrite_, isOwner);
    }

    /// @notice Get all folders owned by a specific address
    function getFoldersOwnedBy(address owner) external view returns (uint256[] memory) {
        uint256 balance = balanceOf(owner);
        uint256[] memory ownedFolders = new uint256[](balance);
        
        for (uint256 i = 0; i < balance; i++) {
            ownedFolders[i] = tokenOfOwnerByIndex(owner, i);
        }
        
        return ownedFolders;
    }

    /// @notice Get all public folders
    function getPublicFolders() external view returns (uint256[] memory) {
        uint256 supply = totalSupply();
        uint256[] memory publicFolders = new uint256[](supply);
        uint256 publicCount = 0;
        
        for (uint256 i = 0; i < supply; i++) {
            uint256 tokenId = tokenByIndex(i);
            if (_tokenExists(tokenId) && _folderInfo[tokenId].isPublic) {
                publicFolders[publicCount++] = tokenId;
            }
        }
        
        assembly {
            mstore(publicFolders, publicCount)
        }
        
        return publicFolders;
    }

    /// @notice Get all folders shared to a specific user
    function getFoldersSharedTo(address user) external view returns (uint256[] memory) {
        uint256[] storage userShares = _sharesByGrantee[user];
        uint256[] memory sharedFolders = new uint256[](userShares.length);
        uint256 folderCount = 0;
        
        for (uint256 i = 0; i < userShares.length; i++) {
            Share storage s = _shares[userShares[i]];
            if (s.folderId != 0 && _tokenExists(s.folderId)) {
                // Check if folder is already in the list (avoid duplicates)
                bool exists = false;
                for (uint256 j = 0; j < folderCount; j++) {
                    if (sharedFolders[j] == s.folderId) {
                        exists = true;
                        break;
                    }
                }
                if (!exists) {
                    sharedFolders[folderCount++] = s.folderId;
                }
            }
        }
        
        // Resize array to exact size
        assembly {
            mstore(sharedFolders, folderCount)
        }
        
        return sharedFolders;
    }

    /// @notice Get viewing price for a folder
    function getViewingPrice(uint256 tokenId) external view returns (uint256) {
        if (!_tokenExists(tokenId)) revert FolderDoesNotExist(tokenId);
        return _folderInfo[tokenId].viewingPrice;
    }

    /// @notice Get all sharees (users with share access) for a folder
    /// @param tokenId The folder NFT ID
    /// @return shareIds Array of share IDs for this folder
    /// @return sharees Array of addresses that have been granted shares
    /// @return canReadList Array of booleans indicating read permission for each sharee
    /// @return canWriteList Array of booleans indicating write permission for each sharee
    function getFolderSharees(uint256 tokenId) external view returns (
        uint256[] memory shareIds,
        address[] memory sharees,
        bool[] memory canReadList,
        bool[] memory canWriteList
    ) {
        if (!_tokenExists(tokenId)) revert FolderDoesNotExist(tokenId);
        
        uint256[] storage folderShareIds = _sharesByFolder[tokenId];
        uint256 shareCount = folderShareIds.length;
        
        // Count valid shares (non-revoked)
        uint256 validCount = 0;
        for (uint256 i = 0; i < shareCount; i++) {
            Share storage s = _shares[folderShareIds[i]];
            if (s.folderId != 0) {
                validCount++;
            }
        }
        
        // Allocate arrays
        shareIds = new uint256[](validCount);
        sharees = new address[](validCount);
        canReadList = new bool[](validCount);
        canWriteList = new bool[](validCount);
        
        // Populate arrays
        uint256 index = 0;
        for (uint256 i = 0; i < shareCount; i++) {
            Share storage s = _shares[folderShareIds[i]];
            if (s.folderId != 0) {
                shareIds[index] = folderShareIds[i];
                sharees[index] = s.grantee;
                canReadList[index] = s.canRead;
                canWriteList[index] = s.canWrite;
                index++;
            }
        }
        
        return (shareIds, sharees, canReadList, canWriteList);
    }

    /// @notice Update payment token address (owner only)
    /// @dev Allows contract owner to change the payment token if needed
    function setPaymentToken(address _paymentToken) external onlyOwner {
        if (_paymentToken == address(0)) revert InvalidPaymentToken();
        paymentToken = IERC20(_paymentToken);
        emit PaymentTokenSet(_paymentToken);
    }

}
