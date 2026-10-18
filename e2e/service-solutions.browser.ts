import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {hashPassword} from '../src/lib/auth/password';
import {ROLE_CODES} from '../src/lib/auth/constants';
import {assertServerUsesTestDatabase} from './guard';
async function main() {
  const prisma=new PrismaClient();
  const base=process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
  await assertServerUsesTestDatabase(base,prisma);
  const {chromium}=createRequire(process.cwd()+'/package.json')(process.env.E2E_PLAYWRIGHT_MODULE || 'playwright');
  const original=await prisma.legacyWorkspace.findUnique({where:{workspace_id:'primary'}});
  const owner=await prisma.user.findFirstOrThrow({where:{is_active:true,user_accesses:{some:{role:{code:ROLE_CODES.OWNER}}}}});
  let browser:any;
  try {
    const testPassword=randomUUID();
    await prisma.user.update({where:{user_id:owner.user_id},data:{must_change_password:false,password_hash:hashPassword(testPassword)}});
    browser=await chromium.launch({headless:true});
    await mkdir('test-results/service-solutions',{recursive:true});
    for(const width of [390,1440]) {
      const context=await browser.newContext({viewport:{width,height:900},timezoneId:'America/Los_Angeles'});
      const login=await context.request.post(base+'/api/v1/auth/login',{data:{email:owner.email,password:testPassword}});
      assert.equal(login.status(),200);
      // Production builds issue Secure cookies; this disposable CI server is HTTP.
      // Keep the real login/session, relaxing transport only in this test context.
      await context.addCookies((await context.cookies()).map((cookie:any)=>({...cookie,secure:false})));
      let response=await context.request.get(base+'/api/v1/legacy-crm/state');
      let state:any;
      if(response.status()===404) {
        const init=await context.request.put(base+'/api/v1/legacy-crm/state',{data:{revision:0,payload:{users:[],clients:[],orders:[],settings:{}}}});
        assert.equal(init.status(),200);
        response=await context.request.get(base+'/api/v1/legacy-crm/state');
      }
      assert.equal(response.status(),200,await response.text());
      state=(await response.json()).data;
      const installers=state.payload.users.filter((u:any)=>u.role==='installer');
      assert.ok(installers.length);
      const order={id:'e2e-solutions',number:'QA-ERP',status:'proposal_accepted',serviceType:'solar_film',serviceSchedules:[],installerIds:[],measurements:{rooms:[{id:'room',windows:[{id:'w1',measureScope:'solar_film',offeringId:'solution-a',offeringName:'Solar One',catalogId:'film-a',width:254,height:254,qty:1,pricePerSqft:12},{id:'w2',measureScope:'solar_film',offeringId:'solution-b',offeringName:'Solar Two',catalogId:'film-a',width:254,height:254,qty:1,pricePerSqft:20}]}]},extraServices:[]};
      state.payload.settings.catalog=[...(state.payload.settings.catalog||[]).filter((f:any)=>f.id!=='film-a'),{id:'film-a',category:'solar',brand:'QA',model:'Model'}];
      state.payload.settings.serviceOfferings=[{id:'solution-a',name:'Solar One',direction:'solar',pricePerSqft:12,installerRatePerSqft:3,filmIds:['film-a'],active:true},{id:'solution-b',name:'Solar Two',direction:'solar',pricePerSqft:20,installerRatePerSqft:4,filmIds:['film-a'],active:true}];
      state.payload.orders=state.payload.orders.filter((o:any)=>o.id!==order.id).concat(order);
      const saved=await context.request.put(base+'/api/v1/legacy-crm/state',{data:state}); assert.equal(saved.status(),200,await saved.text());
      const page=await context.newPage(); const errors:string[]=[];
      page.on('pageerror',(e:Error)=>errors.push(`pageerror: ${e.message}`));
      page.on('console',(message:any)=>{ if(message.type()==='error') errors.push(`console: ${message.text()}`); });
      await page.goto(base+'/legacy-crm',{waitUntil:'networkidle'});
      await page.waitForFunction(()=>typeof (window as any).projectServiceScheduleHtml==='function');
      await page.goto(base+'/legacy-crm#/service-pricing',{waitUntil:'networkidle'});
      await page.getByRole('heading',{name:'Услуги по направлениям',exact:true}).waitFor();
      await page.locator(`[onclick="addServiceOffering('solar')"]`).click();
      const newName=page.locator('input[value="Новая услуга"]');
      const card=newName.locator('xpath=ancestor::div[@data-service-offering-row][1]');
      await newName.fill('QA custom solution'); await newName.press('Tab');
      const price=card.locator('input[type=number]').first();
      await price.fill('18'); await price.press('Tab');
      await card.locator('summary').click();
      await card.locator(`input[type=checkbox][onchange*="'film-a'"]`).check();
      const confirmed=await page.evaluate(()=> (window as any).cloudPersistConfirmed());
      assert.equal(confirmed,true,'Solution edits must be acknowledged by the workspace API');
      const catalogState=(await (await context.request.get(base+'/api/v1/legacy-crm/state')).json()).data;
      const solution=catalogState.payload.settings.serviceOfferings.find((x:any)=>x.name==='QA custom solution');
      assert.ok(solution,JSON.stringify({revision:catalogState.revision,solutions:catalogState.payload.settings.serviceOfferings.map((x:any)=>({id:x.id,name:x.name}))}));
      assert.equal(solution.pricePerSqft,18); assert.deepEqual(solution.filmIds,['film-a']);
      await page.screenshot({path:`test-results/service-solutions/catalog-${width}.png`});
      // Exercise real component functions in the authenticated CRM shell.
      await page.evaluate(({order,installers}:any)=>{
        (window as any).__qaOrder=order;
        const w=window as any;
        const host=document.createElement('div');host.id='solution-ui-test';host.style.cssText='position:fixed;inset:0;z-index:9999;background:white;overflow:auto;padding:12px';
        host.innerHTML=w.projectServiceScheduleHtml(order);
        document.body.appendChild(host);
      },{order,installers});
      assert.equal(await page.locator('[data-service-schedule]').count(),2);
      await page.locator('#service-date-0').fill('2026-10-10T09:00');
      await page.locator('#service-date-1').fill('2026-10-12T11:00');
      await page.locator('.service-installer-0').first().check();
      await page.locator('.service-installer-1').last().check();
      const schedules=await page.evaluate(()=> (window as any).readProjectServiceSchedule((window as any).__qaOrder));
      assert.notEqual(schedules[0].installationAt,schedules[1].installationAt);
      assert.equal(schedules[0].installationAt,'2026-10-10T16:00:00.000Z');
      const dims=await page.locator('#solution-ui-test').evaluate((el:HTMLElement)=>({client:el.clientWidth,scroll:el.scrollWidth}));
      assert.ok(dims.scroll<=dims.client+1,JSON.stringify(dims));
      await page.screenshot({path:`test-results/service-solutions/schedule-${width}.png`});
      const latest=(await (await context.request.get(base+'/api/v1/legacy-crm/state')).json()).data;
      latest.payload.orders.find((o:any)=>o.id===order.id).serviceSchedules=schedules;
      const persisted=await context.request.put(base+'/api/v1/legacy-crm/state',{data:latest}); assert.equal(persisted.status(),200,await persisted.text());
      const reloaded=(await (await context.request.get(base+'/api/v1/legacy-crm/state')).json()).data;
      assert.deepEqual(reloaded.payload.orders.find((o:any)=>o.id===order.id).serviceSchedules,schedules);
      await page.locator('#solution-ui-test').evaluate((element:HTMLElement)=>element.remove());
      // Multi-stage production uses the same real Project card and state API.
      await page.goto(base+'/legacy-crm#/order/'+order.id,{waitUntil:'networkidle'});
      // The API above changed the workspace outside this page; load that revision.
      await page.reload({waitUntil:'networkidle'});
      const serviceArrow=page.locator('[data-project-line="offering:solution-a"] .project-service-arrow');
      try {
        await serviceArrow.waitFor({state:'visible',timeout:15_000});
      } catch (error) {
        throw new Error(`Project card did not render the selected service. URL=${page.url()} errors=${JSON.stringify(errors)} body=${JSON.stringify((await page.locator('body').innerText()).slice(0,1200))}`,{cause:error});
      }
      await serviceArrow.click();
      await page.getByRole('button',{name:'+ Добавить этап',exact:true}).click();
      await page.waitForFunction(()=>document.querySelectorAll('[data-stage-id]').length===1);
      let stage=page.locator('[data-stage-id]').first();
      await stage.locator('input[type=datetime-local]').nth(1).fill('2026-10-10T17:00');
      await page.getByRole('button',{name:'+ Добавить этап',exact:true}).click();
      await page.waitForFunction(()=>document.querySelectorAll('[data-stage-id]').length===2);
      assert.equal(await page.locator('[data-stage-id]').count(),2);
      stage=page.locator('[data-stage-id]').last();
      await stage.locator('input[type=datetime-local]').nth(0).fill('2026-10-17T09:00');
      await stage.locator('input[type=datetime-local]').nth(1).fill('2026-10-17T17:00');
      await stage.getByRole('button',{name:'+ Подрядчик',exact:true}).click();
      await stage.locator('label').filter({hasText:'Подрядчик'}).locator('input').fill('QA Electrical LLC');
      await stage.locator('label').filter({hasText:'Стоимость, $'}).locator('input').fill('200');
      await stage.locator('input[type=number]').first().fill('40');
      await stage.locator('input[type=number]').first().press('Tab');
      assert.equal(await page.evaluate(()=> (window as any).cloudPersistConfirmed()),true);
      const staged=(await (await context.request.get(base+'/api/v1/legacy-crm/state')).json()).data;
      const project=staged.payload.orders.find((o:any)=>o.id===order.id);
      assert.equal(project.productionStages.length,2);
      assert.deepEqual(project.productionStages.map((s:any)=>s.laborSharePct),[60,40]);
      assert.equal(project.extraExpenses.filter((e:any)=>e.stageDerived).length,1);
      assert.equal(project.extraExpenses.find((e:any)=>e.stageDerived).amount,200);
      assert.equal(project.productionStages[1].contractors[0].name,'QA Electrical LLC');
      const stageDims=await page.locator('[data-production-stages]').evaluate((el:HTMLElement)=>({client:el.clientWidth,scroll:el.scrollWidth}));
      assert.ok(stageDims.scroll<=stageDims.client+1,JSON.stringify(stageDims));
      await page.screenshot({path:`test-results/service-solutions/stages-${width}.png`,fullPage:true});
      await page.reload({waitUntil:'networkidle'});
      await page.locator('[data-project-line="offering:solution-a"] .project-service-arrow').click();
      assert.equal(await page.locator('[data-stage-id]').count(),2,'stages persist after reloading the authenticated workspace');
      assert.deepEqual(errors,[]);
      await context.close();console.log(`Solution scheduling components and persisted API: ${width}px passed`);
    }
  } catch(error) {
    if(browser) for(const context of browser.contexts()) for(const page of context.pages()) {
      await page.screenshot({path:'test-results/service-solutions/failure.png'}).catch(()=>{});
    }
    throw error;
  } finally {
    await browser?.close();
    await prisma.user.update({where:{user_id:owner.user_id},data:{password_hash:owner.password_hash,must_change_password:owner.must_change_password}});
    if(original) await prisma.legacyWorkspace.update({where:{workspace_id:'primary'},data:{payload:original.payload as any,revision:original.revision}});
    else await prisma.legacyWorkspace.deleteMany({where:{workspace_id:'primary'}});
    await prisma.$disconnect();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
