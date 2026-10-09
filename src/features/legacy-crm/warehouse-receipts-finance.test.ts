import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const crm = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const calculator = readFileSync('src/components/simple-quick-calculator.tsx', 'utf8');
const calculatorPage = readFileSync('app/legacy-crm/calculator/page.tsx', 'utf8');
const styles = readFileSync('app/globals.css', 'utf8');

test('film models keep full and short names and expose every requested technical parameter', () => {
  assert.match(crm, /c\.fullName \|\| c\.productName/);
  assert.match(crm, /c\.shortName \|\| c\.modelCode/);
  assert.match(crm, /Толщина \$\{c\.thickness\} mil/);
  assert.match(crm, /TSER \$\{c\.tser\}%/);
  assert.match(crm, /UV \$\{c\.uvBlock\}%/);
  assert.match(crm, /IR \$\{c\.irBlock\}%/);
});

test('film, supply and tool receipts record vendor, amount and payment account for finance', () => {
  assert.match(crm, /function recordWarehouseReceipt\(data\)/);
  assert.match(crm, /kind:'film'[\s\S]*?accountId:read\('ar-account'\)/);
  assert.match(crm, /kind:'supply'[\s\S]*?accountId:document\.getElementById\('sm-account'\)/);
  assert.match(crm, /kind:'tool'[\s\S]*?accountId:document\.getElementById\('tool-account'\)/);
  assert.match(crm, /sys_warehouse_receipt_\$\{receipt\.id\}/);
  assert.match(crm, /\['receipts','Приходы'\]/);
});

test('quick calculator uses the shared CRM visual language without changing its calculation logic', () => {
  assert.match(calculatorPage, /className="legacy-calculator-page"/);
  assert.match(calculator, /className="quick-calculator"/);
  assert.match(styles, /\.quick-calculator-hero/);
  assert.match(styles, /\.quick-calculator-results/);
  assert.match(calculator, /const clientTotal = sqft \* Math\.max\(0, line\.client_rate\) \* coefficient/);
});
