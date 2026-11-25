import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

import { NextRequest, NextResponse } from "next/server";

import { apiError } from "@/lib/http/api-response";
import { LOCAL_MAX_UPLOAD_BYTES, localMediaPath, verifyLocalSignedUrl } from "@/lib/storage/local";
import { isAllowedMediaType } from "@/lib/storage/spaces";

export const dynamic = "force-dynamic";

/** Signed upload of one file to the CRM server's disk (the browser PUTs the original). */
export async function PUT(request: NextRequest) {
  const key = verifyLocalSignedUrl(request.nextUrl.searchParams, "PUT");
  if (!key) return apiError(403, "forbidden", "The upload link is invalid or expired.");
  const contentType = request.headers.get("content-type")?.split(";")[0].trim() || "application/octet-stream";
  if (!isAllowedMediaType(contentType)) return apiError(400, "invalid_type", "Only photos, videos and PDF files are allowed.");
  if (!request.body) return apiError(400, "invalid_payload", "The file is empty.");
  const target = localMediaPath(key);
  await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.part`;
  let size = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      size += chunk.length;
      done(size > LOCAL_MAX_UPLOAD_BYTES ? new Error("too_large") : null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(request.body as unknown as WebReadableStream), limit, createWriteStream(temp));
  } catch (error) {
    await rm(temp, { force: true });
    if (error instanceof Error && error.message === "too_large") return apiError(413, "invalid_size", "File is larger than 200 MB.");
    throw error;
  }
  if (!size) {
    await rm(temp, { force: true });
    return apiError(400, "invalid_payload", "The file is empty.");
  }
  await rename(temp, target);
  await writeFile(`${target}.type`, contentType);
  return new NextResponse(null, { status: 200 });
}

/** Signed download (staff view through /api/v1/files/view, Twilio for WhatsApp media). */
export async function GET(request: NextRequest) {
  const key = verifyLocalSignedUrl(request.nextUrl.searchParams, "GET");
  if (!key) return apiError(403, "forbidden", "The link is invalid or expired.");
  const file = localMediaPath(key);
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return apiError(404, "not_found", "File not found.");
  const contentType = (await readFile(`${file}.type`, "utf8").catch(() => "")).trim() || "application/octet-stream";
  const download = request.nextUrl.searchParams.get("download");
  const headers: Record<string, string> = {
    "content-type": contentType,
    "content-length": String(info.size),
    "cache-control": "private, max-age=3000",
    "x-content-type-options": "nosniff",
  };
  if (download) headers["content-disposition"] = `attachment; filename="${download.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100)}"`;
  return new NextResponse(Readable.toWeb(createReadStream(file)) as unknown as ReadableStream, { status: 200, headers });
}
