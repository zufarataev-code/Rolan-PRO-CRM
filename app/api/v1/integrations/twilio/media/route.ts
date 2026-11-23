import { NextRequest } from "next/server";

import { fetchTwilioMessageMedia } from "@/features/twilio/service";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError } from "@/lib/http/api-response";

/** Staff-only: a photo or PDF the customer sent in WhatsApp, fetched from Twilio with server credentials. */
export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request);
  if (!auth.ok) return apiError(401, "unauthorized", "Authentication is required.");
  const sid = request.nextUrl.searchParams.get("sid") || "";
  const index = Number(request.nextUrl.searchParams.get("i") ?? "0");
  if (!/^[A-Za-z0-9]{10,64}$/.test(sid) || !Number.isInteger(index) || index < 0 || index > 9) {
    return apiError(400, "invalid_media", "Invalid media reference.");
  }
  const media = await fetchTwilioMessageMedia(sid, index);
  if (!media) return apiError(404, "media_not_found", "File is not available.");
  return new Response(media.body, {
    headers: { "content-type": media.contentType, "cache-control": "private, max-age=86400" },
  });
}
