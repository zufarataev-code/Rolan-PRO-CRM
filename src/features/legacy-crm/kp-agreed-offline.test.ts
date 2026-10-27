import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Owner, 2026-10-27: «замер внёс, КП сформировал, у нас был договор — а монтаж не назначить».
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const fn = (src: string, name: string) => { const a = src.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return src.slice(a, src.indexOf('\n}\n', a) + 3); };

test('the KP send step offers «Клиент уже согласен», which marks it sent and accepted', () => {
  assert.match(fn(stages, 'proposalWizardHtml'), /onclick="projectAcceptProposalOffline\('\$\{o\.id\}'\)"><b>🤝 Клиент уже согласен<\/b>/);
  const accept = fn(stages, 'projectAcceptProposalOffline');
  assert.match(accept, /prop\.status = 'Sent';/);
  assert.match(accept, /КП согласовано с клиентом напрямую \(договор\)/);
  assert.match(accept, /changeStatus\(oid, 'proposal_accepted'\);/);
  assert.match(fn(html, 'projectProposalNextAction'), /или «Клиент уже согласен», если договор уже есть/);
});
