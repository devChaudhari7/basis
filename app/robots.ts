import type { MetadataRoute } from "next";

const BASE = (process.env.BASIS_PUBLIC_URL ?? "https://basis-self.vercel.app").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Personal books and auth flows are not content to crawl.
        disallow: ["/api/trades", "/auth/", "/signin"]
      }
    ],
    sitemap: `${BASE}/sitemap.xml`
  };
}
