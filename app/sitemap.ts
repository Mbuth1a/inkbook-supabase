import type { MetadataRoute } from "next";

const site = process.env.SITE_URL || "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: site, changeFrequency: "weekly", priority: 1 },
    { url: `${site}/book`, changeFrequency: "monthly", priority: 0.8 },
  ];
}
