import type { NextConfig } from "next";
import { fileURLToPath } from "url";
import { dirname } from "path";

// The website lives inside the FilDOS monorepo, which has its own lockfile in
// the parent dir. Pin the Turbopack root here so Next doesn't infer the repo
// root and pick up the Electron app's lockfile.
const nextConfig: NextConfig = {
  turbopack: {
    root: dirname(fileURLToPath(import.meta.url)),
  },
};

export default nextConfig;
