import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

import { getGoogleAccessToken } from "./oauth";

const REQUEST_STATUS_ENDPOINT = "https://datamanager.googleapis.com/v1/requestStatus:retrieve";

type DestinationStatus = {
  requestStatus?: string;
  errorInfo?: unknown;
  warningInfo?: unknown;
};

type RequestStatusResponse = {
  requestStatusPerDestination?: DestinationStatus[];
};

function trimOrNull(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}
export function summarizeDataManagerRequestStatus(body: RequestStatusResponse | null) {
  const destinations = Array.isArray(body?.requestStatusPerDestination)
    ? body.requestStatusPerDestination
    : [];
  const statuses = destinations.map((item) => item.requestStatus?.trim().toUpperCase() || "REQUEST_STATUS_UNKNOWN");
  const warnings = destinations.flatMap((item) => (item.warningInfo == null ? [] : [item.warningInfo]));
  const errors = destinations.flatMap((item) => (item.errorInfo == null ? [] : [item.errorInfo]));

  if (!statuses.length || statuses.some((status) => status === "PROCESSING" || status === "REQUEST_STATUS_UNKNOWN")) {
    return { state: "processing" as const, statuses, warnings, errors };
  }
  if (statuses.some((status) => status === "FAILED")) {
    return { state: "failed" as const, statuses, warnings, errors };
  }
  if (statuses.some((status) => status === "PARTIAL_SUCCESS")) {
    return { state: "partial_success" as const, statuses, warnings, errors };
  }
  if (statuses.every((status) => status === "SUCCESS")) {
    return { state: "success" as const, statuses, warnings, errors };
  }
  return { state: "processing" as const, statuses, warnings, errors };
}

export async function reconcileNextConversionRequestStatus() {
  const job = await prisma.conversionUploadOutbox.findFirst({
    where: {
      processing_status: "submitted",
      request_id: { not: null },
    },
    orderBy: [{ submitted_at: "asc" }, { updated_at: "asc" }],
    select: {
      conversion_upload_outbox_id: true,
      request_id: true,
    },
  });
  if (!job?.request_id) return { status: "idle" as const };

  const settings = await prisma.googleAdsIntegrationSetting.findUnique({
    where: { setting_key: "default" },
    select: { cloud_project_id: true },
  });
  const accessToken = await getGoogleAccessToken(["https://www.googleapis.com/auth/datamanager"]);
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` };
  const cloudProjectId = trimOrNull(settings?.cloud_project_id ?? process.env.GOOGLE_CLOUD_PROJECT_ID);
  if (cloudProjectId) headers["x-goog-user-project"] = cloudProjectId;

  const url = new URL(REQUEST_STATUS_ENDPOINT);
  url.searchParams.set("requestId", job.request_id);
  const response = await fetch(url, { headers });
  const body = (await response.json().catch(() => null)) as RequestStatusResponse | null;

  if (!response.ok) {
    return {
      status: response.status === 408 || response.status === 429 || response.status >= 500
        ? ("retry" as const)
        : ("needs_operator_action" as const),
      outboxId: job.conversion_upload_outbox_id,
      requestId: job.request_id,
      httpStatus: response.status,
    };
  }

  const summary = summarizeDataManagerRequestStatus(body);
  if (summary.state === "processing") {
    return {
      status: "processing" as const,
      outboxId: job.conversion_upload_outbox_id,
      requestId: job.request_id,
      destinationStatuses: summary.statuses,
    };
  }

  const failed = summary.state === "failed" || summary.state === "partial_success";
  await prisma.conversionUploadOutbox.update({
    where: { conversion_upload_outbox_id: job.conversion_upload_outbox_id },
    data: {
      processing_status: failed ? "needs_operator_action" : "confirmed",
      field_warnings: summary.warnings.length
        ? (summary.warnings as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      last_error: failed
        ? ({
            code: summary.state,
            request_id: job.request_id,
            destination_statuses: summary.statuses,
            errors: summary.errors,
          } as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });

  return {
    status: failed ? ("needs_operator_action" as const) : ("confirmed" as const),
    outboxId: job.conversion_upload_outbox_id,
    requestId: job.request_id,
    destinationStatuses: summary.statuses,
  };
}
