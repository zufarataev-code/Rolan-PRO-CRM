import assert from "node:assert/strict";
import test from "node:test";

import { isPreviewWriteAllowed } from "./preview-edge";

test("preview allows plain reads and leaving the preview", () => {
  assert.equal(isPreviewWriteAllowed("GET", "/api/v1/consultations"), true);
  assert.equal(isPreviewWriteAllowed("DELETE", "/api/v1/team/preview"), true);
  assert.equal(isPreviewWriteAllowed("POST", "/api/v1/auth/logout"), true);
});

test("preview refuses writes and side-effecting GET routes", () => {
  assert.equal(isPreviewWriteAllowed("POST", "/api/v1/leads"), false);
  assert.equal(isPreviewWriteAllowed("PUT", "/api/v1/legacy-crm/state"), false);
  assert.equal(isPreviewWriteAllowed("GET", "/api/v1/integrations/gmail/connect"), false);
  assert.equal(isPreviewWriteAllowed("GET", "/api/v1/integrations/gmail/callback"), false);
  assert.equal(isPreviewWriteAllowed("GET", "/api/v1/auth/demo-login"), false);
  assert.equal(isPreviewWriteAllowed("GET", "/api/v1/something/sync"), false);
});
