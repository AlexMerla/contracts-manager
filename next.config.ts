import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @napi-rs/canvas ships a platform-specific native binary
  // (e.g. skia.darwin-x64.node). Bundling it (webpack or Turbopack) breaks
  // its relative-path resolution of that file — it must stay external so
  // Node's own `require` resolves it directly at runtime instead.
  // exceljs is CJS and reaches for Node's stream/zlib at runtime — same
  // treatment as @napi-rs/canvas: bundling breaks it, so it stays external.
  serverExternalPackages: ["@napi-rs/canvas", "exceljs"],
};

export default nextConfig;
