import { prisma } from "@/lib/db";
import { checkHealth } from "@/features/core/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const result = await checkHealth(() => prisma.$queryRaw`SELECT 1`);
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
