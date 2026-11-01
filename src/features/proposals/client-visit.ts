import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

import { applyVisitChange, publicVisitFromPayload, type PublicVisit, type VisitChangeError, type VisitChangeInput } from "./client-visit-core";

export type { PublicVisit, VisitChangeError, VisitChangeInput } from "./client-visit-core";

type Row = Record<string, any>;

async function legacyOrderIdForToken(accessToken: string) {
  const proposal = await prisma.proposal.findUnique({
    where: { access_token: accessToken },
    select: { deal: { select: { legacy_order_id: true } } },
  }) as { deal?: { legacy_order_id?: string | null } | null } | null;
  if (!proposal) return undefined;
  return proposal.deal?.legacy_order_id || null;
}

/** undefined: no such proposal; null: no visit to show. */
export async function getPublicVisit(accessToken: string): Promise<PublicVisit | null | undefined> {
  const orderId = await legacyOrderIdForToken(accessToken);
  if (orderId === undefined) return undefined;
  if (!orderId) return null;
  const workspace = await prisma.legacyWorkspace.findUnique({ where: { workspace_id: "primary" }, select: { payload: true } });
  return workspace ? publicVisitFromPayload(workspace.payload as Row, orderId) : null;
}

export async function requestPublicVisitChange(accessToken: string, input: VisitChangeInput): Promise<VisitChangeError | PublicVisit> {
  const orderId = await legacyOrderIdForToken(accessToken);
  if (!orderId) return orderId === null ? "no_visit" : "not_found";
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ payload: Prisma.JsonValue }>>(
      Prisma.sql`SELECT payload FROM legacy_workspaces WHERE workspace_id = 'primary' FOR UPDATE`,
    );
    if (!rows[0]) return "not_found" as const;
    const payload = structuredClone(rows[0].payload) as Row;
    const result = applyVisitChange(payload, orderId, input);
    if (typeof result === "string") return result;
    await tx.legacyWorkspace.update({
      where: { workspace_id: "primary" },
      data: { payload: payload as Prisma.InputJsonValue, revision: { increment: 1 } },
    });
    return result;
  }, { maxWait: 5_000, timeout: 20_000 });
}
