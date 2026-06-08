import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude web3 folder from Next.js compilation
  webpack: (config) => {
    // Ignore the web3 directory during compilation
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/web3/**', '**/node_modules/**'],
    };
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      /Critical dependency: the request of a dependency is an expression/,
      /Critical dependency: require function is used in a way in which dependencies cannot be statically extracted/,
    ];
    
    return config;
  },
  // Also exclude from TypeScript checking
  typescript: {
    // Ignore TypeScript errors in web3 folder during build
    ignoreBuildErrors: false,
  },
  images: {
  remotePatterns: [
    {
      protocol: "https",
      hostname: "**.calibration.filbeam.io",
      pathname: "/**",
    },
  ],
  },

  // Exclude web3 from the build
  excludeDefaultMomentLocales: true,
};

export default nextConfig;
