import assert from "node:assert/strict";
import test from "node:test";

import { calculatePayrollAmount } from "./service";

test("installer payroll uses sqft rate and complexity multiplier", () => {
  assert.equal(calculatePayrollAmount(100, 5, 1), 500);
  assert.equal(calculatePayrollAmount(100, 2.5, 1.2), 300);
  assert.equal(calculatePayrollAmount(86.44, 3, 1.5), 388.98);
});

test("installer payroll never creates a negative accrual", () => {
  assert.equal(calculatePayrollAmount(-10, 5, 2), 0);
  assert.equal(calculatePayrollAmount(10, -5, 2), 0);
});
