import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
function load() {
  const db = { settings: { serviceOfferings: [] as any[], catalog: [{ id:'film', category:'solar', brand:'Brand', model:'Model' }, {id:'other',category:'protective'}] }, orders: [] as any[] };
  let role = 'owner'; let n=0;
  const services = [{id:'solar_film',catalogCategory:'solar',title:'Solar'}, {id:'protective_film',catalogCategory:'protective',title:'Safety'}];
  const c: any = vm.createContext({db, console, ORDER_PRIMARY_SERVICES: services, primaryServiceInfo:(id:string)=>services.find(s=>s.id===id), canonicalCatalogCategory:(x:string)=>x, currentUser:()=>({role}), uid:()=>`id${++n}`, alert:()=>{}, save:()=>{}, render:()=>{}, getOrder:(id:string)=>db.orders.find(o=>o.id===id), getCatalogItem:(id:string)=>db.settings.catalog.find(f=>f.id===id), catalogLabel:(f:any)=>`${f.brand} ${f.model}`, academyEsc:(s:any)=>String(s||''), projectQuickLineCatalog:()=>db.settings.catalog.filter(f=>f.category==='solar'), orderUserCanSeeMoney:()=>true, invalidateProjectEstimate:()=>{}, refreshManagerMeasureModal:()=>{}, refreshProjectEstimateWorkspace:()=>{}, measureAllWindows:(o:any)=>(o.measurements?.rooms||[]).flatMap((room:any)=>room.windows.map((win:any)=>({room,win}))), usersByRole:()=>[{id:'a',name:'A'},{id:'b',name:'B'}], datetimeLocalValue:(x:string)=>x, projectQuickLines:(o:any)=>(o.extraServices||[]).filter((l:any)=>l.quickProjectLine)});
  const start=html.indexOf('// ---------- УСЛУГИ ВНУТРИ НАПРАВЛЕНИЙ');
  vm.runInContext(html.slice(start,html.indexOf('function projectQuickLineCatalog(',start)),c);
  return {c,db,setRole:(value:string)=>{role=value;}};
}
test('owner creates real solutions, a film can serve multiple solutions, cross-direction films rejected',()=>{
  const {c,db,setRole}=load(); assert.equal(c.serviceOfferingsAll().length,0);
  c.addServiceOffering('solar'); c.addServiceOffering('solar');
  c.toggleServiceOfferingFilm('svc_id1','film',true); c.toggleServiceOfferingFilm('svc_id2','film',true);
  c.toggleServiceOfferingFilm('svc_id1','other',true);
  assert.deepEqual(Array.from(db.settings.serviceOfferings[0].filmIds),['film']);
  assert.deepEqual(Array.from(db.settings.serviceOfferings[1].filmIds),['film']);
  setRole('manager'); c.addServiceOffering('solar'); assert.equal(c.serviceOfferingsAll().length,2);
});
test('solution price/name is copied into measured scope without changing old estimates on catalog edits',()=>{
  const {c,db}=load(); c.addServiceOffering('solar'); c.updateServiceOffering('svc_id1','name','Solution A'); c.updateServiceOffering('svc_id1','pricePerSqft',12); c.toggleServiceOfferingFilm('svc_id1','film',true);
  const win:any={id:'w',measureScope:'solar_film',catalogId:'other'};
  const o:any={id:'o',measurements:{rooms:[{id:'r',windows:[win]}]}}; db.orders.push(o);
  c.projectSetWindowSolution('o','r','w','offeringId','svc_id1');
  assert.equal(win.pricePerSqft,12); assert.equal(win.catalogId,'');
  c.projectSetWindowSolution('o','r','w','catalogId','other'); assert.equal(win.catalogId,'');
  c.projectSetWindowSolution('o','r','w','catalogId','film'); assert.equal(win.catalogId,'film');
  c.updateServiceOffering('svc_id1','name','Renamed'); c.updateServiceOffering('svc_id1','pricePerSqft',30);
  assert.equal(win.offeringName,'Solution A'); assert.equal(win.pricePerSqft,12);
});
test('measured and quick scope do not double count; services keep distinct crews and dates',()=>{
  const {c}=load(); const a={offeringId:'one',offeringName:'First'},b={offeringId:'two',offeringName:'Second'};
  const o={installerIds:['a','b'],measurements:{rooms:[{windows:[a,b]}]},extraServices:[{id:'old',quickProjectLine:true}],serviceSchedules:[{id:'offering:one',installerIds:['a'],installationAt:'2026-10-10T16:00:00Z'},{id:'offering:two',installerIds:['b'],installationAt:'2026-10-12T16:00:00Z'}]};
  const groups=c.projectServiceGroups(o); assert.equal(groups.length,2);
  assert.deepEqual(Array.from(c.projectServiceCrew(o,a)),['a']); assert.deepEqual(Array.from(c.projectServiceCrew(o,b)),['b']);
  assert.notEqual(c.projectServiceAssignment(o,groups[0]).installationAt,c.projectServiceAssignment(o,groups[1]).installationAt);
  const newGroup={id:'offering:new',lines:[]}; assert.equal(c.projectServiceAssignment(o,newGroup).installationAt,'');
});
test('schedule validation is all-or-nothing; each service requires its own date and crew',()=>{
  const {c}=load(); const o={extraServices:[{id:'one',label:'First'},{id:'two',label:'Second'}]};
  const dates:any={'service-date-0':{value:'2026-10-10T09:00'},'service-date-1':{value:''}};
  c.document={getElementById:(id:string)=>dates[id],querySelectorAll:(selector:string)=>[{value:selector.includes('-0')?'a':'b'}]};
  assert.throws(()=>c.readProjectServiceSchedule(o)); assert.equal((o as any).serviceSchedules,undefined);
  dates['service-date-1'].value='2026-10-12T11:00'; const plans=c.readProjectServiceSchedule(o);
  assert.deepEqual(Array.from(plans,(p:any)=>Array.from(p.installerIds)),[['a'],['b']]);
});
test('all inline CRM scripts compile',()=>{for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)){if(match[1].trim()) new vm.Script(match[1]);}});
