import { redirect } from "next/navigation";

import { TeamDirectory } from "../../components/team-directory";
import { listTeamMembers } from "@/features/team/service";
import { getAppSession } from "@/lib/auth/app-session";
import { ROLE_CODES } from "@/lib/auth/constants";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";

export const dynamic = "force-dynamic";

/**
 * The one place the owner manages employees: add, roles, access, password,
 * and "view as employee". Backed only by PostgreSQL; the legacy CRM derives
 * its employee cards from the same records.
 */
export default async function TeamPage() {
  const session = await getAppSession();

  if (!session) {
    redirect("/login");
  }

  if (session.preview) {
    return <TeamDirectory previewName={session.user.full_name} members={[]} ownUserId="" minPasswordLength={PASSWORD_MIN_LENGTH} />;
  }

  if (!session.roles.includes(ROLE_CODES.OWNER)) {
    redirect("/legacy-crm");
  }

  const members = await listTeamMembers();

  return (
    <TeamDirectory
      members={members
        .filter((member) => !member.roles.every((role) => role === ROLE_CODES.AI_SERVICE))
        .map((member) => ({
          userId: member.userId,
          email: member.email,
          fullName: member.fullName,
          roles: member.roles,
          isActive: member.isActive,
          mustChangePassword: member.mustChangePassword,
          lastLoginAt: member.lastLoginAt ? member.lastLoginAt.toISOString() : null,
        }))}
      ownUserId={session.user.user_id}
      minPasswordLength={PASSWORD_MIN_LENGTH}
    />
  );
}
