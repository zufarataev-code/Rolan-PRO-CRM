import { NextRequest } from "next/server";

import { bankOverview } from "@/features/bank/service";
import { apiSuccess } from "@/lib/http/api-response";

import { bankError, requireBankOwner } from "@/features/bank/route-auth";

export async function GET(request: NextRequest) {
  const auth = await requireBankOwner(request);
  if ("response" in auth) return auth.response;
  const params = request.nextUrl.searchParams;
  try {
    return apiSuccess(await bankOverview({ reviewOnly: params.get("review") === "1", limit: Number(params.get("limit")) || undefined }));
  } catch (error) {
    return bankError(error);
  }
}
