import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { tools } from './tools.js';
import { handleToolCall } from './handlers.js';
import './config.js';
import './blockchain.js';

const server = new Server({
  name: "FilDOS MCP",
  version: "1.0.0",
}, {
  capabilities: {
    tools: {},
  },
});


server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return handleToolCall(name, args);
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("FilDOS MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});