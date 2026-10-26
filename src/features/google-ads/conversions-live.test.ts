import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parseServiceAccountJson } from './credentials';

// Owner, 2026-10-25: «вот что нужно делать» — the Google Ads CRM integration spec.
const read = (p: string) => readFileSync(p, 'utf8');
const fakeKey = '-----BEGIN PRIVATE KEY-----\\nMIIB\\n-----END PRIVATE KEY-----\\n';

test('a service-account key is checked before it is stored', () => {
  const ok = parseServiceAccountJson(JSON.stringify({ type: 'service_account', client_email: 'crm@rolanpro-ads.iam.gserviceaccount.com', private_key: fakeKey }));
  assert.equal(ok.email, 'crm@rolanpro-ads.iam.gserviceaccount.com');
  assert.match(ok.privateKey, /^-----BEGIN PRIVATE KEY-----\nMIIB/);
  assert.throws(() => parseServiceAccountJson('not json'), /JSON/);
  assert.throws(() => parseServiceAccountJson(JSON.stringify({ type: 'authorized_user' })), /service_account/);
  assert.throws(() => parseServiceAccountJson(JSON.stringify({ type: 'service_account', client_email: 'a@gmail.com', private_key: fakeKey })), /client_email/);
  const service = read('src/features/google-ads/credentials.ts');
  assert.match(service, /private_key_encrypted: encryptBankSecret\(account\.privateKey\)/);
  assert.match(read('src/features/google-ads/oauth.ts'), /const account = await resolveServiceAccount\(\);/);
});

test('the sale milestone and the qualification come from the working CRM', () => {
  const sale = read('src/features/sales/close-sale.ts');
  assert.match(sale, /await ensureClosedWonConversion\(tx, \{[\s\S]*?conversionValue: proposal\.selected_total_amount \?\? null,/);
  const publish = read('src/features/legacy-crm/publish-proposal.ts');
  assert.match(publish, /pipelineStatusCode: "PROPOSAL_SENT",/);
  assert.match(publish, /attribution_touchpoint_id: touchpointId,/);
  assert.match(publish, /async function findAcquisitionTouchpointForContact\(/);
});

test('delivery runs by itself every 10 minutes and on demand; test mode until the owner confirms', () => {
  const cycle = read('src/features/google-ads/sync-cycle.ts');
  assert.match(cycle, /const TEN_MINUTES = 10 \* 60 \* 1000;/);
  assert.match(cycle, /if \(!settings\?\.upload_enabled \|\| !settings\.conversion_owner_customer_id\) return \{ skipped: "not_enabled" as const \};/);
  assert.match(read("instrumentation.ts"), /if \(process\.env\.NEXT_RUNTIME === "nodejs"\) \{/);
  const live = read('src/features/google-ads/live-activation.ts');
  assert.match(live, /GOOGLE_ADS_VALIDATE_ONLY\?\.trim\(\)\.toLowerCase\(\) === "true"/);
  assert.match(live, /customer_id_confirmation_mismatch/);
  for (const route of ['credentials', 'sync-now']) {
    assert.match(read(`app/api/v1/integrations/google-ads/${route}/route.ts`), /requireRequestSession\(request, \[ROLE_CODES\.OWNER\]\)/);
  }
});

test('the CRM screen walks the owner through access, IDs, test and live', () => {
  const stages = read('private/legacy/production-stages.js');
  const block = stages.slice(stages.indexOf('// ---------- GOOGLE ADS: КОНВЕРСИИ ИЗ CRM'));
  assert.match(block, /Доступ CRM к Google/);
  assert.match(block, /CRM – Qualified Lead/);
  assert.match(block, /CRM – Converted Lead/);
  assert.match(block, /confirmation: 'ENABLE_LIVE_GOOGLE_ADS_UPLOADS'/);
  assert.match(block, /if \(box\) box\.value = '';/, 'the pasted key is cleared from the page');
  assert.match(stages, /\$\{googleAdsConversionsPanelHtml\(\)\}/);
  assert.doesNotMatch(block, /^(const|let) /m);
});
