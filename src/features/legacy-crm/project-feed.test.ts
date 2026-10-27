import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Owner walkthrough, 2026-10-26: the project must not repeat the funnel with
// «Визиты», client and history sections. One card keeps only working modules.
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');

test('the project card is one compact feed without duplicate stages', () => {
  const feed = stages.slice(stages.indexOf('function projectFeedHtml('), stages.indexOf('\n}\n', stages.indexOf('function projectFeedHtml(')));
  const order = ['${projectContext}', '>Состав проекта</h3>', "projectFeedSection('Замер'", "projectFeedSection('Материалы'", "projectFeedSection('КП и оплата'", "projectFeedSection('Монтаж'", "projectFeedSection('Документы и история'"];
  let last = -1;
  for (const name of order) { const at = feed.indexOf(name); assert.ok(at > last, `${name} after the previous section`); last = at; }
  assert.match(feed, /<div class="project-feed-next"><div class="project-feed-next-kicker">Следующий шаг<\/div>/);
  assert.match(feed, /projectFeedBtn\('Invoice', `openProjectInvoice\('\$\{o\.id\}'\)`\)/);
  assert.match(feed, /projectFeedBtn\('Склад и закупка', 'openProjectPurchaseRequests\(\)'\)/);
  assert.doesNotMatch(feed, /'Визиты'|Назначить визит|next\(\)|project-feed-num/);
  assert.match(feed, /data-project-feed="context"/);
  assert.match(feed, /projectCardOpenWorkspace\('client'\)/);
  assert.match(feed, /projectCardOpenWorkspace\('site'\)/);
  assert.match(html, /\$\{projectFeedHtml\(o, c, u, \{ canManage, canSeeMoney, canSeeInternalEconomics, primary, measureAction, recentTimeline \}\)\}/);
  assert.doesNotMatch(html.slice(html.indexOf('function renderOrderCleanDetails('), html.indexOf('function renderInstallerTechnicalWorkspace(')), /\$\{renderProjectCommandNav\(|<div class="project-command-mobile-action">/);
  assert.doesNotMatch(html.slice(html.indexOf('function renderOrderCleanDetails('), html.indexOf('function renderInstallerTechnicalWorkspace(')), />Последние события</);
});

test('money stays hidden from field roles in the feed', () => {
  const feed = stages.slice(stages.indexOf('function projectFeedHtml('), stages.indexOf('\n}\n', stages.indexOf('function projectFeedHtml(')));
  assert.match(feed, /\$\{money && filmRows\.length \? projectFeedSection\('Материалы'/);
  assert.match(feed, /\$\{money \? projectFeedSection\('КП и оплата'/);
});
