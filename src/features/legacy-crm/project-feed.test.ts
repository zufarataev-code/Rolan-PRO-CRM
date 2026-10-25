import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Owner, 2026-10-24: approved mock-up «Лента проекта» — one page, sections in
// work order, each with one button (as TintWiz), instead of tabs and tiles.
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');

test('the project card is one feed in the order the work goes', () => {
  const feed = stages.slice(stages.indexOf('function projectFeedHtml('), stages.indexOf('\n}\n', stages.indexOf('function projectFeedHtml(')));
  const order = ["next(), 'Визиты'", "next(), 'Клиент и объект'", '>Услуги</h3>', "next(), 'Замер'", "next(), 'Плёнка и закупка'", "next(), 'КП'", "next(), 'Оплата и счёт'", "next(), 'Монтаж'", "next(), 'Документы'", "next(), 'История и файлы'"];
  let last = -1;
  for (const name of order) { const at = feed.indexOf(name); assert.ok(at > last, `${name} after the previous section`); last = at; }
  assert.match(feed, /<div class="project-feed-next"><div class="project-feed-next-kicker">Следующий шаг<\/div>/);
  assert.match(feed, /projectFeedBtn\('Счёт \(Invoice\)', `openProjectInvoice\('\$\{o\.id\}'\)`\)/);
  assert.match(feed, /projectFeedBtn\('Открыть закупку', 'openProjectPurchaseRequests\(\)'\)/);
  assert.match(feed, /projectFeedBtn\(installationIsPlanned \? 'Изменить монтаж' : 'Назначить монтаж', `scheduleInstallationPrompt\('\$\{o\.id\}'\)`/);
  assert.doesNotMatch(feed, /projectFeedBtn\('Назначить монтаж', "projectCardOpenWorkspace\('schedule'\)"\)/);
  assert.match(html, /\$\{projectFeedHtml\(o, c, u, \{ canManage, canSeeMoney, canSeeInternalEconomics, primary, measureAction, recentTimeline \}\)\}/);
  assert.doesNotMatch(html.slice(html.indexOf('function renderOrderCleanDetails('), html.indexOf('function renderInstallerTechnicalWorkspace(')), /\$\{renderProjectCommandNav\(|<div class="project-command-mobile-action">/);
});

test('installation is assigned inside the project, separately for every service', () => {
  const scheduler = html.slice(html.indexOf('function scheduleInstallationPrompt('), html.indexOf('function confirmScheduleInstallation('));
  assert.match(scheduler, /if \(!projectProposalAccepted\(o\)\)/);
  assert.match(scheduler, /Монтаж по услугам проекта/);
  assert.match(scheduler, /projectServiceScheduleHtml\(o\)/);
  assert.match(scheduler, /Назначьте дату и исполнителей отдельно для каждой услуги/);

  const serviceSchedule = html.slice(html.indexOf('function projectServiceScheduleHtml('), html.indexOf('function projectScheduleCopyFirstToAll('));
  assert.match(serviceSchedule, /Дата и время услуги/);
  assert.match(serviceSchedule, /service-installer-\$\{index\}/);
});

test('money stays hidden from field roles in the feed', () => {
  const feed = stages.slice(stages.indexOf('function projectFeedHtml('), stages.indexOf('\n}\n', stages.indexOf('function projectFeedHtml(')));
  for (const section of ["'Плёнка и закупка'", "'КП'", "'Оплата и счёт'"]) {
    const at = feed.indexOf('next(), ' + section) + 'next(), '.length;
    assert.match(feed.slice(Math.max(0, at - 120), at), /\$\{money (&& filmRows\.length )?\? projectFeedSection\(next\(\), $/, `${section} only with money`);
  }
});
