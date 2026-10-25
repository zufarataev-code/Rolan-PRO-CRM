import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
const publishService = readFileSync("src/features/legacy-crm/publish-proposal.ts", "utf8");
const proposalService = readFileSync("src/features/proposals/service.ts", "utf8");
const notificationsRoute = readFileSync("app/api/v1/notifications/route.ts", "utf8");

test("publishing a legacy proposal keeps the manager assigned in the Project", () => {
  assert.match(html, /manager_legacy_id:\s*order\.managerId\s*\|\|\s*null/);
  assert.match(publishService, /legacy_user_ids:\s*\{\s*has:\s*snapshot\.managerLegacyId\s*\}/);
  assert.match(publishService, /assigned_manager_id:\s*assignedManager\?\.user_id\s*\?\?\s*session\.user\.user_id/);
  assert.match(publishService, /data:\s*\{\s*assigned_manager_id:\s*assignedManager\.user_id\s*\}/);
});

test("a client signature advances the canonical deal and notifies its manager", () => {
  const signatureBlock = proposalService.slice(
    proposalService.indexOf("export async function signPublicAgreement"),
    proposalService.indexOf("export async function", proposalService.indexOf("export async function signPublicAgreement") + 30),
  );
  assert.match(signatureBlock, /updateDealStage\([\s\S]*?"APPROVED"\)/);
  assert.match(signatureBlock, /recipientUserId:\s*proposal\.deal\.assigned_manager_id/);
  assert.match(signatureBlock, /typeKey:\s*"agreement\.signed"/);
});

test("legacy CRM reads server notifications, syncs the Project and acknowledges the bell", () => {
  assert.match(html, /fetch\('\/api\/v1\/notifications'/);
  assert.match(html, /syncProposalFromServerNotification/);
  assert.match(html, /premiumApplyServerProposalState\(prop\.orderId, proposal\)/);
  assert.match(html, /setInterval\(\(\) => \{ if \(ROLANPRO_CLOUD && cloudReady\) refreshServerNotifications\(\); \}, 20000\)/);
  assert.match(notificationsRoute, /listNotificationsForSession/);
  assert.match(notificationsRoute, /markNotificationsReadForSession/);
});
