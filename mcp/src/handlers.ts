import type { CallToolResult, TextContent } from "@modelcontextprotocol/sdk/types.js";
import { ethers } from "ethers";
import axios from "axios";
import { readFile } from 'fs/promises';
import { basename } from 'path';
import { contract, provider, wallet } from './blockchain.js';
import { env } from './config.js';
import { validateOwnership } from './utils/ownership.js';
import {
    createFolderSchema,
    uploadFileSchema,
    listFoldersSchema,
    getFolderInfoSchema,
    listFilesSchema,
    searchFilesByTagSchema,
    searchFilesByPromptSchema,
    getStorageBalanceSchema,
} from './schemas.js';
import { uploadFile } from "./utils/storage.js";
import { initializeSynapseFromEnv } from './utils/synapse.js';

/**
 * Handle create_folder tool request
 */
export async function handleCreateFolder(args: unknown): Promise<CallToolResult> {
    const { name: folderName, folderType } = createFolderSchema.parse(args);

    const tx = await contract.mintFolder(folderName, folderType);
    const receipt = await tx.wait();

    const event = receipt.logs.find((log: { topics: string[]; data: string }) => {
        try {
            const parsed = contract.interface.parseLog(log);
            return parsed?.name === 'FolderMinted';
        } catch {
            return false;
        }
    });

    let tokenId = null;
    if (event) {
        const parsed = contract.interface.parseLog(event);
        tokenId = parsed?.args?.tokenId?.toString();
    }

    const response: TextContent = {
        type: "text",
        text: JSON.stringify({
            success: true,
            tokenId: tokenId,
            transactionHash: receipt.hash,
            folderName,
            folderType,
            message: `Folder '${folderName}' created successfully with ID: ${tokenId}`
        }, null, 2)
    };

    return { content: [response] };
}

/**
 * Handle upload_file tool request
 * Supports both local file paths and base64-encoded content from MCP client
 */
export async function handleUploadFile(args: unknown): Promise<CallToolResult> {
    const { filePath, fileContent, fileName, folderId } = uploadFileSchema.parse(args);

    let fileData: Buffer;
    let finalFileName: string;

    // Determine if uploading from file path or base64 content
    if (fileContent) {
        // Uploading from MCP client (base64 encoded)
        if (!fileName) {
            throw new Error("fileName is required when using fileContent");
        }
        fileData = Buffer.from(fileContent, 'base64');
        finalFileName = fileName;
        console.error(`📤 Uploading file from client: ${fileName} (${fileData.length} bytes)`);
    } else if (filePath) {
        // Uploading from local file system
        fileData = await readFile(filePath);
        finalFileName = basename(filePath);
        console.error(`📤 Uploading file from path: ${filePath}`);
    } else {
        throw new Error("Either filePath or fileContent must be provided");
    }

    // Initialize Synapse if not already done
    try {
        await initializeSynapseFromEnv({ withCDN: true });
    } catch (error) {
        // Synapse might already be initialized, ignore error
        console.error("Synapse initialization note:", error instanceof Error ? error.message : String(error));
    }

    // Upload to Filecoin using Synapse
    const uploadResult = await uploadFile(
        new Uint8Array(fileData),
        finalFileName,
        {
            address: wallet.address,
            onProgress: (progress) => {
                console.error(`${progress.progress}% - ${progress.status}`);
            }
        }
    );

    // Add to folder if specified
    if (folderId) {
        if (!(await validateOwnership(folderId))) {
            throw new Error("You don't own this folder or folder doesn't exist");
        }

        const extension = finalFileName.split('.').pop()?.toLowerCase() || "";
        const tags = [extension, "uploaded-via-mcp"];

        console.error(`📁 Adding file to folder ${folderId}...`);
        const tx = await contract.addFile(folderId, uploadResult.pieceCid, finalFileName, tags);
        const receipt = await tx.wait();
        console.error(`✅ File added to folder. TX: ${receipt.hash}`);
    }

    const response: TextContent = {
        type: "text",
        text: JSON.stringify({
            success: true,
            fileName: finalFileName,
            fileSize: fileData.length,
            pieceCid: uploadResult.pieceCid,
            txHash: uploadResult.txHash,
            addedToFolder: !!folderId,
            folderId: folderId || null,
            message: `File '${finalFileName}' uploaded successfully to Filecoin!\nCID: ${uploadResult.pieceCid}${folderId ? `\nAdded to folder: ${folderId}` : ''}`
        }, null, 2)
    };

    return { content: [response] };
}

/**
 * Handle list_folders tool request
 */
export async function handleListFolders(args: unknown): Promise<CallToolResult> {
    const { userAddress } = listFoldersSchema.parse(args);
    const folderIds = await contract.getFoldersOwnedBy(userAddress);

    const folders = await Promise.all(folderIds.map(async (id: ethers.BigNumberish) => {
        const folderData = await contract.getFolderData(id);
        return {
            tokenId: id.toString(),
            name: folderData.name,
            folderType: folderData.folderType,
            isPublic: folderData.isPublic,
            owner: folderData.owner,
            createdAt: new Date(Number(folderData.createdAt) * 1000).toISOString()
        };
    }));

    const response: TextContent = {
        type: "text",
        text: JSON.stringify({
            success: true,
            folders,
            count: folders.length,
            message: `Found ${folders.length} folders for address ${userAddress || wallet.address}`
        }, null, 2)
    };

    return { content: [response] };
}

