import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { ROLE_CODES } from './constants';
import * as edge from './preview-edge';

const actor = '11111111-1111-4111-8111-111111111111';
const employee = '22222222-2222-4222-8222-222222222222';
function harness() {
  let subject: any = { user_id: employee, is_active: true, full_name: 'Employee', user_accesses: ['MANAGER','CONSULTANT'].map(code => ({role:{code}})) };
  const module = { exports: {} as any };
  const source = ts.transpileModule(readFileSync('src/lib/auth/preview.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(source, {module, exports:module.exports, require:(name:string) => {
    if(name.endsWith('/constants')) return {ROLE_CODES};
    if(name.endsWith('/preview-edge')) return edge;
    if(name.endsWith('/db')) return {prisma:{user:{findUnique:async()=>subject}}};
    throw new Error(name);
  }});
  const session = {user:{user_id:actor,full_name:'Owner'},roles:['OWNER'],payload:{token:'fixture'}};
  return {resolve:module.exports.resolvePreviewSession,session,subject,setSubject:(value:any)=>{subject=value;}};
}
test('owner can isolate one assigned role; old preview cookies retain all assigned roles',async()=>{
  const {resolve,session} = harness();
  const selected = await resolve(session,`${employee}.${actor}.CONSULTANT`);
  assert.deepEqual(Array.from(selected.roles),['CONSULTANT']);
  assert.equal(selected.user.user_accesses.length,1);
  assert.equal(selected.preview.actorUserId,actor);
  assert.equal(selected.payload,session.payload);
  assert.deepEqual(Array.from((await resolve(session,`${employee}.${actor}`)).roles),['MANAGER','CONSULTANT']);
  assert.equal(await resolve(session,`${employee}.${actor}.INSTALLER`),null);
});
test('preview cannot cross owner sessions, grant owner rights or use an inactive employee',async()=>{
  const {resolve,session,subject,setSubject} = harness();
  assert.equal(await resolve({...session,roles:['MANAGER']},`${employee}.${actor}.CONSULTANT`),null);
  assert.equal(await resolve(session,`${employee}.${employee}.CONSULTANT`),null);
  assert.equal(await resolve(session,`${actor}.${actor}.OWNER`),null);
  assert.equal(await resolve(session,`invalid.${actor}`),null);
  setSubject({...subject,is_active:false});
  assert.equal(await resolve(session,`${employee}.${actor}`),null);
  setSubject({...subject,user_accesses:[{role:{code:'OWNER'}},{role:{code:'CONSULTANT'}}]});
  assert.equal(await resolve(session,`${employee}.${actor}.CONSULTANT`),null);
  setSubject({...subject,user_accesses:[]});
  assert.equal(await resolve(session,`${employee}.${actor}`),null);
});
