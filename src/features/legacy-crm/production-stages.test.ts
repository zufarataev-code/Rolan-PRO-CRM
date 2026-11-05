import { composeProductionHtml } from './production-ui';
import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareProductionStages, mergeFieldProductionStages, stagePayroll, serviceLaborBudget, settleProductionProject } from './production-stages';
import { prepareServiceSolutions, projectServicesFinished } from './service-solutions';
import { createFieldWorkspace } from './field-workspace';
import { ROLE_CODES } from '@/lib/auth/constants';
import { prepareServiceScopeApprovals, serviceScopeApproved } from './service-scope-approvals';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
type Row = Record<string, any>;
function fixture(status = 'proposal_accepted'): Row {
  return { settings: { catalog: [], serviceOfferings: [{ id:'film', name:'Защитная A1', direction:'protective', unit:'sqft', pricePerSqft:14, installerRatePerSqft:3 }], complexityCoefs:{standard:1} },
    users: [{id:'m',role:'manager'}, {id:'i1',role:'installer',payConfig:{type:'per_sqft'}}, {id:'i2',role:'installer',payConfig:{type:'per_sqft'}}],
    orders:[{id:'o',managerId:'m',serviceType:'protective_film',status,extraExpenses:[],extraServices:[],
      measurements:{rooms:[{id:'r',windows:[{id:'w',offeringId:'film',offeringInstallerRate:3, width:3048,height:3048,qty:1}]}]}}] };
}
function stages(contractor = false): Row[] {
  return [
    {id:'a',serviceId:'offering:film',title:'Монтаж',startsAt:'2026-10-12T16:00:00Z',endsAt:'2026-10-12T22:00:00Z',installerIds:['i1','i2'],responsibleId:'i1',contractors:[],laborSharePct:60,status:'planned'},
    {id:'b',serviceId:'offering:film',title:'Герметизация',startsAt:'2026-10-19T16:00:00Z',endsAt:'2026-10-19T22:00:00Z',installerIds:contractor ? [] : ['i2'],responsibleId:contractor ? '' : 'i2',contractors:contractor ? [{name:'Electrical LLC',amount:200}] : [],laborSharePct:40,status:'planned',dependsOn:'a'},
  ];
}
function plan(contractor = false): Row {
  const before=fixture(), next=structuredClone(before); next.orders[0].productionStages=stages(contractor);
  assert.equal(prepareProductionStages(before,next,false,['m']),null);
  assert.equal(prepareServiceSolutions(before,next,false),null);
  return next;
}
test('only the responsible manager plans stages after accepted proposal',()=>{
  const before=fixture('proposal_sent'),next=structuredClone(before);next.orders[0].productionStages=stages();
  assert.match(prepareProductionStages(before,next,false,['m'])!,/после принятия КП/);
  before.orders[0].status=next.orders[0].status='proposal_accepted';
  assert.match(prepareProductionStages(before,next,false,['other'])!,/ответственный менеджер/);
  assert.equal(prepareProductionStages(before,next,false,['m']),null);
});
test('a mixed project retains separate stages and one contractor expense',()=>{
  const planned=plan(true),o=planned.orders[0];
  assert.deepEqual(o.serviceSchedules[0].installerIds,['i1','i2']);
  assert.equal(o.serviceSchedules[0].externalExecutor,true);
  assert.equal(o.extraExpenses.length,1);assert.equal(o.extraExpenses[0].amount,200);
  const again=structuredClone(planned);
  assert.equal(prepareProductionStages(planned,again,false,['m']),null);
  assert.equal(again.orders[0].extraExpenses.length,1);
  assert.equal(serviceLaborBudget(planned,o,'offering:film'),300);
  assert.deepEqual(stagePayroll(planned,o,o.productionStages[0]).map(row=>row.amount),[90,90]);
  assert.deepEqual(stagePayroll(planned,o,o.productionStages[1]),[]);
  o.extraExpenses[0].paid=true;o.extraExpenses[0].paidAt='2026-10-12T19:00:00Z';
  const settled=structuredClone(planned);
  assert.equal(prepareProductionStages(planned,settled,false,['m']),null);
  assert.equal(settled.orders[0].extraExpenses[0].paid,true,'reprojection retains payment history');
  assert.equal(settled.orders[0].extraExpenses[0].paidAt,o.extraExpenses[0].paidAt);
});
test('dependency and every required stage block early service/project completion',()=>{
  const before=plan(),o=before.orders[0];o.status='installation_scheduled';
  const invalid=structuredClone(before);invalid.orders[0].productionStages[1].status='done';
  assert.match(prepareProductionStages(before,invalid,false,['m'])!,/предыдущий этап/);
  const first=structuredClone(before);first.orders[0].productionStages[0].status='done';
  assert.equal(prepareProductionStages(before,first,false,['m']),null);
  assert.equal(first.orders[0].serviceProgress['offering:film'].status,'in_progress');
  assert.equal(projectServicesFinished(first.orders[0],first),false);
  const second=structuredClone(first);second.orders[0].productionStages[1].status='done';
  assert.equal(prepareProductionStages(first,second,false,['m']),null);
  assert.equal(projectServicesFinished(second.orders[0],second),true);
  const closed=structuredClone(second);closed.orders[0].status='installation_done';
  assert.equal(prepareProductionStages(second,closed,false,['m']),null);
  assert.equal(prepareProductionStages(closed,structuredClone(closed),false,['m']),null,'closed stages round-trip unchanged');
});
test('a completed stage has an immutable server-calculated payroll snapshot',()=>{
  const before=plan();before.orders[0].status='installation_scheduled';
  const next=structuredClone(before);next.orders[0].productionStages[0].status='done';
  next.orders[0].productionStages[0].payroll=[{userId:'i1',amount:99999}];
  next.orders[0].measurements.rooms[0].windows[0].offeringInstallerRate=999;
  assert.equal(prepareProductionStages(before,next,false,['m']),null);
  assert.deepEqual(next.orders[0].productionStages[0].payroll.map((row:Row)=>row.amount),[90,90]);
  // Future changes to the directory cannot rewrite the completed obligation.
  const after=structuredClone(next);after.settings.serviceOfferings[0].installerRatePerSqft=10;
  assert.equal(prepareProductionStages(next,after,true,[]),null);
  assert.deepEqual(after.orders[0].productionStages[0].payroll,next.orders[0].productionStages[0].payroll);
  const changed=structuredClone(next);changed.orders[0].productionStages[0].installerIds=['i1'];
  assert.match(prepareProductionStages(next,changed,false,['m'])!,/сохраняет/);
});
test('field writes cannot change crews, rates or another specialist stage',()=>{
  const before=plan(),o=before.orders[0];o.status='installation_scheduled';
  const submitted=stages();submitted[0].status='done';submitted[0].installerIds=['attacker'];submitted[1].status='done';submitted[1].contractors=[{name:'Fake',amount:999}];
  const merged=mergeFieldProductionStages(o,submitted,new Set(['i1']),'2026-10-12T21:00:00Z');
  assert.equal(merged[0].status,'done');assert.deepEqual(merged[0].installerIds,['i1','i2']);assert.equal(merged[0].doneBy,'i1');
  assert.equal(merged[1].status,'planned');assert.deepEqual(merged[1].contractors,[]);
  o.productionStages=merged;
  const next=structuredClone(before);assert.equal(prepareProductionStages(planWithStatus(),next,false,[],true),null);
  const own=createFieldWorkspace(next,[ROLE_CODES.INSTALLER],['i1']) as Row;
  assert.equal(own.orders[0].productionStages[0].ownEarnings,90);
  assert.equal(own.orders[0].productionStages[0].payroll,undefined);
  assert.equal(own.orders[0].productionStages[0].laborSharePct,undefined);
  assert.equal(own.orders[0].productionStages[1].ownEarnings,0);
  function planWithStatus(){const value=plan();value.orders[0].status='installation_scheduled';return value;}
});
test('cent allocation conserves the service budget over several stages and people',()=>{
  const data=fixture(),o=data.orders[0];o.measurements.rooms[0].windows[0].width=304.8;o.measurements.rooms[0].windows[0].height=304.8;
  data.settings.serviceOfferings[0].installerRatePerSqft=1;o.measurements.rooms[0].windows[0].offeringInstallerRate=1;
  o.productionStages=['a','b','c'].map((id,index)=>({...stages()[0],id,laborSharePct:index===2?33.34:33.33}));
  assert.equal(o.productionStages.flatMap((stage:Row)=>stagePayroll(data,o,stage)).reduce((sum:number,row:Row)=>sum+Math.round(row.amount*100),0),100);
});
test('cyclic dependencies, inconsistent shares and contractor shortcuts are rejected',()=>{
  for(const mutate of [(s:Row[])=>s[0].dependsOn='b',(s:Row[])=>s[1].laborSharePct=99,(s:Row[])=>s[0].contractors=[{name:'Firm',amount:-1}]]){
    const before=fixture(),next=structuredClone(before);next.orders[0].productionStages=stages();mutate(next.orders[0].productionStages);
    assert.ok(prepareProductionStages(before,next,false,['m']));
  }
  const before=fixture(),next=structuredClone(before);next.orders[0].serviceSchedules=[{id:'offering:film',installerIds:[],installationAt:'2026-10-12T16:00:00Z',externalExecutor:true}];
  assert.match(prepareServiceSolutions(before,next,false)!,/связано с этапом/);
});
test('a new service requires recorded client approval before it enters production',()=>{
  const before=fixture('installation_scheduled'),next=structuredClone(before);
  next.orders[0].extraServices.push({id:'new',type:'other',unit:'fixed',qty:1,price:200});
  assert.equal(prepareServiceScopeApprovals(before,next,false,['m'],'manager-session'),null);
  assert.equal(serviceScopeApproved(next.orders[0],'offering:film'),true);
  assert.equal(serviceScopeApproved(next.orders[0],'line:new'),false);
  const approved=structuredClone(next);
  approved.orders[0].serviceScopeApprovals.push({serviceId:'line:new',requestApproval:true,note:'Client confirmed by email on October 12'});
  assert.equal(prepareServiceScopeApprovals(next,approved,false,['m'],'manager-session'),null);
  assert.equal(serviceScopeApproved(approved.orders[0],'line:new'),true);
  assert.equal(approved.orders[0].serviceScopeApprovals.at(-1).approvedBy,'manager-session');
  assert.equal(approved.orders[0].timeline.at(-1).key,'service_change_approved');
});
test('two completed stages accrue in their own weeks and payment cannot count either twice',()=>{
  const payload=plan(),o=payload.orders[0];
  o.status='installation_done';o.installerIds=['i1','i2'];o.installationDoneAt='2026-10-12T19:00:00Z';
  o.productionStages.forEach((stage:Row,index:number)=>{stage.status='done';stage.doneAt=index===0?'2026-10-05T19:00:00Z':'2026-10-12T19:00:00Z';stage.payroll=stagePayroll(payload,o,stage);});
  payload.payrollPayments=[];
  const html=composeProductionHtml(readFileSync('private/legacy/rolanpro-crm-cloud.html','utf8'), readFileSync('private/legacy/production-stages.js','utf8'));
  const source=(name:string)=>{const start=html.indexOf(`function ${name}(`);return html.slice(start,html.indexOf('\n}',start)+2);};
  const c=vm.createContext({db:payload,state:{currentUserId:'owner'},getOrder:()=>o,getUser:(id:string)=>payload.users.find((u:Row)=>u.id===id),installerSeniorFactor:()=>1,
    measureAllWindows:(order:Row)=>order.measurements.rooms.flatMap((room:Row)=>room.windows.map((win:Row)=>({room,win}))),
    orderQuickInstallerPayoutForUser:()=>0,orderAdditionalWorkPayoutForUser:()=>0,orderActualAreaSqft:()=>100,
    financeDate:(value:string)=>new Date(value),fmtMoney:String,uid:()=>String(payload.payrollPayments.length),save:()=>{},render:()=>{},confirm:()=>true,alert:()=>{},
  });
  vm.runInContext(['projectStages','projectStageEmployeeAmount','projectStageUnstagedOrder','orderInstallerPayoutForUser','calcUserPayoutForPeriod',
    'payrollPeriodAllocatedAmount','payrollPaidForPeriod','markPayoutPaid'].map(source).join('\n'),c);
  const start=new Date('2026-10-05T00:00:00Z'),end=new Date('2026-10-11T23:59:59Z');
  assert.equal(c.calcUserPayoutForPeriod('i2',start,end).total,90);
  assert.equal(c.calcUserPayoutForPeriod('i2',new Date('2026-10-12'),new Date('2026-10-18T23:59:59Z')).total,120);
  c.markPayoutPaid('i2',start.toISOString(),end.toISOString());
  c.markPayoutPaid('i2','2026-10-01T00:00:00Z','2026-10-31T23:59:59Z');
  assert.deepEqual(payload.payrollPayments.map((p:Row)=>p.amount),[90,120]);
  c.markPayoutPaid('i2','2026-10-12T00:00:00Z','2026-10-18T23:59:59Z');
  assert.equal(payload.payrollPayments.length,2);
  assert.deepEqual(JSON.parse(JSON.stringify(o.payouts.map((p:Row)=>p.stageId))),['a','b']);
});
test('historical services accrue and settle in each service completion period',()=>{
  const payload:Row={settings:{},users:[{id:'i1',role:'installer',name:'Installer',payConfig:{type:'per_sqft'}}],payrollPayments:[],orders:[]};
  const order:Row={id:'old',number:'R-OLD',quickProjectImportedCompleted:true,installerIds:['i1'],installationDoneAt:'2026-02-20T12:00:00.000Z',payouts:[]};
  payload.orders.push(order);
  const lines=[
    {key:'line:jan',name:'January service',qty:100,unitShort:'sq ft',installerPay:100,installerIds:['i1'],installationAt:'2026-01-12T12:00:00.000Z',sources:[{endDate:'2026-01-12'}]},
    {key:'line:feb',name:'February service',qty:200,unitShort:'sq ft',installerPay:200,installerIds:['i1'],installationAt:'2026-02-20T12:00:00.000Z',sources:[{endDate:'2026-02-20'}]},
  ];
  const html=composeProductionHtml(readFileSync('private/legacy/rolanpro-crm-cloud.html','utf8'), readFileSync('private/legacy/production-stages.js','utf8'));
  const source=(name:string)=>{const start=html.indexOf(`function ${name}(`);return html.slice(start,html.indexOf('\n}',start)+2);};
  const c=vm.createContext({db:payload,state:{currentUserId:'owner'},getOrder:()=>order,getUser:(id:string)=>payload.users.find((u:Row)=>u.id===id),
    projectQuickLines:()=>[{id:'jan'},{id:'feb'}],projectLines:()=>lines,projectStages:()=>[],projectQuickDateValue:(value:string)=>value,
    projectLineQtyText:(line:Row)=>`${line.qty} ${line.unitShort}`,installerSeniorFactor:()=>1,orderInstallerPayoutForUser:()=>300,
    financeDate:(value:string)=>new Date(value),fmtMoney:String,uid:()=>String(payload.payrollPayments.length+order.payouts.length),save:()=>{},render:()=>{},confirm:()=>true,alert:()=>{},
  });
  vm.runInContext(['historicalProjectInstallerAccruals','calcUserPayoutForPeriod','payrollPeriodAllocatedAmount','payrollPaidForPeriod','markPayoutPaid'].map(source).join('\n'),c);
  const january=[new Date('2026-01-01T00:00:00Z'),new Date('2026-01-31T23:59:59Z')];
  const february=[new Date('2026-02-01T00:00:00Z'),new Date('2026-02-28T23:59:59Z')];
  assert.deepEqual(JSON.parse(JSON.stringify(c.calcUserPayoutForPeriod('i1',...january))),{total:100,breakdown:[{kind:'per_sqft',orderId:'old',orderNumber:'R-OLD',accrualId:'line:jan',label:'January service · 100 sq ft',amount:100,date:'2026-01-12T12:00:00.000Z',paid:false}]});
  assert.equal(c.calcUserPayoutForPeriod('i1',...february).total,200);
  c.markPayoutPaid('i1',january[0].toISOString(),january[1].toISOString());
  c.markPayoutPaid('i1',february[0].toISOString(),february[1].toISOString());
  assert.deepEqual(payload.payrollPayments.map((payment:Row)=>payment.amount),[100,200]);
  assert.deepEqual(order.payouts.map((payment:Row)=>payment.accrualId),['line:jan','line:feb']);
});
test('each historical visit receives its minimum in the month when it happened',()=>{
  const user:Row={id:'i1',role:'installer',name:'Installer',payConfig:{type:'per_sqft'}};
  const payload:Row={settings:{},users:[user],orders:[]};
  const order:Row={id:'old',number:'R-OLD',quickProjectImportedCompleted:true,installerIds:['i1'],installationDoneAt:'2026-02-20T12:00:00.000Z',payouts:[]};
  payload.orders.push(order);
  const lines=[
    {key:'line:jan',name:'January service',qty:10,unitShort:'sq ft',installerPay:50,installerIds:['i1'],sources:[{startDate:'2026-01-12',endDate:'2026-01-12'}]},
    {key:'line:feb',name:'February service',qty:10,unitShort:'sq ft',installerPay:50,installerIds:['i1'],sources:[{startDate:'2026-02-20',endDate:'2026-02-20'}]},
  ];
  const html=composeProductionHtml(readFileSync('private/legacy/rolanpro-crm-cloud.html','utf8'), readFileSync('private/legacy/production-stages.js','utf8'));
  const source=(name:string)=>{const start=html.indexOf(`function ${name}(`);return html.slice(start,html.indexOf('\n}',start)+2);};
  const c=vm.createContext({db:payload,state:{currentUserId:'owner'},getUser:()=>user,projectStages:()=>[],
    projectQuickLines:()=>[{id:'jan'},{id:'feb'}],projectLines:()=>lines,projectQuickDateValue:(value:string)=>value,
    projectLineQtyText:(line:Row)=>`${line.qty} ${line.unitShort}`,installerSeniorFactor:()=>1,
    installerPayRules:()=>({minimumPerVisit:200,travelPerHour:20}),installerTravel:()=>({paid:false,hours:0}),
  });
  vm.runInContext(['historicalProjectInstallerAccruals','calcUserPayoutForPeriod'].map(source).join('\n'),c);
  const accruals=JSON.parse(JSON.stringify(c.historicalProjectInstallerAccruals(order,user)));
  assert.deepEqual(accruals.map((item:Row)=>[item.accrualId,item.amount,item.date]),[
    ['line:jan',50,'2026-01-12T12:00:00.000Z'],
    ['line:feb',50,'2026-02-20T12:00:00.000Z'],
    ['historical-visit:2026-01-12:i1',150,'2026-01-12T12:00:00.000Z'],
    ['historical-visit:2026-02-20:i1',150,'2026-02-20T12:00:00.000Z'],
  ]);
  assert.equal(c.calcUserPayoutForPeriod('i1',new Date('2026-01-01T00:00:00Z'),new Date('2026-01-31T23:59:59Z')).total,200);
  assert.equal(c.calcUserPayoutForPeriod('i1',new Date('2026-02-01T00:00:00Z'),new Date('2026-02-28T23:59:59Z')).total,200);
});
test('a historical service longer than fourteen days keeps every visit accrual',()=>{
  const user:Row={id:'i1',role:'installer',name:'Installer',payConfig:{type:'per_sqft'}};
  const order:Row={id:'long',number:'R-LONG',quickProjectImportedCompleted:true,installerIds:['i1'],installationDoneAt:'2026-01-20T12:00:00.000Z'};
  const lines=[{key:'line:long',name:'Long service',qty:100,unitShort:'sq ft',installerPay:1000,installerIds:['i1'],sources:[{startDate:'2026-01-01',endDate:'2026-01-20'}]}];
  const html=composeProductionHtml(readFileSync('private/legacy/rolanpro-crm-cloud.html','utf8'), readFileSync('private/legacy/production-stages.js','utf8'));
  const source=(name:string)=>{const start=html.indexOf(`function ${name}(`);return html.slice(start,html.indexOf('\n}',start)+2);};
  const c=vm.createContext({projectQuickLines:()=>[{id:'long'}],projectLines:()=>lines,projectQuickDateValue:(value:string)=>value,
    projectLineQtyText:(line:Row)=>`${line.qty} ${line.unitShort}`,installerSeniorFactor:()=>1,
    installerPayRules:()=>({minimumPerVisit:200,travelPerHour:20}),installerTravel:()=>({paid:false,hours:0}),
  });
  vm.runInContext(source('historicalProjectInstallerAccruals'),c);
  const accruals=JSON.parse(JSON.stringify(c.historicalProjectInstallerAccruals(order,user)));
  const visits=accruals.filter((item:Row)=>item.accrualId.startsWith('historical-visit:'));
  assert.equal(visits.length,20);
  assert.equal(visits[0].date,'2026-01-01T12:00:00.000Z');
  assert.equal(visits.at(-1).date,'2026-01-20T12:00:00.000Z');
  assert.equal(accruals.reduce((sum:number,item:Row)=>sum+item.amount,0),4000);
});
test('fixed-per-job installer receives one historical accrual on the last service date',()=>{
  const payload:Row={settings:{},users:[{id:'i1',role:'installer',name:'Installer',payConfig:{type:'fixed_per_job',fixedPerJob:450}}],payrollPayments:[],orders:[]};
  const order:Row={id:'old',number:'R-OLD',quickProjectImportedCompleted:true,installerIds:['i1'],installationDoneAt:'2026-02-20T12:00:00.000Z',payouts:[]};
  payload.orders.push(order);
  const lines=[
    {key:'line:jan',name:'January service',installerIds:['i1'],sources:[{endDate:'2026-01-12'}]},
    {key:'line:feb',name:'February service',installerIds:['i1'],sources:[{endDate:'2026-02-20'}]},
  ];
  const html=composeProductionHtml(readFileSync('private/legacy/rolanpro-crm-cloud.html','utf8'), readFileSync('private/legacy/production-stages.js','utf8'));
  const source=(name:string)=>{const start=html.indexOf(`function ${name}(`);return html.slice(start,html.indexOf('\n}',start)+2);};
  const c=vm.createContext({db:payload,state:{currentUserId:'owner'},getOrder:()=>order,getUser:(id:string)=>payload.users.find((u:Row)=>u.id===id),
    projectQuickLines:()=>[{id:'jan'},{id:'feb'}],projectLines:()=>lines,projectQuickDateValue:(value:string)=>value,
    installerSeniorFactor:()=>1,financeDate:(value:string)=>new Date(value),fmtMoney:String,uid:()=>String(payload.payrollPayments.length+order.payouts.length),save:()=>{},render:()=>{},confirm:()=>true,alert:()=>{},
  });
  vm.runInContext(['historicalProjectInstallerAccruals','calcUserPayoutForPeriod','payrollPeriodAllocatedAmount','payrollPaidForPeriod','markPayoutPaid'].map(source).join('\n'),c);
  const january=[new Date('2026-01-01T00:00:00Z'),new Date('2026-01-31T23:59:59Z')];
  const february=[new Date('2026-02-01T00:00:00Z'),new Date('2026-02-28T23:59:59Z')];
  assert.equal(c.calcUserPayoutForPeriod('i1',...january).total,0);
  assert.deepEqual(JSON.parse(JSON.stringify(c.calcUserPayoutForPeriod('i1',...february))),{total:450,breakdown:[{kind:'fixed_per_job',orderId:'old',orderNumber:'R-OLD',accrualId:'historical-fixed:i1',label:'Фикс за проект · $450',amount:450,date:'2026-02-20T12:00:00.000Z',paid:false}]});
  c.markPayoutPaid('i1',february[0].toISOString(),february[1].toISOString());
  assert.equal(payload.payrollPayments[0].amount,450);
  assert.deepEqual(order.payouts.map((payment:Row)=>payment.accrualId),['historical-fixed:i1']);
});
test('owner assigned as historical surveyor receives fixed survey pay',()=>{
  const owner:Row={id:'owner',role:'owner',name:'Owner',payConfig:{type:'fixed_per_job',fixedPerJob:175}};
  const order:Row={id:'old',number:'R-OLD',quickProjectImportedCompleted:true,measurerId:'owner',measurementDoneAt:'2026-01-10T12:00:00.000Z',installerIds:[],payouts:[]};
  const payload:Row={settings:{},users:[owner],orders:[order]};
  const html=composeProductionHtml(readFileSync('private/legacy/rolanpro-crm-cloud.html','utf8'), readFileSync('private/legacy/production-stages.js','utf8'));
  const source=(name:string)=>{const start=html.indexOf(`function ${name}(`);return html.slice(start,html.indexOf('\n}',start)+2);};
  const c=vm.createContext({db:payload,getUser:()=>owner,projectStages:()=>[],projectHistoricalEntryLines:()=>[{id:'service'}],projectQuickLines:()=>[{id:'service'}]});
  vm.runInContext(['historicalProjectInstallerAccruals','calcUserPayoutForPeriod'].map(source).join('\n'),c);
  const result=JSON.parse(JSON.stringify(c.calcUserPayoutForPeriod('owner',new Date('2026-01-01T00:00:00Z'),new Date('2026-01-31T23:59:59Z'))));
  assert.equal(result.total,175);
  assert.equal(result.breakdown[0].date,'2026-01-10T12:00:00.000Z');
});
test('an unassigned internal stage retains a labor reserve; an external stage uses its invoice instead',()=>{
  const html=composeProductionHtml(readFileSync('private/legacy/rolanpro-crm-cloud.html','utf8'), readFileSync('private/legacy/production-stages.js','utf8'));const start=html.indexOf('function projectStageReferenceAmount(');
  const c=vm.createContext({db:{settings:{complexityCoefs:{standard:1}}},projectLines:()=>[{key:'service',unit:'sqft',installerPay:300}]});
  vm.runInContext(html.slice(start,html.indexOf('\n}',start)+2),c);
  assert.equal(c.projectStageReferenceAmount({complexity:'standard'},{serviceId:'service',installerIds:[],contractors:[],laborSharePct:40,status:'planned'}),120);
  assert.equal(c.projectStageReferenceAmount({complexity:'standard'},{serviceId:'service',installerIds:[],contractors:[{name:'Firm',amount:200}],laborSharePct:40,status:'planned'}),0);
});
test('a separately completed service receives its own server-stamped payroll stage',()=>{
  const before=fixture('installation_scheduled');
  before.orders[0].serviceSchedules=[{id:'offering:film',installationAt:'2026-10-12T16:00:00Z',installerIds:['i1','i2']}];
  const next=structuredClone(before);
  next.orders[0].serviceProgress={'offering:film':{status:'done',doneBy:'i1',doneAt:'2000-01-01'}};
  assert.equal(prepareProductionStages(before,next,false,[],true),null);
  const stage=next.orders[0].productionStages[0];
  assert.equal(stage.status,'done');assert.notEqual(stage.doneAt,'2000-01-01');
  assert.deepEqual(stage.payroll.map((p:Row)=>p.amount),[150,150]);
  const repeat=structuredClone(next);assert.equal(prepareProductionStages(next,repeat,false,[],true),null);
  assert.equal(repeat.orders[0].productionStages.length,1);
});

