import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Owner walkthrough, 2026-10-26: the project must not repeat the funnel with
// «Визиты», client and history sections. One card keeps only working modules.
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');

test('the project card is one compact feed without duplicate stages', () => {
  const feed = stages.slice(stages.indexOf('function projectFeedHtml('), stages.indexOf('\n}\n', stages.indexOf('function projectFeedHtml(')));
  // Owner, 2026-11-06: the stage buttons open every step, so the feed keeps only the next step, the composition and the document chips.
  const order = ['class="project-feed-top"', '>Состав проекта</h3>', '<div class="project-feed-docs">', 'projectFeedCheckHtml(o, lines, proposal)'];
  let last = -1;
  for (const name of order) { const at = feed.indexOf(name); assert.ok(at > last, `${name} after the previous section`); last = at; }
  assert.match(feed, /<div class="project-feed-next"><div class="project-feed-next-kicker">Следующий шаг<\/div>/);
  // Owner, 2026-11-06: «Следующий шаг» и «До монтажа» — одна компактная строка, не полоса на весь экран.
  assert.match(feed, /<div class="project-feed-top">\$\{primary \? `<div class="project-feed-next">[\s\S]*?projectCardGateChecklist\(o, \{ canManage, owner: u\?\.role === 'owner' \}\) : ''\}<\/div>/);
  assert.match(feed, /onclick="openProjectInvoice\('\$\{o\.id\}'\)">Invoice<\/button>/);
  assert.doesNotMatch(feed, /'Визиты'|Назначить визит|next\(\)|project-feed-num/);
  // Owner, 2026-10-26: the «Клиент и объект» block is gone from the card; the
  // client name in the command header links to the client card instead.
  assert.doesNotMatch(feed, /data-project-feed="context"/);
  assert.doesNotMatch(feed, /projectCardOpenWorkspace\('site'\)/);
  assert.match(html, /class="project-command-client" onclick="projectCardOpenWorkspace\('client'\)"/);
  assert.match(html, /\$\{projectFeedHtml\(o, c, u, \{ canManage, canSeeMoney, canSeeInternalEconomics, primary, measureAction, recentTimeline \}\)\}/);
  assert.doesNotMatch(html.slice(html.indexOf('function renderOrderCleanDetails('), html.indexOf('function renderInstallerTechnicalWorkspace(')), /\$\{renderProjectCommandNav\(|<div class="project-command-mobile-action">/);
  assert.doesNotMatch(html.slice(html.indexOf('function renderOrderCleanDetails('), html.indexOf('function renderInstallerTechnicalWorkspace(')), />Последние события</);
});

test('money stays hidden from field roles in the feed', () => {
  const feed = stages.slice(stages.indexOf('function projectFeedHtml('), stages.indexOf('\n}\n', stages.indexOf('function projectFeedHtml(')));
  assert.match(feed, /\$\{money \? projectCardGateChecklist\(o,/);
  assert.match(feed, /\$\{money && \(lines\.length \|\| projectPendingSizedServices\(o\)\.length\) \? projectFeedCheckHtml\(o, lines, proposal\) : ''\}/);
  assert.doesNotMatch(feed, /projectFeedSection\('КП и оплата'|projectFeedSection\('Материалы'/);
});
