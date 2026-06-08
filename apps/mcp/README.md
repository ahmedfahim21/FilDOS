# FilDOS MCP Server

> AI-powered decentralized file storage on Filecoin - Built for autonomous agents using Model Context Protocol (MCP)

## What is FilDOS MCP?

FilDOS MCP Server enables AI agents to autonomously manage files on the Filecoin network. Upload, organize, and search files on decentralized storage through simple MCP tool calls.

## Key Features

- 📁 **Folder Management** - Create and manage folder NFTs with access control
- 📤 **File Operations** - Upload files to Filecoin and organize them seamlessly
- 🔍 **Semantic Search** - AI-powered file search using embeddings

## Quick Setup

### Prerequisites

- Node.js 18 or higher
- A Filecoin wallet private key
- Access to Filecoin Calibration Network (testnet)

### Installation

1. **Clone and install dependencies**
   ```bash
   git clone https://github.com/ArqosLabs/FilDOS-MCP.git
   cd FilDOS-MCP
   npm install
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   # Required: Your wallet private key (get test FIL from faucet)
   PRIVATE_KEY=your_private_key_here
   ```
   Go to fildos.cloud, setup your account, add tokens and configure storage for usage.

3. **Build the server**
   ```bash
   npm run build
   ```

### Adding to Claude Desktop

Add this configuration to your Claude Desktop config file:

```json
{
  "mcpServers": {
    "fildos": {
      "command": "node",
      "args": ["/absolute/path/to/FilDOS-MCP/build/index.js"]
    }
  }
}
```

Restart Claude Desktop to load the server.

## Resources

- [FilDOS Documentation](https://github.com/ArqosLabs/FILDOS)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Filecoin Docs](https://docs.filecoin.io/)
- [Synapse SDK](https://github.com/filozone/synapse-sdk)

---