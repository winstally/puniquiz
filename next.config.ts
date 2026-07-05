import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

function devAllowedOrigins(): string[] {
  const origins = new Set<string>();

  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.internal) continue;
      if (entry.family !== "IPv4") continue;
      origins.add(entry.address);
    }
  }

  return [...origins];
}

const nextConfig: NextConfig = {
  reactCompiler: true,
  allowedDevOrigins: devAllowedOrigins(),
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
