import { z } from "zod";

// Tool validation schemas
export const createFolderSchema = z.object({
  name: z.string().min(1, "Folder name is required"),
  folderType: z.enum(["personal", "work", "agent"]).default("personal")
});

export const uploadFileSchema = z.object({
  filePath: z.string().optional(),
  fileContent: z.string().optional(), // base64 encoded file content
  fileName: z.string().optional(),
  folderId: z.string().min(1, "Folder ID is required"),
}).refine(
  (data) => data.filePath || data.fileContent,
  { message: "Either filePath or fileContent must be provided" }
);

export const listFoldersSchema = z.object({
  userAddress: z.string().optional()
});

export const getFolderInfoSchema = z.object({
  folderId: z.string().min(1, "Folder ID is required")
});

export const listFilesSchema = z.object({
  folderId: z.string().min(1, "Folder ID is required")
});

export const searchFilesByPromptSchema = z.object({
  prompt: z.string().min(1, "Search prompt is required"),
  folderId: z.string().optional()
});

export const searchFilesByTagSchema = z.object({
  tag: z.string().min(1, "Search tag is required"),
  folderId: z.string().optional()
});

export const getStorageBalanceSchema = z.object({
  userAddress: z.string().optional()
});
