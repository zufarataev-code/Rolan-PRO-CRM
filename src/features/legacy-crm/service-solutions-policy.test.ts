import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareServiceSolutions, serviceSolutionsForViewer } from './service-solutions';
const current = { settings: {catalog:[{id:'film',category:'solar'}],serviceOfferings:[{id:'solution',name:'Solution',direction:'solar',pricePerSqft:12,installerRatePerSqft:3,filmIds:['film']}]}, users:[{id:'installer',role:'installer'}],orders:[{id:'order',serviceType:'solar_film',extraServices:[]}] };
test('manager sees customer prices and cannot change solution definitions through workspace API',()=>{
  const next = serviceSolutionsForViewer(current,false);
  assert.equal(next.settings.serviceOfferings[0].installerRatePerSqft,undefined);
  assert.equal(next.settings.serviceOfferings[0].pricePerSqft,12);
  assert.equal(prepareServiceSolutions(current,next,false),null);
  next.settings.serviceOfferings[0].pricePerSqft=1;
  assert.match(prepareServiceSolutions(current,next,false)!,/владелец/);
});
test('server owns the saved pay basis; unknown materials and directions are rejected',()=>{
  const next:any=serviceSolutionsForViewer(current,false);
  next.orders[0].extraServices=[{id:'line',quickProjectLine:true,serviceType:'solar_film',offeringId:'solution',catalogId:'film',offeringInstallerRate:999}];
  assert.equal(prepareServiceSolutions(current,next,false),null);
  assert.equal(next.orders[0].extraServices[0].offeringInstallerRate,3);
  next.orders[0].extraServices[0].catalogId='other';
  assert.match(prepareServiceSolutions(current,next,false)!,/Плёнка/);
});
test('old saved rate survives later changes to the solution; assignments validate crew and date',()=>{
  const old:any=structuredClone(current); old.orders[0].extraServices=[{id:'line',serviceType:'solar_film',offeringId:'solution',catalogId:'film',offeringInstallerRate:2}];
  const next:any=serviceSolutionsForViewer(old,false);
  assert.equal(prepareServiceSolutions(old,next,false),null); assert.equal(next.orders[0].extraServices[0].offeringInstallerRate,2);
  next.orders[0].serviceSchedules=[{id:'line:line',installationAt:'invalid',installerIds:['installer']}];
  assert.ok(prepareServiceSolutions(old,next,false));
  next.orders[0].serviceSchedules[0].installationAt='2026-10-10T16:00:00Z';
  assert.equal(prepareServiceSolutions(old,next,false),null);
  next.orders[0].serviceSchedules[0].installerIds=['unknown']; assert.ok(prepareServiceSolutions(old,next,false));
});

test('installer receives the saved rate only for their own assigned service',()=>{
  const payload:any=structuredClone(current);
  payload.orders[0].installerIds=['installer','other'];
  payload.orders[0].measurements={rooms:[{windows:[{id:'a',offeringId:'one',offeringInstallerRate:3},{id:'b',offeringId:'two',offeringInstallerRate:8}]}]};
  payload.orders[0].serviceSchedules=[{id:'offering:one',installerIds:['installer']},{id:'offering:two',installerIds:['other']}];
  const result=serviceSolutionsForViewer(payload,false,['installer']);
  const windows=result.orders[0].measurements.rooms[0].windows;
  assert.equal(windows[0].offeringInstallerRate,3);
  assert.equal(windows[1].offeringInstallerRate,undefined);
  assert.equal(result.settings.serviceOfferings[0].installerRatePerSqft,undefined);
  assert.equal(serviceSolutionsForViewer(payload,false).orders[0].measurements.rooms[0].windows[0].offeringInstallerRate,undefined);
});
