import type { NextConfig } from "next";

const backend =
  process.env.API_PROXY_TARGET || "http://127.0.0.1:5000";

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backend}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
