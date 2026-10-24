import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Owner, 2026-10-24: «когда выбираешь направление, оно должно открываться в окне
// отдельно и добавлять свои услуги… и КП тоже самое»; «дизайн должен остаться как
// есть в CRM… самое главное везде цветовые решения».

const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');

function slice(source: string, from: string, to: string) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `slice ${from}`);
  return source.slice(start, end);
}

test('a direction opens in its own window: Услуги → Замер → Цена, in the direction colour', () => {
  const win = slice(stages, 'function projectDirectionWindowHtml(o, directionKey, step)', '\n}\n');
  assert.match(win, /const tone = rpDir\(directionKey\);/);
  assert.match(win, /--dir-color:\$\{academyEsc\(tone\.color\)\}/);
  assert.match(win, /order-workspace-modal rp-dirwin/, 'the CRM frame, not a new design');
  assert.match(win, /← К проекту/);
  assert.match(stages, /\{ id: 'services', label: 'Услуги' \}, \{ id: 'measure', label: 'Замер' \}, \{ id: 'price', label: 'Цена' \}/);
  assert.match(stages, /onclick="openProjectDirectionWindow\('\$\{o\.id\}','\$\{jsQuote\(direction\.key\)\}'\)"><span class="project-cashier-direction-icon">/, 'the direction tile opens it');
  assert.match(stages, /Открыть направление →/);
});

test('adding a service or measuring from the window comes back to it', () => {
  assert.match(stages, /openServiceCashier\(oid, 'direction'\);\n  serviceCashierPick\('direction', directionKey\);/);
  assert.match(html, /\['estimate', 'intake', 'direction'\]\.includes\(returnTo\)/);
  assert.match(html, /returnTo === 'direction' && typeof returnToProjectDirectionWindow === 'function' && returnToProjectDirectionWindow\(\)/);
  assert.match(html, /if \(returnTo === 'card' \|\| returnTo === 'direction'\) projectCardEdit\(apply\)/);
  assert.match(stages, /if \(o && orderMeasureScopes\(o\)\.includes\(directionKey\)\) managerSelectMeasureScope\(oid, directionKey\);/, 'the measurement opens on this direction');
  assert.match(html, /state\._directionWindow\?\.oid === oid \? `<button class="workspace-back" onclick="returnToProjectDirectionWindow\(\)">← К направлению<\/button>`/);
});

test('the KP is one window: Состав → Как увидит → Отправить; the studio stays one tap away', () => {
  assert.match(stages, /\{ id: 'compose', label: 'Состав' \}, \{ id: 'preview', label: 'Как увидит' \}, \{ id: 'send', label: 'Отправить' \}/);
  const wiz = slice(stages, 'function proposalWizardHtml(o, step)', '\n}\n');
  assert.match(wiz, /const tone = rpDir\(direction\.key\);/, 'directions keep their colours in the KP');
  assert.match(wiz, /<iframe src="\$\{academyEsc\(url\)\}" title="КП глазами клиента"/);
  assert.match(wiz, /premiumMarkProposalSent\('\$\{prop\.token\}','WhatsApp'\)/);
  assert.match(wiz, /Все настройки КП: оплата, версии/);
  assert.match(html, /if \(typeof proposalWizardActive === 'function' && proposalWizardActive\(order\.id\)\)/, 'building or sending keeps the window');
  assert.match(html, /onclick: `openProposalWizard\('\$\{o\.id\}','send'\)`/);
  assert.match(html, /onclick: `openProposalWizard\('\$\{o\.id\}'\)` \};/);
});

test('phones keep the step row; the main button wears the direction colour', () => {
  assert.match(readFileSync('src/features/legacy-crm/mobile-workspace.ts', 'utf8'), /\.rp-cashier, \.rp-dirwin, \[data-rp-keep-layout\]/);
  assert.match(html, /html body \.rp-dirwin \.rp-dirwin-steps \{ display: flex !important; align-items: center !important; flex-wrap: nowrap !important; \}/);
  assert.match(stages, /class="btn-primary rp-dirwin-next" style="background:var\(--dir-color\) !important;/);
});
