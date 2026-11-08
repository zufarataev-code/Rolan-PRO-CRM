import assert from "node:assert/strict";
import test from "node:test";

import { buildStorageKey, isAllowedMediaType, isValidStorageKey, presignUrl } from "./spaces";

test("presign matches the AWS SigV4 reference example", () => {
  // AWS docs: "Example: A presigned URL" (examplebucket / test.txt / 2013-05-24, 86400 s).
  const url = presignUrl({
    config: {
      endpoint: "https://s3.amazonaws.com",
      region: "us-east-1",
      bucket: "examplebucket",
      accessKey: "AKIAIOSFODNN7EXAMPLE",
      secretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    },
    method: "GET",
    key: "test.txt",
    expiresSeconds: 86400,
    now: new Date("2013-05-24T00:00:00Z"),
  });
  assert.match(url, /^https:\/\/examplebucket\.s3\.amazonaws\.com\/test\.txt\?/);
  assert.match(url, /X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404$/);
});

test("storage keys are safe, dated and validated", () => {
  const key = buildStorageKey({ scope: "order 12/../x", fileName: "IMG 0001 (1).HEIC", now: new Date("2026-11-08T00:00:00Z"), id: "abc" });
  assert.equal(key, "crm/order-12-x/2026-11/abc-IMG-0001-1-.heic");
  assert.equal(isValidStorageKey(key), true);
  const clean = buildStorageKey({ scope: "order-42", fileName: "video.mov", now: new Date("2026-11-08T00:00:00Z"), id: "u1" });
  assert.equal(clean, "crm/order-42/2026-11/u1-video.mov");
  assert.equal(isValidStorageKey(clean), true);
  assert.equal(isValidStorageKey("crm/../secrets"), false);
  assert.equal(isAllowedMediaType("video/quicktime"), true);
  assert.equal(isAllowedMediaType("image/heic"), true);
  assert.equal(isAllowedMediaType("text/html"), false);
});
