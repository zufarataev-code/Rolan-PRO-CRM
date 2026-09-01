import { PasswordRecoveryError, requestPasswordReset } from "@/features/auth/password-recovery";
import { apiError, apiSuccess } from "@/lib/http/api-response";

const GENERIC_MESSAGE = "Если такой активный аккаунт существует, письмо со ссылкой восстановления отправлено.";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return apiError(400, "invalid_email", "Укажите корректный email.");
  }

  try {
    await requestPasswordReset(email);
    return apiSuccess({ message: GENERIC_MESSAGE });
  } catch (error) {
    if (error instanceof PasswordRecoveryError && error.code === "delivery_unavailable") {
      return apiError(503, error.code, error.message);
    }
    console.error("[Password recovery] request failed", error);
    return apiError(500, "password_reset_failed", "Не удалось обработать запрос восстановления.");
  }
}
