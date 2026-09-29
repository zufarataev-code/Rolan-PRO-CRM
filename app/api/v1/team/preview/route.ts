import { NextRequest, NextResponse } from "next/server";

import { ROLE_CODES } from "@/lib/auth/constants";
import { PREVIEW_COOKIE, PREVIEW_TTL_SECONDS, isValidPreviewTarget, loadSessionUser } from "@/lib/auth/preview";
import { getRealRequestSession } from "@/lib/auth/server";
import { apiError } from "@/lib/http/api-response";

function previewCookie(value: string, maxAge: number) {
  return {
    name: PREVIEW_COOKIE,
    value,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

/** Owner starts "view as employee" for one employee (read-only, one hour). */
export async function POST(request: NextRequest) {
  const session = await getRealRequestSession(request);
  if (!session) {
    return apiError(401, "unauthorized", "Authentication is required.");
  }
  if (!session.roles.includes(ROLE_CODES.OWNER)) {
    return apiError(403, "forbidden", "Только владелец может смотреть глазами сотрудника.");
  }

  const body = (await request.json().catch(() => null)) as { userId?: string } | null;
  const userId = body?.userId?.trim();
  if (!isValidPreviewTarget(userId)) {
    return apiError(400, "invalid_payload", "Укажите сотрудника.");
  }
  if (userId === session.user.user_id) {
    return apiError(400, "invalid_payload", "Это ваш собственный аккаунт.");
  }

  const subject = await loadSessionUser(userId);
  if (!subject) {
    return apiError(404, "not_found", "Сотрудник не найден.");
  }

  const response = NextResponse.json({
    data: {
      userId: subject.user_id,
      fullName: subject.full_name,
      roles: subject.user_accesses.map((access) => access.role.code),
      redirectTo: "/legacy-crm",
    },
    meta: {},
    errors: [],
  });
  response.cookies.set(previewCookie(subject.user_id, PREVIEW_TTL_SECONDS));
  return response;
}

/** Leaves the preview. Allowed for anyone: clearing the cookie is always safe. */
export async function DELETE() {
  const response = NextResponse.json({ data: { redirectTo: "/team" }, meta: {}, errors: [] });
  response.cookies.set(previewCookie("", 0));
  return response;
}
