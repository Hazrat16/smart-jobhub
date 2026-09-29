import type { NextConfig } from "next";

const backend =
  process.env.API_PROXY_TARGET || "http://127.0.0.1:5000";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (.next/standalone).
  output: "standalone",
  // Dev-only proxy. In deployed environments the ALB routes /api/* to the api
  // service on the same origin, so no rewrite is needed.
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      {
        source: "/api/:path*",
        destination: `${backend}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
