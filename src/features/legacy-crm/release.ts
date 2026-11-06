import path from "node:path";

/**
 * The release the server is running. Production serves every release from
 * /home/runcloud/rolanpro-crm-releases/<commit sha> (deploy/watch-production.sh),
 * so the working directory name is the commit. A developer build has none and
 * uses the process start time: a restart counts as a new release.
 */
const STARTED_AT = new Date().toISOString();

export function currentReleaseId(): string {
  const explicit = String(process.env.ROLANPRO_RELEASE_SHA || "").trim();
  if (/^[0-9a-f]{7,40}$/i.test(explicit)) return explicit.toLowerCase();
  const dir = path.basename(process.cwd());
  if (/^[0-9a-f]{7,40}$/i.test(dir)) return dir.toLowerCase();
  return `dev-${STARTED_AT}`;
}
