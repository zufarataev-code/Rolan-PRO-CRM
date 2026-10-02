/**
 * Minimal Plaid API client over fetch (no SDK dependency). Only the calls the
 * bank feed needs: Link token, token exchange, accounts, institution name and
 * transactions sync. https://plaid.com/docs/api/
 */

export type PlaidEnvironment = "sandbox" | "production";

export type PlaidConfig = {
  clientId: string;
  secret: string;
  environment: PlaidEnvironment;
};

export type PlaidAccount = {
  account_id: string;
  name: string;
  official_name?: string | null;
  mask?: string | null;
  type: string;
  subtype?: string | null;
  balances: {
    current?: number | null;
    available?: number | null;
    limit?: number | null;
    iso_currency_code?: string | null;
  };
};

export type PlaidTransaction = {
  transaction_id: string;
  account_id: string;
  amount: number;
  iso_currency_code?: string | null;
  date: string;
  authorized_date?: string | null;
  name: string;
  merchant_name?: string | null;
  pending: boolean;
  personal_finance_category?: { primary?: string | null; detailed?: string | null } | null;
};

export class PlaidApiError extends Error {
  constructor(readonly code: string, message: string, readonly displayMessage?: string | null) {
    super(message);
    this.name = "PlaidApiError";
  }
}

const BASE_URLS: Record<PlaidEnvironment, string> = {
  sandbox: "https://sandbox.plaid.com",
  production: "https://production.plaid.com",
};

export function plaidBaseUrl(environment: PlaidEnvironment) {
  return BASE_URLS[environment];
}

export function createPlaidClient(config: PlaidConfig, fetchImpl: typeof fetch = fetch) {
  async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetchImpl(`${plaidBaseUrl(config.environment)}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Plaid-Version": "2020-09-14" },
      body: JSON.stringify({ client_id: config.clientId, secret: config.secret, ...body }),
    });
    const payload = (await response.json().catch(() => null)) as (T & {
      error_code?: string;
      error_message?: string;
      display_message?: string | null;
    }) | null;
    if (!response.ok || !payload) {
      throw new PlaidApiError(
        payload?.error_code || `HTTP_${response.status}`,
        payload?.error_message || `Plaid request ${path} failed.`,
        payload?.display_message,
      );
    }
    return payload;
  }

  return {
    createLinkToken(input: { userId: string; accessToken?: string }) {
      return call<{ link_token: string; expiration: string }>("/link/token/create", {
        client_name: "Rolan PRO CRM",
        language: "en",
        country_codes: ["US"],
        user: { client_user_id: input.userId },
        // A token with an access token opens Link in update mode (re-login).
        ...(input.accessToken
          ? { access_token: input.accessToken }
          : { products: ["transactions"], transactions: { days_requested: 730 } }),
      });
    },
    exchangePublicToken(publicToken: string) {
      return call<{ access_token: string; item_id: string }>("/item/public_token/exchange", { public_token: publicToken });
    },
    getAccounts(accessToken: string) {
      return call<{ accounts: PlaidAccount[]; item: { item_id: string; institution_id?: string | null } }>("/accounts/get", {
        access_token: accessToken,
      });
    },
    getInstitutionName(institutionId: string) {
      return call<{ institution: { name: string } }>("/institutions/get_by_id", {
        institution_id: institutionId,
        country_codes: ["US"],
      }).then((result) => result.institution.name);
    },
    syncTransactions(accessToken: string, cursor?: string | null) {
      return call<{
        added: PlaidTransaction[];
        modified: PlaidTransaction[];
        removed: Array<{ transaction_id: string }>;
        next_cursor: string;
        has_more: boolean;
      }>("/transactions/sync", { access_token: accessToken, ...(cursor ? { cursor } : {}), count: 500 });
    },
  };
}

export type PlaidClient = ReturnType<typeof createPlaidClient>;
