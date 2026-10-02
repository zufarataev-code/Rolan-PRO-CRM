import type { NextRequest } from "next/server";

import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError } from "@/lib/http/api-response";

import { PlaidApiError } from "./plaid";

/** Bank feeds are the owner's alone: balances, operations and keys. */
export async function requireBankOwner(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) {
    return { response: apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Bank feeds are available to the owner only.") } as const;
  }
  return { session: auth.session } as const;
}

const PLAID_MESSAGES: Record<string, string> = {
  INVALID_API_KEYS: "Plaid не принял ключи — проверьте client_id, secret и режим (Sandbox / Production) в «Ключи Plaid».",
  INVALID_FIELD: "Plaid не принял ключи — проверьте client_id, secret и режим (Sandbox / Production) в «Ключи Plaid».",
  ITEM_LOGIN_REQUIRED: "Банк просит войти заново — нажмите «Войти в банк заново».",
  INSTITUTION_DOWN: "Банк сейчас недоступен — попробуйте обновить позже.",
  INSTITUTION_NOT_RESPONDING: "Банк сейчас не отвечает — попробуйте обновить позже.",
  RATE_LIMIT_EXCEEDED: "Слишком много запросов к Plaid — попробуйте через несколько минут.",
  PRODUCT_NOT_READY: "Банк ещё готовит операции — обновите через несколько минут.",
};

export function bankError(error: unknown) {
  if (error instanceof PlaidApiError) {
    const message = PLAID_MESSAGES[error.code] || error.displayMessage || `Plaid: ${error.message}`;
    return apiError(400, "bank_feed_failed", message, { plaid_error_code: error.code });
  }
  const message = error instanceof Error ? error.message : "Не удалось выполнить операцию.";
  return apiError(400, "bank_feed_failed", message);
}
