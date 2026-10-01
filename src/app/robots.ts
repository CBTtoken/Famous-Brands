import type { MetadataRoute } from "next";

// Temporary home: nothing here is for search engines.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
