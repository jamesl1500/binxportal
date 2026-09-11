import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits `.next/standalone` — only the node_modules actually used, traced
  // per-route — instead of shipping the whole workspace. That's what the
  // production Dockerfile copies into the final image; see apps/binx-web/Dockerfile.
  output: "standalone",
  reactCompiler: true,
  experimental: {
    serverActions: {
      // Uploads (canvas images, task files, message attachments) go through
      // server actions as multipart FormData. Next caps action bodies at 1MB
      // by default; binx-api itself rejects anything over 25MiB with a
      // friendly 413, so give the action enough room to let that be the
      // error the user sees.
      bodySizeLimit: "30mb",
    },
  },
};

export default nextConfig;
