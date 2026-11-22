import assert from 'node:assert/strict';
import {mkdir, readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {hashPassword} from '../src/lib/auth/password';
import {ROLE_CODES} from '../src/lib/auth/constants';
import {assertServerUsesTestDatabase} from './guard';

// #592 (Owner, 2026-11-22): projects imported from TintWiz came in as solar film, but
// they are privacy. The owner changes the direction on a paid project from its card,
// and fixes many imported projects at once from the projects list. Money stays as is.
const OUT = 'test-results/wiz-direction';
const CLIENT_ID = 'e2e-592-client';
const IDS = ['e2e-592-wiz-1', 'e2e-592-wiz-2', 'e2e-592-wiz-3'];

async function overflowOf(page: any, scope?: string) {
  return page.evaluate((selector: string | undefined) => {
    const inner = window.innerWidth;
    const clipped = (el: Element | null): boolean => {
      for (let node = el?.parentElement; node && node !== document.body; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX) && node.getBoundingClientRect().right <= inner + 1) return true;
      }
      return false;
    };
    const root = selector ? document.querySelector(selector) : document.body;
    const offenders: string[] = [];
    for (const el of Array.from((root || document.body).querySelectorAll('*'))) {
      const box = (el as HTMLElement).getBoundingClientRect();
      if (!box.width || !box.height || getComputedStyle(el).visibility === 'hidden') continue;
      if (box.right > inner + 1 && !clipped(el)) { offenders.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className || '').split(/\s+/)[0]} right=${Math.round(box.right)}`); if (offenders.length >= 8) break; }
    }
    return {scroll: document.documentElement.scrollWidth, inner, offenders};
  }, scope);
}

async function shot(page: any, name: string) {
  const path = `${OUT}/${name}.jpg`;
  await page.screenshot({path, type: 'jpeg', quality: 60});
  if (process.env.E2E_PRINT_SCREENSHOTS === '1') {
    const data = (await readFile(path)).toString('base64');
    console.log(`@@SHOT ${name} ${data.length}`);
    for (let index = 0; index * 8000 < data.length; index += 1) console.log(`@@B64 ${name} ${index} ${data.slice(index * 8000, (index + 1) * 8000)}`);
  }
}

// The shape the old TintWiz import saved: solar film guessed on an «Импорт» window,
// the paid total on its own line, status completed.
function wizProject(id: string, index: number, now: string) {
  return {
    id, number: `WIZ-592-${index}`, clientId: CLIENT_ID, status: 'completed', createdAt: now, paidAt: now, actSignedAt: now,
    installationAt: now, installationDoneAt: now, paid: 7500, depositReceived: true, complexity: 'standard', pricePerM2: 120,
    installerIds: [], extraExpenses: [],
    measurements: {rooms: [{id: `r${index}`, name: 'Импорт', windows: [{id: `w${index}`, name: 'Импорт', width: 2000, height: 2000, qty: 1, actualWidth: 2000, actualHeight: 2000, actualQty: 1, glassType: '', side: 'in', filmType: 'QA — Solar 20', catalogId: 'e2e592-solar'}]}]},
    extraServices: [{id: `l${index}`, type: 'custom', label: 'Услуга по проекту (импорт Wiz)', qty: 1, price: 7500, cost: 0}],
    timeline: [{at: now, key: 'orderCreated', by: null}, {at: now, key: 'completed', by: null, note: 'Оплачено полностью (импорт Wiz)'}],
    notes: 'Импорт из Wiz.', _imported: true, _importSource: 'wiz', _wizCode: `592-${index}`, _wizPrice: 7500,
  };
}

async function main() {
  const prisma = new PrismaClient();
  const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
  await assertServerUsesTestDatabase(base, prisma);
  const {chromium} = createRequire(process.cwd() + '/package.json')(process.env.E2E_PLAYWRIGHT_MODULE || 'playwright');
  const original = await prisma.legacyWorkspace.findUnique({where: {workspace_id: 'primary'}});
  const owner = await prisma.user.findFirstOrThrow({where: {is_active: true, user_accesses: {some: {role: {code: ROLE_CODES.OWNER}}}}});
  const failures: string[] = [];
  const report: string[] = [];
  let browser: any;
  try {
    const testPassword = randomUUID();
    await prisma.user.update({where: {user_id: owner.user_id}, data: {must_change_password: false, password_hash: hashPassword(testPassword)}});
    browser = await chromium.launch({headless: true});
    await mkdir(OUT, {recursive: true});
    for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
      const phone = viewport.width < 500;
      const label = `${viewport.width}`;
      const context = await browser.newContext({viewport, timezoneId: 'America/Los_Angeles', ...(phone ? {isMobile: true, hasTouch: true, deviceScaleFactor: 2} : {})});
      await context.addInitScript('window.__name = window.__name || ((fn) => fn);');
      const login = await context.request.post(base + '/api/v1/auth/login', {data: {email: owner.email, password: testPassword}});
      assert.equal(login.status(), 200);
      await context.addCookies((await context.cookies()).map((cookie: any) => ({...cookie, secure: false})));
      // Fresh imported projects for every screen size.
      let response = await context.request.get(base + '/api/v1/legacy-crm/state');
      if (response.status() === 404) {
        const init = await context.request.put(base + '/api/v1/legacy-crm/state', {data: {revision: 0, payload: {users: [], clients: [], orders: [], settings: {}}}});
        assert.equal(init.status(), 200);
        response = await context.request.get(base + '/api/v1/legacy-crm/state');
      }
      assert.equal(response.status(), 200, await response.text());
      const state = (await response.json()).data;
      const now = new Date(Date.now() - 30 * 86400000).toISOString();
      state.payload.settings.catalog = [...(state.payload.settings.catalog || []).filter((f: any) => f.id !== 'e2e592-solar'),
        {id: 'e2e592-solar', category: 'solar', brand: 'QA', model: 'Solar 20', retailPerSqft: 12, costPerSqft: 3}];
      state.payload.clients = (state.payload.clients || []).filter((c: any) => c.id !== CLIENT_ID).concat({id: CLIENT_ID, name: 'QA TintWiz Client', phone: '+13105550592', email: 'qa-wiz@example.com', createdAt: now});
      state.payload.orders = (state.payload.orders || []).filter((o: any) => !IDS.includes(o.id)).concat(IDS.map((id, index) => wizProject(id, index + 1, now)));
      const saved = await context.request.put(base + '/api/v1/legacy-crm/state', {data: state});
      assert.equal(saved.status(), 200, await saved.text());

      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e: Error) => errors.push(`pageerror: ${e.message}`));
      page.on('dialog', (dialog: any) => { report.push(`dialog@${label}: ${dialog.message().replace(/\s+/g, ' ').slice(0, 160)}`); dialog.accept(); });
      const money = (id: string) => page.evaluate((oid: string) => { const w = window as any; const o = w.getOrder(oid); return {revenue: w.orderRevenue(o), paid: o.paid, status: o.status, serviceType: o.serviceType || '', note: (o.timeline || []).filter((e: any) => e.key === 'direction_moved').map((e: any) => e.note)}; }, id);

      // 1. The card of a paid imported project asks to check its direction.
      await page.goto(`${base}/legacy-crm#/order/${IDS[0]}`, {waitUntil: 'networkidle'});
      await page.reload({waitUntil: 'networkidle'});
      await page.locator('.order-clean-shell').waitFor({state: 'visible', timeout: 15_000});
      const notice = page.locator('[data-wiz-direction-notice]');
      await notice.waitFor({state: 'visible', timeout: 5_000});
      await notice.scrollIntoViewIfNeeded();
      const check = async (name: string, scope?: string) => {
        const result = await overflowOf(page, scope);
        report.push(`${name}@${label}: ${JSON.stringify(result)}`);
        if (phone && (result.scroll > result.inner || result.offenders.length)) failures.push(`${name}@${label} scrolls sideways: ${JSON.stringify(result)}`);
      };
      await check('card-notice');
      await shot(page, `card-notice-${label}`);
      const before = await money(IDS[0]);

      // 2. «Сменить направление» opens the direction window with the move open; pick privacy.
      await notice.getByRole('button', {name: 'Сменить направление'}).click();
      await page.locator('.rp-dirwin').waitFor({state: 'visible'});
      await page.locator('.rp-dirwin-move').scrollIntoViewIfNeeded();
      await check('move-window', '.modal-content');
      await shot(page, `move-window-${label}`);
      await page.locator('.rp-dirwin-pick', {hasText: 'Приватная'}).first().click();
      await page.waitForTimeout(400);
      const after = await money(IDS[0]);
      report.push(`card-move@${label}: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
      if (after.serviceType !== 'privacy_film') failures.push(`card-move@${label}: direction did not change: ${JSON.stringify(after)}`);
      if (after.revenue !== before.revenue || after.paid !== before.paid || after.status !== before.status) failures.push(`card-move@${label}: money changed: ${JSON.stringify({before, after})}`);
      if (!after.note.some((note: string) => /Солнцезащитная плёнка → Приватная плёнка/.test(note))) failures.push(`card-move@${label}: no history entry`);
      await page.evaluate(() => (window as any).closeProjectDirectionWindow());
      await page.waitForTimeout(200);
      const noticeGone = await page.locator('[data-wiz-direction-notice]').count();
      if (noticeGone) failures.push(`card-move@${label}: the notice stays after the change`);
      await shot(page, `card-after-${label}`);

      // 3. The projects list: the owner fixes the other two imports at once.
      await page.goto(`${base}/legacy-crm#/section/orders`, {waitUntil: 'networkidle'});
      await page.reload({waitUntil: 'networkidle'});
      const open = page.getByRole('button', {name: /Импорт TintWiz/});
      await open.first().waitFor({state: 'visible', timeout: 10_000});
      // After the server saved it, the moved project keeps its money.
      const reloaded = await money(IDS[0]);
      report.push(`card-move-reloaded@${label}: ${JSON.stringify(reloaded)}`);
      if (reloaded.serviceType !== 'privacy_film' || reloaded.revenue !== before.revenue) failures.push(`card-move-reloaded@${label}: money changed after save: ${JSON.stringify({before, reloaded})}`);
      await open.first().click();
      await page.locator('[data-wiz-bulk]').waitFor({state: 'visible'});
      const listed = await page.locator('.rp-wiz-bulk-row').count();
      report.push(`bulk@${label}: listed=${listed}`);
      if (listed !== 2) failures.push(`bulk@${label}: expected the two unchecked imports, got ${listed}`);
      await page.getByRole('button', {name: 'Отметить все показанные'}).click();
      await page.waitForTimeout(150);
      await check('bulk', '.modal-content');
      await shot(page, `bulk-${label}`);
      const bulkBefore = await Promise.all(IDS.slice(1).map(money));
      await page.locator('[data-wiz-bulk-apply]').click();
      await page.waitForTimeout(600);
      const bulkAfter = await Promise.all(IDS.slice(1).map(money));
      report.push(`bulk-move@${label}: ${JSON.stringify(bulkAfter)}`);
      bulkAfter.forEach((row: any, index: number) => {
        if (row.serviceType !== 'privacy_film') failures.push(`bulk-move@${label}: ${IDS[index + 1]} did not change`);
        if (row.revenue !== bulkBefore[index].revenue || row.paid !== bulkBefore[index].paid) failures.push(`bulk-move@${label}: money changed on ${IDS[index + 1]}`);
        if (!row.note.some((note: string) => /массовая правка импорта TintWiz/.test(note))) failures.push(`bulk-move@${label}: no history entry on ${IDS[index + 1]}`);
      });
      await shot(page, `bulk-after-${label}`);
      await page.waitForTimeout(1500);
      await page.reload({waitUntil: 'networkidle'});
      await page.waitForFunction(() => typeof (window as any).getOrder === 'function' && !!(window as any).getOrder('e2e-592-wiz-2'));
      const bulkReloaded = await Promise.all(IDS.slice(1).map(money));
      report.push(`bulk-reloaded@${label}: ${JSON.stringify(bulkReloaded)}`);
      bulkReloaded.forEach((row: any, index: number) => {
        if (row.serviceType !== 'privacy_film' || row.revenue !== bulkBefore[index].revenue) failures.push(`bulk-reloaded@${label}: money changed after save on ${IDS[index + 1]}`);
      });

      if (errors.length) failures.push(`${label}: page errors ${JSON.stringify(errors)}`);
      await context.close();
      console.log(`#592 TintWiz direction: ${label}px checked`);
    }
    console.log(report.join('\n'));
    assert.deepEqual(failures, []);
  } catch (error) {
    if (browser) for (const context of browser.contexts()) for (const page of context.pages()) {
      await page.screenshot({path: `${OUT}/failure.png`}).catch(() => {});
    }
    console.log(report.join('\n'));
    throw error;
  } finally {
    await browser?.close();
    await prisma.user.update({where: {user_id: owner.user_id}, data: {password_hash: owner.password_hash, must_change_password: owner.must_change_password}});
    if (original) await prisma.legacyWorkspace.update({where: {workspace_id: 'primary'}, data: {payload: original.payload as any, revision: original.revision}});
    else await prisma.legacyWorkspace.deleteMany({where: {workspace_id: 'primary'}});
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
