import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {composeProductionHtml} from './production-ui';
const module=readFileSync('private/legacy/production-stages.js','utf8');
const html=composeProductionHtml(readFileSync('private/legacy/rolanpro-crm-cloud.html','utf8'),module);
function source(name:string){const i=module.indexOf(`function ${name}(`);return module.slice(i,module.indexOf('\n}',i)+2);}
test('the served production UI has a single definition per function and valid scripts',()=>{
  for(const match of module.matchAll(/^(?:async )?function (\w+)\(/gm))assert.equal([...html.matchAll(new RegExp('^(?:async )?function '+match[1]+'\\(','gm'))].length,1,match[1]);
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(match[1].trim())new vm.Script(match[1]);
});
test('voice creates a draft and leaves ambiguous project references unselected',()=>{
  const context=vm.createContext({db:{orders:[{id:'a',number:'557'},{id:'b',number:'568'}]}});
  vm.runInContext(source('financeVoiceDraft'),context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.financeVoiceDraft('Потратил 125,50 долларов на проект 557'))),{amount:125.5,orderId:'a',note:'Потратил 125,50 долларов на проект 557'});
  assert.equal(context.financeVoiceDraft('Расход 80 долларов, проект 557 и проект 568').orderId,'');
  assert.equal(context.financeVoiceDraft('проект 5570 расход 80 долларов').orderId,'');
});
test('cash expenses reduce project profit once when explicitly settling an obligation',()=>{
  const db={finance:{transactions:[{type:'expense',scope:'business',orderId:'a',category:'project_expense',amount:200,projectExpenseId:'stage:s'},{type:'expense',orderId:'a',category:'project_expense',amount:30,projectExpenseId:null},{type:'expense',scope:'personal',orderId:'a',category:'project_expense',amount:1000}]}};
  const c=vm.createContext({db});vm.runInContext(source('projectFinanceDirectCost'),c);
  assert.equal(c.projectFinanceDirectCost({id:'a',extraExpenses:[{id:'stage:s',amount:200}]}),230);
  assert.equal(c.projectFinanceDirectCost({id:'b',extraExpenses:[]}),0);
  db.finance.transactions[0].amount=220;
  assert.equal(c.projectFinanceDirectCost({id:'a',extraExpenses:[{id:'stage:s',amount:200}]}),250);
  db.finance.transactions.push({type:'expense',scope:'business',orderId:'a',category:'project_expense',amount:50,projectExpenseId:'fuel'});
  assert.equal(c.projectFinanceDirectCost({id:'a',extraExpenses:[{id:'stage:s',amount:200},{id:'fuel',type:'gas',amount:50}]}),250,'fuel is already included by the project transport calculation');
});
