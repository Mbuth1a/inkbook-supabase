import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["sharp"],
  images: {
    formats: ["image/avif", "image/webp"],
    // Gallery photos get a new file name whenever they change, so they can be cached for a long time.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    // Portfolio photos are served from the public Supabase Storage bucket.
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" }],
  },
  poweredByHeader: false,
};

export default config;
