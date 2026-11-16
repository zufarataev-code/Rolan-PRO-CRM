import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

test("the tablet shell has one compact rail and a two-row top bar", () => {
  assert.match(
    html,
    /@media \(min-width: 841px\) and \(max-width: 1366px\) \{[\s\S]*?\.app-shell,[\s\S]*?grid-template-columns: 72px minmax\(0, 1fr\)/,
  );
  assert.match(
    html,
    /grid-template-areas:\s*"menu title actions"\s*"search search search"/,
  );
  assert.match(
    html,
    /\.topbar-role-testing,[\s\S]*?\.topbar-switch-user \{ display: none !important; \}/,
  );
  assert.match(html, /class="btn-primary text-sm topbar-create-project"/);
});

test("the active Project card mounts the approved Balance summary without a second calculator", () => {
  const card = html.slice(
    html.indexOf("function renderOrderCleanDetails("),
    html.indexOf("function renderInstallerTechnicalWorkspace("),
  );

  assert.match(card, /class="project-card-page"/);
  assert.match(card, /class="project-command-grid"/);
  assert.match(card, /<main class="project-command-main">[\s\S]*?\$\{projectFeedHtml\(/);
  assert.match(
    card,
    /\$\{renderProjectCommandSide\(o, \{ money: canSeeMoney, economics: canSeeInternalEconomics, installer: isInstaller \}\)\}/,
  );
  assert.match(
    html,
    /\.project-card-page \.project-command-side \{\s*position: sticky;/,
  );
  assert.match(
    html,
    /@media \(min-width: 841px\) and \(max-width: 1366px\)[\s\S]*?\.project-card-page \.project-command-grid \{ grid-template-columns: minmax\(0, 1fr\); \}[\s\S]*?\.project-card-page \.project-command-side \{\s*order: -1;\s*position: static;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
  );
});

test("Project money has one visible summary instead of repeating in the hero", () => {
  const header = html.slice(
    html.indexOf("function renderProjectCommandHeader("),
    html.indexOf("function projectLineScopeRows("),
  );

  assert.match(header, /const fieldFacts = money \? '' :/);
  assert.doesNotMatch(header, /<span>Сумма<\/span>/);
  assert.doesNotMatch(header, /<span>Оплачено<\/span>/);
  assert.doesNotMatch(header, /<span>Остаток<\/span>/);
});

test("payroll becomes labelled responsive rows instead of clipping off-screen", () => {
  const payroll = html.slice(
    html.indexOf("function renderPayroll()"),
    html.indexOf("function markPayoutPaid("),
  );

  assert.match(payroll, /class="payroll-page"/);
  assert.match(payroll, /class="w-full text-sm payroll-breakdown-table"/);
  for (const label of ["Дата", "Заказ", "Описание", "Сумма", "Статус"]) {
    assert.ok(payroll.includes(`data-label="${label}"`), `missing responsive label: ${label}`);
  }
  assert.match(
    html,
    /@media \(max-width: 1180px\) \{[\s\S]*?\.payroll-breakdown-table thead \{ display: none; \}[\s\S]*?content: attr\(data-label\)/,
  );
});
