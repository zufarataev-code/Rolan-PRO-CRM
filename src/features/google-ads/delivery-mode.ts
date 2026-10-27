/** An explicit CRM pause takes precedence over the legacy environment fallback. */
export function effectiveGoogleAdsUploadEnabled(databaseValue: boolean | null | undefined, environmentValue = process.env.GOOGLE_ADS_UPLOAD_ENABLED) {
  return databaseValue ?? (environmentValue?.trim().toLowerCase() === "true");
}

/** Missing or malformed server configuration must never enable live uploads. */
export function googleAdsEnvironmentAllowsLive(value = process.env.GOOGLE_ADS_VALIDATE_ONLY) {
  return value?.trim().toLowerCase() === "false";
}

export function effectiveGoogleAdsValidateOnly(databaseValue: boolean | null | undefined, environmentValue = process.env.GOOGLE_ADS_VALIDATE_ONLY) {
  return databaseValue !== false || !googleAdsEnvironmentAllowsLive(environmentValue);
}
