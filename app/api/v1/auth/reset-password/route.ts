import { PasswordRecoveryError, resetPasswordWithToken } from "@/features/auth/password-recovery";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { token?: unknown; password?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!token || !password) {
    return apiError(400, "invalid_input", "Ссылка восстановления и новый пароль обязательны.");
  }

  try {
    const result = await resetPasswordWithToken(token, password);
    return apiSuccess({ email: result.email, message: "Пароль изменён. Теперь можно войти в CRM." });
  } catch (error) {
    if (error instanceof PasswordRecoveryError) {
      return apiError(400, error.code, error.message);
    }
    console.error("[Password recovery] reset failed", error);
    return apiError(500, "password_reset_failed", "Не удалось изменить пароль.");
  }
}
