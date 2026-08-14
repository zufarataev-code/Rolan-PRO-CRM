import { redirect } from "next/navigation";

import { GmailMailbox } from "@/components/gmail-mailbox";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireAppSession } from "@/lib/auth/app-session";

const MAIL_ROLES = [ROLE_CODES.OWNER, ROLE_CODES.MANAGER] as const;

export default async function MailPage() {
  const session = await requireAppSession(MAIL_ROLES);
  if (!session) redirect("/login");

  const isOwner = session.roles.includes(ROLE_CODES.OWNER);

  return <GmailMailbox canConnect={isOwner} />;
}
