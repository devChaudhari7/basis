import type { MetadataRoute } from "next";

import { getDesk } from "@/lib/datasource";

const BASE = (process.env.BASIS_PUBLIC_URL ?? "https://basis-self.vercel.app").replace(/\/$/, "");

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const desk = await getDesk().catch(() => null);
  const updated = desk ? new Date(`${desk.asOf}T00:00:00Z`) : new Date();

  const staticRoutes = ["", "/bot", "/method", "/performance", "/journal", "/leaderboard", "/api"].map(
    (path) => ({
      url: `${BASE}${path}`,
      lastModified: updated,
      changeFrequency: "daily" as const,
      priority: path === "" ? 1 : 0.7
    })
  );

  const pairRoutes = (desk?.pairs ?? []).map((pair) => ({
    url: `${BASE}/s/${pair.slug}`,
    lastModified: new Date(`${pair.latest.d}T00:00:00Z`),
    changeFrequency: "daily" as const,
    priority: 0.9
  }));

  return [...staticRoutes, ...pairRoutes];
}
