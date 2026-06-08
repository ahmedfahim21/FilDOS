# FilDOS MCP - Modular Structure

## 📁 Project Structure

```
src/
├── index.ts              # Main entry point - Server initialization
├── types.ts              # TypeScript type definitions
├── config.ts             # Environment configuration and validation
├── blockchain.ts         # Blockchain connection setup
├── schemas.ts            # Zod validation schemas
├── tools.ts              # Tool definitions for MCP
├── handlers.ts           # Request handlers for each tool
└── utils/
    ├── ownership.ts      # Ownership validation utilities
    ├── folders.ts        # Folder management utilities
    └── storage.ts        # File storage utilities
```

## 📄 File Descriptions

### `index.ts`
Main entry point that:
- Creates the MCP server instance
- Registers request handlers
- Starts the server on stdio transport

### `types.ts`
Contains all TypeScript interfaces:
- `FolderInfo` - Folder metadata structure
- `FileInfo` - File metadata structure
- `UploadResult` - File upload response
- `EnvConfig` - Environment configuration type

### `config.ts`
Handles environment configuration:
- Loads `.env` file
- Validates required environment variables using Zod
- Exports validated config
- Provides helpful error messages for missing config

### `blockchain.ts`
Blockchain initialization:
- Sets up ethers.js provider
- Initializes wallet
- Creates contract instance with ABI
- Exports blockchain objects for use across the app

### `schemas.ts`
Zod validation schemas for all tools:
- Input validation for each tool
- Type-safe parameter parsing
- Default value handling

### `tools.ts`
Tool definitions array:
- Defines all available MCP tools
- Specifies input schemas
- Provides descriptions for each tool

### `handlers.ts`
Request handlers for each tool

### `utils/ownership.ts`
Ownership validation utilities:
- `validateOwnership` - Verifies token ownership

### `utils/synapse.ts`
Synapse SDK utilities

### `utils/storage.ts`
Storage and AI utilities:
- `uploadFileToFilecoin` - Handles file uploads

## 🔄 Import Flow

```
index.ts
  ├── config.ts (auto-initialized)
  ├── blockchain.ts (auto-initialized)
  ├── tools.ts
  └── handlers.ts
        ├── schemas.ts
        ├── blockchain.ts
        ├── config.ts
        └── utils/
              ├── ownership.ts
              ├── synapse.ts
              └── storage.ts
```


## 🔧 Adding a New Tool

1. Add type definitions to `types.ts` (if needed)
2. Add validation schema to `schemas.ts`
3. Add tool definition to `tools.ts`
4. Add handler function to `handlers.ts`
5. Add case to `handleToolCall` switch statement
