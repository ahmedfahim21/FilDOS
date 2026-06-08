import { config } from "dotenv";
import { z } from "zod";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { EnvConfig } from './types.js';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config({ path: join(__dirname, '..', '.env') });

// Debug: Log environment variables (without sensitive data)
console.error("Environment check:");
console.error("- PRIVATE_KEY:", process.env.PRIVATE_KEY ? "[SET]" : "[NOT SET]");
console.error("- CONTRACT_ADDRESS:", process.env.CONTRACT_ADDRESS ? "[SET]" : "[NOT SET]");
console.error("- RPC_URL:", process.env.RPC_URL || "[NOT SET]");
console.error("- AI_SERVICE_URL:", process.env.AI_SERVICE_URL || "[NOT SET]");

const envSchema = z.object({
  PRIVATE_KEY: z.string().min(1, "PRIVATE_KEY is required. Please set it in your .env file."),
  RPC_URL: z.string().url("Valid RPC URL is required").default("https://api.calibration.node.glif.io/rpc/v1"),
  CONTRACT_ADDRESS: z.string().min(1, "CONTRACT_ADDRESS is required. Please set it in your .env file."),
  NETWORK_ID: z.string().default("314159"),
  AI_SERVICE_URL: z.string().url().default("http://localhost:5000"),
});


export let env: EnvConfig;

try {
  env = envSchema.parse(process.env) as EnvConfig;
  console.error("✅ Environment validation successful");
} catch (error) {
  console.error("❌ Environment validation failed:", error);
  console.error("Please check your .env file and ensure all required variables are set.");
  console.error("Copy .env.example to .env and fill in the values.");
  process.exit(1);
}

export const hasBlockchainConfig = env.PRIVATE_KEY && env.CONTRACT_ADDRESS;
if (!hasBlockchainConfig) {
  console.error("Warning: PRIVATE_KEY and CONTRACT_ADDRESS not configured. Blockchain features will be disabled.");
}
