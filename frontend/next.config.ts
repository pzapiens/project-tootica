import type { NextConfig } from "next";

// The backend origin the frontend proxies to. Read from env so dev/prod can
// differ; falls back to the local backend dev port.
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Any request the browser makes to /api/* is transparently forwarded to
      // the backend. Same-origin from the browser's view, so no CORS needed.
      {
        source: "/api/:path*",
        destination: `${BACKEND_ORIGIN}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
