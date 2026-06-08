import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const tools: Tool[] = [
  {
    name: "create_folder",
    description: "Create a new folder NFT for organizing files",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the folder"
        },
        folderType: {
          type: "string",
          enum: ["personal", "work", "agent"],
          description: "Type of folder to create",
          default: "personal"
        }
      },
      required: ["name", "folderType"]
    }
  },
  {
    name: "upload_file",
    description: "Upload a file to Filecoin storage and optionally add to a folder. Supports both local file paths (server-side) and base64-encoded file content (from MCP client).",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Path to the local file to upload (server-side files only)"
        },
        fileContent: {
          type: "string",
          description: "Base64-encoded file content (for uploading files from MCP client)"
        },
        fileName: {
          type: "string",
          description: "Name of the file (required when using fileContent)"
        },
        folderId: {
          type: "string",
          description: "ID of the folder to upload to"
        }
      },
      required: []
    }
  },
  {
    name: "list_folders",
    description: "Get all folders owned by an address",
    inputSchema: {
      type: "object",
      properties: {
        userAddress: {
          type: "string",
          description: "Address to get folders for (defaults to current wallet)"
        }
      },
      required: []
    }
  },
  {
    name: "get_folder_info",
    description: "Get detailed information about a specific folder",
    inputSchema: {
      type: "object",
      properties: {
        folderId: {
          type: "string",
          description: "ID of the folder to get information for"
        }
      },
      required: ["folderId"]
    }
  },
  {
    name: "list_files",
    description: "List all files in a specific folder",
    inputSchema: {
      type: "object",
      properties: {
        folderId: {
          type: "string",
          description: "ID of the folder to list files from"
        }
      },
      required: ["folderId"]
    }
  },
  {
    name: "search_files_by_prompt",
    description: "Search for files using AI-powered semantic search",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Search query in natural language"
        },
        folderId: {
          type: "string",
          description: "Limit search to specific folder (optional)"
        }
      },
      required: ["prompt"]
    }
  },
  {
    name: "search_files_by_tag",
    description: "Search for files using a specific tag",
    inputSchema: {
      type: "object",
      properties: {
        tag: {
          type: "string",
          description: "Tag to search for"
        }
      },
      required: ["tag"]
    }
  },
  {
    name: "get_storage_balance",
    description: "Check FIL balance and storage allowances",
    inputSchema: {
      type: "object",
      properties: {
        userAddress: {
          type: "string",
          description: "Address to check balance for (defaults to current wallet)"
        }
      },
      required: []
    }
  }
];
