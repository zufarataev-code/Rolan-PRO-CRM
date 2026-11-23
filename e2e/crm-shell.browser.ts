import assert from 'node:assert/strict';
import {mkdir, readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {hashPassword} from '../src/lib/auth/password';
import {ROLE_CODES} from '../src/lib/auth/constants';
import {assertServerUsesTestDatabase} from './guard';

// #578 (Owner, 2026-11-21: «Да всю СРМ»): the owner and managers now land in the new
// /crm interface. This test signs in through the real login form, checks that it opens
// /crm, opens each new screen on a computer and a phone, and fails if a screen does not
// load, throws, or scrolls sideways on the phone. Screenshots go into the job log.
const OUT = 'test-results/crm-shell';

async function shot(page: any, name: string) {
  const path = `${OUT}/${name}.jpg`;
  await page.screenshot({path, type: 'jpeg', quality: 60});
  if (process.env.E2E_PRINT_SCREENSHOTS === '1') {
    const data = (await readFile(path)).toString('base64');
    console.log(`@@SHOT ${name} ${data.length}`);
    for (let index = 0; index * 8000 < data.length; index += 1) console.log(`@@B64 ${name} ${index} ${data.slice(index * 8000, (index + 1) * 8000)}`);
  }
}

async function sideways(page: any) {
  return page.evaluate(() => {
    const inner = window.innerWidth;
    const offenders: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const box = (el as HTMLElement).getBoundingClientRect();
      if (!box.width || !box.height || box.right <= inner + 1) continue;
      let clipped = false;
      for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX) && node.getBoundingClientRect().right <= inner + 1) { clipped = true; break; }
      }
      // A closed side panel waits off screen on purpose.
      if (!clipped && getComputedStyle(el).position !== 'fixed') offenders.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).split(/\s+/).slice(0, 2).join('.')} right=${Math.round(box.right)}`);
      if (offenders.length >= 6) break;
    }
    return {scroll: document.documentElement.scrollWidth, inner, offenders};
  });
}

async function main() {
  const prisma = new PrismaClient();
  const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
  await assertServerUsesTestDatabase(base, prisma);
  const {chromium} = createRequire(process.cwd() + '/package.json')(process.env.E2E_PLAYWRIGHT_MODULE || 'playwright');
  const owner = await prisma.user.findFirstOrThrow({where: {is_active: true, user_accesses: {some: {role: {code: ROLE_CODES.OWNER}}}}});
  const failures: string[] = [];
  let browser: any;
  try {
    const password = randomUUID();
    await prisma.user.update({where: {user_id: owner.user_id}, data: {must_change_password: false, password_hash: hashPassword(password)}});
    browser = await chromium.launch({headless: true});
    await mkdir(OUT, {recursive: true});
    for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
      const phone = viewport.width < 500;
      const context = await browser.newContext({viewport, timezoneId: 'America/Los_Angeles', ...(phone ? {isMobile: true, hasTouch: true, deviceScaleFactor: 2} : {})});
      await context.addInitScript('window.__name = window.__name || ((fn) => fn);');
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e: Error) => errors.push(`pageerror: ${e.message}`));
      const label = String(viewport.width);

      // Sign in the way a person does and record where the login form sends the owner.
      const navigations: string[] = [];
      page.on('framenavigated', (frame: any) => { if (frame === page.mainFrame()) navigations.push(new URL(frame.url()).pathname); });
      await page.goto(base + '/login', {waitUntil: 'networkidle'});
      await page.locator('input[type=email]').fill(owner.email);
      await page.locator('input[type=password]').fill(password);
      const sent = page.waitForRequest((request: any) => request.isNavigationRequest() && new URL(request.url()).pathname !== '/login', {timeout: 20_000});
      await page.locator('button[type=submit]').click();
      const target = new URL((await sent).url()).pathname;
      if (target !== '/crm') failures.push(`${label}: the login form sends the owner to ${target}, not /crm (navigations ${navigations.join(' > ')})`);
      await page.waitForLoadState('networkidle');
      if (new URL(page.url()).pathname !== '/crm') {
        // Production cookies are Secure; on this plain-HTTP CI server sign in again through the API.
        const login = await context.request.post(base + '/api/v1/auth/login', {data: {email: owner.email, password}});
        assert.equal(login.status(), 200);
        await context.addCookies((await context.cookies()).map((cookie: any) => ({...cookie, secure: false})));
      }

      // The one-time «Добавить CRM на телефон?» offer follows the first sign-in; a person answers «Не сейчас».
      const installOffer = page.getByRole('dialog', {name: 'Установка Rolan PRO'});
      if (await installOffer.waitFor({state: 'visible', timeout: 5_000}).then(() => true, () => false)) {
        await installOffer.getByRole('button', {name: 'Не сейчас'}).click();
        await installOffer.waitFor({state: 'hidden'});
      }

      const projects = await (await context.request.get(base + '/api/v1/crm-ui/projects')).json().catch(() => null);
      const firstProject = projects?.data?.columns?.flatMap?.((column: any) => column.cards || [])?.[0]?.id;
      const screens: Array<[string, string]> = [['home', '/crm'], ['projects', '/crm/projects'], ['leads', '/crm/leads'], ['calendar', '/crm/calendar'], ['clients', '/crm/clients']];
      if (firstProject) screens.push(['project', `/crm/projects/${encodeURIComponent(firstProject)}`]);
      for (const [name, path] of screens) {
        await page.goto(base + path, {waitUntil: 'networkidle'});
        await page.locator('main h1, h1').first().waitFor({state: 'visible', timeout: 20_000}).catch(() => failures.push(`${name}@${label}: no heading`));
        const broken = await page.getByText(/Не удалось|Ошибка загрузки/).count();
        if (broken) failures.push(`${name}@${label}: the screen shows a load error`);
        if (phone) {
          const result = await sideways(page);
          if (result.scroll > result.inner || result.offenders.length) failures.push(`${name}@${label} scrolls sideways: ${JSON.stringify(result)}`);
        }
        if (await installOffer.count()) failures.push(`${name}@${label}: the one-time install offer came back after «Не сейчас»`);
        await shot(page, `${name}-${label}`);
      }
      // The new menu still has a way back to the previous interface and a way out.
      if (phone) await page.getByRole('button', {name: 'Открыть меню'}).click();
      if (!(await page.getByRole('link', {name: 'Прежний интерфейс'}).first().isVisible())) failures.push(`${label}: no link to the previous interface`);
      if (!(await page.getByRole('button', {name: 'Выйти'}).first().isVisible())) failures.push(`${label}: no «Выйти»`);
      if (errors.length) failures.push(`${label}: ${errors.join('; ')}`);
      await context.close();
    }
    assert.deepEqual(failures, []);
    console.log('New /crm interface is the landing page and its screens load on computer and phone: passed');
  } finally {
    await browser?.close();
    await prisma.user.update({where: {user_id: owner.user_id}, data: {password_hash: owner.password_hash, must_change_password: owner.must_change_password}});
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
