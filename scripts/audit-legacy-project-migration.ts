import { PrismaClient } from "@prisma/client";
import { auditLegacyProjectMigration } from "../src/features/projects/legacy-migration-audit";

const db = new PrismaClient();
async function main() {
  const report = await db.$transaction(async tx => {
    // Database-enforced protection even if a future edit accidentally adds a write.
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const workspace = await tx.legacyWorkspace.findUniqueOrThrow({ where: { workspace_id: "primary" } });
    const users = await tx.user.findMany({ select: { user_id: true, legacy_user_ids: true } });
    const proposals = await tx.proposal.findMany({ select: {
      proposal_id: true, access_token: true, project: { select: { project_id: true } },
    } });
    return auditLegacyProjectMigration(workspace.payload, workspace.revision, { users, proposals });
  }, { isolationLevel: "RepeatableRead", timeout: 30000 });
  // IDs, counts and issue codes only: no client contacts, access tokens or payload dump.
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Migration audit failed"); process.exitCode = 1; }).finally(() => db.$disconnect());
