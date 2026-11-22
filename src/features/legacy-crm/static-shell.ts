import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { replaceLegacyBootstrapLogin } from "@/features/legacy-crm/html-shell";
import { composeProductionHtml } from "@/features/legacy-crm/production-ui";

// Owner, 2026-11-22: «CRM не должна тормозить». The first byte of /legacy-crm
// took ~3 s: every request re-read four files and re-composed ~420 functions into
// the 3 MB legacy script (~1.2 s of regex work on a laptop, more on the server).
// The composed page depends only on these files, so it is built once per release
// (file size + mtime) and reused; per-session patches are still added per request.

const LEGACY_FILES = ["rolanpro-crm-cloud.html", "production-stages.js", "project-cabinet.js", "owner-board.js"] as const;

type Cached = { key: string; html: Promise<string> };
let cached: Cached | null = null;

function legacyPath(name: string) {
  return path.join(process.cwd(), "private", "legacy", name);
}

async function filesKey(): Promise<string> {
  const stats = await Promise.all(LEGACY_FILES.map((name) => stat(legacyPath(name))));
  return stats.map((s, i) => `${LEGACY_FILES[i]}:${s.size}:${s.mtimeMs}`).join("|");
}

export async function buildLegacyStaticShell(): Promise<string> {
  const [html, productionUi, cabinetUi, boardUi] = await Promise.all(
    LEGACY_FILES.map((name) => readFile(legacyPath(name), "utf8")),
  );
  return replaceLegacyBootstrapLogin(
    composeProductionHtml(composeProductionHtml(composeProductionHtml(html, productionUi), cabinetUi), boardUi),
  );
}

/** The composed legacy page without any per-session patches, built once per file version. */
export async function legacyStaticShell(): Promise<string> {
  const key = await filesKey();
  if (cached?.key === key) return cached.html;
  const html = buildLegacyStaticShell();
  cached = { key, html };
  // A failed build must not stay cached: the next request tries again.
  html.catch(() => { if (cached?.html === html) cached = null; });
  return html;
}

/** Test hook. */
export function resetLegacyStaticShellCache() {
  cached = null;
}
