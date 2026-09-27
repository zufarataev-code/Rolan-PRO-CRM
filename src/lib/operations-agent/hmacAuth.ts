import { NextRequest } from "next/server";
import crypto from "crypto";

const HMAC_SECRET = process.env.CRM_OPERATIONS_AGENT_SECRET;

export async function verifyHMAC(request: NextRequest): { ok: boolean; message?: string } {
  const hmacHeader = request.headers.get('x-hmac-signature');
  if (!hmacHeader || !HMAC_SECRET) return { ok: false, message: 'Missing HMAC signature or secret.' };

  const timestamp = request.headers.get('x-timestamp');
  if (!timestamp || Math.abs(Date.now() - Number(timestamp)) > 300000) {
    return { ok: false, message: 'Timestamp out of range.' };
  }

  const rawBody = await request.text();
  const hmac = crypto.createHmac('sha256', HMAC_SECRET);
  hmac.update(timestamp + rawBody);

  const calculatedSignature = hmac.digest('hex');
  return { ok: crypto.timingSafeEqual(Buffer.from(hmacHeader), Buffer.from(calculatedSignature)) };
}

