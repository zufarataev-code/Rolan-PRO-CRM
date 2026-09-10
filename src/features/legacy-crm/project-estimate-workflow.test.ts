import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

test("measurement completion routes the manager into project calculation", () => {
  assert.match(source, /Завершить замер и рассчитать проект/);
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
