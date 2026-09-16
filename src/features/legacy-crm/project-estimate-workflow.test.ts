import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

test("measurement completion routes the manager into project calculation", () => {
  assert.match(source, /Завершить замер[\s\S]*?и рассчитать проект/);
  assert.match(
    source,
    /function completeManagerMeasurement\(oid\)[\s\S]*changeStatus\(oid, 'measurement_done'\)/,
  );
  assert.match(
    source,
    /newStatus === 'measurement_done'[\s\S]*openProjectEstimateWorkspace\(orderId\)/,
  );
});

test("project calculation combines measured materials, services, expenses and margin", () => {
  assert.match(source, /function renderProjectEstimateWorkspace\(o\)/);
  assert.match(source, /1\. Замер и материалы/);
  assert.match(source, /2\. Дополнительные услуги/);
  assert.match(source, /3\. Прямые расходы проекта/);
  assert.match(source, /Прибыль/);
  assert.match(source, /Маржа/);
  assert.match(source, /projectEstimateSnapshot/);
});

test("manager prices the proposal without seeing owner-only project economics", () => {
  assert.match(source, /function orderUserCanSeeInternalEconomics\(order, user = currentUser\(\)\)/);
  assert.match(source, /user\.role === 'owner' && orderUserOwns\(order, user\)/);
  assert.match(source, /canSeeInternalEconomics \? '<th class="money">Себестоимость материала<\/th>' : ''/);
  assert.match(source, /canSeeInternalEconomics \? `<section class="project-estimate-section">[\s\S]*?3\. Прямые расходы проекта/);
  assert.match(source, /canSeeInternalEconomics \? `<div><label>Расстояние, км/);
  assert.doesNotMatch(source, /projectEstimateUpdateSetting\([^\n]+['"]marketing['"]/);
  assert.match(source, /Менеджер назначает только цену продажи, которая попадёт в КП/);
  assert.match(source, /if \(!state\.orderClassicMode \|\| u\.role !== 'owner'\)/);
});

test("hidden internal expenses do not block manager proposal readiness", () => {
  const readiness = source.match(/function projectEstimateReadiness\(o\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(readiness, /extraExpenses/);
  assert.match(readiness, /extraServices/);
  assert.match(readiness, /orderRevenue\(o\) <= 0/);
});

test("proposal generation is blocked until the calculation is approved", () => {
  assert.match(
    source,
    /function openProfessionalKP\(oid\)[\s\S]*if \(!projectEstimateIsApproved\(o\)\)/,
  );
  assert.match(
    source,
    /async function generatePremiumProposal\(orderId\)[\s\S]*if \(!projectEstimateIsApproved\(order\)\)/,
  );
  assert.match(source, /Подтвердить расчёт и сформировать КП/);
});

test("old quoted orders are migrated without losing proposal access", () => {
  assert.match(source, /if \(o\.projectEstimateApprovedAt === undefined\)/);
  assert.match(source, /const alreadyQuoted = !!o\.proposalSentAt \|\| !!o\.proposalAcceptedAt \|\| \[/);
  assert.match(source, /o\.proposalSentAt \|\| o\.proposalAcceptedAt \|\| o\.createdAt/);
});

test("field workers cannot open project economics", () => {
  assert.match(
    source,
    /if \(!orderUserCanSeeMoney\(o, currentUser\(\)\)\) \{ alert\('Расчёт проекта доступен только владельцу и назначенному менеджеру\.'/,
  );
  assert.match(source, /canSeeMoney \? renderOrderWorkspaceTile\(\{ orderId: o\.id, key: 'estimate'/);
});

test("manual transport expense is not counted twice", () => {
  assert.match(
    source,
    /function orderManualExpensesTotal\(o\)[\s\S]*\.filter\(e => e\.type !== 'gas'\)/,
  );
});

test("proposal readiness validates the actual window instead of its room wrapper", () => {
  assert.match(
    source,
    /windows\.some\(\(\{ win \}\) => windowActualAreaSqft\(win\) <= 0\)/,
  );
  assert.match(
    source,
    /windows\.some\(\(\{ win \}\) => !windowCatalog\(win\)\)/,
  );
  assert.doesNotMatch(source, /windows\.some\(w => windowActualAreaSqft\(w\) <= 0\)/);
});

test("window removal button creates an area-based calculated service", () => {
  assert.match(source, /function managerToggleWindowRemoval\(oid, rid, wid\)/);
  assert.match(source, /function orderRemovalAreaSqft\(o\)/);
  assert.match(source, /line\.price = Number\(\(area \* unitPrice\)\.toFixed\(2\)\)/);
  assert.match(source, /Удаление плёнки\$\{windowRemovalRequired\(w\)/);
  assert.match(source, /Удалить окно/);
});

test("manager can quote from customer dimensions but installation requires verified dimensions", () => {
  const readiness = source.match(/function projectEstimateReadiness\(o\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(readiness, /orderMeasurementVerificationIssues|windowMeasurementIsVerified/);
  assert.match(source, /measurementBasis: orderMeasurementVerificationIssues\(o\)\.length \? 'CUSTOMER_PRELIMINARY' : 'SURVEYOR_VERIFIED'/);
  assert.match(source, /По ним разрешено рассчитать проект и выпустить КП/);
  assert.match(source, /function orderStatusRequiresVerifiedMeasurements\(status\)/);
  assert.match(source, /'installation_scheduled','installation_accepted','installation_en_route','installation_in_progress'/);
  assert.match(source, /if \(!ensureVerifiedMeasurementsForStatus\(o, newStatus/);
});

test("each manager-entered window starts preliminary and can be explicitly verified", () => {
  assert.match(source, /measurementSource: 'CUSTOMER'/);
  assert.match(source, /function managerConfirmWindowMeasurement\(oid, rid, wid\)/);
  assert.match(source, /От клиента · подтвердить точные/);
  assert.match(source, /markWindowMeasurementVerified\(w\)/);
  assert.match(source, /markWindowMeasurementUnverified\(w\)[\s\S]*invalidateProjectEstimate/);
  assert.match(source, /measurementSource: 'SURVEYOR_VERIFIED'/);
});
