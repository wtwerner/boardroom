import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // The restored build cache served a stale globals.css (new @theme colors never compiled), so builds start clean
    turbopackFileSystemCacheForBuild: false,
  },
  images: {
    // Large box art is resized from BGG's full images; small icons use BGG's own thumbnails directly
    remotePatterns: [{ protocol: "https", hostname: "cf.geekdo-images.com" }],
    // Box art never changes; resize each image once a month at most
    minimumCacheTTL: 60 * 60 * 24 * 31,
  },
  // Vercel resizes images itself and next/og doesn't use sharp, so leave its ~18 MB of native libs out of every function
  outputFileTracingExcludes: {
    "*": ["node_modules/sharp/**", "node_modules/@img/**", "node_modules/.pnpm/sharp@*/**", "node_modules/.pnpm/@img+*/**"],
  },
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
