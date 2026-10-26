/**
 * Server start hook (Next.js). Starts the Google Ads delivery cycle once per
 * Node.js server process; it does nothing until the owner enables uploads and
 * saves Google access in CRM settings. The conditional import keeps Node-only
 * modules out of the edge bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startGoogleAdsSyncScheduler } = await import("./src/features/google-ads/sync-cycle");
    startGoogleAdsSyncScheduler();
  }
}
