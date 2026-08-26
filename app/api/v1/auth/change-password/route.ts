import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request);

  if (!auth.ok) {
    return apiError(401, "unauthorized", "Authentication is required.");
  }

  const body = (await request.json().catch(() => null)) as
    | { password?: string }
    | null;
  const password = body?.password ?? "";

  if (password.length < 12) {
    return apiError(400, "weak_password", "Password must contain at least 12 characters.");
  }

  await prisma.user.update({
    where: { user_id: auth.session.user.user_id },
    data: {
      password_hash: hashPassword(password),
      must_change_password: false,
    },
  });

  return apiSuccess({ password_changed: true, roles: auth.session.roles });
}
