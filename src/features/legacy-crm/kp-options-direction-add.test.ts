import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Owner, 2026-10-24: «на замере подбираем плёнку, а в КП добавляем допы — клиент
// сам выбирает» (smart: voice control, wall switch, second remote, 10-year
// warranty $5/month); «направление открывается в отдельном окне и тут же внутри
// добавляешь услуги, чтобы не прыгало туда-сюда».
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const publish = readFileSync('src/features/legacy-crm/publish-proposal.ts', 'utf8');
const service = readFileSync('src/features/proposals/service.ts', 'utf8');

const fn = (src: string, name: string) => { const a = src.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return src.slice(a, src.indexOf('\n}\n', a)); };

test('a directory service can be a KP option the client ticks, with a monthly price', () => {
  assert.match(html, /updateServiceOffering\('\$\{offering\.id\}','proposalOptional',this\.checked,this\)"> Клиент может добавить как опцию/);
  assert.match(html, /updateServiceOffering\('\$\{offering\.id\}','monthly',this\.checked,this\)"> Подписка · цена в месяц/);
  const items = fn(stages, 'projectProposalOptionItems');
  assert.match(items, /is_optional: true,\s*client_selected: false,/);
  assert.match(items, /line_price: offering\.monthly \? 0 : price/);
  assert.match(items, /title_en: offering\.monthly \? `\$\{title\} — \$\$\{price\}\/month` : title/);
  assert.match(html, /if \(typeof projectProposalOptionItems === 'function'\) items\.push\(\.\.\.projectProposalOptionItems\(order\)\);/);
  assert.match(fn(stages, 'proposalWizardHtml'), /\$\{projectProposalOptionsHtml\(o\)\}/);
});

test('the server keeps options unticked, counts them only when chosen, and lets the client tick only options', () => {
  assert.match(publish, /isOptional: item\.is_optional === true,/);
  assert.match(publish, /const total = snapshot\.items\.filter\(\(item\) => !item\.isOptional\)/);
  assert.match(publish, /is_optional: item\.isOptional,\s*client_selected: item\.clientSelected,/);
  const update = service.slice(service.indexOf('export async function updatePublicProposalSelections('));
  assert.match(update.slice(0, 3000), /proposal_id: proposal\.proposal_id,\s*\/\/ Only extras are the client's to tick; the agreed scope stays as sent\.\s*is_optional: true,/);
  assert.match(update.slice(0, 4000), /calculateSuggestedDeposit\(toNumber\(totals\.selected_total_amount\), proposal\.property_type\)/);
});

test('what the client ticked comes into the project', () => {
  const apply = stages.slice(stages.indexOf('async function premiumApplyClientOptions('), stages.indexOf('\n}\n', stages.indexOf('async function premiumApplyClientOptions(')));
  assert.match(apply, /item\.is_optional && item\.client_selected && item\.dynamic_fields\?\.offering_id/);
  assert.match(apply, /projectAddOfferingLine\(oid, id, item\.dynamic_fields\.direction \|\| ''\)/);
  assert.match(html, /setTimeout\(\(\) => premiumApplyClientOptions\(order\.id, \{ quiet: true \}\), 0\)/);
  assert.match(stages, /projectFeedBtn\('Забрать выбор клиента', `premiumApplyClientOptions\('\$\{o\.id\}'\)`\)/);
});

test('services are added inside the direction window; a new direction opens its window', () => {
  assert.match(fn(stages, 'projectDirectionWindowHtml'), /\$\{edit \? projectDirectionAddHtml\(o, directionKey\) : ''\}/);
  const add = fn(stages, 'projectDirectionAddHtml');
  assert.match(add, /Уточним на замере/);
  assert.match(add, /<div class="rp-dirwin-sub">На складе<\/div>/);
  assert.match(fn(stages, 'projectDirectionAddService'), /openProjectDirectionWindow\(oid, directionKey, 'services'\);/, 'stays in the window');
  assert.match(fn(stages, 'openProjectDirectionPicker'), /closeModal\(\); openProjectDirectionWindow\('\$\{o\.id\}','\$\{jsQuote\(direction\.id\)\}','services'\)/);
  assert.doesNotMatch(fn(stages, 'projectDirectionOfferingPickerHtml'), /openServiceCashier/);
});
