import { NextRequest } from "next/server";

import { syncAllBankConnections } from "@/features/bank/service";
import { apiSuccess } from "@/lib/http/api-response";

import { bankError, requireBankOwner } from "@/features/bank/route-auth";

export async function POST(request: NextRequest) {
  const auth = await requireBankOwner(request);
  if ("response" in auth) return auth.response;
  try {
    return apiSuccess({ results: await syncAllBankConnections() });
  } catch (error) {
    return bankError(error);
  }
}
