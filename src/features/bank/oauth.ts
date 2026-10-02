/** Where OAuth banks return the owner; Plaid accepts only HTTPS addresses registered in its Dashboard. */
export function bankOAuthRedirectUri(appUrl: string) {
  try {
    const url = new URL("/legacy-crm/bank/oauth", appUrl);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export const BANK_OAUTH_NOT_REGISTERED =
  "Банки со входом через свой сайт (Chase, Bank of America, Wells Fargo) подключатся, когда адрес возврата добавлен в Plaid: Dashboard → Developers → API → Allowed redirect URIs.";
