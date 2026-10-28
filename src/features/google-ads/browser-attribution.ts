/** No cookies, credentials or implied consent. The host may persist this only under its consent policy. */
export function captureGoogleAdsUrl(url: string, capturedAt = new Date()) {
  const landing = new URL(url);
  const value = (name: string) => landing.searchParams.get(name)?.slice(0, 2048) || null;
  return {
    google_ads_customer_id: value("google_ads_customer_id"),
    google_ads_campaign_id: value("campaign_id") || value("utm_id"),
    gclid: value("gclid"), gbraid: value("gbraid"), wbraid: value("wbraid"),
    landing_page: landing.href.slice(0, 4096),
    utm_source: value("utm_source"), utm_medium: value("utm_medium"), utm_campaign: value("utm_campaign"), utm_term: value("utm_term"), utm_content: value("utm_content"),
    captured_at: capturedAt.toISOString(),
  };
}
