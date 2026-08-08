import { getEnv } from "@/lib/env";
import { apiSuccess } from "@/lib/http/api-response";

export async function POST() {
  const response = apiSuccess({
    logged_out: true,
  });

  response.cookies.set({
    name: getEnv().sessionCookieName,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: getEnv().nodeEnv === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}
