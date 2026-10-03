import { PrismaClient } from "@prisma/client";
import { auditLegacyProjectMigration } from "../src/features/projects/legacy-migration-audit";

import { reconcileLegacyProjectReferences } from "../src/features/projects/legacy-migration-reconciliation";

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
    const clients = await tx.client.findMany({ select: { client_id: true, email: true, phone: true } });
    const projects = await tx.project.findMany({ select: { project_id: true, client_id: true } });
    const films = await tx.filmCatalog.findMany({ select: { film_id: true } });
    return {
      ...auditLegacyProjectMigration(workspace.payload, workspace.revision, { users, proposals }),
      reconciliation: reconcileLegacyProjectReferences(workspace.payload, { clients, projects, films }),
    };
  }, { isolationLevel: "RepeatableRead", timeout: 30000 });
  // Allowlisted IDs, numeric evidence and issue codes: no contacts, tokens or payload dump.
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Migration audit failed"); process.exitCode = 1; }).finally(() => db.$disconnect());