test('settling a completed installation never rewinds payment states or duplicates history',()=>{
  const payload=plan();const o=payload.orders[0];o.status='installation_done';
  o.productionStages.forEach((s:Row)=>s.status='done');o.serviceProgress={'offering:film':{status:'done',doneAt:'2026-10-12T19:00:00Z'}};
  settleProductionProject({status:'installation_in_progress'},o,payload,'owner');
  assert.equal(o.timeline.length,1);
  for(const status of ['installation_done','act_signed','payment_received','completed','review_received']){
    o.status=status;const before=structuredClone(o);settleProductionProject(before,o,payload,'owner');assert.deepEqual(o,before);
  }
});

test('legacy actual-size defaults preserve approval while a real size change requires approval',()=>{
  const original=fixture(),before=structuredClone(original);
  assert.equal(prepareServiceScopeApprovals(original,before,true,[],'owner'),null);
  const next=structuredClone(before),w=next.orders[0].measurements.rooms[0].windows[0];
  w.actualWidth=w.width;w.actualHeight=w.height;w.actualQty=w.qty;
  next.orders[0].serviceSchedules=[{id:'offering:film',installationAt:'2026-10-12T16:00:00Z',installerIds:['i1']}];
  assert.equal(prepareServiceScopeApprovals(before,next,true,[],'owner'),null);
  assert.equal(serviceScopeApproved(next.orders[0],'offering:film'),true);
  assert.equal(prepareServiceSolutions(before,next,true),null);
  w.actualWidth+=100;assert.equal(serviceScopeApproved(next.orders[0],'offering:film'),false);
});
