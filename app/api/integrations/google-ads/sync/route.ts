import { NextRequest, NextResponse } from "next/server";

import { processNextConversionUpload } from "@/features/google-ads/data-manager";
import { reconcileConversionOutbox } from "@/features/google-ads/reconciliation";
import { reconcileNextConversionRequestStatus } from "@/features/google-ads/request-status";
import { authorizeGoogleAdsSync } from "@/features/google-ads/sync-auth";

const MAX_BATCH = 25;

export async function POST(request: NextRequest) {
  const authorization = authorizeGoogleAdsSync(
    request.headers.get("authorization"),
    process.env.GOOGLE_ADS_SYNC_SECRET,
  );
  if (authorization === "not_configured") {
    return NextResponse.json(
      { ok: false, error: { code: "integration_not_configured", message: "Google Ads sync is not configured." } },
      { status: 503 },
    );
  }
  if (authorization !== "authorized") {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Google Ads sync authorization failed." } },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as { limit?: number } | null;
  const requested = Number.isFinite(body?.limit) ? Math.trunc(body?.limit ?? 10) : 10;
  const limit = Math.max(1, Math.min(MAX_BATCH, requested));
  const reconciliation = await reconcileConversionOutbox(100);
  const uploads: Array<Awaited<ReturnType<typeof processNextConversionUpload>>> = [];
  const statuses: Array<Awaited<ReturnType<typeof reconcileNextConversionRequestStatus>>> = [];

  for (let index = 0; index < limit; index += 1) {
    const result = await processNextConversionUpload();
    uploads.push(result);
    if (result.status === "idle" || result.status === "disabled") break;
  }

  for (let index = 0; index < limit; index += 1) {
    const result = await reconcileNextConversionRequestStatus();
    statuses.push(result);
    if (result.status === "idle" || result.status === "processing" || result.status === "retry") break;
  }

  return NextResponse.json({
    ok: true,
    data: { reconciliation, uploads, statuses },
  });
}
