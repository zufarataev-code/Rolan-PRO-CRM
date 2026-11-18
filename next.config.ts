import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Types are checked once, by CI (`npm run typecheck`), before any deploy.
  // The production server builds with a 1 GB Node heap on purpose
  // (deploy/watch-production.sh) so a build never starves the running CRM;
  // repeating the whole-project type check inside `next build` no longer fits
  // into that heap (release 4415a28 failed there with "heap out of memory"),
  // so the build compiles and CI stays the type gate.
  typescript: { ignoreBuildErrors: true },
  // Owner, 2026-11-03: the CRM is a staff tool and proposal links carry a
  // client's name, address and price — no page is for search engines.
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] }];
  },
};

export default nextConfig;
