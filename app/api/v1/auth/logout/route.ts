import { PREVIEW_COOKIE } from "@/lib/auth/preview-edge";
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
  // A preview must never outlive the owner's session: otherwise the next
  // owner to sign in on this browser would land inside that employee's view.
  response.cookies.set({
    name: PREVIEW_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: getEnv().nodeEnv === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}
