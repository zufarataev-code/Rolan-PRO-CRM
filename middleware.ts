import { NextResponse, type NextRequest } from "next/server";

import { getEnv } from "@/lib/env";
import { getRolesForPath, hasAnyRole } from "@/lib/auth/rbac";

type EdgeSessionPayload = {
  roles: string[];
  exp: number;
};

function base64UrlToBase64(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;

  if (padding === 0) {
    return normalized;
  }

  return normalized.padEnd(normalized.length + (4 - padding), "=");
}

function arrayBufferToBase64Url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function encodeText(value: string) {
  return new TextEncoder().encode(value);
}

function decodePayloadSegment(segment: string) {
  return JSON.parse(atob(base64UrlToBase64(segment))) as EdgeSessionPayload;
}

async function verifyEdgeSession(token: string) {
  const [header, payload, signature] = token.split(".");

  if (!header || !payload || !signature) {
    return null;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encodeText(getEnv().authSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const expected = await crypto.subtle.sign("HMAC", key, encodeText(`${header}.${payload}`));
  const expectedSignature = arrayBufferToBase64Url(expected);

  if (expectedSignature !== signature) {
    return null;
  }

  const decoded = decodePayloadSegment(payload);

  if (decoded.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return decoded;
}

function isPublicPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api/v1/auth/login") ||
    pathname.startsWith("/api/v1/auth/logout")
  );
}

function deny(request: NextRequest, status: number, code: string, message: string) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        data: null,
        meta: {},
        errors: [{ code, message }],
      },
      { status },
    );
  }

  return NextResponse.redirect(new URL("/", request.url));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const isApiV1 = pathname.startsWith("/api/v1");
  const requiredRoles = getRolesForPath(pathname);
  const sessionToken = request.cookies.get(getEnv().sessionCookieName)?.value;

  if (!sessionToken && (isApiV1 || requiredRoles)) {
    return deny(request, 401, "unauthorized", "Authentication is required.");
  }

  if (!sessionToken) {
    return NextResponse.next();
  }

  const session = await verifyEdgeSession(sessionToken);

  if (!session && (isApiV1 || requiredRoles)) {
    return deny(request, 401, "invalid_session", "Session is invalid or expired.");
  }

  if (session && requiredRoles && !hasAnyRole(session.roles, requiredRoles)) {
    return deny(request, 403, "forbidden", "Insufficient role permissions.");
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
