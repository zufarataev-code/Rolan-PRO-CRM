type AppEnv = {
  authSecret: string;
  databaseUrl: string;
  sessionCookieName: string;
  sessionTtlHours: number;
  appUrl: string;
  nodeEnv: string;
};

export function getEnv(): AppEnv {
  return {
    authSecret: process.env.AUTH_SECRET ?? "development-only-secret",
    databaseUrl: process.env.DATABASE_URL ?? "",
    sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "rolanpro_session",
    sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? "168"),
    appUrl: process.env.APP_URL ?? "http://localhost:3000",
    nodeEnv: process.env.NODE_ENV ?? "development",
  };
}
