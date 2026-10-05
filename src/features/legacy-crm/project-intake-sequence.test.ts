import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html','utf8');
test('project intake starts with direction, then solution, building, and contact',()=>{
 const start=html.indexOf('function openOrderModal()');
 const modal=html.slice(start,html.indexOf('function refreshOrderIntakeGates()',start));
 const anchors=['id="no-svc-buttons"','id="no-offering"','id="no-site-type-buttons"','id="no-client-search"'];
 let previous=-1;
 for(const anchor of anchors){ const next=modal.indexOf(anchor);assert.ok(next>previous,anchor);previous=next; }
 assert.match(modal,/state\._newOrderService = ''/);
 assert.match(modal,/state\._newOrderOfferingId = ''/);
});
test('changing direction clears the previous solution and building; inactive and foreign solutions are rejected',()=>{
 const state:any={_newOrderService:'solar_film',_newOrderOfferingId:'solar',_newOrderSiteType:'COMMERCIAL',_newOrderClient:'client'};
 const nodes=new Map<string,any>();
 for(const id of ['no-svc','no-offering','no-offering-empty','no-site-type'])nodes.set(id,{value:'',style:{},disabled:false});
 const blocks=['data-intake-offering','data-intake-site','data-intake-client','data-new-order-after-client'];
 const gates=new Map(blocks.map(name=>[`[${name}]`,[{style:{display:''}}]]));
 const offerings=[{id:'solar',name:'Solar solution',direction:'solar'},{id:'smart',name:'Smart solution',direction:'smart'},{id:'inactive',direction:'smart',active:false}];
 const c:any=vm.createContext({state,Set,ORDER_PRIMARY_SERVICES:[{id:'solar_film'},{id:'smart_film'}],
 document:{querySelector:()=>null,getElementById:(id:string)=>nodes.get(id),querySelectorAll:(key:string)=>gates.get(key)||[]},
 serviceOffering:(id:string)=>offerings.find(o=>o.id===id),serviceOfferingDirection:(id:string)=>id.split('_')[0],
 serviceOfferingsFor:(direction:string)=>offerings.filter(o=>o.direction===direction&&o.active!==false),
 normalizeOrderSiteType:(value:string)=>['COMMERCIAL','RESIDENTIAL'].includes(value)?value:'',academyEsc:(s:string)=>s,refreshOrderBuilderPreview:()=>{}});
 vm.runInContext(html.slice(html.indexOf('function offeringServiceType('),html.indexOf('function selectOrderExecution(')),c);
 c.selectOrderService('smart_film');
 assert.equal(state._newOrderOfferingId,'');assert.equal(state._newOrderSiteType,'');
 assert.equal(gates.get('[data-intake-client]')![0].style.display,'none');
 assert.match(nodes.get('no-offering').innerHTML,/Smart solution/);assert.doesNotMatch(nodes.get('no-offering').innerHTML,/Solar solution/);
 c.selectOrderOffering('solar');assert.equal(state._newOrderOfferingId,'');
 c.selectOrderOffering('inactive');assert.equal(state._newOrderOfferingId,'');
 c.selectOrderOffering('smart');assert.equal(state._newOrderOfferingId,'smart');
 c.selectOrderSiteType('RESIDENTIAL');assert.equal(gates.get('[data-intake-client]')![0].style.display,'');
});
test('saved project and measurement defaults preserve the chosen solution for the estimate and proposal',()=>{
 const creation=html.slice(html.indexOf('function createOrder(nextStep'),html.indexOf('function openClientModal()'));
 assert.match(creation,/offeringId: offering\.id/);
 assert.match(creation,/offering\.direction !== serviceOfferingDirection\(service\.id\)/);
 assert.match(creation,/openManagerMeasureModal\(o\.id\)/);
 const defaults=html.slice(html.indexOf('function managerWindowDefaults('),html.indexOf('function syncWindowPanelsForType('));
 assert.match(defaults,/o\.offeringIds \|\| o\.orderBuilder\?\.offeringIds/);
 assert.match(defaults,/\.map\(serviceOffering\)\.find/);
 assert.match(defaults,/applyWindowOffering\(win, offering\)/);
});

test('multiple concrete services are deduplicated and inactive or unknown directions cannot enter intake',()=>{
 const offerings=[{id:'a',direction:'solar'},{id:'b',direction:'solar'},{id:'c',direction:'smart'},{id:'off',direction:'smart',active:false},{id:'unknown',direction:'unknown'}];
 const state:any={_newOrderOfferingId:'a',_newOrderExtraOfferingIds:['a','b','c','c','off','unknown']};
 const c:any=vm.createContext({state,Set,ORDER_PRIMARY_SERVICES:[{id:'solar_film'},{id:'smart_film'}],serviceOffering:(id:string)=>offerings.find(o=>o.id===id),serviceOfferingDirection:(id:string)=>id.split('_')[0]});
 vm.runInContext(html.slice(html.indexOf('function offeringServiceType('),html.indexOf('function renderNewOrderExtraOfferings(')),c);
 assert.deepEqual(Array.from(c.newOrderSelectedOfferings(),(o:any)=>o.id),['a','b','c']);
 assert.deepEqual(Array.from(c.newOrderSelectedOfferings(),(o:any)=>c.offeringServiceType(o)),['solar_film','solar_film','smart_film']);
});
