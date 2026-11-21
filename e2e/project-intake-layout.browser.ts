import assert from 'node:assert/strict';
import {mkdir, readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {hashPassword} from '../src/lib/auth/password';
import {ROLE_CODES} from '../src/lib/auth/constants';
import {assertServerUsesTestDatabase} from './guard';

// #577 (Owner, 2026-11-21): the «Новый проект» window and the project card fit one
// screen on a big monitor, and nothing scrolls sideways on a phone. This test opens
// the real legacy CRM in a browser, checks the layout and saves screenshots.
const OUT = 'test-results/project-intake-layout';
const CLIENT_ID = 'e2e-577-client';
const EMPTY_ID = 'e2e-577-from-lead';
const TWO_ID = 'e2e-577-two-services';

type Overflow = {scroll: number; inner: number; offenders: string[]};

async function overflowOf(page: any, scope?: string): Promise<Overflow> {
  return page.evaluate((selector: string | undefined) => {
    const inner = window.innerWidth;
    const root = selector ? document.querySelector(selector) as HTMLElement | null : document.documentElement;
    const clipped = (el: Element | null): boolean => {
      for (let node = el?.parentElement; node && node !== document.body; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX)) {
          const box = node.getBoundingClientRect();
          if (box.right <= inner + 1) return true;
        }
      }
      return false;
    };
    const offenders: string[] = [];
    for (const el of Array.from((root || document.body).querySelectorAll('*'))) {
      const box = (el as HTMLElement).getBoundingClientRect();
      if (!box.width || !box.height) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.position === 'fixed' && box.left >= inner) continue;
      if (box.right > inner + 1 && !clipped(el)) {
        const name = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${typeof (el as HTMLElement).className === 'string' && (el as HTMLElement).className ? '.' + (el as HTMLElement).className.trim().split(/\s+/).slice(0, 3).join('.') : ''}`;
        offenders.push(`${name} right=${Math.round(box.right)}`);
        if (offenders.length >= 8) break;
      }
    }
    return {scroll: document.documentElement.scrollWidth, inner, offenders};
  }, scope);
}

async function shot(page: any, name: string, options: Record<string, unknown> = {}) {
  const path = `${OUT}/${name}.jpg`;
  await page.screenshot({path, type: 'jpeg', quality: 60, ...options});
  // Artifact zips cannot always be opened by the reviewers; with this flag the picture
  // is also printed into the job log as base64 lines.
  if (process.env.E2E_PRINT_SCREENSHOTS === '1') {
    const data = (await readFile(path)).toString('base64');
    console.log(`@@SHOT ${name} ${data.length}`);
    for (let index = 0; index * 8000 < data.length; index += 1) console.log(`@@B64 ${name} ${index} ${data.slice(index * 8000, (index + 1) * 8000)}`);
  }
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
    let seeded = false;
    for (const viewport of [{width: 1920, height: 1080}, {width: 1440, height: 900}, {width: 390, height: 844}, {width: 375, height: 812}]) {
      const phone = viewport.width < 500;
      const context = await browser.newContext({viewport, timezoneId: 'America/Los_Angeles', ...(phone ? {isMobile: true, hasTouch: true, deviceScaleFactor: 2} : {})});
      // tsx wraps named inner functions in __name(); page.evaluate code runs in the
      // browser, where that helper does not exist.
      await context.addInitScript('window.__name = window.__name || ((fn) => fn);');
      const login = await context.request.post(base + '/api/v1/auth/login', {data: {email: owner.email, password: testPassword}});
      assert.equal(login.status(), 200);
      // Production builds issue Secure cookies; this disposable CI server is HTTP.
      await context.addCookies((await context.cookies()).map((cookie: any) => ({...cookie, secure: false})));
      if (!seeded) {
        let response = await context.request.get(base + '/api/v1/legacy-crm/state');
        if (response.status() === 404) {
          const init = await context.request.put(base + '/api/v1/legacy-crm/state', {data: {revision: 0, payload: {users: [], clients: [], orders: [], settings: {}}}});
          assert.equal(init.status(), 200);
          response = await context.request.get(base + '/api/v1/legacy-crm/state');
        }
        assert.equal(response.status(), 200, await response.text());
        const state = (await response.json()).data;
        const now = new Date().toISOString();
        state.payload.settings.catalog = [...(state.payload.settings.catalog || []).filter((f: any) => !['e2e577-film', 'e2e577-privacy-film'].includes(f.id)),
          {id: 'e2e577-film', category: 'solar', brand: 'QA', model: 'Solar 20'}, {id: 'e2e577-privacy-film', category: 'privacy', brand: 'QA', model: 'Frost'}];
        state.payload.settings.serviceOfferings = [...(state.payload.settings.serviceOfferings || []).filter((x: any) => !String(x.id).startsWith('e2e577-')),
          {id: 'e2e577-solar', name: 'Solar Control', direction: 'solar', pricePerSqft: 14, installerRatePerSqft: 3, filmIds: ['e2e577-film'], active: true},
          {id: 'e2e577-privacy', name: 'Privacy Frost', direction: 'privacy', pricePerSqft: 16, installerRatePerSqft: 3, filmIds: ['e2e577-privacy-film'], active: true}];
        state.payload.clients = (state.payload.clients || []).filter((c: any) => c.id !== CLIENT_ID).concat({id: CLIENT_ID, name: 'QA Layout Client', phone: '+13105550177', email: 'qa-layout@example.com', source: 'google', createdAt: now, address: '1200 Wilshire Blvd, Los Angeles, CA 90017'});
        const win = (id: string, scope: string, offeringId: string, name: string, catalogId: string, price: number) => ({id, measureScope: scope, offeringId, offeringName: name, catalogId, width: 254, height: 254, qty: 1, pricePerSqft: price});
        const fromLead = {id: EMPTY_ID, number: 'QA-577-L', clientId: CLIENT_ID, status: 'new', leadSource: 'google', createdAt: now, managerId: state.payload.users.find((u: any) => u.role === 'owner')?.id || null,
          serviceType: 'solar_film', serviceTypes: ['solar_film'], leadIntentServiceType: 'solar_film', leadIntentConfidence: 'from_lead', filmChoicePending: true, measurements: {rooms: []}, extraServices: [], extraExpenses: [], installerIds: [], timeline: []};
        const two = {id: TWO_ID, number: 'QA-577-2', clientId: CLIENT_ID, status: 'measurement_done', createdAt: now, managerId: fromLead.managerId,
          serviceType: 'solar_film', serviceTypes: ['solar_film', 'privacy_film'], installerIds: [], extraServices: [], extraExpenses: [], timeline: [],
          measurements: {rooms: [
            {id: 'r1', name: 'Living room', windows: [win('w1', 'solar_film', 'e2e577-solar', 'Solar Control', 'e2e577-film', 14), win('w2', 'solar_film', 'e2e577-solar', 'Solar Control', 'e2e577-film', 14)]},
            {id: 'r2', name: 'Bathroom', windows: [win('w3', 'privacy_film', 'e2e577-privacy', 'Privacy Frost', 'e2e577-privacy-film', 16)]},
          ]}};
        state.payload.orders = (state.payload.orders || []).filter((o: any) => ![EMPTY_ID, TWO_ID].includes(o.id)).concat(fromLead, two);
        const saved = await context.request.put(base + '/api/v1/legacy-crm/state', {data: state});
        assert.equal(saved.status(), 200, await saved.text());
        seeded = true;
      }
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e: Error) => errors.push(`pageerror: ${e.message}`));
      const label = `${viewport.width}`;
      const check = async (name: string, scope?: string) => {
        const result = await overflowOf(page, scope);
        report.push(`${name}@${label}: scrollWidth=${result.scroll} innerWidth=${result.inner} offenders=${JSON.stringify(result.offenders)}`);
        if (phone && (result.scroll > result.inner || result.offenders.length)) failures.push(`${name}@${label} scrolls sideways: ${JSON.stringify(result)}`);
      };

      await page.goto(base + '/legacy-crm', {waitUntil: 'networkidle'});
      await page.waitForFunction(() => typeof (window as any).openOrderModal === 'function' && typeof (window as any).selectOrderClient === 'function');

      // «Новый проект»: empty, then with the client, object and one service chosen.
      await page.evaluate(() => (window as any).openOrderModal());
      await page.locator('.erp-intake-modal').waitFor({state: 'visible'});
      await page.waitForTimeout(150);
      if (viewport.width === 1920 || phone) await shot(page, `intake-new-empty-${label}`);
      await page.evaluate((id: string) => { const w = window as any; w.selectOrderClient(id); w.selectOrderSiteType('RESIDENTIAL'); w.toggleNewOrderOffering('e2e577-solar', true); }, CLIENT_ID);
      await page.waitForTimeout(150);
      const columns = await page.evaluate(() => {
        const grid = document.querySelector('.erp-intake-columns') as HTMLElement | null;
        const modal = document.querySelector('.erp-intake-modal') as HTMLElement | null;
        return {columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0, modalWidth: modal?.getBoundingClientRect().width || 0};
      });
      report.push(`intake@${label}: ${JSON.stringify(columns)}`);
      if (viewport.width >= 1280 && columns.columns !== 2) failures.push(`intake@${label}: expected two columns, got ${JSON.stringify(columns)}`);
      if (phone && columns.columns !== 1) failures.push(`intake@${label}: expected one column on a phone, got ${JSON.stringify(columns)}`);
      await check('intake', '.erp-intake-modal');
      if (viewport.width === 1920 || viewport.width === 390) await shot(page, `intake-new-filled-${label}`);
      await page.evaluate(() => (window as any).closeModal());

      // Project card: made from a Google lead with no services yet, and with two services.
      for (const [id, name] of [[EMPTY_ID, 'card-from-lead'], [TWO_ID, 'card-two-services']]) {
        await page.goto(`${base}/legacy-crm#/order/${id}`, {waitUntil: 'networkidle'});
        await page.reload({waitUntil: 'networkidle'});
        try {
          await page.locator('.order-clean-shell').waitFor({state: 'visible', timeout: 15_000});
        } catch (error) {
          throw new Error(`Project card ${id} did not render. errors=${JSON.stringify(errors)} body=${JSON.stringify((await page.locator('body').innerText()).slice(0, 1200))}`, {cause: error});
        }
        await page.waitForTimeout(200);
        if (id === EMPTY_ID) {
          const empty = await page.evaluate(() => ({
            lead: document.querySelector('.project-cashier-lead')?.textContent?.replace(/\s+/g, ' ').trim() || '',
            add: document.querySelector('.project-cashier-add-toggle')?.textContent?.trim() || '',
            emptyText: document.querySelector('.project-cashier-empty')?.textContent?.trim() || '',
            tiles: document.querySelectorAll('.project-cashier-direction.add').length,
            addServicesBar: Array.from(document.querySelectorAll('.project-feed-next')).some(node => /Добавить услуги проекта/.test(node.textContent || '')),
          }));
          report.push(`card-from-lead@${label}: ${JSON.stringify(empty)}`);
          if (!/из заявки/.test(empty.lead)) failures.push(`card-from-lead@${label}: the lead direction is not offered: ${JSON.stringify(empty)}`);
          if (empty.add !== '+ Направление / услуга') failures.push(`card-from-lead@${label}: no single add button: ${JSON.stringify(empty)}`);
          if (empty.tiles) failures.push(`card-from-lead@${label}: big direction tiles are back`);
          if (empty.addServicesBar) failures.push(`card-from-lead@${label}: the big «Добавить услуги проекта» bar is still shown`);
        }
        const layout = await page.evaluate(() => {
          const shell = document.querySelector('.order-clean-shell') as HTMLElement | null;
          const services = document.querySelector('.project-feed-services') as HTMLElement | null;
          const hero = document.querySelector('.project-command-hero') as HTMLElement | null;
          return {
            columns: shell ? getComputedStyle(shell).gridTemplateColumns.split(' ').length : 0,
            sideBySide: Boolean(services && hero && services.getBoundingClientRect().left > hero.getBoundingClientRect().right - 1),
            shellBottom: Math.round(shell?.getBoundingClientRect().bottom || 0) + Math.round(window.scrollY),
            pageHeight: document.documentElement.scrollHeight,
          };
        });
        report.push(`${name}@${label}: ${JSON.stringify(layout)}`);
        if (viewport.width >= 1600 && !layout.sideBySide) failures.push(`${name}@${label}: services are not beside the header: ${JSON.stringify(layout)}`);
        await check(name);
        if (viewport.width !== 375) await shot(page, `${name}-${label}`);
      }

      if (phone) {
        for (const [hash, name] of [['#/section/leads', 'leads'], ['#/section/calendar', 'calendar']]) {
          await page.goto(`${base}/legacy-crm${hash}`, {waitUntil: 'networkidle'});
          await page.reload({waitUntil: 'networkidle'});
          await page.waitForTimeout(300);
          await check(name);
        }
        await page.goto(`${base}/legacy-crm#/order/${TWO_ID}`, {waitUntil: 'networkidle'});
        await page.reload({waitUntil: 'networkidle'});
        await page.locator('.order-clean-shell').waitFor({state: 'visible', timeout: 15_000});
        await page.evaluate((id: string) => (window as any).openManagerMeasureModal(id), TWO_ID);
        await page.waitForTimeout(300);
        await check('measure-modal', '.modal-content');
        await page.goto(`${base}/field/measure`, {waitUntil: 'networkidle'});
        await page.waitForTimeout(300);
        if (new URL(page.url()).pathname.startsWith('/field/measure')) await check('field-measure');
        else report.push(`field-measure@${label}: redirected to ${page.url()}`);
      }
      if (errors.length) failures.push(`${label}: page errors ${JSON.stringify(errors)}`);
      await context.close();
      console.log(`#577 layout: ${label}px checked`);
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
