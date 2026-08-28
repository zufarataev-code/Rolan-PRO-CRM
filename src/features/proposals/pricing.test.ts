import assert from "node:assert/strict";
import test from "node:test";

import { calculateDeposit, calculateTax } from "./pricing";

test("на жилье аванс ограничен 10 процентами при малой сумме", () => {
  const result = calculateDeposit(5000, 50, "residential");

  assert.equal(result.legalCap, 500);
  assert.equal(result.amount, 500);
  assert.equal(result.capped, true);
  assert.equal(result.effectivePercent, 10);
});

test("на жилье аванс ограничен 1000 долларов при большой сумме", () => {
  const result = calculateDeposit(40000, 50, "residential");

  assert.equal(result.legalCap, 1000);
  assert.equal(result.amount, 1000);
  assert.equal(result.capped, true);
  assert.equal(result.effectivePercent, 2.5);
});

test("на жилье малый запрошенный аванс не увеличивается до предела", () => {
  const result = calculateDeposit(5000, 5, "residential");

  assert.equal(result.amount, 250);
  assert.equal(result.capped, false);
});

test("на коммерции предел не применяется", () => {
  const result = calculateDeposit(40000, 50, "commercial");

  assert.equal(result.amount, 20000);
  assert.equal(result.legalCap, null);
  assert.equal(result.capped, false);
  assert.equal(result.effectivePercent, 50);
});

test("нулевая сумма договора не ломает расчёт", () => {
  const result = calculateDeposit(0, 50, "residential");

  assert.equal(result.amount, 0);
  assert.equal(result.effectivePercent, 0);
});

test("налог считается и округляется до цента", () => {
  const result = calculateTax(2500, 9.5);

  assert.equal(result.taxAmount, 237.5);
  assert.equal(result.totalWithTax, 2737.5);
});

test("нулевая ставка налога оставляет сумму без изменений", () => {
  const result = calculateTax(2500, 0);

  assert.equal(result.taxAmount, 0);
  assert.equal(result.totalWithTax, 2500);
});

test("отрицательные значения приводятся к нулю", () => {
  const result = calculateTax(-100, -5);

  assert.equal(result.subtotal, 0);
  assert.equal(result.taxRatePercent, 0);
  assert.equal(result.totalWithTax, 0);
});
