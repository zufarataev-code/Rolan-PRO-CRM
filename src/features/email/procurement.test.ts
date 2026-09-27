import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync("src/features/email/procurement.ts", "utf8");
const route = readFileSync("app/api/v1/integrations/procurement-email/messages/route.ts", "utf8");

test("supplier email uses the non-client Resend channel", () => {
  assert.match(service, /process\.env\.PROCUREMENT_EMAIL_API_KEY \|\| process\.env\.MARKETING_EMAIL_API_KEY/);
  assert.match(service, /fetch\(`\$\{RESEND_API\}\/emails`/);
  assert.doesNotMatch(service, /sendPrimaryGmail|workMailApi/);
  assert.match(service, /must not be the main Google Workspace mailbox/);
});

test("supplier email is idempotent by purchase request", () => {
  assert.match(route, /idempotencyKey: `procurement-\$\{purchaseRequestId\}`/);
  assert.match(service, /"Idempotency-Key": input\.idempotencyKey/);
  assert.match(route, /purchase_request_id: purchaseRequestId/);
});

test("supplier request recipient and content come from the locked persisted workspace", () => {
  assert.match(route, /FROM legacy_workspaces WHERE workspace_id = 'primary' FOR UPDATE/);
  assert.match(route, /purchaseRequest = requests\.find/);
  assert.match(route, /vendor = vendors\.find/);
  assert.match(route, /buildProcurementMessage\(purchaseRequest, vendor\)/);
  assert.doesNotMatch(route, /body\?\.(?:to|subject|body)/);
  assert.match(route, /purchaseRequest\.status = "requested"/);
  assert.match(route, /workspace_revision: result\.revision/);
});

test("only owner and manager can send supplier requests", () => {
  assert.match(route, /ROLE_CODES\.OWNER, ROLE_CODES\.MANAGER/);
  assert.match(route, /requireRequestSession\(request, ROLES\)/);
  assert.match(route, /action_key: "procurement\.request\.sent"/);
});