/**
 * Handle get_folder_info tool request
 */
export async function handleGetFolderInfo(args: unknown): Promise<CallToolResult> {
    const { folderId } = getFolderInfoSchema.parse(args);

    const folderData = await contract.getFolderData(folderId);
    const files = await contract.getFiles(folderId);

    const folderInfo = {
        tokenId: folderId,
        name: folderData.name,
        folderType: folderData.folderType,
        isPublic: folderData.isPublic,
        owner: folderData.owner,
        createdAt: new Date(Number(folderData.createdAt) * 1000).toISOString(),
        fileCount: files.length,
        files: files.map((file: { cid: string; filename: string; tags: string[]; timestamp: bigint }) => ({
            cid: file.cid,
            filename: file.filename,
            tags: file.tags,
            timestamp: new Date(Number(file.timestamp) * 1000).toISOString()
        }))
    };

    const response: TextContent = {
        type: "text",
        text: JSON.stringify({
            success: true,
            folderInfo,
            message: `Folder '${folderData.name}' contains ${files.length} files`
        }, null, 2)
    };

    return { content: [response] };
}

/**
 * Handle list_files tool request
 */
export async function handleListFiles(args: unknown): Promise<CallToolResult> {
    const { folderId } = listFilesSchema.parse(args);

    const files = await contract.getFiles(folderId);
    const formattedFiles = files.map((file: { cid: string; filename: string; tags: string[]; timestamp: bigint }) => ({
        cid: file.cid,
        filename: file.filename,
        tags: file.tags,
        timestamp: new Date(Number(file.timestamp) * 1000).toISOString()
    }));

    const response: TextContent = {
        type: "text",
        text: JSON.stringify({
            success: true,
            files: formattedFiles,
            count: formattedFiles.length,
            message: `Found ${formattedFiles.length} files in folder ${folderId}`
        }, null, 2)
    };

    return { content: [response] };
}

/**
 * Handle search_files tool request
 */
export async function handleSearchByPromptFiles(args: unknown): Promise<CallToolResult> {
    const { prompt, folderId } = searchFilesByPromptSchema.parse(args);

    try {
        const searchResponse = await axios.post(`${env.AI_SERVICE_URL}/search`, {
            query: prompt,
            folder_id: folderId
        });

        const response: TextContent = {
            type: "text",
            text: JSON.stringify({
                success: true,
                results: searchResponse.data.results || [],
                query: prompt,
                message: `Found ${searchResponse.data.results?.length || 0} files matching "${prompt}"`
            }, null, 2)
        };

        return { content: [response] };
    } catch {
        const response: TextContent = {
            type: "text",
            text: JSON.stringify({
                success: false,
                error: "AI service unavailable",
                message: "Semantic search is currently unavailable. Please try again later."
            }, null, 2)
        };

        return { content: [response] };
    }
}

/**
 * Handle search_files_by_tag tool request
 */
export async function handleSearchByTagFiles(args: unknown): Promise<CallToolResult> {
    const { tag } = searchFilesByTagSchema.parse(args);

    const files = await contract.searchMyFilesByTag(tag);
    
    const formattedFiles = files.map((file: {
        cid: string;
        filename: string;
        timestamp: bigint;
        owner: string;
        tags: string[];
    }) => ({
        cid: file.cid,
        filename: file.filename,
        owner: file.owner,
        tags: file.tags,
        timestamp: new Date(Number(file.timestamp) * 1000).toISOString()
    }));

    const response: TextContent = {
        type: "text",
        text: JSON.stringify({
            success: true,
            files: formattedFiles,
            count: formattedFiles.length,
            tag: tag,
            message: `Found ${formattedFiles.length} file${formattedFiles.length !== 1 ? 's' : ''} with tag "${tag}"`
        }, null, 2)
    };

    return { content: [response] };
}


/**
 * Handle get_storage_balance tool request
 */
export async function handleGetStorageBalance(args: unknown): Promise<CallToolResult> {
    const { userAddress } = getStorageBalanceSchema.parse(args);
    const address = userAddress || wallet.address;

    // Get balance from provider
    const balance = await provider.getBalance(address);
    const balanceInFIL = ethers.formatEther(balance);

    const response: TextContent = {
        type: "text",
        text: JSON.stringify({
            success: true,
            address,
            balance: {
                wei: balance.toString(),
                fil: balanceInFIL,
                formatted: `${parseFloat(balanceInFIL).toFixed(4)} FIL`
            },
            message: `Balance: ${parseFloat(balanceInFIL).toFixed(4)} FIL`
        }, null, 2)
    };

    return { content: [response] };
}


/**
 * Main tool call dispatcher
 */
export async function handleToolCall(name: string, args: unknown): Promise<CallToolResult> {
    try {
        switch (name) {
            case "create_folder":
                return await handleCreateFolder(args);
            case "upload_file":
                return await handleUploadFile(args);
            case "list_folders":
                return await handleListFolders(args);
            case "get_folder_info":
                return await handleGetFolderInfo(args);
            case "list_files":
                return await handleListFiles(args);
            case "search_files_by_prompt":
                return await handleSearchByPromptFiles(args);
            case "search_files_by_tag":
                return await handleSearchByTagFiles(args);
            case "get_storage_balance":
                return await handleGetStorageBalance(args);
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    } catch (error) {
        const response: TextContent = {
            type: "text",
            text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
                tool: name,
                arguments: args
            }, null, 2)
        };

        return { content: [response] };
    }
}
