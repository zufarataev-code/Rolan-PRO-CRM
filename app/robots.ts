import type { MetadataRoute } from "next";

// The CRM and client proposal pages stay out of search (Owner, 2026-11-03).
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
