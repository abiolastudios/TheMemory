import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets phones on the same Wi-Fi open the dev server (e.g. http://192.168.1.20:3000).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  // Hide the Next.js dev badge; it covers the lock-screen buttons.
  devIndicators: false,
  async headers() {
    return [
      {
        // Always fetch the latest service worker so updates reach guests straight away.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
