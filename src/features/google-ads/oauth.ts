import { createSign } from "node:crypto";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/datamanager",
  "https://www.googleapis.com/auth/adwords",
];

const tokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

async function parseTokenResponse(response: Response, cacheKey: string) {
  const body = (await response.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number; error?: string; error_description?: string }
    | null;

  if (!response.ok || !body?.access_token) {
    throw new Error(
      `Google OAuth token request failed (${response.status}): ${body?.error_description ?? body?.error ?? "unknown error"}`,
    );
  }

  const ttlSeconds = Math.max(60, Number(body.expires_in ?? 3600));
  const cached = {
    accessToken: body.access_token,
    expiresAt: Date.now() + (ttlSeconds - 60) * 1000,
  };
  tokenCache.set(cacheKey, cached);
  return cached.accessToken;
}

async function tokenFromRefreshToken(cacheKey: string) {
  const clientId = process.env.GOOGLE_ADS_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_ADS_OAUTH_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) return null;

  const form = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    signal: AbortSignal.timeout(30_000),
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  return parseTokenResponse(response, cacheKey);
}

async function tokenFromServiceAccount(scopes: string[], cacheKey: string) {
  // Server env first, then the key the owner saved in CRM settings.
  const { resolveServiceAccount } = await import("./credentials");
  const account = await resolveServiceAccount();
  if (!account) return null;
  const { email, privateKey } = account;

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
  const payload = base64UrlJson({
    iss: email,
    scope: scopes.join(" "),
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600,
  });
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey).toString("base64url");

  const form = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: `${unsigned}.${signature}`,
  });
  const response = await fetch(TOKEN_ENDPOINT, {
    signal: AbortSignal.timeout(30_000),
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  return parseTokenResponse(response, cacheKey);
}

export async function getGoogleAccessToken(scopes = DEFAULT_SCOPES) {
  const cacheKey = [...new Set(scopes)].sort().join(" ");
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.accessToken;

  const refreshTokenAccess = await tokenFromRefreshToken(cacheKey);
  if (refreshTokenAccess) return refreshTokenAccess;

  const serviceAccountAccess = await tokenFromServiceAccount(scopes, cacheKey);
  if (serviceAccountAccess) return serviceAccountAccess;

  throw new Error(
    "Google credentials are not configured. Set OAuth refresh-token credentials or a service-account email/private key.",
  );
}

export function clearGoogleAccessTokenCache() {
  tokenCache.clear();
}
