import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

test("project calculator exposes one fast operational summary", () => {
  assert.match(source, /Быстрый итог проекта/);
  assert.match(source, /Услуги проекта/);
  assert.match(source, /Предварительный объём/);
  assert.match(source, /Расход плёнки/);
  assert.match(source, /Позиции проекта/);
  assert.match(source, /Резерв оплаты монтажа/);
});

test("installer labor uses employee reference rates and keeps a fallback reserve", () => {
  assert.match(source, /function installerRateForWindow\(user, w\)/);
  assert.match(source, /pc\.ratesByCategory\?\.\[category\]/);
  assert.match(source, /function installerServiceRateByCategory\(category\)/);
  assert.match(source, /installerRates\?\.serviceTypes\?\.\[serviceCode\]/);
  assert.match(source, /return installerServiceRateByCategory\(category\)/);
  assert.match(source, /function orderInstallerPayoutForUser\(o, userId\)/);
  assert.match(source, /source: 'REFERENCE_DEFAULT'/);
  assert.match(source, /source: 'EMPLOYEE_REFERENCE'/);
  assert.match(source, /amount = orderInstallerPayoutForUser\(o, u\.id\)/);
});

test("material, direct costs, fixed expenses and California reserve produce management net profit", () => {
  const calculation = source.match(/function projectProfitability\(o\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(calculation, /fixedAllocation = fixedPool \/ projectCount/);
  assert.match(calculation, /grossProfit = orderMargin\(o\)/);
  assert.match(calculation, /profitBeforeTax = grossProfit - fixedAllocation/);
  assert.match(calculation, /monthTaxReserve/);
  assert.match(calculation, /netProfit: profitBeforeTax - taxAllocation/);
  assert.match(source, /Расчётная чистая прибыль/);
  assert.match(source, /Это управленческий резерв, а не налоговая декларация/);
});

test("project direct expense list covers delivery, purchases and hired specialists", () => {
  assert.match(source, /delivery: 'Доставка'/);
  assert.match(source, /material_purchase: 'Разовая закупка материала'/);
  assert.match(source, /subcontractor: 'Наёмный специалист'/);
  assert.match(source, /tools: 'Инструмент \/ оборудование'/);
});

test("tax profile supports California corporation types without hiding configurability", () => {
  assert.match(source, /entityType: 'C_CORP'/);
  assert.match(source, /ratePct: 8\.84/);
  assert.match(source, /value === 'S_CORP'\) profile\.ratePct = 1\.5/);
  assert.match(source, /annualMinimum: 800/);
  assert.match(source, /value="CUSTOM"/);
});

test("owner settings keep company fixed costs and break-even in one source of truth", () => {
  assert.match(source, /key: 'company-costs'/);
  assert.match(source, /function renderCompanyFixedExpenseSettings\(\)/);
  assert.match(source, /function companyFixedMonthlyBurn\(\)/);
  assert.match(source, /financeOpenPlanModal\(-1,'company-fixed'\)/);
  assert.match(source, /scope !== 'personal'/);
  assert.match(source, /costBehavior !== 'variable'/);
  assert.match(source, /Это управленческий план, а не списание денег со счёта/);
});

test("company compensation model separates fixed salaries from revenue percentages", () => {
  assert.match(source, /opx_owner_salary', 'Оклад владельца — Зуфар', 3000/);
  assert.match(source, /opx_measurer_salary', 'Оклад замерщика', 4000/);
  assert.match(source, /s\.pricingDefaults\.managerPct = 5/);
  assert.match(source, /s\.pricingDefaults\.marketingPct = 10/);
  assert.match(source, /s\.pricingDefaults\.measurerPct = 0/);
  assert.match(source, /Оклады входят в постоянные расходы месяца/);
  assert.match(source, /Комиссия менеджера от валовой выручки/);
  assert.match(source, /Рекламный резерв от валовой выручки/);
});

test("project PSS charges manager commission and advertising once from gross revenue", () => {
  const pss = source.match(/function orderPSS\(o\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(pss, /const mgr = rev \* managerPct \/ 100/);
  assert.match(pss, /const marketing = rev \* Math\.max\(0, Number\(pd\.marketingPct\) \|\| 0\) \/ 100/);
  assert.match(source, /legacyAds\.active = false/);
  assert.match(source, /legacyAds\.costBehavior = 'variable'/);
  assert.match(source, /Рекламный резерв \(\$\{Number\(db\.settings\.pricingDefaults\?\.marketingPct/);
});

test("new project opens a quick multi-service estimate without requiring measurements", () => {
  assert.match(source, /createOrder\('draft'\)/);
  assert.match(source, /createOrder\('estimate'\)/);
  assert.match(source, /Создать и быстро рассчитать →/);
  assert.match(source, /function createOrder\(nextStep = 'estimate'\)/);
  assert.match(source, /openProjectEstimateWorkspace\(o\.id\)/);
  assert.match(source, /selectedServices\.forEach\(selectedService =>/);
});
