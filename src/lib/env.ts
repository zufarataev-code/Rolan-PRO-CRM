type AppEnv = {
  authSecret: string;
  databaseUrl: string;
  demoLoginEnabled: boolean;
  sessionCookieName: string;
  sessionTtlHours: number;
  appUrl: string;
  nodeEnv: string;
};

const INSECURE_AUTH_SECRETS = new Set([
  "development-only-secret",
  "change-me-before-production",
  "replace-me",
]);

function resolveAuthSecret(nodeEnv: string) {
  const authSecret = process.env.AUTH_SECRET?.trim() || "development-only-secret";

  if (
    nodeEnv === "production" &&
    (authSecret.length < 32 || INSECURE_AUTH_SECRETS.has(authSecret.toLowerCase()))
  ) {
    throw new Error("AUTH_SECRET must be a unique secret of at least 32 characters in production.");
  }

  return authSecret;
}

export function getEnv(): AppEnv {
  const nodeEnv = process.env.NODE_ENV ?? "development";

  return {
    authSecret: resolveAuthSecret(nodeEnv),
    databaseUrl: process.env.DATABASE_URL ?? "",
    demoLoginEnabled:
      nodeEnv !== "production" && process.env.ENABLE_DEMO_LOGIN?.trim().toLowerCase() === "true",
    sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "rolanpro_session",
    sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? "168"),
    appUrl: process.env.APP_URL ?? "http://localhost:3000",
    nodeEnv,
  };
}
