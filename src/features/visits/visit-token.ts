import { createHmac, timingSafeEqual } from "node:crypto";

import { getEnv } from "@/lib/env";

/**
 * Owner, 2026-11-27: «клиент получает уведомление, переходит по ссылке — ничего не
 * происходит». Every scheduled visit gets its own client link that works without a
 * proposal: who is coming, when, and «Перенести». The link is the project id signed
 * with the server secret, so it cannot be guessed for another project.
 */
const sign = (orderId: string) => createHmac("sha256", getEnv().authSecret).update(`client-visit\n${orderId}`).digest("base64url").slice(0, 22);

export function visitToken(orderId: string) {
  return `${orderId}.${sign(orderId)}`;
}

export function orderIdFromVisitToken(token: string) {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const orderId = token.slice(0, dot);
  if (!/^[A-Za-z0-9_-]{2,80}$/.test(orderId)) return null;
  const expected = Buffer.from(sign(orderId));
  const given = Buffer.from(token.slice(dot + 1));
  return expected.length === given.length && timingSafeEqual(expected, given) ? orderId : null;
}

export function visitUrl(orderId: string) {
  return `${getEnv().appUrl.replace(/\/$/, "")}/visit/${visitToken(orderId)}`;
}
