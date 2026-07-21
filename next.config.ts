import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The mini app only bundles src/hoodie.ts, src/tick.ts, src/wrapper-abi.ts
  // (dependency-free). The CLI keeps its own Node-only modules.
};

export default nextConfig;
