import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@copilotkit/runtime"],
  transpilePackages: ["@repo/agent"],
};

export default nextConfig;
