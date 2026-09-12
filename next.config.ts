import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 上傳憑證走 server action，預設 body 只有 1MB，手機截圖一定過不去。
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
};

export default nextConfig;
