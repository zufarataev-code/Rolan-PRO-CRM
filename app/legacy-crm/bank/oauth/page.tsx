import { redirect } from "next/navigation";

import { BankFeeds } from "../../../../components/bank-feeds";
import { getAppSession } from "@/lib/auth/app-session";
import { ROLE_CODES } from "@/lib/auth/constants";

export const dynamic = "force-dynamic";

/**
 * Plaid OAuth return address (Chase, Bank of America, Wells Fargo…): the bank
 * sends the owner here and Link resumes with the saved token. Owner only.
 * Register https://<CRM>/legacy-crm/bank/oauth in Plaid Dashboard → Allowed redirect URIs.
 */
export default async function LegacyCrmBankOAuthPage() {
  const session = await getAppSession();
  if (!session) redirect("/login");
  if (session.preview || !session.roles.includes(ROLE_CODES.OWNER)) redirect("/legacy-crm");
  return <BankFeeds oauthReturn />;
}
