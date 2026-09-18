import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @napi-rs/canvas ships a platform-specific native binary
  // (e.g. skia.darwin-x64.node). Bundling it (webpack or Turbopack) breaks
  // its relative-path resolution of that file — it must stay external so
  // Node's own `require` resolves it directly at runtime instead.
  serverExternalPackages: ["@napi-rs/canvas"],
};

export default nextConfig;
