import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits `.next/standalone` — only the node_modules actually used, traced
  // per-route — instead of shipping the whole workspace. That's what the
  // production Dockerfile copies into the final image; see apps/binx-web/Dockerfile.
  output: "standalone",
  reactCompiler: true,
  images: {
    // Explicit rather than relying on next/image's defaults — makes AVIF/WebP
    // negotiation for the marketing hero images (public/marketing/*.webp) a
    // deliberate choice, not an implicit one.
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    // Run the React Compiler (`reactCompiler` above) as Turbopack's native
    // Rust port instead of the Babel plugin — same output, less build/dev
    // compile time and memory. Experimental: to roll back, delete this line
    // (babel-plugin-react-compiler stays installed for exactly that reason).
    turbopackRustReactCompiler: true,
    // Dev only: don't compile a client-side `import()` / `next/dynamic`
    // target (e.g. the AI modal) until the browser actually asks for it.
    // No effect on production builds.
    turbopackLazyDynamicImports: true,
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
