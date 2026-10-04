import { redirect } from "next/navigation";

import { BankFeeds } from "../../../components/bank-feeds";
import { getAppSession } from "@/lib/auth/app-session";
import { ROLE_CODES } from "@/lib/auth/constants";

export const dynamic = "force-dynamic";

/**
 * «Деньги → Счета и карты» (Owner, 2026-10-02). Opened from /legacy-crm as an
 * overlay, like the employee directory. Owner only; never in «Посмотреть глазами».
 */
export default async function LegacyCrmBankPage() {
  const session = await getAppSession();
  if (!session) redirect("/login");
  if (session.preview || !session.roles.includes(ROLE_CODES.OWNER)) redirect("/legacy-crm");
  return <BankFeeds />;
}
