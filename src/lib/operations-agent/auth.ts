import { createHmac, timingSafeEqual } from "node:crypto";

export const OPERATIONS_AGENT_SIGNATURE_HEADER = "x-rolan-agent-signature";
export const OPERATIONS_AGENT_TIMESTAMP_HEADER = "x-rolan-agent-timestamp";

const MAX_CLOCK_SKEW_SECONDS = 300;

export function verifyOperationsAgentSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  secret: string,
  nowMs = Date.now(),
) {
  if (!secret || secret.length < 32 || !timestamp || !signature) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;

  const nowSeconds = Math.floor(nowMs / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signature.trim().toLowerCase(), "utf8");

  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}
