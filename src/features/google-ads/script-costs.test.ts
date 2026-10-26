import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { generateIntegrationKey, hashIntegrationKey, integrationKeyFromHeaders, isIntegrationName } from '../integrations/api-keys';
import { parseScriptCostPayload } from './script-costs';

// Owner, 2026-10-25: «сделай API ключ нашей CRM, чтобы подключить Google Ads для аналитики».
const today = new Date('2026-10-25T12:00:00Z');

test('the Google Ads script payload is checked and normalised', () => {
  const ok = parseScriptCostPayload({ customer_id: '123-456-7890', currency: 'usd', rows: [{ date: '2026-10-24', campaign_id: 111, campaign_name: 'Smart film LA', cost_micros: 12_340_000, clicks: 7, impressions: 300 }] }, today);
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.payload.customer_id, '1234567890');
    assert.equal(ok.payload.currency, 'USD');
    assert.deepEqual(ok.payload.rows[0], { date: '2026-10-24', campaign_id: '111', campaign_name: 'Smart film LA', cost_micros: 12_340_000, clicks: 7, impressions: 300 });
  }
  const fromCost = parseScriptCostPayload({ customer_id: '1', rows: [{ date: '2026-10-20', campaign_id: 'a', cost: 5.5 }] }, today);
  assert.equal(fromCost.ok && fromCost.payload.rows[0].cost_micros, 5_500_000);
  assert.equal(parseScriptCostPayload({ customer_id: '1', rows: [{ date: '2024-01-01', campaign_id: 'a' }] }, today).ok, false, 'too old');
  assert.equal(parseScriptCostPayload({ customer_id: '', rows: [] }, today).ok, false);
  assert.equal(parseScriptCostPayload({ customer_id: '1', rows: [{ date: '2026-10-20', campaign_id: 'a', clicks: -1 }] }, today).ok, false);
});

test('a CRM key is random, kept as a hash, read from Bearer or X-Api-Key', () => {
  const a = generateIntegrationKey();
  const b = generateIntegrationKey();
  assert.match(a, /^rpk_[A-Za-z0-9_-]{40}$/);
  assert.notEqual(a, b);
  assert.match(hashIntegrationKey(a), /^[0-9a-f]{64}$/);
  assert.equal(integrationKeyFromHeaders(new Headers({ authorization: `Bearer ${a}` })), a);
  assert.equal(integrationKeyFromHeaders(new Headers({ 'x-api-key': b })), b);
  assert.equal(isIntegrationName('google_ads'), true);
  assert.equal(isIntegrationName('stripe'), false);
});

test('the endpoint is public but needs the key; key management and spend are owner-only', () => {
  const route = readFileSync('app/api/public/google-ads/costs/route.ts', 'utf8');
  assert.match(route, /verifyIntegrationKey\("google_ads", key\)/);
  const keys = readFileSync('app/api/v1/settings/integration-keys/route.ts', 'utf8');
  assert.equal((keys.match(/requireRequestSession\(request, \[ROLE_CODES\.OWNER\]\)/g) || []).length, 3);
  const service = readFileSync('src/features/integrations/api-keys.ts', 'utf8');
  assert.match(service, /key_hash: hashIntegrationKey\(key\)/);
  assert.doesNotMatch(service, /key: key,|plaintext/);
  const migration = readFileSync('prisma/migrations/20261025120000_integration_api_keys/migration.sql', 'utf8');
  assert.match(migration, /"key_hash" CHAR\(64\) NOT NULL/);
});

test('the CRM shows the key once inside a ready script and sets spend against Google projects', () => {
  const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
  const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
  assert.match(html, /\$\{typeof googleAdsCrmPanelHtml === 'function' \? googleAdsCrmPanelHtml\(\) : ''\}/);
  assert.match(stages, /FROM campaign WHERE segments\.date DURING LAST_30_DAYS/);
  assert.match(stages, /headers: \{ Authorization: 'Bearer ' \+ CRM_KEY \}/);
  assert.match(stages, /googleAdsCampaignReportHtml\(g\?\.report\)/);
  assert.doesNotMatch(stages, /function googleAdsCrmProjectsStats/);
  assert.match(stages, /roi_percent/);
  // Composed into the page: function declarations only.
  const block = stages.slice(stages.indexOf('// ---------- GOOGLE ADS → CRM'));
  assert.doesNotMatch(block, /^(const|let) /m);
});

test('the script text does not end its function early for the page composer', () => {
  const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
  const start = stages.indexOf('function googleAdsCrmScriptText(key) {');
  const firstClose = stages.indexOf('\n}', start);
  assert.match(stages.slice(start, firstClose), /\]\.join\('\\n'\);$/);
});
