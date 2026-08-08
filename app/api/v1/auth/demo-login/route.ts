import { NextRequest, NextResponse } from "next/server";

import { createSessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";

const DEMO_ROLE_MAP = {
  owner: {
    email: "owner@rolanpro.local",
    redirectTo: "/owner",
  },
  manager: {
    email: "manager@rolanpro.local",
    redirectTo: "/manager",
  },
  consultant: {
    email: "consultant@rolanpro.local",
    redirectTo: "/survey",
  },
  installer: {
    email: "installer@rolanpro.local",
    redirectTo: "/installer/jobs",
  },
} as const;

export async function GET(request: NextRequest) {
  const role = request.nextUrl.searchParams.get("role")?.trim().toLowerCase() as
    | keyof typeof DEMO_ROLE_MAP
    | undefined;

  if (!role || !(role in DEMO_ROLE_MAP)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const demoUser = DEMO_ROLE_MAP[role];
  const user = await prisma.user.findUnique({
    where: {
      email: demoUser.email,
    },
    include: {
      user_accesses: {
        where: {
          is_active: true,
          role: {
            is_active: true,
          },
        },
        include: {
          role: true,
        },
      },
    },
  });

  if (!user?.is_active || user.user_accesses.length === 0) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  await prisma.user.update({
    where: {
      user_id: user.user_id,
    },
    data: {
      last_login_at: new Date(),
    },
  });

  const sessionToken = createSessionToken({
    sub: user.user_id,
    email: user.email,
    roles: user.user_accesses.map((access) => access.role.code),
  });

  const response = NextResponse.redirect(new URL(demoUser.redirectTo, request.url));
  response.cookies.set({
    name: getEnv().sessionCookieName,
    value: sessionToken,
    httpOnly: true,
    sameSite: "lax",
    secure: getEnv().nodeEnv === "production",
    path: "/",
    maxAge: getEnv().sessionTtlHours * 60 * 60,
  });

  return response;
}
