import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Owner, 2026-11-22 21:55: «API ключ нашей CRM для бота-ассистента», «полный доступ».
const server = readFileSync("src/lib/auth/server.ts", "utf8");
const middleware = readFileSync("middleware.ts", "utf8");
const keys = readFileSync("src/features/integrations/api-keys.ts", "utf8");
const keyRoute = readFileSync("app/api/v1/settings/integration-keys/route.ts", "utf8");
const stages = readFileSync("private/legacy/production-stages.js", "utf8");

test("the assistant key is an integration key and acts only as an active owner", () => {
  assert.match(keys, /INTEGRATIONS = \["google_ads", "assistant"\]/);
  assert.match(server, /if \(!token\) \{\s*return assistantKeySession\(request\);/);
  assert.match(server, /assistantKeyOwnerId\(key\)/);
  assert.match(server, /if \(!user \|\| !user\.is_active\) return null;/);
  assert.match(server, /if \(!roles\.includes\("OWNER"\)\) return null;/);
});

test("the edge lets a bearer key through to /api/v1 only, where the server checks it", () => {
  assert.match(middleware, /!sessionToken && isApiV1 && \/\^bearer rpk_\/i\.test\(bearer\)/);
});

test("a key cannot mint or switch off keys", () => {
  assert.equal(keyRoute.match(/auth\.session\.viaApiKey\) return apiError\(403/g)?.length, 3);
});

test("the owner creates, sees and switches off the key in Integrations", () => {
  assert.match(stages, /function assistantKeyPanelHtml\(\)/);
  assert.match(stages, /integration: 'assistant'/);
  assert.match(stages, /integration-keys\?integration=assistant', \{ method: 'DELETE'/);
});
