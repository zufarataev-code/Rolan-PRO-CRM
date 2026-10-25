/**
 * Server start hook (Next.js). Starts the Google Ads delivery cycle once per
 * server process; it does nothing until the owner enables uploads and saves
 * Google access in CRM settings.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startGoogleAdsSyncScheduler } = await import("@/features/google-ads/sync-cycle");
  startGoogleAdsSyncScheduler();
}
