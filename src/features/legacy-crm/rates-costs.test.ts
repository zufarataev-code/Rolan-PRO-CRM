import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Owner, 2026-10-25: «один источник правды, где пишем ставки и зарплаты,
// постоянные и переменные расходы». One section edits each number at its home;
// salaries are mirrored into fixed costs automatically.
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const fn = (src: string, name: string) => { const a = src.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return src.slice(a, src.indexOf('\n}\n', a) + 3); };

function load(users: any[], opex: any[]) {
  const ctx: any = { db: { users, opex }, currentUser: () => ({ role: 'owner' }) };
  vm.createContext(ctx);
  vm.runInContext(fn(stages, 'ratesMonthlySalary') + fn(stages, 'syncTeamSalaryPlans'), ctx);
  return ctx;
}

test('old owner/measurer salary plans move to the employee without changing the monthly total', () => {
  const ctx = load(
    [{ id: 'o', name: 'Зуфар', role: 'owner', payConfig: { type: 'commission' } }, { id: 'm', name: 'Алан', role: 'measurer', payConfig: { type: 'salary', monthlySalary: 4000 } }],
    [{ id: 'opx_owner_salary', amount: 3000, active: true }, { id: 'opx_measurer_salary', amount: 4000, active: true }, { id: 'rent', amount: 500, active: true }],
  );
  assert.equal(vm.runInContext('syncTeamSalaryPlans()', ctx), true);
  const active = ctx.db.opex.filter((p: any) => p.active !== false).map((p: any) => `${p.id}:${p.amount}`).sort();
  assert.deepEqual(active, ['opx_salary_m:4000', 'opx_salary_o:3000', 'rent:500']);
  assert.equal(ctx.db.users[0].payConfig.type, 'salary');
  assert.equal(ctx.db.users[0].payConfig.monthlySalary, 3000);
  assert.equal(ctx.db.opex.find((p: any) => p.id === 'opx_owner_salary').retiredBy, 'team');
  assert.equal(vm.runInContext('syncTeamSalaryPlans()', ctx), false, 'idempotent');
});

test('a salary changed at the employee flows into fixed costs; leaving or another pay type switches it off', () => {
  const ctx = load([{ id: 'a', name: 'Данил', role: 'manager', payConfig: { type: 'salary', monthlySalary: 2500 } }], []);
  vm.runInContext('syncTeamSalaryPlans()', ctx);
  const plan = () => ctx.db.opex.find((p: any) => p.id === 'opx_salary_a');
  assert.equal(plan().amount, 2500);
  assert.equal(plan().autoFrom, 'team');
  ctx.db.users[0].payConfig = { type: 'commission', commissionPct: 5 };
  vm.runInContext('syncTeamSalaryPlans()', ctx);
  assert.equal(plan().active, false);
  ctx.db.users[0].payConfig = { type: 'salary', monthlySalary: 3000 };
  ctx.db.users[0].active = false;
  vm.runInContext('syncTeamSalaryPlans()', ctx);
  assert.equal(plan().active, false);
});

test('only the owner session mirrors salaries', () => {
  const ctx = load([{ id: 'a', role: 'manager', payConfig: { type: 'salary', monthlySalary: 1 } }], []);
  ctx.currentUser = () => ({ role: 'installer' });
  assert.equal(vm.runInContext('syncTeamSalaryPlans()', ctx), false);
  assert.equal(ctx.db.opex.length, 0);
});

test('save() keeps the mirror; the plan modal sends a salary to the employee', () => {
  assert.match(fn(html, 'save'), /if \(typeof syncTeamSalaryPlans === 'function'\) syncTeamSalaryPlans\(\);/);
  assert.match(fn(html, 'financeOpenPlanModal'), /existing\?\.autoFrom === 'team'[^\n]*openUserPayConfig\(existing\.userId\)/);
  assert.match(fn(html, 'financeOpenPlanModal'), /preset === 'company-variable' \? 'variable' : 'fixed'/);
});

test('one section with four windows; settings entries lead to it', () => {
  const view = fn(stages, 'renderRatesCosts');
  for (const title of ['Люди и оплата', 'За единицу работы', 'Постоянные расходы', 'Переменные расходы']) assert.ok(view.includes(title), title);
  assert.match(view, /ratesUpdateOffering\('\$\{item\.id\}','installerRatePerSqft'/);
  assert.match(view, /openUserPayConfig\('\$\{user\.id\}'\)/);
  assert.match(html, /\['ratesCosts', 'Ставки и расходы', '🧾'\]/);
  assert.match(html, /case 'ratesCosts': return u\.role === 'owner' \? renderRatesCosts\(\)/);
  assert.match(html, /key: 'company-costs'[^\n]*destination: 'ratesCosts'/);
  assert.match(html, /key: 'pricing'[^\n]*destination: 'ratesCosts', tab: 'variable'/);
});
