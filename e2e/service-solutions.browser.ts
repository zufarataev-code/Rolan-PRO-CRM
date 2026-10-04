import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {PrismaClient} from '@prisma/client';
import {assertServerUsesTestDatabase} from './guard';
async function main() {
  const prisma=new PrismaClient();
  const base=process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
  await assertServerUsesTestDatabase(base,prisma);
  const {chromium}=createRequire(process.cwd()+'/package.json')(process.env.E2E_PLAYWRIGHT_MODULE || 'playwright');
  const original=await prisma.legacyWorkspace.findUnique({where:{workspace_id:'primary'}});
  let browser:any;
  try {
    await prisma.user.updateMany({where:{email:'owner@rolanpro.local'},data:{must_change_password:false}});
    browser=await chromium.launch({headless:true});
    await mkdir('test-results/service-solutions',{recursive:true});
    for(const width of [390,1440]) {
      const context=await browser.newContext({viewport:{width,height:900},timezoneId:'America/Los_Angeles'});
      const login=await context.request.post(base+'/api/v1/auth/login',{data:{email:'owner@rolanpro.local',password:process.env.E2E_SEED_PASSWORD || 'ChangeMe123!'}});
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
      const order={id:'e2e-solutions',serviceType:'solar_film',serviceSchedules:[],installerIds:[],measurements:{rooms:[{id:'room',windows:[{id:'w1',measureScope:'solar_film',offeringId:'solution-a',offeringName:'Solar One',catalogId:'film-a',width:254,height:254,qty:1,pricePerSqft:12},{id:'w2',measureScope:'solar_film',offeringId:'solution-b',offeringName:'Solar Two',catalogId:'film-a',width:254,height:254,qty:1,pricePerSqft:20}]}]},extraServices:[]};
      state.payload.settings.catalog=[...(state.payload.settings.catalog||[]).filter((f:any)=>f.id!=='film-a'),{id:'film-a',category:'solar',brand:'QA',model:'Model'}];
      state.payload.settings.serviceOfferings=[{id:'solution-a',name:'Solar One',direction:'solar',pricePerSqft:12,installerRatePerSqft:3,filmIds:['film-a'],active:true},{id:'solution-b',name:'Solar Two',direction:'solar',pricePerSqft:20,installerRatePerSqft:4,filmIds:['film-a'],active:true}];
      state.payload.orders=state.payload.orders.filter((o:any)=>o.id!==order.id).concat(order);
      const saved=await context.request.put(base+'/api/v1/legacy-crm/state',{data:state}); assert.equal(saved.status(),200,await saved.text());
      const page=await context.newPage(); const errors:string[]=[]; page.on('pageerror',(e:Error)=>errors.push(e.message));
      await page.goto(base+'/legacy-crm',{waitUntil:'networkidle'});
      await page.waitForFunction(()=>typeof (window as any).projectServiceScheduleHtml==='function');
      await page.goto(base+'/legacy-crm#/service-pricing',{waitUntil:'networkidle'});
      await page.getByRole('heading',{name:'Услуги по направлениям',exact:true}).waitFor();
      await page.locator(`[onclick="addServiceOffering('solar')"]`).click();
      const newName=page.locator('input[value="Новая услуга"]');
      await newName.fill('QA custom solution'); await newName.press('Tab');
      const card=page.locator('div.p-3.border').filter({has:page.locator('input[value="QA custom solution"]')});
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
      // Real project creation must select several concrete services before measurements.
      const intakeState=(await (await context.request.get(base+'/api/v1/legacy-crm/state')).json()).data;
      intakeState.payload.settings.catalog=intakeState.payload.settings.catalog.filter((film:any)=>film.id!=='qa-safety-film');
      intakeState.payload.settings.serviceOfferings=intakeState.payload.settings.serviceOfferings.filter((item:any)=>!['qa-safety-a','qa-safety-b'].includes(item.id));
      intakeState.payload.settings.catalog.push({id:'qa-safety-film',category:'protective',brand:'QA',model:'Safety'});
      intakeState.payload.settings.serviceOfferings.push(
        {id:'qa-safety-a',direction:'protective',name:'QA Safety A',filmIds:['qa-safety-film'],pricePerSqft:12,installerRatePerSqft:3,active:true},
        {id:'qa-safety-b',direction:'protective',name:'QA Safety B',filmIds:['qa-safety-film'],pricePerSqft:20,installerRatePerSqft:4,active:true});
      intakeState.payload.clients=intakeState.payload.clients.filter((client:any)=>client.id!=='qa-intake-client').concat({id:'qa-intake-client',name:'QA Intake Client',firstName:'QA Intake',lastName:'Client',phone:'+18055550191',email:'qa-intake@example.test',source:'direct',accountType:'b2c',type:'b2c',relationshipType:'one_time',address:'100 QA Street, Los Angeles, CA 90001',addressStreet:'100 QA Street',addressCity:'Los Angeles',addressState:'CA',addressZip:'90001'});
      const intakeSetup=await context.request.put(base+'/api/v1/legacy-crm/state',{data:intakeState}); assert.equal(intakeSetup.status(),200,await intakeSetup.text());
      await page.reload({waitUntil:'networkidle'});
      await page.evaluate(()=> (window as any).openOrderModal());
      await page.locator('#no-client-search').fill('QA Intake');
      await page.locator('#no-client-results').getByText('QA Intake Client',{exact:true}).click();
      await page.locator('[data-site-type="RESIDENTIAL"]').click();
      await page.locator('[data-svc="protective_film"]').click();
      for (const id of ['qa-safety-a','qa-safety-b']) {
        await page.locator(`[data-intake-offering="${id}"] input[type=checkbox]`).check();
        await page.locator(`[data-intake-offering="${id}"] select`).selectOption('qa-safety-film');
      }
      assert.equal(await page.locator('[aria-label="Замер объекта"]').count(),0);
      await page.screenshot({path:`test-results/service-solutions/intake-${width}.png`});
      await page.getByRole('button',{name:'Создать проект →',exact:true}).click();
      await page.getByRole('dialog',{name:'Услуги проекта',exact:true}).waitFor();
      assert.equal(await page.getByRole('dialog',{name:'Замер объекта',exact:true}).count(),0);
      assert.equal(await page.evaluate(()=> (window as any).cloudPersistConfirmed()),true);
      const afterIntake=(await (await context.request.get(base+'/api/v1/legacy-crm/state')).json()).data;
      const created=afterIntake.payload.orders.filter((item:any)=>item.clientId==='qa-intake-client').at(-1);
      assert.ok(created); assert.equal(created.measurements.rooms.length,0);
      assert.deepEqual(created.extraServices.map((line:any)=>[line.offeringId,line.catalogId,line.unitPrice,line.qty]),[['qa-safety-a','qa-safety-film',12,0],['qa-safety-b','qa-safety-film',20,0]]);
      await page.screenshot({path:`test-results/service-solutions/created-services-${width}.png`});
      await page.getByRole('button',{name:'Перейти к замерам выбранных услуг →',exact:true}).click();
      await page.locator('[onclick^="managerAddRoomFromForm("]').click();
      await page.locator('[onclick^="managerAddWindow("]').click();
      await page.locator('[data-measure-offering="qa-safety-b"]').click();
      await page.locator('[onclick^="managerAddWindow("]').click();
      assert.equal(await page.evaluate(()=> (window as any).cloudPersistConfirmed()),true);
      const afterWindows=(await (await context.request.get(base+'/api/v1/legacy-crm/state')).json()).data;
      const measured=afterWindows.payload.orders.find((item:any)=>item.id===created.id);
      assert.deepEqual(measured.measurements.rooms[0].windows.map((win:any)=>[win.offeringId,win.catalogId,win.pricePerSqft]),[['qa-safety-a','qa-safety-film',12],['qa-safety-b','qa-safety-film',20]]);
      await page.reload({waitUntil:'networkidle'});
      await page.evaluate((id:string)=> (window as any).openProjectChosenServices(id),created.id);
      await page.getByRole('dialog',{name:'Услуги проекта',exact:true}).getByText('QA Safety A',{exact:true}).waitFor();
      await page.getByRole('dialog',{name:'Услуги проекта',exact:true}).getByText('QA Safety B',{exact:true}).waitFor();
      const phoneDialog=await page.getByRole('dialog',{name:'Услуги проекта',exact:true}).evaluate((el:HTMLElement)=>({width:el.clientWidth,scroll:el.scrollWidth}));
      assert.ok(phoneDialog.scroll<=phoneDialog.width+1,JSON.stringify(phoneDialog));
      await page.evaluate(()=> (window as any).closeModal());
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
    if(original) await prisma.legacyWorkspace.update({where:{workspace_id:'primary'},data:{payload:original.payload as any,revision:original.revision}});
    else await prisma.legacyWorkspace.deleteMany({where:{workspace_id:'primary'}});
    await prisma.$disconnect();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
