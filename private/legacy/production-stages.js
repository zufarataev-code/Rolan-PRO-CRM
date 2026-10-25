// Service production module. Loaded into the established CRM script before boot.
function projectStages(o, serviceId) {
  return (o?.productionStages || []).filter(s => !serviceId || s.serviceId === serviceId);
}
function projectStageEmployeeAmount(o, stage, userId) {
  if (stage.status === 'done') return Number(stage.payroll?.find(p => p.userId === userId)?.amount ?? (typeof currentUser === 'function' && currentUser()?.id === userId ? stage.ownEarnings : 0)) || 0;
  if (!(stage.installerIds || []).includes(userId) || getUser(userId)?.payConfig?.type !== 'per_sqft') return 0;
  const scoped=projectStageUnstagedOrder(o,true,stage.serviceId);
  scoped.installerIds=stage.installerIds;
  scoped.serviceSchedules=[{id:stage.serviceId,installerIds:stage.installerIds,installationAt:stage.startsAt}];
  const base = orderInstallerPayoutForUser(scoped,userId);
  return Math.round(base * Number(stage.laborSharePct || 0)) / 100;
}
function projectStageUnstagedOrder(o, onlyService = false, serviceId = '') {
  const staged = new Set(projectStages(o).map(s => s.serviceId));
  const keep = id => onlyService ? id === serviceId : !staged.has(id);
  return { ...o, productionStages: [], measurements: { ...o.measurements, rooms: (o.measurements?.rooms || []).map(r => ({ ...r, windows: (r.windows || []).filter(w => keep(w.offeringId ? 'offering:' + w.offeringId : 'direction:' + (w.measureScope || o.serviceType || 'solar_film'))) })) }, extraServices: (o.extraServices || []).filter(l => keep('line:' + l.id)) };
}
function projectStageReferenceAmount(o, stage) {
  if (stage.contractors?.length || stage.installerIds?.length) return 0;
  const line = projectLines(o).find(l => l.key === stage.serviceId);
  return Math.round(Number(line?.installerPay || 0) * Number(stage.laborSharePct || 0)) / 100;
}
function projectScopeApproved(o, key) {
  if (!Array.isArray(o.serviceScopeApprovals)) return projectCardInProduction(o);
  const group = projectServiceGroups(o).find(g => g.id === key);
  return !!group && o.serviceScopeApprovals.some(a => a.serviceId === key && a.scope === projectServiceScope(o, group));
}
function projectApproveScope(oid, key) {
  const o = getOrder(oid); if (!o || !projectCardCanPlan(o)) return;
  const note = prompt('Подтверждение клиента: дата и способ согласования дополнительной услуги');
  if (!note || note.trim().length < 3) return;
  o.serviceScopeApprovals ||= [];
  o.serviceScopeApprovals.push({serviceId:key,requestApproval:true,note:note.trim()});
  save(); render();
}
function projectStageSave(o, redraw = true) {
  const services = [...new Set(projectStages(o).map(s => s.serviceId))];
  o.serviceSchedules ||= [];
  services.forEach(serviceId => {
    const stages = projectStages(o, serviceId);
    const plan = {id:serviceId,installationAt:stages.map(s => s.startsAt).filter(Boolean).sort()[0] || '',installerIds:[...new Set(stages.flatMap(s => s.installerIds || []))],externalExecutor:stages.some(s => s.contractors?.length)};
    o.serviceSchedules = o.serviceSchedules.filter(s => s.id !== serviceId).concat(plan);
  });
  save(); if (redraw) { preservePositionForNextRender(); render(); }
}
function projectAddStage(oid, key) {
  const o = getOrder(oid); if (!o || !projectCardCanPlan(o) || !projectScopeApproved(o,key)) return;
  if (projectStages(o,key).some(s => s.status === 'done')) return alert('После начисления доли этапов зафиксированы.');
  const group = projectServiceGroups(o).find(g => g.id === key); if (!group) return;
  const plan = projectServiceAssignment(o,group);
  const start = plan.installationAt || new Date().toISOString();
  o.productionStages ||= [];
  o.productionStages.push({id:'stage_' + uid(),serviceId:key,title:'Этап ' + (projectStages(o,key).length + 1),startsAt:start,endsAt:new Date(Date.parse(start)+8*3600000).toISOString(),installerIds:[...(plan.installerIds || [])],responsibleId:plan.installerIds?.[0] || '',contractors:[],laborSharePct:0,status:'planned'});
  const stages=projectStages(o,key); stages.forEach((s,i) => s.laborSharePct=i===stages.length-1 ? 100 - Math.floor(100/stages.length)*(stages.length-1) : Math.floor(100/stages.length));
  projectStageSave(o);
}
function projectEditStage(oid, sid, field, value) {
  const o=getOrder(oid),s=projectStages(o).find(s=>s.id===sid); if (!s || !projectCardCanPlan(o) || s.status==='done') return;
  const stages=projectStages(o,s.serviceId);
  if(field==='laborSharePct') {
    if(stages.some(s=>s.status==='done') || !Number.isFinite(Number(value))) return;
    s.laborSharePct=Math.min(100,Math.max(0,Number(value)));
    const rest=stages.filter(x=>x!==s); if(!rest.length)s.laborSharePct=100;
    else rest.forEach((x,i)=>x.laborSharePct=i===rest.length-1 ? 100-s.laborSharePct-Math.floor((100-s.laborSharePct)/rest.length)*(rest.length-1) : Math.floor((100-s.laborSharePct)/rest.length));
  } else if(field==='startsAt' || field==='endsAt') {
    const date=new Date(value); if(!Number.isFinite(date.getTime()))return;
    s[field]=date.toISOString(); if(field==='startsAt'&&Date.parse(s.endsAt)<=date.getTime())s.endsAt=new Date(date.getTime()+8*3600000).toISOString();
  } else if(field==='title') s.title=String(value).slice(0,160);
  else if(field==='responsibleId') s.responsibleId=value;
  else if(field==='dependsOn') s.dependsOn=value;
  projectStageSave(o,field==='laborSharePct');
}
function projectStageCrew(oid,sid,id,checked) {
  const o=getOrder(oid),s=projectStages(o).find(x=>x.id===sid); if(!s || !projectCardCanPlan(o) || s.status==='done')return;
  s.installerIds=checked ? [...new Set([...s.installerIds,id])] : s.installerIds.filter(x=>x!==id);
  if(!s.installerIds.includes(s.responsibleId))s.responsibleId=s.installerIds[0]||'';
  projectStageSave(o);
}
function projectStageContractor(oid,sid,index,field,value) {
  const o=getOrder(oid),s=projectStages(o).find(x=>x.id===sid); if(!s||!projectCardCanPlan(o)||s.status==='done')return;
  if(field==='add'){s.contractors.push({name:'Подрядчик',amount:0});projectStageSave(o);return;}
  if(field==='remove')s.contractors.splice(index,1);
  else if(s.contractors[index])s.contractors[index][field]=field==='amount'?Math.max(0,Number(value)||0):String(value).slice(0,160);
  projectStageSave(o,field==='remove');
}
function projectDeleteStage(oid,sid) {
  const o=getOrder(oid),s=projectStages(o).find(x=>x.id===sid); if(!s||!projectCardCanPlan(o)||projectStages(o,s.serviceId).some(x=>x.status==='done'))return;
  if(projectStages(o).some(x=>x.dependsOn===sid))return alert('Сначала уберите зависимость от этапа.');
  o.productionStages=projectStages(o).filter(x=>x.id!==sid);
  const stages=projectStages(o,s.serviceId);stages.forEach((x,i)=>x.laborSharePct=i===stages.length-1?100-Math.floor(100/stages.length)*(stages.length-1):Math.floor(100/stages.length));
  projectStageSave(o);
}
async function projectSetStageProgress(oid,sid,status) {
  const o=getOrder(oid),s=projectStages(o).find(x=>x.id===sid),u=currentUser(); if(!s||s.status==='done')return;
  if(!PROJECT_SCHEDULED_STATUSES.includes(o.status)||(!projectCardCanPlan(o)&&!s.installerIds.includes(u?.id)))return;
  if(s.dependsOn&&projectStages(o).find(x=>x.id===s.dependsOn)?.status!=='done')return alert('Сначала завершите предыдущий этап.');
  const previous=s.status;s.status=status;
  if(!await cloudPersistConfirmed())s.status=previous;
  render();
}
function projectStagesHtml(o,key) {
  const stages=projectStages(o,key),manage=projectCardCanPlan(o),money=orderUserCanSeeMoney(o,currentUser()) && orderUserCanManage(currentUser());
  const approved=projectScopeApproved(o,key);
  if(!approved&&projectCardInProduction(o))return `<div class="p-3">Дополнительная услуга ожидает подтверждения клиента.${manage?`<button class="btn-ghost" onclick="projectApproveScope('${o.id}','${jsQuote(key)}')">Записать подтверждение</button>`:''}</div>`;
  if(!stages.length&&!manage)return '';
  return `<section data-production-stages class="p-3" style="min-width:0;grid-column:1/-1"><h4 class="font-bold">Этапы услуги</h4>${stages.map(s=>{
    const edit=manage&&s.status!=='done';const disabled=edit?'':'disabled';
    const call=(field)=>`projectEditStage('${o.id}','${s.id}','${field}',this.value)`;
    return `<div data-stage-id="${s.id}" class="p-3 border rounded-lg mt-2" style="min-width:0"><label style="display:block;min-width:0">Название<input style="width:100%;min-height:44px" value="${academyEsc(s.title)}" onchange="${call('title')}" ${disabled}></label><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));gap:8px"><label style="min-width:0">Начало<input style="width:100%;min-height:44px" type="datetime-local" value="${datetimeLocalValue(s.startsAt)}" onchange="${call('startsAt')}" ${disabled}></label><label style="min-width:0">Окончание<input style="width:100%;min-height:44px" type="datetime-local" value="${datetimeLocalValue(s.endsAt)}" onchange="${call('endsAt')}" ${disabled}></label>${money?`<label style="min-width:0">Доля оплаты, %<input style="width:100%;min-height:44px" type="number" min="0" max="100" value="${s.laborSharePct}" onchange="${call('laborSharePct')}" ${disabled}></label>`:''}</div><div class="flex flex-wrap gap-2 mt-2">${db.users.filter(u=>u.role==='installer'&&u.active!==false).map(u=>`<label><input type="checkbox" ${s.installerIds.includes(u.id)?'checked':''} onchange="projectStageCrew('${o.id}','${s.id}','${u.id}',this.checked)" ${disabled}> ${academyEsc(u.name)}</label>`).join('')}</div><label>Ответственный<select onchange="${call('responsibleId')}" ${disabled}><option value="">Выберите</option>${s.installerIds.map(id=>`<option value="${id}" ${id===s.responsibleId?'selected':''}>${academyEsc(getUser(id)?.name||id)}</option>`).join('')}</select></label><label>После этапа<select onchange="${call('dependsOn')}" ${disabled}><option value="">Без зависимости</option>${projectStages(o).filter(x=>x.id!==s.id).map(x=>`<option value="${x.id}" ${s.dependsOn===x.id?'selected':''}>${academyEsc(x.title)}</option>`).join('')}</select></label>${(s.contractors||[]).map((c,i)=>`<div style="display:flex;flex-wrap:wrap;gap:8px"><label style="flex:1;min-width:0">Подрядчик<input style="width:100%;min-height:44px" value="${academyEsc(c.name)}" onchange="projectStageContractor('${o.id}','${s.id}',${i},'name',this.value)" ${disabled}></label>${money?`<label style="flex:1;min-width:0">Стоимость, $<input style="width:100%;min-height:44px" type="number" min="0" value="${c.amount}" onchange="projectStageContractor('${o.id}','${s.id}',${i},'amount',this.value)" ${disabled}></label>`:''}${edit?`<button class="btn-ghost" onclick="projectStageContractor('${o.id}','${s.id}',${i},'remove','')">Убрать</button>`:''}</div>`).join('')}<div class="flex flex-wrap gap-2 mt-2">${edit?`<button class="btn-ghost" onclick="projectStageContractor('${o.id}','${s.id}',0,'add','')">+ Подрядчик</button><button class="btn-ghost" onclick="projectDeleteStage('${o.id}','${s.id}')">Удалить этап</button>`:''}<span class="tag">${s.status==='done'?'✓ Выполнен':s.status==='in_progress'?'В работе':'Запланирован'}</span>${s.status!=='done'&&PROJECT_SCHEDULED_STATUSES.includes(o.status)&&(manage||s.installerIds.includes(currentUser()?.id))?`<button class="btn-ghost" onclick="projectSetStageProgress('${o.id}','${s.id}','${s.status==='planned'?'in_progress':'done'}')">${s.status==='planned'?'Начать':'Выполнено'}</button>`:''}${s.ownEarnings!==undefined?`<span>Начислено: ${fmtMoney(s.ownEarnings)}</span>`:''}</div></div>`;
  }).join('')}${manage?`<button class="btn-ghost mt-2" onclick="projectAddStage('${o.id}','${jsQuote(key)}')">+ Добавить этап</button>`:''}</section>`;
}


function orderInstallerPayoutForUser(o, userId) {
  if (projectStages(o).length && getUser(userId)?.payConfig?.type === 'per_sqft') return projectStages(o).reduce((sum,s) => sum + projectStageEmployeeAmount(o,s,userId),0) * installerSeniorFactor(getUser(userId)) + orderInstallerPayoutForUser(projectStageUnstagedOrder(o),userId);
  const installerIds = [...new Set((o?.installerIds || []).filter(Boolean))];
  if (!installerIds.includes(userId)) return 0;
  const user = getUser(userId);
  const pc = user?.payConfig || {};
  if (pc.type === 'fixed_per_job') return Math.max(0, Number(pc.fixedPerJob) || 0);
  if (pc.type === 'commission') return orderRevenue(o) * Math.max(0, Number(pc.commissionPct) || 0) / 100 / installerIds.length;
  if (pc.type !== 'per_sqft') return 0;
  const filmPayout = !measureAllWindows(o).length ? orderQuickInstallerPayoutForUser(o, user) : measureAllWindows(o).reduce((sum, { win }) => {
    const crew = projectServiceCrew(o, win);
    if (!crew.includes(userId)) return sum;
    return sum + windowActualAreaSqft(win) * installerRateForWindow(user, win) / Math.max(1, crew.length);
  }, 0);
  return (filmPayout + orderAdditionalWorkPayoutForUser(o, user, installerIds.length)) * installerSeniorFactor(user);
}

function calcUserPayoutForPeriod(userId, startDate, endDate) {
  const u = getUser(userId);
  if (!u || !u.payConfig) return { total: 0, breakdown: [] };
  const pc = u.payConfig;
  const breakdown = [];
  let total = 0;
  if (pc.type === 'salary') {
    const accruals = payrollSalaryAccruals(u, startDate, endDate);
    total = Number(accruals.reduce((sum, x) => sum + x.amount, 0).toFixed(2));
    breakdown.push({ kind: 'salary', label: 'Оклад за выбранные дни', amount: total });
    return { total, breakdown };
  }
  // Commission / per-sqft / fixed-per-job — based on orders in period
  db.orders.forEach(original => {
    let o = original;
    if (pc.type === 'per_sqft' && projectStages(o).length) {
      projectStages(o).filter(s => s.status === 'done' && (s.installerIds || []).includes(userId) && new Date(s.doneAt) >= startDate && new Date(s.doneAt) <= endDate).forEach(s => {
        const amount = projectStageEmployeeAmount(o,s,userId);
        if (amount > 0) { breakdown.push({kind:'per_sqft',orderId:o.id,orderNumber:o.number,stageId:s.id,label:s.title,amount,date:s.doneAt}); total += amount; }
      });
      o = projectStageUnstagedOrder(o);
    }
    let trigger, dateField;
    if (pc.type === 'commission') { trigger = (u.id === o.managerId); dateField = o.paidAt; }
    else if (pc.type === 'per_sqft') { trigger = (o.installerIds||[]).includes(u.id); dateField = o.installationDoneAt; }
    else if (pc.type === 'fixed_per_job') {
      // measurer: when measurement done; otherwise installer-fixed
      if (u.role === 'measurer') { trigger = (u.id === o.measurerId); dateField = o.measurementDoneAt; }
      else { trigger = (o.installerIds||[]).includes(u.id); dateField = o.installationDoneAt; }
    } else return;
    if (!trigger || !dateField) return;
    const dt = new Date(dateField);
    if (dt < startDate || dt > endDate) return;
    let amount = 0, label = '';
    if (pc.type === 'commission') {
      amount = orderRevenue(o) * (pc.commissionPct || 0) / 100;
      label = `${pc.commissionPct}% от ${fmtMoney(orderRevenue(o))}`;
    } else if (pc.type === 'per_sqft') {
      const installersCount = (o.installerIds||[]).length || 1;
      amount = orderInstallerPayoutForUser(o, u.id);
      label = `${orderActualAreaSqft(o).toFixed(1)} sqft × ставки${installersCount>1?' ÷'+installersCount:''}`;
    } else if (pc.type === 'fixed_per_job') {
      amount = pc.fixedPerJob || 0;
      label = `Фикс $${pc.fixedPerJob}`;
    }
    if (amount > 0) {
      const isPaid = (o.payouts || []).filter(p => p.userId === u.id && p.paid).reduce((sum, p) => sum + (Number(p.amount) || 0), 0) >= amount;
      breakdown.push({ kind: pc.type, orderId: o.id, orderNumber: o.number, label, amount, date: dateField, paid: isPaid });
      total += amount;
    }
  });
  return { total, breakdown };
}

function markPayoutPaid(userId, startISO, endISO) {
  const u = getUser(userId);
  const start = new Date(startISO), end = new Date(endISO);
  const calc = calcUserPayoutForPeriod(userId, start, end);
  const amountDue = Math.max(0, calc.total - payrollPaidForPeriod(userId, start, end));
  if (amountDue <= 0) return alert('За выбранный период всё уже выплачено.');
  if (!confirm(`Подтвердить выплату ${fmtMoney(amountDue)} для ${u.name}?\n\nВ хронологию каждого заказа добавится запись.`)) return;
  const paymentBatchId = 'pay_' + uid();
  const paidAt = new Date().toISOString();
  db.payrollPayments = db.payrollPayments || [];
  const allocations = calc.breakdown.flatMap(b => {
    if (b.kind === 'salary' && !b.orderId) {
      return payrollSalaryAccruals(u, start, end).map(x => {
        const first = new Date(x.date), last = new Date(x.date); last.setHours(23, 59, 59, 999);
        return { ...x, amount: Number(Math.max(0, x.amount - payrollPaidForPeriod(userId, first, last)).toFixed(2)) };
      });
    }
    const alreadyPaid = b.orderId ? (getOrder(b.orderId)?.payouts || []).filter(p => p.userId === userId && p.paid && (p.stageId || null) === (b.stageId || null)).reduce((sum, p) => sum + (Number(p.amount) || 0), 0) : payrollPaidForPeriod(userId, start, end);
    return { stageId: b.stageId || null, orderId: b.orderId || null, kind: b.kind, amount: Math.max(0, b.amount - alreadyPaid), date: b.date || null, periodStart: startISO, periodEnd: endISO };
  }).filter(x => x.amount > 0);
  if (Math.abs(allocations.reduce((sum, x) => sum + x.amount, 0) - amountDue) > 0.01) {
    return alert('Выплата не записана: исторические суммы не совпадают с начислениями. Сверьте выплаты сотрудника.');
  }
  db.payrollPayments.push({
    id: paymentBatchId, userId, amount: amountDue, paidAt,
    periodStart: startISO, periodEnd: endISO,
    allocations,
    createdBy: state.currentUserId,
  });
  calc.breakdown.forEach(b => {
    if (!b.orderId) return;
    const allocation = allocations.find(x => x.orderId === b.orderId && (x.stageId || null) === (b.stageId || null));
    if (!allocation) return;
    const o = getOrder(b.orderId);
    if (!o) return;
    o.payouts = o.payouts || [];
    o.payouts.push({
      id: uid(), userId, stageId: b.stageId || null, amount: allocation.amount, accruedAt: b.date,
      type: b.kind, label: b.label,
      paid: true, paidAt, paymentBatchId,
    });
    o.timeline = o.timeline || [];
    o.timeline.push({ at: new Date().toISOString(), key: 'payout_paid', by: state.currentUserId, note: `Выплачено ${u.name}: ${fmtMoney(allocation.amount)} (${b.label})` });
  });
  save();
  alert(`Выплачено ${fmtMoney(amountDue)} → ${u.name}`);
  render();
}

function projectServiceProgressCell(o, line, user = currentUser()) {
  if (projectStages(o,line.key).length) return projectStagesHtml(o,line.key);
  const entry = projectServiceProgress(o, line.key);
  const chip = entry.status === 'done'
    ? `<span class="tag bg-emerald-50 text-emerald-700">✓ выполнена${entry.doneAt ? ` ${fmtDate(entry.doneAt)}` : ''}</span>`
    : entry.status === 'in_progress' ? '<span class="tag bg-blue-50 text-blue-700">в работе</span>' : '<span class="tag">запланирована</span>';
  if (!projectCanMarkService(o, line, user)) return chip;
  const manager = orderUserCanManage(user) && orderUserCanSeeMoney(o, user);
  const act = (status, label) => `<button class="btn-ghost text-xs" onclick="projectSetServiceProgress('${o.id}','${jsQuote(line.key)}','${status}')">${label}</button>`;
  return `${chip}<div class="flex flex-wrap gap-1 mt-1">${entry.status === 'planned' ? act('in_progress', 'Начать') : ''}${entry.status !== 'done' ? act('done', 'Выполнено') : manager ? act('in_progress', 'Вернуть в работу') : ''}</div>`;
}

function projectSetServiceProgress(oid, key, status) {
  const o = getOrder(oid);
  if (projectStages(o,key).length) return alert('Отметьте выполнение каждого этапа услуги.');
  const user = currentUser();
  const line = projectLines(o).find(item => item.key === key);
  if (!SERVICE_PROGRESS_LABELS[status] || !projectCanMarkService(o, line, user)) return;
  // Reopening a done service is the manager's call.
  if (projectServiceProgress(o, key).status === 'done' && status !== 'done' && !(orderUserCanManage(user) && orderUserCanSeeMoney(o, user))) return;
  // Same check as the base CRM: no photo or a future date asks first (Owner, 2026-10-23).
  if (status === 'done' && projectServiceProgress(o, key).status !== 'done' && typeof projectConfirmServicesDone === 'function' && !projectConfirmServicesDone(o, [line])) return;
  projectWriteServiceProgress(o, line, status, user);
  save();
  projectSyncStatusFromServices(o);
  preservePositionForNextRender(); render();
}

function projectLineDirectionInfo(line) {
  const offering = serviceOffering(line?.offeringId);
  const category = offering?.direction || serviceOfferingDirection(line?.direction || 'solar_film');
  const service = ORDER_PRIMARY_SERVICES.find(item => canonicalCatalogCategory(item.catalogCategory) === category)
    || primaryServiceInfo(line?.direction || 'solar_film');
  return { key: service.id, category, icon: service.icon, title: service.title, short: service.short };
}
function projectDirectionKeyFromScope(scope, offeringId = '') {
  return projectLineDirectionInfo({ direction: scope, offeringId }).key;
}
function projectDirectionExcluded(o, directionKey) {
  return (o.excludedProjectDirections || []).includes(directionKey);
}
function projectIncludedDirectionOrder(o) {
  if (!o || !o.excludedProjectDirections?.length) return o;
  const keep = (scope, offeringId = '') => !projectDirectionExcluded(o, projectDirectionKeyFromScope(scope || o.serviceType, offeringId));
  return {
    ...o,
    measurements: { ...o.measurements, rooms: (o.measurements?.rooms || []).map(room => ({ ...room, windows: (room.windows || []).filter(win => keep(win.measureScope, win.offeringId)) })) },
    extraServices: (o.extraServices || []).filter(line => keep(line.serviceType, line.offeringId)),
    offeringIds: (o.offeringIds || []).filter(id => keep(offeringServiceType(serviceOffering(id)), id)),
    serviceTypes: (o.serviceTypes || []).filter(scope => keep(scope)),
  };
}
function projectToggleDirectionIncluded(oid, directionKey, included) {
  const o=getOrder(oid);if(!o||!orderUserCanManage(currentUser())||CLOSED_PROJECT_STATUSES.includes(o.status))return;
  const values=new Set(o.excludedProjectDirections||[]);
  if(included)values.delete(directionKey);else values.add(directionKey);
  o.excludedProjectDirections=[...values];
  projectEstimateMarkChanged(o,`${included?'Возвращено в расчёт':'Исключено из расчёта'} направление «${primaryServiceInfo(directionKey).title}»`);
  save();preservePositionForNextRender();render();
}
function projectDirectionGroups(o, lines = projectLines(o), pending = projectPendingSizedServices(o)) {
  const groups = new Map();
  const ensure = info => {
    if (!groups.has(info.key)) groups.set(info.key, { ...info, lines: [], pending: [] });
    return groups.get(info.key);
  };
  lines.forEach(line => ensure(projectLineDirectionInfo(line)).lines.push(line));
  pending.forEach(offering => ensure(projectLineDirectionInfo({ offeringId: offering.id, direction: offeringServiceType(offering) })).pending.push(offering));
  return [...groups.values()];
}
function projectDirectionExpenseTotals(o, directionKey, lineKeys = []) {
  const expenses = (o.extraExpenses || []).filter(expense => expense.direction === directionKey || (expense.serviceId && lineKeys.includes(expense.serviceId)));
  return {
    planned: expenses.reduce((sum, expense) => sum + (Number(expense.plannedAmount ?? expense.amount) || 0), 0),
    actual: expenses.reduce((sum, expense) => sum + (Number(expense.actualAmount) || (expense.actual ? Number(expense.amount) || 0 : 0)), 0),
  };
}
function projectDirectionOfferingPickerHtml(o, directionKey) {
  const direction = serviceOfferingDirection(directionKey);
  const used = new Set(projectLines(o).map(line => line.offeringId).filter(Boolean));
  const pending = new Set(projectPendingSizedServices(o).map(offering => offering.id));
  const options = serviceOfferingsFor(direction).filter(offering => !used.has(offering.id) && !pending.has(offering.id));
  if (!options.length) return '<span class="text-xs text-gray-500">Все услуги направления добавлены</span>';
  // One way to add a service: the cashier, opened at this direction (Owner, 2026-10-23:
  // «услуги имеют два варианта — зачем?» — a dropdown here and the cashier above).
  return `<button type="button" class="btn-ghost text-sm project-direction-add" onclick="openProjectDirectionWindow('${o.id}','${jsQuote(directionKey)}','services')">+ Услуга в направление</button>`;
}
function projectLineNoteValue(o, key) {
  return String(o.serviceLineNotes?.[key] || '');
}
function projectCardSetLineNote(oid, key, value) {
  const o = getOrder(oid);
  if (!o || !orderUserCanManage(currentUser())) return;
  o.serviceLineNotes ||= {};
  const note = String(value || '').trim().slice(0, 2000);
  if (note) o.serviceLineNotes[key] = note; else delete o.serviceLineNotes[key];
  projectEstimateMarkChanged(o, `Изменён комментарий к услуге «${projectLines(o).find(line => line.key === key)?.name || 'услуга'}»`);
  save();
}
function projectCardMoveLine(oid, key, delta) {
  const o=getOrder(oid);if(!o||!orderUserCanManage(currentUser()))return;
  const keys=projectLines(o).map(line=>line.key),index=keys.indexOf(key),next=index+Number(delta);
  if(index<0||next<0||next>=keys.length)return;
  [keys[index],keys[next]]=[keys[next],keys[index]];o.projectLineOrder=keys;
  save();preservePositionForNextRender();render();
}
function projectRecommendations(o) {
  const lines = projectLines(o);
  const selected = new Set([...lines.map(line=>line.offeringId),...projectPendingSizedServices(o).map(offering=>offering.id)].filter(Boolean));
  const dismissed = new Set(o.dismissedProjectRecommendations || []);
  const suggestions = [];
  const addOffering = (key, direction, pattern, title, reason) => {
    const offering = serviceOfferingsFor(direction).find(item => !selected.has(item.id) && pattern.test(`${item.name} ${item.description || ''}`));
    if (offering && !dismissed.has(key)) suggestions.push({key,title,reason,offeringId:offering.id});
  };
  const directions = new Set(lines.map(line=>projectLineDirectionInfo(line).category));
  const windows = measureAllWindows(o).map(item=>item.win);
  if (directions.has('smart')) {
    addOffering('smart-zone','smart',/zone|зон|подключ/i,'Добавить подключение зон','Для Smart-плёнки каждая зона должна попасть в расчёт и заказ-наряд.');
    addOffering('smart-power','smart',/power|блок.*питан|controller|контрол/i,'Добавить блок питания / управление','Проверьте питание, контроллеры и количество зон до формирования КП.');
    addOffering('smart-electric','smart',/electric|электр/i,'Добавить электрика','Электрика планируется отдельной услугой со своей датой и исполнителем.');
  }
  if (directions.has('protective') || windows.some(win=>win.side==='out')) {
    addOffering('protective-attachment','protective',/silicon|силикон|attachment|wet.?glaze|креплен/i,'Добавить силиконовое крепление','Защитная плёнка и наружный монтаж могут требовать отдельного второго этапа.');
  }
  // The measurement is already the card's main «next step» button; a second
  // «Создать или связать замер» here was one more way to the same place (Owner, 2026-10-23).
  return suggestions;
}
function projectRecommendationAction(oid, key, offeringId = '', measure = false) {
  const o=getOrder(oid);if(!o||!orderUserCanManage(currentUser()))return;
  if(measure)return openManagerMeasureModal(oid);
  if(offeringId)projectCardAddService(oid,offeringId);
}
function projectRecommendationDismiss(oid,key) {
  const o=getOrder(oid);if(!o||!orderUserCanManage(currentUser()))return;
  o.dismissedProjectRecommendations=[...new Set([...(o.dismissedProjectRecommendations||[]),key])];
  save();preservePositionForNextRender();render();
}
function projectRecommendationsHtml(o) {
  const rows=projectRecommendations(o);if(!rows.length)return '';
  return `<section class="project-recommendations"><div><h4 class="font-bold">Подсказки по составу проекта</h4><div class="text-xs text-gray-500">CRM предлагает только услуги из вашего справочника. Ничего не добавляется без решения менеджера.</div></div><div class="project-recommendation-list">${rows.map(item=>`<div class="project-recommendation"><div><b>${academyEsc(item.title)}</b><span>${academyEsc(item.reason)}</span></div><div class="flex gap-1"><button class="btn-primary text-xs" onclick="projectRecommendationAction('${o.id}','${item.key}','${item.offeringId||''}',${item.measure?'true':'false'})">${item.measure?'Открыть замер':'Добавить'}</button><button class="btn-ghost text-xs" onclick="projectRecommendationDismiss('${o.id}','${item.key}')">Не нужно</button></div></div>`).join('')}</div></section>`;
}

/**
 * The project is a cashier, not a wizard: all chosen directions stay visible
 * together, while measurement, calculation and the work order remain views of
 * the same projectLines. This is the navigation map approved in the three-screen
 * project / measurement / work-order concept (Owner, 2026-10-21).
 */
function projectCardFocusDirection(oid, directionKey) {
  const o = getOrder(oid);
  if (!o) return;
  const direction = projectDirectionGroups(o).find(item => item.key === directionKey);
  const line = direction?.lines?.find(item => item.kind !== 'included') || direction?.lines?.[0];
  if (line) state.projectCardSelection = { ...(state.projectCardSelection || {}), [oid]: line.key };
  preservePositionForNextRender();
  render();
  requestAnimationFrame(() => document.querySelector(`[data-project-direction="${CSS.escape(directionKey)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
}
function projectCashierMapHtml(o, directions, { money = false, edit = false } = {}) {
  const included = directions.filter(direction => !projectDirectionExcluded(o, direction.key));
  const primaryKey = included[0]?.key || '';
  // Owner, 2026-10-24 («теги, которые дублируют услуги»): direction tiles here
  // repeated the direction cards right below; each direction is shown once, as
  // its card, and its tile opens nothing new. Only «+ Добавить направление» stays.
  const directionCards = directions.map(direction => {
    const token = typeof rpDir === 'function' ? rpDir(direction.key) : null;
    const color = token?.color || '#2563eb';
    const count = direction.lines.length + direction.pending.length;
    const total = direction.lines.filter(line => !line.excluded).reduce((sum, line) => sum + (Number(line.price) || 0), 0);
    const excluded = projectDirectionExcluded(o, direction.key);
    return `<button type="button" class="project-cashier-direction ${excluded ? 'excluded' : ''}" style="--direction-color:${academyEsc(color)}" onclick="openProjectDirectionWindow('${o.id}','${jsQuote(direction.key)}')"><span class="project-cashier-direction-icon">${direction.icon}</span><span><b>${academyEsc(direction.title)}</b><span>${count} ${projectPlural(count, 'услуга', 'услуги', 'услуг')}${money ? ` · ${fmtMoney(total)}` : ''}${excluded ? ' · вне расчёта' : ''}</span></span>${direction.key === primaryKey ? '<span class="project-cashier-primary">основное</span>' : ''}</button>`;
  }).join('');
  const rooms = o.measurements?.rooms?.length || 0;
  const windows = measureAllWindows(o).length;
  const area = orderActualAreaSqft(o);
  return `<div class="project-cashier-map" data-project-cashier-map>
    <!-- Касса проекта · направления и услуги: heading dropped 2026-10-24, «Состав проекта» above says it -->
    <div class="project-cashier-directions">${money && edit ? `<button type="button" class="project-cashier-direction add" onclick="openProjectDirectionPicker('${o.id}')"><span class="project-cashier-direction-icon">+</span><span><b>Добавить направление</b><span>услуга, материал и дополнения</span></span></button>` : ''}</div>
    <div class="project-cashier-flow"><div class="project-cashier-flow-facts"><span><b>${rooms}</b> ${projectPlural(rooms, 'помещение', 'помещения', 'помещений')}</span><span><b>${windows}</b> ${projectWindowsWord(windows)}</span><span><b>${area.toFixed(2)}</b> sq ft</span><span>Размеры общие, направления назначаются услугам и окнам</span></div><div class="project-cashier-flow-actions"><button type="button" class="btn-ghost" onclick="openManagerMeasureModal('${o.id}')">Замер</button>${money ? `<button type="button" class="btn-ghost" onclick="openProjectEstimateWorkspace('${o.id}')">Расчёт / КП</button>` : ''}<button type="button" class="btn-ghost" onclick="openWorkOrder('${o.id}')">Заказ-наряд</button></div></div>
  </div>`;
}

function renderProjectCardServices(o, { money = false, economics = false, manage = false } = {}) {
  const lines = projectLines(o);
  const pending = projectPendingSizedServices(o);
  const directions = projectDirectionGroups(o, lines, pending);
  const production = projectCardInProduction(o);
  const plan = production && manage && money && PROJECT_PLANNING_STATUSES.includes(o.status);
  const edit = money && !CLOSED_PROJECT_STATUSES.includes(o.status);
  const tracking = PROJECT_SCHEDULED_STATUSES.includes(o.status) || CLOSED_PROJECT_STATUSES.includes(o.status);
  const chosen = projectCardChosenLine(o, lines);
  const total = field => lines.filter(line => !line.excluded).reduce((sum, line) => sum + (Number(line[field]) || 0), 0);
  const row = line => {
    const selected = chosen?.key === line.key;
    const crew = projectLineCrewText(line);
    const status = projectServiceProgress(o, line.key).status;
    const statusLabel = status === 'done' ? 'Выполнено' : status === 'in_progress' ? 'В работе' : line.installationAt ? 'Назначено' : line.kind === 'included' ? 'В пакете' : 'В проекте';
    const source = line.sources[0];
    const date = line.installationAt ? datetimeLocalValue(line.installationAt) : '';
    const deletable = edit && ['quantity', 'work'].includes(line.kind);
    const offering = serviceOffering(line.offeringId);
    const range = projectServicePriceRange(offering);
    const coefficient = Number(db.settings.complexityCoefs?.[o.complexity || 'standard'] ?? 1) || 1;
    const unitPrice = line.kind === 'windows' ? (line.qty > 0 ? line.price / line.qty / coefficient : Number(line.windows[0]?.pricePerSqft) || 0) : line.kind === 'quantity' ? Number(source?.unitPrice) || 0 : Number(line.price) || 0;
    const priceUnit = line.kind === 'work' ? 'сумма' : `/ ${line.kind === 'windows' ? 'sq ft' : line.unitShort}${line.kind === 'windows' && coefficient !== 1 ? ` × ${coefficient} сложность` : ''}`;
    const priceEditable = edit && line.kind !== 'included' && (line.kind === 'windows' || line.kind === 'work' || line.kind === 'quick' || (line.kind === 'quantity' && range));
    return `<div data-project-line="${academyEsc(line.key)}">
      <div class="project-service-row ${selected ? 'selected' : ''}">
        <div><div class="project-service-name">${line.kind === 'included' ? '↳ ' : projectCardServiceIcon(line) + ' '}${academyEsc(line.name)}</div><div class="project-service-meta">${academyEsc(projectLineNote(line))}</div></div>
        <div><span class="project-service-label">Объём</span><span class="project-service-value">${academyEsc(projectLineQtyText(line))}</span></div>
        ${money ? `<div><span class="project-service-label">Сумма</span><span class="project-service-value">${line.kind === 'included' ? 'в пакете' : fmtMoney(line.price)}</span></div>` : '<div></div>'}
        <div><span class="project-service-label">${production ? 'Монтаж' : 'Статус'}</span><span class="project-service-value">${production ? academyEsc(crew.date) : academyEsc(statusLabel)}</span></div>
        <button type="button" class="project-service-arrow" onclick="projectCardSelectLine('${o.id}','${jsQuote(line.key)}')" aria-label="Открыть услугу ${academyEsc(line.name)}">›</button>
      </div>
      ${selected ? projectStagesHtml(o,line.key) : ''}
      ${selected && (edit || plan) ? `<div class="project-service-edit">
        ${line.kind === 'windows' ? `<label>Замер<button type="button" class="btn-ghost w-full mt-1" onclick="openManagerMeasureModal('${o.id}')">${line.windows.length} ${projectWindowsWord(line.windows.length)}</button></label>` : edit && source ? `<label>Количество<input type="number" min="0" step="${line.unit === 'lft' ? '0.5' : '1'}" value="${Number(line.qty) || 0}" onchange="projectCardSetQty('${o.id}','${jsQuote(source.id)}',this.value)"></label>` : '<span></span>'}
        ${edit ? `<label>Цена${priceEditable ? `<input type="number" min="${range?.min || 0}" ${range?.max ? `max="${range.max}"` : ''} step="0.25" value="${Math.round(unitPrice * 100) / 100}" aria-label="Цена: ${academyEsc(line.name)}" onchange="projectCardSetPrice('${o.id}','${jsQuote(line.key)}',this.value)"> <span class="text-xs text-gray-500">${academyEsc(priceUnit)}</span>${range ? `<span class="block text-xs text-gray-500">от ${fmtMoney(range.min)}${range.max ? ` до ${fmtMoney(range.max)}` : ''}</span>` : ''}` : `<div class="project-service-value">${line.kind === 'included' ? 'в пакете' : fmtMoney(unitPrice)}</div>`}</label>` : ''}
        ${plan ? `<label>Исполнитель${projectCardCrewPicker(o, line)}</label><label>Дата<input type="datetime-local" class="${date ? '' : 'project-card-missing'}" value="${date}" onchange="projectCardSetDate('${o.id}','${jsQuote(line.key)}',this.value)"></label>` : `<label>Состояние<div class="project-service-value">${academyEsc(statusLabel)}</div></label>`}
        <label>${tracking ? 'Ход работ' : 'Действия'}<div class="flex flex-wrap gap-1 mt-1">${tracking ? projectServiceProgressCell(o, line) : ''}<button class="btn-ghost" title="Выше" onclick="projectCardMoveLine('${o.id}','${jsQuote(line.key)}',-1)">↑</button><button class="btn-ghost" title="Ниже" onclick="projectCardMoveLine('${o.id}','${jsQuote(line.key)}',1)">↓</button>${deletable ? `<button class="btn-ghost text-red-600" onclick="projectCardDeleteService('${o.id}','${jsQuote(source.id)}')">Удалить</button>` : ''}</div></label>
        <details style="grid-column:1/-1" ${projectLineNoteValue(o,line.key) ? 'open' : ''}><summary class="text-xs font-semibold text-slate-500 cursor-pointer">Комментарий по услуге${projectLineNoteValue(o,line.key) ? '' : ' +'}</summary><textarea rows="2" placeholder="Что важно учесть при расчёте, замере или монтаже" onchange="projectCardSetLineNote('${o.id}','${jsQuote(line.key)}',this.value)">${academyEsc(projectLineNoteValue(o,line.key))}</textarea></details>
      </div>` : ''}
    </div>`;
  };
  const pendingRow = offering => { const film = getCatalogItem(projectOfferingCatalogId(o, offering.id)); return `<div class="project-service-pending" data-project-pending="${academyEsc(offering.id)}"><b>${academyEsc(offering.name)}</b> · ${film ? academyEsc(catalogLabel(film)) : 'материал уточняется'} · ${(typeof offeringWindowCandidates === 'function' && offeringWindowCandidates(o, offering).length) ? 'не стоит ни на одном окне — $0' : 'для расчёта нужен замер'} ${edit ? `${(typeof offeringWindowCandidates === 'function' && offeringWindowCandidates(o, offering).length) ? `<button class="btn-ghost text-xs ml-2" onclick="openOfferingWindowsPicker('${o.id}','${jsQuote(offering.id)}')">Выбрать окна</button>` : `<button class="btn-ghost text-xs ml-2" onclick="openManagerMeasureModal('${o.id}')">Внести размеры</button>`}${o.offeringId !== offering.id ? `<button class="btn-ghost text-xs text-red-600 ml-1" onclick="projectCardRemovePending('${o.id}','${jsQuote(offering.id)}')">Убрать</button>` : ''}` : ''}</div>`; };
  const directionCards = directions.map(direction => {
    const directionLines = direction.lines;
    const excluded = projectDirectionExcluded(o,direction.key);
    const amount = field => excluded ? 0 : directionLines.reduce((sum, line) => sum + (Number(line[field]) || 0), 0);
    const expenses = projectDirectionExpenseTotals(o, direction.key, directionLines.map(line => line.key));
    const dates = directionLines.map(line => line.installationAt).filter(Boolean).sort();
    const done = directionLines.length && directionLines.every(line => projectServiceProgress(o,line.key).status === 'done');
    const working = directionLines.some(line => projectServiceProgress(o,line.key).status === 'in_progress');
    const status = done ? 'Выполнено' : working ? 'В работе' : dates.length ? 'Запланировано' : 'Расчёт';
    return `<section class="project-direction-card ${excluded?'excluded':''}" data-project-direction="${academyEsc(direction.key)}">
      <header class="project-direction-head">
        <div><div class="project-direction-title">${direction.icon} ${academyEsc(direction.title)} <span class="tag">${directionLines.length + direction.pending.length}</span></div><div class="project-direction-meta">${excluded?'Не входит в расчёт и КП':academyEsc(status)}${!excluded&&dates.length ? ` · ближайшая дата ${academyEsc(fmtDateTime(dates[0]))}` : ''}</div></div>
        <div class="project-direction-kpis">${money ? `<span><small>Клиенту</small><b>${fmtMoney(amount('price'))}</b></span>` : ''}${economics ? `<span><small>Материал + работа</small><b>${fmtMoney(amount('materialCost') + amount('installerPay'))}</b></span><span><small>Расходы план / факт</small><b>${fmtMoney(expenses.planned)} / ${fmtMoney(expenses.actual)}</b></span>` : ''}</div>
        <button type="button" class="btn-primary text-sm project-direction-open" onclick="openProjectDirectionWindow('${o.id}','${jsQuote(direction.key)}')">Открыть направление →</button>
        ${money && edit ? `<div class="project-direction-actions">${projectDirectionOfferingPickerHtml(o,direction.key)}<label><input type="checkbox" ${excluded?'':'checked'} onchange="projectToggleDirectionIncluded('${o.id}','${direction.key}',this.checked)"> В расчёте</label></div>` : ''}
      </header>
      <div class="project-direction-services">${directionLines.map(row).join('')}${direction.pending.map(pendingRow).join('') || (!directionLines.length ? '<div class="p-4 text-sm text-gray-500">Добавьте услугу этого направления.</div>' : '')}</div>
    </section>`;
  }).join('');
  return `<section class="project-service-ledger" data-project-card-services>
    <div class="project-service-ledger-head"><div><div class="project-service-ledger-title">Состав проекта <span class="tag">${lines.length + pending.length}</span></div><div class="project-service-ledger-sub">Проект может включать несколько направлений. У каждой услуги — свой объём, цена, дата, исполнитель, этапы и расходы.</div></div></div>
    ${typeof projectCashierMapHtml === 'function' ? projectCashierMapHtml(o, directions, { money, edit }) : ''}
    <div class="project-service-list">${directionCards || '<div class="p-4 text-sm text-gray-500">В проекте пока нет услуг.</div>'}</div>
    <div class="project-service-footer"><span>${economics ? `Материал ${fmtMoney(total('materialCost'))} · работа ${fmtMoney(total('installerPay'))}` : `${lines.length} позиций`}</span>${money ? `<strong>Клиенту ${fmtMoney(orderRevenue(o))}</strong>` : ''}</div>
    ${manage ? projectRecommendationsHtml(o) : ''}
    ${manage && money ? projectDirectExpensesHtml(o) : ''}
    ${production ? renderProjectCardSchedule(o, projectCardUnplanned(o), plan) : ''}
  </section>`;
}

function projectCardUnplanned(o) {
  return projectLines(o).filter(line => projectStages(o,line.key).length ? projectStages(o,line.key).some(s => !s.startsAt || !s.endsAt || (!s.installerIds?.length && !s.contractors?.length) || (s.installerIds?.length && !s.responsibleId)) : !line.installerIds.length || !line.installationAt);
}

function projectCardVisits(o, lines = projectLines(o)) {
  lines = lines.flatMap(line => projectStages(o,line.key).length ? projectStages(o,line.key).filter(s=>s.status!=='done').map(s=>({...line,name:line.name+' · '+s.title,installationAt:s.startsAt,installerIds:s.installerIds || [],externalExecutor:s.contractors?.map(c=>c.name).join(', ')})) : [line]);
  const byVisit = new Map();
  lines.filter(line => (line.installerIds.length || line.externalExecutor) && line.installationAt).forEach(line => {
    const key = `${line.installationAt.slice(0, 16)}|${[...line.installerIds].sort().join(',')}`;
    if (!byVisit.has(key)) byVisit.set(key, { at: line.installationAt, installerIds: line.installerIds, lines: [] });
    byVisit.get(key).lines.push(line);
  });
  return [...byVisit.values()].sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

async function cloudPersist(options = {}) {
  if (!cloudReady) return false;
  if (cloudSaveInFlight) {
    cloudSaveQueued = true;
    return false;
  }
  cloudSaveInFlight = true;
  cloudStatus('Сохраняем…');
  let snapshot = JSON.parse(JSON.stringify(db));
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetch('/api/v1/legacy-crm/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: cloudRevision, payload: snapshot }),
      });
      const result = await response.json();
      if (response.status === 401) {
        location.assign('/login');
        return false;
      }
      if (response.status === 409 && result?.errors?.[0]?.code === 'duplicate_client') {
        // The server refuses a second card for an existing phone/email. Undo
        // only that card and keep every other queued edit in this snapshot.
        const resolved = resolveRejectedDuplicateClient(result?.meta || {});
        cloudStatus('Дубль клиента заблокирован', 'red');
        alert(resolved === 'merged'
          ? 'Клиент с таким телефоном или email уже существует. Новая карточка не создана — заказы привязаны к существующему клиенту.'
          : 'Этот телефон или email уже принадлежит другому клиенту. Контакт в карточке возвращён к прежнему значению.');
        if (!resolved) {
          cloudReady = false;
          location.reload();
          return false;
        }
        snapshot = JSON.parse(JSON.stringify(db));
        render();
        continue;
      }
      if (response.status === 409) {
        cloudStatus('Объединяем изменения…');
        const latestResponse = await fetch('/api/v1/legacy-crm/state', { cache: 'no-store' });
        if (latestResponse.status === 401) {
          location.assign('/login');
          return false;
        }
        const latestResult = await latestResponse.json();
        if (!latestResponse.ok) throw new Error(latestResult?.errors?.[0]?.message || 'workspace refresh failed');
        const remotePayload = latestResult.data.payload;
        projectYieldTakenFollowUps(remotePayload);
        snapshot = mergeCloudWorkspaceSnapshots(cloudBaseSnapshot, JSON.parse(JSON.stringify(db)), remotePayload);
        db = cloneCloudWorkspaceValue(snapshot);
        projectSettleChangedServices(false);
        // The other crew may have finished the last open service meanwhile.
        if (projectCloseFinishedProjects().length + projectClaimServiceFollowUps()) snapshot = JSON.parse(JSON.stringify(db));
        cloudRevision = latestResult.data.revision;
        cloudBaseSnapshot = cloneCloudWorkspaceValue(remotePayload);
        localStorage.setItem('rolanpro_crm', JSON.stringify(db));
        continue;
      }
      if (!response.ok) throw new Error(result?.errors?.[0]?.message || 'save failed');
      for (const update of result.data.production_stage_updates || []) {
        const saved = snapshot.orders?.find(o=>o.id===update.id), local = db.orders?.find(o=>o.id===update.id);
        if (!saved) continue;
        const fields = {productionStages:update.productionStages,serviceScopeApprovals:update.serviceScopeApprovals,status:update.status,installationDoneAt:update.installationDoneAt,serviceProgress:update.serviceProgress,serviceSchedules:update.serviceSchedules,installerIds:update.installerIds,installationAt:update.installationAt,servicesClosedNotice:update.servicesClosedNotice,timeline:update.timeline};
        for (const [field,value] of Object.entries(fields)) {
          if (local) local[field]=mergeCloudWorkspaceSnapshots(saved[field],local[field],value);
          saved[field]=cloneCloudWorkspaceValue(value);
        }
        const expenses=(saved.extraExpenses||[]).filter(e=>!e.stageDerived).concat(update.stageExpenses||[]);
        if(local && JSON.stringify(local.extraExpenses)===JSON.stringify(saved.extraExpenses))local.extraExpenses=cloneCloudWorkspaceValue(expenses);
        saved.extraExpenses=expenses;
      }
      if (projectClaimServiceFollowUps()) cloudSaveQueued = true;
      cloudRevision = result.data.revision;
      cloudBaseSnapshot = cloneCloudWorkspaceValue(snapshot);
      cloudStatus('Сохранено', 'green');
      projectRunClaimedFollowUps(snapshot).catch(error => console.warn('Project follow-ups failed', error));
      return true;
    }
    cloudSaveQueued = true;
    cloudStatus('Сохраняем повторно…');
    return false;
  } catch (error) {
    console.error('[Cloud CRM] save failed', error);
    cloudStatus('Нет связи — изменения сохранены локально', 'red');
    if (options.throwOnFailure) throw error;
    return false;
  } finally {
    cloudSaveInFlight = false;
    if (cloudSaveQueued) {
      cloudSaveQueued = false;
      cloudScheduleSave();
    }
  }
}

function orderRevenue(o) {
  o=projectIncludedDirectionOrder(o);
  if (Array.isArray(o.serviceScopeApprovals)) {
    const approved = new Set(projectServiceGroups(o).filter(g=>projectScopeApproved(o,g.id)).map(g=>g.id));
    const filtered = {...o,measurements:{...o.measurements,rooms:(o.measurements?.rooms||[]).map(r=>({...r,windows:(r.windows||[]).filter(w=>approved.has(w.offeringId?'offering:'+w.offeringId:'direction:'+(w.measureScope||o.serviceType||'solar_film')))}))},extraServices:(o.extraServices||[]).filter(l=>approved.has('line:'+l.id))};
    return orderFilmRevenue(filtered)+orderExtraServicesRevenue(filtered);
  }
  return orderFilmRevenue(o) + orderExtraServicesRevenue(o);
}

function orderActualAreaSqft(o) {
  o=projectIncludedDirectionOrder(o);
  return (o.measurements?.rooms || []).reduce((sum, room) => sum + roomActualAreaSqft(room), 0);
}
function orderExtraServicesCost(o) {
  o=projectIncludedDirectionOrder(o);
  return projectOfferingLines(o).reduce((sum, line) => sum + (Number(line.qty) || 0) * serviceOfferingMaterialCost(line), 0);
}
function orderFilmCost(o) {
  o=projectIncludedDirectionOrder(o);
  if (o._inventoryDeducted && Number.isFinite(o._inventoryMaterialCost)) return o._inventoryMaterialCost;
  const cutCost = orderFilmCutMaterialCost(o);
  if (cutCost != null) return cutCost;
  if (!measureAllWindows(o).length) return orderQuickLineMaterialCost(o);
  return (o.measurements?.rooms || []).reduce((sum, room) => sum + (room.windows || []).reduce((part,win)=>part+windowFilmCost(win),0),0);
}
function orderInstallerPayout(o) {
  return orderInstallerPayoutBreakdown(projectIncludedDirectionOrder(o)).total;
}

function projectQuickAddExpense(oid, type = 'delivery') {
  const o = getOrder(oid);
  if (!o || !(orderUserCanSeeMoney(o,currentUser()) && orderUserCanManage(currentUser()))) return;
  o.extraExpenses = o.extraExpenses || [];
  o.extraExpenses.push({ id: uid(), type, label: projectEstimateExpenseLabel(type), amount: 0, projectDirect: true, createdAt: new Date().toISOString() });
  projectEstimateMarkChanged(o, 'Добавлен прямой расход в быстром вводе');
  save(); refreshQuickProjectEntry(oid);
}

function projectQuickUpdateExpense(oid, expenseId, field, value) {
  const o = getOrder(oid);
  const expense = (o?.extraExpenses || []).find(item => item.id === expenseId);
  if (expense?.stageDerived) return alert('Измените подрядчика в этапе услуги.');
  if (!o || !expense || !(orderUserCanSeeMoney(o,currentUser()) && orderUserCanManage(currentUser()))) return;
  if (field === 'amount') expense.amount = Math.max(0, Number(value) || 0);
  if (field === 'type') {
    expense.type = value;
    expense.label = projectEstimateExpenseLabel(value);
  }
  if (field === 'label') expense.label = String(value || '').trim();
  projectEstimateMarkChanged(o, 'Изменён прямой расход в быстром вводе');
  save(); refreshQuickProjectEntry(oid);
}

function projectQuickDeleteExpense(oid, expenseId) {
  const o = getOrder(oid);
  if (!o || !(orderUserCanSeeMoney(o,currentUser()) && orderUserCanManage(currentUser()))) return;
  o.extraExpenses = (o.extraExpenses || []).filter(item => item.id !== expenseId);
  projectEstimateMarkChanged(o, 'Удалён прямой расход в быстром вводе');
  save(); refreshQuickProjectEntry(oid);
}

function projectEstimateAddExpense(oid, type = 'other') {
  const o = getOrder(oid);
  if (!o || !(orderUserCanSeeMoney(o,currentUser()) && orderUserCanManage(currentUser()))) return;
  o.extraExpenses = o.extraExpenses || [];
  o.extraExpenses.push({ id: uid(), type, label: projectEstimateExpenseLabel(type), amount: 0, projectDirect: true, createdAt: new Date().toISOString() });
  projectEstimateMarkChanged(o, 'Добавлен прямой расход проекта');
  save(); refreshProjectEstimateWorkspace(oid);
}

function projectEstimateUpdateExpense(oid, eid, field, value) {
  const o = getOrder(oid);
  const line = (o?.extraExpenses || []).find(e => e.id === eid);
  if (line?.stageDerived) return alert('Измените подрядчика в этапе услуги.');
  if (!o || !line || !(orderUserCanSeeMoney(o,currentUser()) && orderUserCanManage(currentUser()))) return;
  if (field === 'amount') line[field] = Math.max(0, parseFloat(value) || 0);
  else line[field] = value;
  if (field === 'type') line.label = projectEstimateExpenseLabel(value);
  projectEstimateMarkChanged(o, 'Изменён прямой расход проекта');
  save(); refreshProjectEstimateWorkspace(oid);
}

function projectEstimateDeleteExpense(oid, eid) {
  const o = getOrder(oid);
  if (!o || !(orderUserCanSeeMoney(o,currentUser()) && orderUserCanManage(currentUser()))) return;
  o.extraExpenses = (o.extraExpenses || []).filter(e => e.id !== eid);
  projectEstimateMarkChanged(o, 'Удалён прямой расход проекта');
  save(); refreshProjectEstimateWorkspace(oid);
}

function orderInstallerPayoutBreakdown(o) {
  if (projectStages(o).length) {
    const ids=[...new Set([...(o.installerIds||[]),...projectStages(o).flatMap(s=>s.installerIds||[])])];
    const byInstaller=ids.map(userId=>({userId,name:getUser(userId)?.name || 'Специалист',amount:orderInstallerPayoutForUser(o,userId)}));
    return {total:byInstaller.reduce((sum,p)=>sum+p.amount,0)+projectStages(o).reduce((sum,s)=>sum+projectStageReferenceAmount(o,s),0),byInstaller,source:'SERVICE_STAGES'};
  }
  const installerIds = [...new Set((o?.installerIds || []).filter(Boolean))];
  if (!installerIds.length) {
    const windows = measureAllWindows(o);
    const total = windows.length
      ? windows.reduce((sum, { win }) => sum + windowInstallerPayout(win), 0)
      : projectQuickLines(o).filter(line => line.unit === 'sqft').reduce((sum, line) => {
          return sum + (Number(line.qty) || 0) * installerRateForQuickLine(null, line);
        }, 0);
    const work = orderAdditionalWorkPayoutForUser(o, null, 1);
    return { total: total + work, byInstaller: [], source: 'REFERENCE_DEFAULT' };
  }
  const byInstaller = installerIds.map(userId => {
    const user = getUser(userId);
    return { userId, name: user?.name || 'Исполнитель', amount: orderInstallerPayoutForUser(o, userId) };
  });
  return { total: byInstaller.reduce((sum, row) => sum + row.amount, 0), byInstaller, source: 'EMPLOYEE_REFERENCE' };
}

function projectFinanceDirectCost(o) {
  const payments=(db.finance?.transactions||[]).filter(t=>t.type==='expense'&&t.scope!=='personal'&&t.orderId===o.id&&t.category==='project_expense');
  const expenses=(o.extraExpenses||[]).filter(e=>e.type!=='gas');
  const planned=expenses.reduce((sum,e)=>sum+Math.max(Number(e.amount)||0,payments.filter(t=>t.projectExpenseId===e.id).reduce((n,t)=>n+(Number(t.amount)||0),0)),0);
  const legacy=payments.filter(t=>t.projectExpenseId===undefined).reduce((sum,t)=>sum+(Number(t.amount)||0),0);
  const newCosts=payments.filter(t=>t.projectExpenseId!==undefined&&!(o.extraExpenses||[]).some(e=>e.id===t.projectExpenseId)).reduce((sum,t)=>sum+(Number(t.amount)||0),0);
  const gasSurplus=(o.extraExpenses||[]).filter(e=>e.type==='gas').reduce((sum,e)=>sum+Math.max(0,payments.filter(t=>t.projectExpenseId===e.id).reduce((n,t)=>n+(Number(t.amount)||0),0)-(Number(e.amount)||0)),0);
  return Math.max(planned,legacy)+newCosts+gasSurplus;
}
function orderManualExpensesTotal(o) {
  return projectFinanceDirectCost(o);
}
function financeProjectExpenseOptions() {
  const select=document.getElementById('fin-project-expense'),oid=document.getElementById('fin-order')?.value;
  if(!select)return;
  select.innerHTML='<option value="">Новый расход</option>'+(getOrder(oid)?.extraExpenses||[]).map(e=>`<option value="${academyEsc(e.id)}">${academyEsc(e.label || 'Расход')} · ${fmtMoney(e.amount)}</option>`).join('');
}
function financeVoiceDraft(text) {
  const amount=String(text||'').match(/(?:\$\s*|сумм[ауы]\s*|расход\s*|потратил[аи]?\s*)(\d+(?:[.,]\d{1,2})?)/i) || String(text||'').match(/(\d+(?:[.,]\d{1,2})?)\s*(?:доллар|usd|бакс)/i);
  const matches=(db.orders||[]).filter(o=>o.number&&new RegExp('(?:проект|заказ|project)\\s*(?:номер\\s*)?'+String(o.number).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\w-])','i').test(text));
  return {amount:amount?Number(amount[1].replace(',','.')):null,orderId:matches.length===1?matches[0].id:'',note:String(text||'').trim()};
}
function financeApplyVoiceDraft(text) {
  const draft=financeVoiceDraft(text);
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.value=value;};
  set('fin-type','expense');set('fin-category','project_expense');set('fin-amount',draft.amount||'');set('fin-order',draft.orderId);set('fin-note',draft.note);
  financeProjectExpenseOptions();
  const status=document.getElementById('fin-voice-status');if(status)status.textContent='Черновик готов. Проверьте сумму, проект, счёт и сохраните операцию.';
}
function financeStartVoiceDraft() {
  const Recognition=window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!Recognition){const text=prompt('Продиктуйте через микрофон клавиатуры или введите расход, сумму и номер проекта');if(text)financeApplyVoiceDraft(text);return;}
  const r=new Recognition();r.lang='ru-RU';r.interimResults=false;
  const status=document.getElementById('fin-voice-status');if(status)status.textContent='Слушаю…';
  r.onresult=e=>financeApplyVoiceDraft(e.results[0][0].transcript);
  r.onerror=()=>{if(status)status.textContent='Не удалось распознать. Введите данные в форме или повторите запись.';};
  r.start();
}

function financeOpenTransactionModal() {
  const accounts = financeData().accounts.filter(a => a.active !== false && a.id !== 'fin_unallocated');
  if (!accounts.length) { financeOpenAccountModal(); return; }
  const accountOptions = accounts.map(a => `<option value="${a.id}">${academyEsc(a.name)}</option>`).join('');
  const categoryOptions = FINANCE_CATEGORY_OPTIONS.map(([key, label]) => `<option value="${key}">${academyEsc(label)}</option>`).join('');
  const orderOptions = (db.orders || []).slice().sort((a,b) => financeDate(b.createdAt)-financeDate(a.createdAt))
    .map(o => `<option value="${o.id}">${academyEsc(o.number || o.id)} · ${academyEsc(getClient(o.clientId)?.name || '')}</option>`).join('');
  state.modal = `<div class="modal-backdrop" onclick="if(event.target===this) closeModal()"><div class="modal-content p-6" style="max-width:38rem">
    <div class="flex items-center justify-between gap-3 mb-3"><div><h3 class="font-semibold text-lg">Новая операция</h3><p class="text-xs text-gray-500">Только фактическое движение денег</p></div><button class="btn-ghost" onclick="closeModal()">✕</button></div>
    <button class="btn-ghost mb-2" onclick="financeStartVoiceDraft()">🎙 Продиктовать расход</button><p id="fin-voice-status" class="text-xs text-gray-500"></p><div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div><label>Тип</label><select id="fin-type" onchange="financeTransactionTypeChanged()"><option value="income">Приход</option><option value="expense">Расход</option><option value="transfer">Перевод</option></select></div>
      <div><label>Сумма ($)</label><input id="fin-amount" type="number" min="0" step="0.01" placeholder="0.00"></div>
      <div><label>Дата</label><input id="fin-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      <div><label>Счёт / касса</label><select id="fin-account">${accountOptions}</select></div>
      <div id="fin-to-wrap" style="display:none"><label>На счёт</label><select id="fin-to-account">${accountOptions}</select></div>
      <div id="fin-category-wrap"><label>Категория</label><select id="fin-category" onchange="financeTransactionCategoryChanged()">${categoryOptions}</select></div>
      <div><label>Связать с заказом</label><select id="fin-order" onchange="financeProjectExpenseOptions()"><option value="">Без заказа</option>${orderOptions}</select></div>
      <div><label>Оплата существующего расхода проекта<select id="fin-project-expense"><option value="">Новый расход</option></select></label></div><div><label>Чьи деньги</label><select id="fin-scope"><option value="business">Бизнес</option><option value="personal">Личное / изъятие владельца</option></select></div>
      <div><label>Характер расхода</label><select id="fin-behavior"><option value="variable">Переменный</option><option value="fixed">Постоянный</option></select></div>
      <div><label>Поставщик / получатель</label><input id="fin-vendor" placeholder="Например, Sunbelt или Google"></div>
      <div><label>Теги</label><input id="fin-tags" placeholder="smart, склад, срочно"></div>
      <div class="md:col-span-2"><label>Комментарий</label><input id="fin-note" placeholder="Назначение платежа"></div>
    </div>
    <div class="flex justify-end gap-2 mt-4"><button class="btn-ghost" onclick="closeModal()">Отмена</button><button class="btn-primary" onclick="financeSaveTransaction()">Сохранить операцию</button></div>
  </div></div>`;
  render();
}

function financeSaveTransaction() {
  const type = document.getElementById('fin-type')?.value;
  const amount = Math.abs(Number(document.getElementById('fin-amount')?.value) || 0);
  const accountId = document.getElementById('fin-account')?.value;
  const toAccountId = type === 'transfer' ? document.getElementById('fin-to-account')?.value : '';
  if (!['owner','manager'].includes(currentUser()?.role)) return;
  if (!Number.isFinite(amount)) return alert('Некорректная сумма');
  if (!amount) return alert('Укажите сумму больше нуля');
  if (!accountId) return alert('Выберите счёт');
  if (type === 'transfer' && (!toAccountId || toAccountId === accountId)) return alert('Для перевода выберите другой счёт');
  financeData().transactions.push({
    id: 'fin_' + uid(), type, amount,
    date: document.getElementById('fin-date')?.value || new Date().toISOString().slice(0,10),
    accountId, toAccountId: toAccountId || null,
    category: type === 'transfer' ? 'transfer' : (document.getElementById('fin-category')?.value || 'other'),
    projectExpenseId: document.getElementById('fin-project-expense')?.value || null,
    orderId: document.getElementById('fin-order')?.value || null,
    scope: document.getElementById('fin-scope')?.value || 'business',
    costBehavior: document.getElementById('fin-behavior')?.value || 'variable',
    vendor: document.getElementById('fin-vendor')?.value?.trim() || '',
    tags: financeTags(document.getElementById('fin-tags')?.value || ''),
    note: document.getElementById('fin-note')?.value?.trim() || '',
    source: 'manual', createdAt: new Date().toISOString(), createdBy: state.currentUserId,
  });
  save(); closeModal(); render();
}

function financeSystemRows() {
  const manual = financeManualRows();
  const rows = [];
  const unallocated = 'fin_unallocated';

  ensureWarehouseReceipts().forEach(receipt => {
    rows.push({
      id: `sys_warehouse_receipt_${receipt.id}`, type: 'expense', amount: Math.max(0, Number(receipt.total) || 0),
      date: receipt.date || receipt.createdAt, accountId: receipt.accountId || unallocated,
      category: receipt.kind === 'tool' ? 'tools' : 'inventory_purchase',
      inventoryId: receipt.inventoryId || null, warehouseReceiptId: receipt.id,
      scope: 'business', costBehavior: 'variable', tags: ['склад', receipt.kind === 'tool' ? 'инструмент' : 'закупка'],
      vendor: db.vendors?.find(v => v.id === receipt.vendorId)?.name || '',
      note: `Приход · ${receipt.itemName || 'склад'}${receipt.reference ? ` · ${receipt.reference}` : ''}`,
      source: 'warehouse_receipts', sourceLabel: 'Склад', editable: false,
    });
  });

  // Client money: the order is authoritative. A linked manual bank operation
  // allocates that receipt to an account and reduces the unallocated remainder.
  (db.orders || []).forEach(o => {
    const paid = Math.max(0, Number(o.paid) || 0);
    const linked = financeLinkedAmount(manual, t => t.type === 'income' && t.orderId === o.id);
    const remainder = Math.max(0, paid - linked);
    if (remainder > 0) rows.push({
      id: `sys_order_${o.id}`, type: 'income', amount: remainder,
      date: o.paidAt || o.stripe?.paidAt || o.depositReceivedAt || o.updatedAt || o.createdAt,
      accountId: unallocated, category: 'client_payment', orderId: o.id,
      scope: 'business', costBehavior: 'variable', tags: ['клиент', 'заказ'],
      note: `Оплата клиента · ${o.number || o.id}`, source: 'orders', sourceLabel: 'Заказы', editable: false,
    });
  });

  // Stock receipts represent actual purchases. Material consumption remains a
  // project-cost metric and is not charged to cash a second time.
  (db.inventory || []).forEach(r => {
    if (ensureWarehouseReceipts().some(receipt => receipt.inventoryId === r.id)) return;
    const cost = Math.max(0, Number(r.costTotal) || 0);
    const linked = financeLinkedAmount(manual, t => t.type === 'expense' && t.inventoryId === r.id);
    const remainder = Math.max(0, cost - linked);
    if (remainder > 0) rows.push({
      id: `sys_inventory_${r.id}`, type: 'expense', amount: remainder,
      date: r.dateReceived || r.createdAt, accountId: unallocated,
      category: 'inventory_purchase', inventoryId: r.id,
      scope: 'business', costBehavior: 'variable', tags: ['склад', 'материал'],
      note: `Закупка рулона${r.lotNumber ? ` · ${r.lotNumber}` : ''}`,
      source: 'inventory', sourceLabel: 'Склад', editable: false,
    });
  });

  // Only confirmed payouts are cash out. New payouts have a batch record so
  // fixed salary (which is not tied to an order) is also captured correctly.
  (db.payrollPayments || []).forEach(p => {
    const linked = financeLinkedAmount(manual, t => t.type === 'expense' && t.payrollPaymentId === p.id);
    const remainder = Math.max(0, (Number(p.amount) || 0) - linked);
    if (remainder > 0) rows.push({
      id: `sys_payroll_payment_${p.id}`, type: 'expense', amount: remainder,
      date: p.paidAt, accountId: unallocated, category: 'payroll', payrollPaymentId: p.id,
      scope: 'business', costBehavior: 'variable', tags: ['зарплата'],
      note: `Выплата · ${getUser(p.userId)?.name || 'сотрудник'}`,
      source: 'payroll', sourceLabel: 'Зарплата', editable: false,
    });
  });

  // Compatibility with payouts created before payment batches existed.
  (db.orders || []).forEach(o => {
    const paidPayouts = (o.payouts || []).filter(p => p.paid && !p.paymentBatchId);
    const total = paidPayouts.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const linked = financeLinkedAmount(manual, t => t.type === 'expense' && t.orderId === o.id && t.category === 'payroll');
    const remainder = Math.max(0, total - linked);
    if (remainder > 0) rows.push({
      id: `sys_payroll_${o.id}`, type: 'expense', amount: remainder,
      date: paidPayouts.map(p => p.paidAt).filter(Boolean).sort().pop() || o.installationDoneAt || o.createdAt,
      accountId: unallocated, category: 'payroll', orderId: o.id,
      scope: 'business', costBehavior: 'variable', tags: ['зарплата', 'заказ'],
      note: `Выплаченная зарплата · ${o.number || o.id}`,
      source: 'payroll', sourceLabel: 'Зарплата', editable: false,
    });
  });

  // Costs accrue on completion; only paid obligations create cash rows.
  (db.orders || []).forEach(o => {
    const paid=(o.extraExpenses||[]).filter(e=>e.paid===true||e.paidAt);
    const manualPayments=manual.filter(t=>t.type==='expense'&&t.orderId===o.id&&t.category==='project_expense');
    const total=paid.reduce((sum,e)=>sum+Math.max(0,(Number(e.amount)||0)-manualPayments.filter(t=>t.projectExpenseId===e.id).reduce((n,t)=>n+(Number(t.amount)||0),0)),0);
    const legacy=manualPayments.filter(t=>t.projectExpenseId===undefined).reduce((sum,t)=>sum+(Number(t.amount)||0),0);
    const remainder=Math.max(0,total-legacy);
    if(remainder>0)rows.push({id:`sys_expense_${o.id}`,type:'expense',amount:remainder,date:paid.map(e=>e.paidAt||e.date||e.createdAt).filter(Boolean).sort().pop()||o.updatedAt||o.createdAt,accountId:unallocated,category:'project_expense',orderId:o.id,scope:'business',costBehavior:'variable',tags:['заказ'],note:`Расходы по объекту · ${o.number||o.id}`,source:'orders',sourceLabel:'Заказы',editable:false});
  });
  return rows;
}

function calendarEventsForOrder(o, type) {
  const info = orderEventInfo(type);
  if(type==='install' && projectStages(o).length && o.status!=='proposal_accepted') {
    const stageServices=new Set(projectStages(o).map(s=>s.serviceId));
    const staged=projectStages(o).filter(s=>s.startsAt).map(s=>({o:{...o,installerIds:s.installerIds || [],installationAt:s.startsAt,installationDurationMinutes:Math.max(1,(Date.parse(s.endsAt)-Date.parse(s.startsAt))/60000),stageId:s.id,stageTitle:s.title},dt:new Date(s.startsAt),kind:type,info,id:o.id+'_stage_'+s.id,note:s.title,stageId:s.id,title:s.title}));
    const unstaged={...projectStageUnstagedOrder(o),serviceSchedules:(o.serviceSchedules||[]).filter(p=>!stageServices.has(p.id))};
    return staged.concat(unstaged.serviceSchedules.length?calendarEventsForOrder(unstaged,type):[]);
  }
  // A plan at «КП принято» is a draft until «Подтвердить монтаж».
  if (type === 'install' && o.status === 'proposal_accepted' && o.serviceSchedules?.length) return [];
  if (type === 'install' && o.serviceSchedules?.length) {
    return projectServiceGroups(o).flatMap(group => {
      const assignment = projectServiceAssignment(o, group);
      const dt = new Date(assignment.installationAt);
      if (!assignment.installationAt || Number.isNaN(dt.getTime())) return [];
      const scoped = { ...o, installerIds: assignment.installerIds || [], installationAt: assignment.installationAt };
      return [{ id: `${o.id}_service_${group.id}`, o: scoped, kind: type, dt, info, note: group.name }];
    });
  }
  return calendarEventDatesForOrder(o, type).map((x, idx) => ({
    id: `${o.id}_${type}_${x.source || idx}`,
    o,
    kind: type,
    dt: new Date(x.at),
    info,
    note: x.note || '',
  })).filter(ev => !Number.isNaN(ev.dt.getTime()));
}

function projectCardUpcomingVisits(o, now = Date.now()) {
  return projectCardVisits(o,projectLines(o).filter(l=>projectStages(o,l.key).length || projectServiceProgress(o,l.key).status!=='done')).filter(v=>Date.parse(v.at)>=now);
}

function projectExpenseTypes() {
  return [
    ['material','Материалы'],['labor','Работа'],['equipment','Оборудование'],['rent','Аренда'],
    ['subcontractor','Субподрядчик'],['delivery','Доставка'],['consumables','Расходники'],
    ['customs','Таможня'],['gas','Бензин'],['other','Другое'],
  ];
}
function projectExpenseScopeValue(expense) {
  if (expense.serviceId) return `service:${expense.serviceId}`;
  if (expense.direction) return `direction:${expense.direction}`;
  return 'project';
}
function projectExpenseScopeOptions(o, expense) {
  const directions = projectDirectionGroups(o);
  return `<option value="project" ${projectExpenseScopeValue(expense)==='project'?'selected':''}>Весь проект</option>${directions.map(direction=>`<option value="direction:${academyEsc(direction.key)}" ${projectExpenseScopeValue(expense)===`direction:${direction.key}`?'selected':''}>${direction.icon} ${academyEsc(direction.title)}</option>`).join('')}${directions.flatMap(direction=>direction.lines.map(line=>`<option value="service:${academyEsc(line.key)}" ${projectExpenseScopeValue(expense)===`service:${line.key}`?'selected':''}>↳ ${academyEsc(line.name)}</option>`)).join('')}`;
}
function projectDirectExpensesHtml(o) {
  const rows=(o.extraExpenses||[]).map(e=>{
    const planned=Number(e.plannedAmount ?? e.amount)||0;
    const actual=Number(e.actualAmount)||(e.actual?Number(e.amount)||0:0);
    return `<div class="project-expense-row" data-project-expense="${e.id}">
      <label>Категория<select onchange="projectEditDirectExpense('${o.id}','${e.id}','type',this.value)" ${e.stageDerived?'disabled':''}>${projectExpenseTypes().map(([value,label])=>`<option value="${value}" ${e.type===value?'selected':''}>${label}</option>`).join('')}</select></label>
      <label>Расход<input value="${academyEsc(e.label||'')}" onchange="projectEditDirectExpense('${o.id}','${e.id}','label',this.value)" ${e.stageDerived?'disabled':''}></label>
      <label>План, $<input type="number" min="0" value="${planned}" onchange="projectEditDirectExpense('${o.id}','${e.id}','plannedAmount',this.value)" ${e.stageDerived?'disabled':''}></label>
      <label>Факт, $<input type="number" min="0" value="${actual}" onchange="projectEditDirectExpense('${o.id}','${e.id}','actualAmount',this.value)" ${e.stageDerived?'disabled':''}></label>
      <label>Отнести к<select onchange="projectEditDirectExpense('${o.id}','${e.id}','scope',this.value)" ${e.stageDerived?'disabled':''}>${projectExpenseScopeOptions(o,e)}</select></label>
      ${!e.stageDerived?`<button class="btn-ghost text-red-600" onclick="projectEditDirectExpense('${o.id}','${e.id}','delete','')">Удалить</button>`:'<span class="text-xs">Из этапа</span>'}
    </div>`;
  }).join('');
  const planned=(o.extraExpenses||[]).reduce((sum,e)=>sum+(Number(e.plannedAmount??e.amount)||0),0);
  const actual=(o.extraExpenses||[]).reduce((sum,e)=>sum+(Number(e.actualAmount)||(e.actual?Number(e.amount)||0:0)),0);
  return `<section class="project-expenses" data-project-direct-expenses><div class="project-expenses-head"><div><h4 class="font-bold">Расходы проекта</h4><div class="text-xs text-gray-500">План и факт учитываются один раз; расход можно закрепить за проектом, направлением или услугой.</div></div><strong>${fmtMoney(planned)} план · ${fmtMoney(actual)} факт</strong></div>${rows||'<div class="text-sm text-gray-500 mt-2">Прямых расходов пока нет.</div>'}<button class="btn-ghost mt-2" onclick="projectEditDirectExpense('${o.id}','','add','')">+ Добавить расход</button></section>`;
}
function projectEditDirectExpense(oid,eid,field,value) {
  const o=getOrder(oid);if(!o||!orderUserCanManage(currentUser())||!orderUserCanSeeMoney(o,currentUser()))return;
  o.extraExpenses||=[];const e=o.extraExpenses.find(e=>e.id===eid);if(e?.stageDerived)return;
  if(field==='add')o.extraExpenses.push({id:uid(),type:'other',label:'Прямой расход',plannedAmount:0,actualAmount:0,amount:0,actual:false,projectDirect:true,createdAt:new Date().toISOString()});
  else if(field==='delete')o.extraExpenses=o.extraExpenses.filter(e=>e.id!==eid);
  else if(e&&field==='scope'){
    delete e.serviceId;delete e.direction;
    if(String(value).startsWith('service:'))e.serviceId=String(value).slice(8);
    if(String(value).startsWith('direction:'))e.direction=String(value).slice(10);
  } else if(e&&['plannedAmount','actualAmount'].includes(field)){
    e[field]=Math.max(0,Number(value)||0);
    e.actual=Number(e.actualAmount)>0;
    e.amount=e.actual?Number(e.actualAmount):Number(e.plannedAmount);
  } else if(e&&['label','type'].includes(field))e[field]=String(value).slice(0,160);
  projectEstimateMarkChanged(o,'Изменены расходы проекта');
  save();if(['add','delete','scope'].includes(field)){preservePositionForNextRender();render();}
}

function projectServiceScope(o, group) {
  const bases = { actualWidth:'width',actualHeight:'height',actualQty:'qty' };
  const pick = (item, fields) => Object.fromEntries(fields.filter(field => item?.[field] !== undefined && !(bases[field] && (Number(item[field])<=0 || Number(item[field])===Number(item[bases[field]])))).map(field=>[field,item[field]]));
  // Each window with its room (where the work is); their order is not part of it.
  const rooms = new Map(measureAllWindows(o).map(({ room, win }) => [win, room?.id ?? null]));
  const byId = (a, b) => String(a.id ?? '').localeCompare(String(b.id ?? ''));
  return JSON.stringify([...group.windows.map(win => ({ ...pick(win, PROJECT_SCOPE_WINDOW_FIELDS), roomId: rooms.get(win) ?? null })).sort(byId), ...group.lines.map(line => pick(line, PROJECT_SCOPE_LINE_FIELDS))], (_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
}

// ---------- DIRECTION WINDOW (Owner, 2026-10-24) ----------
// «Когда выбираешь направление, оно должно открываться в окне отдельно и
// добавлять свои услуги». Each direction of a project opens in its own window
// with three steps — Услуги → Замер → Цена — showing only that direction's
// services, windows and money, in the direction's colour. The CRM's look stays
// as it is: the window reuses the calculation workspace frame.
function projectDirectionWindowSteps() {
  return [{ id: 'services', label: 'Услуги' }, { id: 'measure', label: 'Замер' }, { id: 'price', label: 'Цена' }];
}
function projectDirectionWindowData(o, directionKey) {
  const lines = projectLines(o);
  const pending = projectPendingSizedServices(o);
  const direction = projectDirectionGroups(o, lines, pending).find(item => item.key === directionKey)
    || { ...projectLineDirectionInfo({ direction: directionKey }), lines: [], pending: [] };
  const windows = measureAllWindows(o).filter(({ win }) => projectLineDirectionInfo({ direction: win.measureScope || o.serviceType, offeringId: win.offeringId }).key === directionKey);
  const sized = direction.lines.filter(line => line.kind === 'windows').length + direction.pending.length;
  const unsized = windows.filter(({ win }) => typeof windowSizeEntered === 'function' && !windowSizeEntered(win)).length;
  const total = projectDirectionExcluded(o, directionKey) ? 0 : direction.lines.filter(line => !line.excluded && line.kind !== 'included').reduce((sum, line) => sum + (Number(line.price) || 0), 0);
  const done = {
    services: direction.lines.length + direction.pending.length > 0,
    measure: !sized || (windows.length > 0 && !unsized && !direction.pending.length),
    price: total > 0 && !direction.pending.length,
  };
  return { direction, windows, total, done, unsized };
}
function openProjectDirectionWindow(oid, directionKey, step = '') {
  const o = getOrder(oid);
  if (!o) return;
  const prev = state._directionWindow;
  const current = step || (prev && prev.oid === oid && prev.key === directionKey ? prev.step : '') || 'services';
  const pick = prev && prev.oid === oid && prev.key === directionKey ? prev.pick || '' : '';
  state._directionWindow = { oid, key: directionKey, step: current, pick };
  state.modal = projectDirectionWindowHtml(o, directionKey, current);
  render();
}
function closeProjectDirectionWindow() {
  state._directionWindow = null;
  closeModal();
}
function returnToProjectDirectionWindow() {
  const w = state._directionWindow;
  if (!w || !getOrder(w.oid)) return false;
  openProjectDirectionWindow(w.oid, w.key, w.step);
  return true;
}
function projectDirectionWindowAddService(oid, directionKey) {
  state._directionWindow = { ...(state._directionWindow || {}), oid, key: directionKey, step: 'services' };
  openServiceCashier(oid, 'direction');
  serviceCashierPick('direction', directionKey);
}
function projectDirectionWindowMeasure(oid, directionKey) {
  state._directionWindow = { ...(state._directionWindow || {}), oid, key: directionKey, step: 'measure' };
  openManagerMeasureModal(oid);
  const o = getOrder(oid);
  if (o && orderMeasureScopes(o).includes(directionKey)) managerSelectMeasureScope(oid, directionKey);
}
function projectDirectionWindowHtml(o, directionKey, step) {
  const tone = rpDir(directionKey);
  const money = orderUserCanSeeMoney(o, currentUser());
  const owner = currentUser()?.role === 'owner';
  const edit = money && !CLOSED_PROJECT_STATUSES.includes(o.status);
  const { direction, windows, total, done, unsized } = projectDirectionWindowData(o, directionKey);
  const steps = projectDirectionWindowSteps();
  const index = Math.max(0, steps.findIndex(item => item.id === step));
  const tabs = steps.map((item, i) => `<button type="button" class="rp-dirwin-step ${i === index ? 'current' : done[item.id] ? 'done' : ''}" onclick="openProjectDirectionWindow('${o.id}','${jsQuote(directionKey)}','${item.id}')">${done[item.id] && i !== index ? '✓' : i + 1} ${item.label}</button>`).join('');
  const lineRow = line => `<div class="rp-dirwin-row"><div><b>${line.kind === 'included' ? '↳ ' : ''}${academyEsc(line.name)}</b><span>${academyEsc(projectLineNote(line))}</span></div><div class="rp-dirwin-num">${academyEsc(projectLineQtyText(line))}${money ? `<b>${line.kind === 'included' ? 'в пакете' : fmtMoney(line.price)}</b>` : ''}</div></div>`;
  const pendingRow = offering => { const film = getCatalogItem(projectOfferingCatalogId(o, offering.id)); return `<div class="rp-dirwin-row pending"><div><b>${academyEsc(offering.name)}</b><span>${film ? academyEsc(catalogLabel(film)) : 'материал уточним на замере'}</span></div>${(typeof offeringWindowCandidates === 'function' && offeringWindowCandidates(o, offering).length) ? `<button type="button" class="btn-ghost text-xs" onclick="openOfferingWindowsPicker('${o.id}','${jsQuote(offering.id)}','direction')">Выбрать окна</button>` : '<div class="rp-dirwin-num">нужен замер</div>'}</div>`; };
  let body = '';
  if (step === 'measure') {
    const rooms = new Map();
    windows.forEach(({ room, win }) => { if (!rooms.has(room.id)) rooms.set(room.id, { room, list: [] }); rooms.get(room.id).list.push(win); });
    const unit = db.settings?.inputUnits === 'inches' ? 'in' : 'mm';
    const size = win => (typeof windowSizeEntered === 'function' && !windowSizeEntered(win)) ? 'размер не внесён' : `${measureMmToInput(win.width)} × ${measureMmToInput(win.height)} ${unit}${Number(win.qty) > 1 ? ` · ${win.qty} шт.` : ''} · ${windowAreaSqft(win).toFixed(1)} sq ft`;
    body = `<p class="rp-dirwin-hint">Только окна этого направления. Окна других направлений — в их окнах.</p>
      ${[...rooms.values()].map(({ room, list }) => `<div class="rp-dirwin-group">${academyEsc(room.name || 'Помещение')} · ${list.length} ${projectWindowsWord(list.length)}</div>${list.map(win => `<div class="rp-dirwin-row"><div><b>${academyEsc(win.name || 'Окно')}</b><span>${academyEsc(size(win))}</span></div><div class="rp-dirwin-num">${windowMeasurementIsVerified(win) ? '<span class="rp-dirwin-ok">✓ точно</span>' : '<span class="rp-dirwin-wait">от клиента</span>'}</div></div>`).join('')}`).join('') || '<div class="rp-dirwin-empty">Окон этого направления пока нет.</div>'}
      ${unsized ? `<div class="rp-dirwin-warn">Без размеров: ${unsized} ${projectWindowsWord(unsized)}</div>` : ''}
      <button type="button" class="btn-ghost w-full mt-2" onclick="projectDirectionWindowMeasure('${o.id}','${jsQuote(directionKey)}')">${windows.length ? 'Открыть замер этого направления' : '+ Внести окна этого направления'}</button>`;
  } else if (step === 'price') {
    const cost = direction.lines.reduce((sum, line) => sum + (Number(line.materialCost) || 0) + (Number(line.installerPay) || 0), 0);
    body = `<p class="rp-dirwin-hint">Цена посчитана из услуг и замера этого направления.</p>
      ${direction.lines.map(lineRow).join('')}${direction.pending.map(pendingRow).join('')}
      ${money ? `<div class="rp-dirwin-total"><span>Итого направление</span><b>${fmtMoney(total)}</b></div>` : ''}
      ${owner && total > 0 ? `<div class="rp-dirwin-owner"><div class="rp-dirwin-group">Видит только владелец</div><div class="rp-dirwin-row"><div><b>Материал и специалисты по установке</b><span>по строкам направления</span></div><div class="rp-dirwin-num"><b>${fmtMoney(cost)}</b></div></div><div class="rp-dirwin-row"><div><b>Прямая маржа</b><span>без общих расходов проекта</span></div><div class="rp-dirwin-num"><b>${fmtMoney(total - cost)} · ${total ? Math.round((total - cost) / total * 100) : 0}%</b></div></div></div>` : ''}
      ${money ? `<button type="button" class="btn-ghost w-full mt-2" onclick="state._directionWindow=null;openProjectEstimateWorkspace('${o.id}')">Полный расчёт проекта и КП</button>` : ''}`;
  } else {
    body = `<p class="rp-dirwin-hint">Что делаем в этом направлении. Здесь только его услуги и плёнки.</p>
      ${direction.lines.map(lineRow).join('')}${direction.pending.map(pendingRow).join('')}
      ${!direction.lines.length && !direction.pending.length ? '<div class="rp-dirwin-empty">Услуг пока нет.</div>' : ''}
      ${edit ? projectDirectionAddHtml(o, directionKey) : ''}`;
  }
  const next = index < steps.length - 1
    ? `<button type="button" class="btn-primary rp-dirwin-next" style="background:var(--dir-color) !important;border-color:var(--dir-color) !important;color:#fff !important" onclick="openProjectDirectionWindow('${o.id}','${jsQuote(directionKey)}','${steps[index + 1].id}')">Далее: ${steps[index + 1].label.toLowerCase()} →</button>`
    : `<button type="button" class="btn-primary rp-dirwin-next" style="background:var(--dir-color) !important;border-color:var(--dir-color) !important;color:#fff !important" onclick="closeProjectDirectionWindow()">✓ Готово — к проекту</button>`;
  return `<div class="modal-backdrop order-workspace-backdrop" onclick="if(event.target===this) closeProjectDirectionWindow()">
    <div class="modal-content workspace-modal order-workspace-modal rp-dirwin" style="--workspace-color:${academyEsc(tone.color)};--dir-color:${academyEsc(tone.color)};--dir-tint:${academyEsc(tone.tint)};--dir-deep:${academyEsc(tone.deep)}" onclick="event.stopPropagation()" role="dialog" aria-modal="true" aria-label="Направление ${academyEsc(direction.title)}">
      <header class="order-workspace-modal-head rp-dirwin-head">
        <button type="button" class="workspace-back" onclick="closeProjectDirectionWindow()">← К проекту</button>
        <div class="order-workspace-modal-heading"><span class="order-workspace-modal-icon rp-dirwin-icon">${rpIcon(tone, 20)}</span><div><div class="order-workspace-modal-kicker">${academyEsc(o.number)}</div><h3>${academyEsc(direction.title)}</h3></div></div>
        ${money ? `<div class="rp-dirwin-sum">${fmtMoney(total)}</div>` : ''}
      </header>
      <div class="rp-dirwin-steps">${tabs}</div>
      <div class="order-workspace-modal-body rp-dirwin-body">${body}</div>
      <div class="rp-dirwin-foot">${next}</div>
    </div>
  </div>`;
}

// ---------- KP WINDOW (Owner, 2026-10-24: «и КП тоже самое») ----------
// One window, three steps — Состав → Как увидит клиент → Отправить — on top of
// the existing calculation and Proposal Studio (both still reachable).
function proposalWizardSteps() {
  return [{ id: 'compose', label: 'Состав' }, { id: 'preview', label: 'Как увидит' }, { id: 'send', label: 'Отправить' }];
}
function proposalWizardActive(oid) {
  const w = state._proposalWizard;
  if (!w || w.oid !== oid) return false;
  return !!w.pending || String(state.modal || '').includes('data-proposal-wizard');
}
function openProposalWizard(oid, step = 'compose') {
  const o = getOrder(oid);
  if (!o) return;
  if (!orderUserCanViewProposal(o)) { alert('КП доступно только владельцу и назначенному менеджеру'); return; }
  const prop = getPremiumProposalByOrder(oid);
  const ready = projectEstimateIsApproved(o) && prop && prop.publishedAt;
  const current = ready ? step : 'compose';
  state._proposalWizard = { oid, step: current, pending: false };
  state.modal = proposalWizardHtml(o, current);
  render();
}
function closeProposalWizard() {
  state._proposalWizard = null;
  closeModal();
}
function proposalWizardBuild(oid) {
  const o = getOrder(oid);
  if (!o) return;
  state._proposalWizard = { oid, step: 'preview', pending: true };
  if (projectEstimateIsApproved(o)) openProfessionalKP(oid); else approveProjectEstimateAndOpenProposal(oid);
  // Refused (issues, low-margin «нет»): the flag must not hijack a later studio.
  setTimeout(() => { const w = state._proposalWizard; if (w && w.pending && !String(state.modal || '').includes('data-proposal-wizard')) w.pending = false; }, 15000);
}
function proposalWizardHtml(o, step) {
  const steps = proposalWizardSteps();
  const index = Math.max(0, steps.findIndex(item => item.id === step));
  const prop = getPremiumProposalByOrder(o.id);
  const approved = projectEstimateIsApproved(o);
  const ready = approved && prop && prop.publishedAt;
  const client = getClient(o.clientId) || {};
  const groups = projectDirectionGroups(o).filter(direction => !projectDirectionExcluded(o, direction.key));
  const total = orderRevenue(o);
  const calc = prop ? premiumProposalCalc(prop) : null;
  const deposit = calc ? calc.paymentDue : (typeof companyDepositFor === 'function' ? companyDepositFor(total) : 0);
  const tabs = steps.map((item, i) => `<button type="button" class="rp-dirwin-step ${i === index ? 'current' : i < index ? 'done' : ''}" ${ready || i === 0 ? `onclick="openProposalWizard('${o.id}','${item.id}')"` : 'disabled'}>${i < index ? '✓' : i + 1} ${item.label}</button>`).join('');
  let body = '';
  let foot = '';
  if (step === 'preview' && ready) {
    const url = premiumProposalUrl(prop);
    body = `<p class="rp-dirwin-hint">Так клиент увидит КП на телефоне. Язык и всё содержимое — как у клиента.</p>
      <div class="rp-kpwin-frame"><iframe src="${academyEsc(url)}" title="КП глазами клиента" loading="lazy"></iframe></div>
      <a class="btn-ghost w-full mt-2 text-center" href="${academyEsc(url)}" target="_blank" rel="noopener">Открыть как клиент ↗</a>`;
    foot = `<button type="button" class="btn-primary rp-dirwin-next" style="background:var(--dir-color) !important;border-color:var(--dir-color) !important;color:#fff !important" onclick="openProposalWizard('${o.id}','send')">Всё верно — отправить →</button>`;
  } else if (step === 'send' && ready) {
    const url = premiumProposalUrl(prop);
    const msg = `Hi ${client.name || ''}, your ROLANPRO proposal is ready: ${url}`;
    const sent = prop.status && prop.status !== 'Draft';
    body = `${sent ? `<div class="rp-kpwin-sent">✓ ${academyEsc(premiumStatusLabelRu(prop.status, prop))}</div>` : '<p class="rp-dirwin-hint">Выберите, как отправить. CRM отметит «КП отправлено».</p>'}
      <a class="rp-kpwin-channel" href="${whatsappLink(client.phone, msg)}" target="_blank" rel="noopener" onclick="premiumMarkProposalSent('${prop.token}','WhatsApp')"><b>WhatsApp</b><span>${academyEsc(client.phone || 'нет телефона')}</span></a>
      <a class="rp-kpwin-channel" href="${smsLink(client.phone, msg)}" onclick="premiumMarkProposalSent('${prop.token}','SMS')"><b>SMS</b><span>${client.smsConsent ? 'согласие есть' : 'нет согласия на SMS — лучше WhatsApp'}</span></a>
      ${client.email ? `<button type="button" class="rp-kpwin-channel" onclick="premiumSendCanonicalProposal('${prop.token}')"><b>Email</b><span>${academyEsc(client.email)}</span></button>` : '<div class="rp-kpwin-channel off"><b>Email</b><span>у клиента нет email</span></div>'}
      <button type="button" class="rp-kpwin-channel" onclick="navigator.clipboard.writeText('${jsQuote(url)}'); premiumMarkProposalSent('${prop.token}','ссылка скопирована')"><b>Скопировать ссылку</b><span>отправить другим способом</span></button>
      <button type="button" class="btn-ghost w-full mt-2" onclick="state._proposalWizard=null; openPremiumProposalManagerModal('${prop.token}')">Все настройки КП: оплата, версии</button>`;
    foot = `<button type="button" class="btn-primary rp-dirwin-next" style="background:var(--dir-color) !important;border-color:var(--dir-color) !important;color:#fff !important" onclick="closeProposalWizard()">✓ Готово — к проекту</button>`;
  } else {
    const row = direction => {
      const tone = rpDir(direction.key);
      const sum = direction.lines.filter(line => !line.excluded && line.kind !== 'included').reduce((s, line) => s + (Number(line.price) || 0), 0);
      return `<div class="rp-kpwin-dir" style="--dir-color:${academyEsc(tone.color)};--dir-tint:${academyEsc(tone.tint)};--dir-deep:${academyEsc(tone.deep)}">
        <div class="rp-kpwin-dir-head"><span class="rp-kpwin-dot"></span><b>${academyEsc(direction.title)}</b><span class="rp-kpwin-dir-sum">${fmtMoney(sum)}</span></div>
        ${direction.lines.map(line => `<div class="rp-kpwin-line"><span>${line.kind === 'included' ? '↳ ' : ''}${academyEsc(line.name)} · ${academyEsc(projectLineQtyText(line))}</span><span>${line.kind === 'included' ? 'в пакете' : fmtMoney(line.price)}</span></div>`).join('')}
        ${direction.pending.map(offering => `<div class="rp-kpwin-line warn"><span>${academyEsc(offering.name)}</span><span>нужен замер</span></div>`).join('')}
        <button type="button" class="rp-kpwin-edit" onclick="state._proposalWizard=null; openProjectDirectionWindow('${o.id}','${jsQuote(direction.key)}')">Изменить направление</button>
      </div>`;
    };
    const issues = projectEstimateReadiness(o);
    body = `<p class="rp-dirwin-hint">КП собирается из посчитанных направлений. Состав меняется в окне направления.</p>
      ${groups.map(row).join('') || '<div class="rp-dirwin-empty">В проекте пока нет услуг.</div>'}
      ${projectProposalOptionsHtml(o)}
      <div class="rp-kpwin-total"><div><span>Итого</span><b>${fmtMoney(total)}</b></div><div><span>Аванс при подписи</span><b>${fmtMoney(deposit)}</b></div></div>
      ${issues.length ? `<div class="rp-dirwin-warn">Чего не хватает: ${academyEsc(issues.join(', '))}</div>` : ''}`;
    foot = issues.length
      ? `<button type="button" class="btn-primary rp-dirwin-next" style="background:var(--dir-color) !important;border-color:var(--dir-color) !important;color:#fff !important" onclick="state._proposalWizard=null; openProjectEstimateWorkspace('${o.id}')">Показать, чего не хватает</button>`
      : ready
        ? `<button type="button" class="btn-primary rp-dirwin-next" style="background:var(--dir-color) !important;border-color:var(--dir-color) !important;color:#fff !important" onclick="openProposalWizard('${o.id}','preview')">Далее: как увидит клиент →</button>`
        : `<button type="button" class="btn-primary rp-dirwin-next" style="background:var(--dir-color) !important;border-color:var(--dir-color) !important;color:#fff !important" onclick="proposalWizardBuild('${o.id}')">Собрать КП →</button>`;
  }
  return `<div class="modal-backdrop order-workspace-backdrop" data-proposal-wizard onclick="if(event.target===this) closeProposalWizard()">
    <div class="modal-content workspace-modal order-workspace-modal rp-dirwin rp-kpwin" style="--workspace-color:#2563eb;--dir-color:#2563eb;--dir-tint:#e9efff;--dir-deep:#1d4ed8" onclick="event.stopPropagation()" role="dialog" aria-modal="true" aria-label="Коммерческое предложение">
      <header class="order-workspace-modal-head rp-dirwin-head">
        <button type="button" class="workspace-back" onclick="closeProposalWizard()">← К проекту</button>
        <div class="order-workspace-modal-heading"><span class="order-workspace-modal-icon rp-dirwin-icon">📄</span><div><div class="order-workspace-modal-kicker">${academyEsc(o.number)} · ${academyEsc(client.name || '')}</div><h3>Коммерческое предложение</h3></div></div>
        <div class="rp-dirwin-sum">${fmtMoney(total)}</div>
      </header>
      <div class="rp-dirwin-steps">${tabs}</div>
      <div class="order-workspace-modal-body rp-dirwin-body">${body}</div>
      <div class="rp-dirwin-foot">${foot}</div>
    </div>
  </div>`;
}

// ---------- СЧЁТ (INVOICE) ДЛЯ КОММЕРЧЕСКИХ КЛИЕНТОВ (Owner, 2026-10-24) ----------
// «Хочу отправить инвойс коммерческим клиентам, чтобы они платили по счёту, и
// снять зависимость от Stripe». A numbered invoice from the project: lines in
// English, what is paid, balance due, due date (Net 15/30), and how to pay —
// bank transfer, Zelle, check — from «Настройки → Как клиент платит». It opens
// as a printable page (Save as PDF) and is kept in the project.
// Only functions are composed into the CRM page (production-ui.ts), so the terms are a function.
function invoiceTerms() {
  return [
    { id: 'receipt', label: 'Due on receipt', days: 0 },
    { id: 'net15', label: 'Net 15', days: 15 },
    { id: 'net30', label: 'Net 30', days: 30 },
  ];
}
function invoiceTerm(id) { return invoiceTerms().find(t => t.id === id) || invoiceTerms()[1]; }
function invoiceNextNumber(o) {
  const n = (o.invoices || []).length + 1;
  return `INV-${String(o.number || o.id).replace(/^R-/, '')}${n > 1 ? '-' + n : ''}`;
}
function invoiceAddDays(dateKey, days) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  return localDateKey(new Date(y, (m || 1) - 1, (d || 1) + days));
}
function invoiceUsDate(dateKey) {
  const [y, m, d] = String(dateKey || '').split('-');
  return y && m && d ? `${m}/${d}/${y}` : '';
}
function invoicePaymentMethods() {
  const cp = db.settings?.clientPayments || {};
  const company = db.settings?.companyName || 'ROLANPRO';
  const out = [];
  const bank = String(cp.achInstructions || cp.bankTransferInstructions || '').trim();
  if (bank && cp.achEnabled !== false) out.push({ key: 'bank', title: 'Bank transfer (ACH / wire)', text: bank });
  const zelle = String(cp.zelleRecipient || '').trim();
  if (zelle && cp.zelleEnabled !== false) out.push({ key: 'zelle', title: 'Zelle', text: `${zelle}${cp.zelleRecipientName ? ` (${cp.zelleRecipientName})` : ''}` });
  const mail = String(cp.checkMailingAddress || db.settings?.officeAddress || '').trim();
  if (cp.checkEnabled !== false) out.push({ key: 'check', title: 'Check', text: `Payable to ${company}${mail ? `\nMail to: ${mail}` : ''}` });
  return out;
}
function invoiceCardFee(amount) { return Math.round(Math.max(0, Number(amount) || 0) * 0.03 * 100) / 100; }
function invoiceDraft(o, form = {}) {
  const c = getClient(o.clientId) || {};
  const lines = projectLines(o).filter(line => !line.excluded).map(line => ({
    title: (typeof projectProposalLineTitle === 'function' && projectProposalLineTitle(line)) || line.name || 'Service',
    qty: Math.round((Number(line.qty) || 0) * 100) / 100,
    unit: line.unitShort || line.unit || '',
    amount: Math.round((Number(line.price) || 0) * 100) / 100,
  }));
  const total = Math.round(orderRevenue(o) * 100) / 100;
  const linesSum = lines.reduce((sum, line) => sum + line.amount, 0);
  if (Math.abs(total - linesSum) >= 0.01) lines.push({ title: total < linesSum ? 'Discount' : 'Adjustment', qty: 0, unit: '', amount: Math.round((total - linesSum) * 100) / 100 });
  const paid = Math.round(Math.max(orderPaidTotal(o), Number(o.paid) || 0) * 100) / 100;
  const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
  const mode = form.mode || 'balance';
  const deposit = Math.min(balance, companyDepositFor(total));
  const amount = mode === 'deposit' ? deposit : mode === 'custom' ? Math.min(balance, Math.max(0, Number(form.custom) || 0)) : balance;
  const issued = form.issued || localDateKey();
  const term = invoiceTerm(form.terms || (orderSiteType(o) === 'COMMERCIAL' ? 'net15' : 'receipt'));
  const number = form.number || invoiceNextNumber(o);
  const saved = (o.invoices || []).find(item => item.number === number && Math.abs((Number(item.amount) || 0) - amount) < 0.01) || {};
  const cardFee = invoiceCardFee(amount);
  return {
    number,
    issued, due: invoiceAddDays(issued, term.days), terms: term.id, termsLabel: term.label,
    mode, amount: Math.round(amount * 100) / 100, total, paid, balance, deposit,
    poNumber: String(form.po || '').trim().slice(0, 60),
    billTo: { name: String(form.billName ?? c.companyName ?? c.name ?? '').trim() || c.name || 'Client', attn: c.companyName && c.name !== c.companyName ? c.name : '', email: c.email || '', phone: c.phone || '', address: orderAddress(o, c) || '' },
    lines, methods: invoicePaymentMethods(), project: o.number || '', note: String(form.note || '').trim().slice(0, 500),
    paymentLinkUrl: saved.paymentLinkUrl || '', paymentLinkId: saved.paymentLinkId || '',
    cardFee, cardPayable: Math.round((amount + cardFee) * 100) / 100,
  };
}
function invoiceFormValues() {
  const v = id => document.getElementById(id)?.value;
  return { number: v('inv-number'), issued: v('inv-issued'), terms: v('inv-terms'), mode: v('inv-mode'), custom: v('inv-custom'), po: v('inv-po'), billName: v('inv-bill'), note: v('inv-note') };
}
function openProjectInvoice(oid) {
  const o = getOrder(oid);
  if (!o || !orderUserCanSeeMoney(o, currentUser())) return;
  const inv = invoiceDraft(o, state._invoiceForm?.oid === oid ? state._invoiceForm : {});
  // Money documents keep the company navy, not a direction colour.
  const d = { color: '#0F2440', tint: '#EEF2F8', deep: '#0F2440' };
  const methods = inv.methods;
  const noBank = !methods.some(m => m.key === 'bank');
  state.modal = `
  <div class="modal-backdrop" onclick="if(event.target===this) closeModal()">
    <div class="modal-content workspace-modal p-5 rp-invoice-modal" style="max-width:40rem;border-top:4px solid ${d.color}" onclick="event.stopPropagation()" data-rp-keep-layout>
      <button type="button" class="workspace-back mb-2" onclick="closeModal()">← К проекту</button>
      <div class="flex items-start justify-between gap-3">
        <div><div class="text-xs font-bold" style="color:${d.deep}">СЧЁТ · INVOICE</div><h3 class="font-black text-xl">${academyEsc(inv.number)} · ${fmtMoney(inv.amount)}</h3>
        <p class="text-sm text-gray-600">${academyEsc(inv.billTo.name)} · проект ${academyEsc(inv.project)} · оплатить до ${academyEsc(invoiceUsDate(inv.due))}</p></div>
      </div>
      <div class="grid grid-cols-2 gap-3 mt-3">
        <label>Номер счёта<input id="inv-number" value="${academyEsc(inv.number)}" oninput="invoiceFormChanged('${o.id}', false)"></label>
        <label>Дата<input id="inv-issued" type="date" value="${inv.issued}" onchange="invoiceFormChanged('${o.id}')"></label>
        <label>Срок оплаты<select id="inv-terms" onchange="invoiceFormChanged('${o.id}')">${invoiceTerms().map(t => `<option value="${t.id}" ${t.id === inv.terms ? 'selected' : ''}>${t.label}</option>`).join('')}</select></label>
        <label>PO / номер заказа клиента<input id="inv-po" value="${academyEsc(inv.poNumber)}" placeholder="если клиент дал" oninput="invoiceFormChanged('${o.id}', false)"></label>
        <label class="col-span-2">Кому (компания)<input id="inv-bill" value="${academyEsc(inv.billTo.name)}" oninput="invoiceFormChanged('${o.id}', false)"></label>
        <label>Сумма счёта<select id="inv-mode" onchange="invoiceFormChanged('${o.id}')">
          <option value="balance" ${inv.mode === 'balance' ? 'selected' : ''}>Остаток ${fmtMoney(inv.balance)}</option>
          <option value="deposit" ${inv.mode === 'deposit' ? 'selected' : ''}>Аванс ${fmtMoney(inv.deposit)}</option>
          <option value="custom" ${inv.mode === 'custom' ? 'selected' : ''}>Другая сумма</option></select></label>
        <label style="${inv.mode === 'custom' ? '' : 'visibility:hidden'}">Сумма, $<input id="inv-custom" type="number" min="0" step="0.01" value="${inv.mode === 'custom' ? inv.amount : ''}" oninput="invoiceFormChanged('${o.id}', false)"></label>
        <label class="col-span-2">Примечание для клиента<input id="inv-note" value="${academyEsc(inv.note)}" placeholder="необязательно" oninput="invoiceFormChanged('${o.id}', false)"></label>
      </div>
      <div class="rounded-lg border mt-3 p-3 text-sm">
        <div class="flex justify-between"><span>Проект</span><b>${fmtMoney(inv.total)}</b></div>
        <div class="flex justify-between"><span>Оплачено</span><b>${fmtMoney(inv.paid)}</b></div>
        <div class="flex justify-between"><span>Остаток</span><b>${fmtMoney(inv.balance)}</b></div>
      </div>
      <div class="rounded-lg mt-3 p-3 text-sm" style="background:${d.tint}">
        <b>Как клиент заплатит:</b> ${methods.map(m => academyEsc(m.title)).join(' · ') || '—'}
        <div class="mt-1">Карта через Stripe добавляется в сам счёт автоматически; комиссия 3% показывается клиенту отдельно.</div>
        ${noBank ? `<div class="text-amber-800 mt-1">Банковские реквизиты не заполнены — впишите их сами в «Настройки → Как клиент платит → Банковский перевод». В чат и сообщения их не отправляйте.</div>` : ''}
      </div>
      <div class="flex gap-2 flex-wrap mt-4">
        <button class="btn-primary flex-1" style="background:${d.color}!important;border-color:${d.color}!important" onclick="issueProjectInvoice('${o.id}')">🧾 Открыть счёт (PDF)</button>
        <button class="btn-ghost" onclick="copyProjectInvoiceText('${o.id}')">Текст для письма</button>
        ${inv.balance > 0.01 ? `<button class="btn-ghost" onclick="closeModal(); openPaymentModal('${o.id}',{kind:'final'})">Отметить оплату</button>` : ''}
      </div>
      ${(o.invoices || []).length ? `<div class="mt-4 text-sm"><b>Выставленные счета</b>${o.invoices.slice().reverse().map(i => `<div class="flex justify-between border-t py-1 mt-1"><span>${academyEsc(i.number)} · ${academyEsc(invoiceUsDate(i.issued))} · до ${academyEsc(invoiceUsDate(i.due))}</span><b>${fmtMoney(i.amount)}</b></div>`).join('')}</div>` : ''}
    </div>
  </div>`;
  render();
}
function invoiceFormChanged(oid, rerender = true) {
  state._invoiceForm = { oid, ...invoiceFormValues() };
  if (rerender) openProjectInvoice(oid);
}
function invoiceDocumentHtml(inv) {
  const esc = academyEsc;
  const company = db.settings?.companyName || 'ROLANPRO';
  const from = [db.settings?.officeAddress, db.settings?.companyPhone, db.settings?.companyEmail].filter(Boolean).map(esc).join('<br>');
  const money = v => (v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Invoice ${esc(inv.number)}</title>
<style>body{font-family:Inter,Arial,sans-serif;color:#0f172a;max-width:780px;margin:28px auto;padding:0 22px;font-size:14px}h1{font-size:30px;margin:0;letter-spacing:.02em}.muted{color:#64748b}.top{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;border-bottom:3px solid #0f2440;padding-bottom:14px}.meta td{padding:2px 0 2px 14px;text-align:right}.grid{display:flex;justify-content:space-between;gap:24px;margin:18px 0}table.items{width:100%;border-collapse:collapse;margin-top:8px}table.items th{text-align:left;font-size:12px;text-transform:uppercase;color:#475569;border-bottom:1px solid #cbd5e1;padding:8px 6px}table.items td{border-bottom:1px solid #e2e8f0;padding:8px 6px;vertical-align:top}.r{text-align:right;white-space:nowrap}.totals{margin-left:auto;width:300px;margin-top:10px}.totals div{display:flex;justify-content:space-between;padding:4px 0}.due{font-size:18px;font-weight:800;border-top:2px solid #0f2440;padding-top:8px!important}.pay{margin-top:22px;padding:14px 16px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc}.pay pre{font-family:inherit;white-space:pre-wrap;margin:2px 0 10px}.pay-online{display:block;text-align:center;text-decoration:none;background:#635bff;color:#fff;padding:13px 18px;border-radius:9px;font-weight:800;font-size:16px;margin:12px 0 6px}@media print{button{display:none}body{margin:0 auto}.pay-online{border:1px solid #635bff;color:#312e81;background:#fff}}</style></head><body>
<div class="top"><div><h1>INVOICE</h1><div style="font-weight:800;font-size:16px;margin-top:6px">${esc(company)}</div><div class="muted">${from}</div></div>
<table class="meta"><tr><td class="muted">Invoice #</td><td><b>${esc(inv.number)}</b></td></tr><tr><td class="muted">Date</td><td>${esc(invoiceUsDate(inv.issued))}</td></tr><tr><td class="muted">Terms</td><td>${esc(inv.termsLabel)}</td></tr><tr><td class="muted">Due date</td><td><b>${esc(invoiceUsDate(inv.due))}</b></td></tr>${inv.poNumber ? `<tr><td class="muted">PO #</td><td>${esc(inv.poNumber)}</td></tr>` : ''}<tr><td class="muted">Project</td><td>${esc(inv.project)}</td></tr></table></div>
<div class="grid"><div><div class="muted" style="font-size:12px;text-transform:uppercase">Bill to</div><b>${esc(inv.billTo.name)}</b>${inv.billTo.attn ? `<br>Attn: ${esc(inv.billTo.attn)}` : ''}<br>${esc(inv.billTo.address)}${inv.billTo.email ? `<br>${esc(inv.billTo.email)}` : ''}${inv.billTo.phone ? `<br>${esc(inv.billTo.phone)}` : ''}</div>
<div style="text-align:right"><div class="muted" style="font-size:12px;text-transform:uppercase">Amount due</div><div style="font-size:28px;font-weight:800">${money(inv.amount)}</div><div class="muted">by ${esc(invoiceUsDate(inv.due))}</div></div></div>
<table class="items"><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Amount</th></tr></thead><tbody>
${inv.lines.map(l => `<tr><td>${esc(l.title)}</td><td class="r">${l.qty ? `${l.qty} ${esc(l.unit)}` : ''}</td><td class="r">${money(l.amount)}</td></tr>`).join('')}
</tbody></table>
<div class="totals"><div><span>Project total</span><b>${money(inv.total)}</b></div>${inv.paid > 0 ? `<div><span>Paid to date</span><b>−${money(inv.paid).replace('−','')}</b></div>` : ''}<div><span>Balance</span><b>${money(inv.balance)}</b></div>${Math.abs(inv.amount - inv.balance) >= 0.01 ? `<div><span>${inv.mode === 'deposit' ? 'Deposit due now' : 'Due now'}</span><b>${money(inv.amount)}</b></div>` : ''}<div class="due"><span>Amount due</span><span>${money(inv.amount)}</span></div></div>
<div class="pay"><b>How to pay</b> <span class="muted">— bank transfer, Zelle and check have no processing fee. Please include invoice # ${esc(inv.number)} in the payment memo.</span>
${inv.paymentLinkUrl ? `<a class="pay-online" href="${esc(inv.paymentLinkUrl)}" target="_blank" rel="noopener">Pay ${money(inv.cardPayable)} securely by card</a><div class="muted" style="text-align:center">Includes a 3% card processing fee of ${money(inv.cardFee)}. Bank transfer and Zelle have no fee.</div>` : ''}
${inv.methods.map(m => `<div style="margin-top:8px"><b>${esc(m.title)}</b><pre>${esc(m.text)}</pre></div>`).join('')}</div>
${inv.note ? `<p style="margin-top:16px">${esc(inv.note)}</p>` : ''}
<p class="muted" style="margin-top:22px">Thank you for your business.</p>
<p><button onclick="print()" style="padding:10px 16px;font-weight:700">Print / Save as PDF</button></p></body></html>`;
}
async function issueProjectInvoice(oid) {
  const o = getOrder(oid);
  if (!o) return;
  const inv = invoiceDraft(o, { ...(state._invoiceForm?.oid === oid ? state._invoiceForm : {}), ...invoiceFormValues() });
  if (inv.amount <= 0) { alert('Сумма счёта 0 — проект уже оплачен.'); return; }
  const win = window.open('', '_blank');
  if (!win) { alert('Разрешите всплывающие окна, чтобы открыть счёт.'); return; }
  win.document.write('<!doctype html><title>Preparing invoice…</title><body style="font-family:Arial;padding:32px">Preparing secure invoice…</body>');
  const savedInvoice = (o.invoices || []).find(item => item.number === inv.number && Math.abs((Number(item.amount) || 0) - inv.amount) < 0.01);
  if (savedInvoice?.paymentLinkUrl) {
    inv.paymentLinkUrl = savedInvoice.paymentLinkUrl;
    inv.paymentLinkId = savedInvoice.paymentLinkId || '';
  } else {
    try {
      const link = await createStripePaymentLink(o, inv.cardPayable, `Invoice ${inv.number} · project ${inv.project} · amount due ${fmtMoney(inv.amount)}`);
      inv.paymentLinkUrl = link.url;
      inv.paymentLinkId = link.id;
    } catch (error) {
      console.warn('[Invoice] Stripe link unavailable; invoice keeps bank/Zelle/check methods', error);
    }
  }
  win.document.open();
  win.document.write(invoiceDocumentHtml(inv));
  win.document.close();
  o.invoices = Array.isArray(o.invoices) ? o.invoices : [];
  const existing = o.invoices.find(i => i.number === inv.number);
  const record = { number: inv.number, issued: inv.issued, due: inv.due, terms: inv.terms, amount: inv.amount, mode: inv.mode, po: inv.poNumber, by: state.currentUserId || null, at: new Date().toISOString(), paymentLinkUrl: inv.paymentLinkUrl || '', paymentLinkId: inv.paymentLinkId || '', cardFee: inv.cardFee, cardPayable: inv.cardPayable };
  if (existing) Object.assign(existing, record); else o.invoices.push(record);
  o.timeline = o.timeline || [];
  o.timeline.push({ at: record.at, key: 'invoice_issued', by: state.currentUserId, note: `Счёт ${inv.number} на ${fmtMoney(inv.amount)}, оплатить до ${invoiceUsDate(inv.due)}` });
  state._invoiceForm = null;
  save();
  openProjectInvoice(oid);
}
function invoiceEmailText(inv) {
  return `Hello${inv.billTo.attn ? ' ' + inv.billTo.attn : ''},\n\nPlease find attached invoice ${inv.number} for project ${inv.project}.\nAmount due: $${inv.amount.toFixed(2)} — due ${invoiceUsDate(inv.due)} (${inv.termsLabel}).${inv.paymentLinkUrl ? `\n\nPay securely by card (3% processing fee; card total $${inv.cardPayable.toFixed(2)}):\n${inv.paymentLinkUrl}` : ''}\n\nBank transfer / Zelle / check (no processing fee; please reference ${inv.number}):\n${inv.methods.map(m => `\n${m.title}:\n${m.text}`).join('\n')}\n\nThank you,\n${db.settings?.companyName || 'ROLANPRO'}`;
}
async function copyProjectInvoiceText(oid) {
  const o = getOrder(oid);
  if (!o) return;
  const text = invoiceEmailText(invoiceDraft(o, { ...(state._invoiceForm?.oid === oid ? state._invoiceForm : {}), ...invoiceFormValues() }));
  try { await navigator.clipboard.writeText(text); alert('Текст письма скопирован. Приложите PDF счёта и отправьте клиенту.'); }
  catch (_) { prompt('Скопируйте текст письма:', text); }
}

// ---------- ПЛЁНКИ НЕТ НА СКЛАДЕ — ДОБАВИТЬ И ЗАКАЗАТЬ ПРЯМО ИЗ ОКНА (Owner, 2026-10-24) ----------
// «Логика была такой: при выборе плёнки, если её нет на складе, можно добавить
// плёнку самому, и от этого формируется заказ-наряд на закупку». The film list
// of a window ends with «Нет в списке — добавить и заказать»; the film is written
// into the catalog as «ожидает закупки», linked to the service, put on the
// windows of that service, and a purchase request for this project is drafted.
function windowManualFilmReturn(oid, inMeasurement) {
  if (inMeasurement && typeof refreshManagerMeasureModal === 'function') refreshManagerMeasureModal(oid);
  else if (typeof refreshProjectEstimateWorkspace === 'function') refreshProjectEstimateWorkspace(oid);
  else render();
}
function openWindowManualFilmForm(oid, rid, wid, inMeasurement = false) {
  const o = getOrder(oid);
  const win = o?.measurements?.rooms?.find(room => room.id === rid)?.windows?.find(item => item.id === wid);
  if (!o || !win || !orderUserCanManage(currentUser()) || !orderUserCanSeeMoney(o, currentUser())) return;
  const category = primaryServiceInfo(win.measureScope || o.serviceType)?.catalogCategory || 'solar';
  const offering = serviceOffering(win.offeringId);
  const widths = db.settings.filmRolls?.widths || [1524, 1829];
  const vendors = (db.vendors || []).filter(vendor => vendor.active !== false);
  const same = measureAllWindows(o).filter(({ win: item }) => item.offeringId && item.offeringId === win.offeringId);
  const back = `windowManualFilmReturn('${oid}',${inMeasurement ? 'true' : 'false'})`;
  state.modal = `<div class="modal-backdrop" onclick="if(event.target===this) ${back}"><div class="modal-content workspace-modal p-6" style="max-width:40rem" onclick="event.stopPropagation()">
    <button type="button" class="workspace-back mb-2" onclick="${back}">← Назад к замеру</button>
    <h3 class="font-semibold text-lg">Плёнки нет в списке — добавить и заказать</h3>
    <p class="text-xs text-gray-500 mb-4">Плёнка появится в каталоге со статусом «ожидает закупки»${offering ? ` и в услуге «${academyEsc(offering.name)}»` : ''}, встанет на окна и сразу создастся заявка на закупку под этот проект. Когда рулон придёт — его принимают на склад как обычно.</p>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div><label>Направление</label><input value="${academyEsc(catLabel(category))}" disabled></div>
      <div><label>Тип плёнки${category === 'solar' ? ' *' : ''}</label>${category === 'solar'
        ? `<select id="wmf-type"><option value="">Выберите тип</option>${SOLAR_FILM_SUBTYPES.map(type => `<option value="${academyEsc(type)}">${academyEsc(type)}</option>`).join('')}</select>`
        : `<input id="wmf-type" placeholder="Например: прозрачная 8 mil">`}</div>
      <div class="md:col-span-2"><label>Бренд и модель *</label><input id="wmf-name" placeholder="Как у поставщика, например 3M Prestige 70"></div>
      <div><label>Поставщик</label><select id="wmf-vendor"><option value="">Не выбран</option>${vendors.map(vendor => `<option value="${academyEsc(vendor.id)}">${academyEsc(vendor.name)}</option>`).join('')}</select></div>
      <div><label>Ширина рулона</label><select id="wmf-width">${widths.map(width => `<option value="${Number(width)}">${(Number(width) / 25.4).toFixed(0)}" · ${Number(width)} мм</option>`).join('')}</select></div>
      <div class="md:col-span-2"><label>Комментарий для закупки</label><input id="wmf-note" placeholder="Цвет, плотность, сроки"></div>
      ${same.length > 1 ? `<label class="md:col-span-2 flex items-center gap-2"><input id="wmf-all" type="checkbox" checked style="width:18px;height:18px"> На все окна услуги «${academyEsc(offering?.name || '')}» без плёнки (${same.length})</label>` : ''}
    </div>
    <div id="wmf-error" class="text-sm text-red-600 mt-3 hidden"></div>
    <div class="flex gap-2 mt-5"><button class="btn-primary flex-1" onclick="saveWindowManualFilm('${oid}','${rid}','${wid}',${inMeasurement ? 'true' : 'false'})">Добавить плёнку и создать заявку</button><button class="btn-ghost" onclick="${back}">Отмена</button></div>
  </div></div>`;
  render();
}
function saveWindowManualFilm(oid, rid, wid, inMeasurement = false) {
  const o = getOrder(oid);
  const win = o?.measurements?.rooms?.find(room => room.id === rid)?.windows?.find(item => item.id === wid);
  if (!o || !win || !orderUserCanManage(currentUser()) || !orderUserCanSeeMoney(o, currentUser())) return;
  const fail = message => { const box = document.getElementById('wmf-error'); if (box) { box.textContent = message; box.classList.remove('hidden'); } else alert(message); };
  const category = primaryServiceInfo(win.measureScope || o.serviceType)?.catalogCategory || 'solar';
  const filmType = String(document.getElementById('wmf-type')?.value || '').trim();
  const name = String(document.getElementById('wmf-name')?.value || '').trim().slice(0, 120);
  const vendorId = String(document.getElementById('wmf-vendor')?.value || '');
  const widthMm = Number(document.getElementById('wmf-width')?.value) || 1524;
  const note = String(document.getElementById('wmf-note')?.value || '').trim().slice(0, 300);
  const all = document.getElementById('wmf-all') ? document.getElementById('wmf-all').checked : false;
  if (!name) return fail('Впишите бренд и модель плёнки.');
  if (category === 'solar' && !filmType) return fail('Выберите тип солнцезащитной плёнки.');
  // The same film written in again is reused, never duplicated in the catalog.
  let catalog = (db.settings.catalog || []).find(item => !item.archived && item.category === category && String(item.model || '').trim().toLowerCase() === name.toLowerCase()) || null;
  if (!catalog) {
    catalog = { id: 'film_' + uid(), brand: '', filmCategory: filmType, productName: name, modelCode: '', model: name, category, retailPerSqft: 0, vendorId: vendorId || null, pendingPurchase: true, addedManuallyBy: currentUser()?.id || null, addedManuallyAt: new Date().toISOString() };
    db.settings.catalog.push(catalog);
  } else if (warehouseCatalogStockStats(catalog.id).availableSqft <= 0) {
    catalog.pendingPurchase = true;
    if (vendorId && !catalog.vendorId) catalog.vendorId = vendorId;
  }
  catalog.manualRollWidthMm = widthMm;
  const offering = serviceOffering(win.offeringId);
  if (offering) offering.filmIds = [...new Set([...serviceOfferingFilmIds(offering), catalog.id])];
  const targets = all ? measureAllWindows(o).map(({ win: item }) => item).filter(item => item.id === win.id || (item.offeringId === win.offeringId && !item.catalogId)) : [win];
  targets.forEach(item => { item.catalogId = catalog.id; item.filmType = catalogLabel(catalog); });
  const sqft = Math.round(measureAllWindows(o).filter(({ win: item }) => item.catalogId === catalog.id).reduce((sum, { win: item }) => sum + (windowActualAreaSqft(item) || 0), 0) * 100) / 100;
  let request = manualFilmPurchaseRequest(o.id, catalog.id) || activeProjectFilmPurchaseRequest(o.id, catalog.id);
  if (!request && warehouseCatalogStockStats(catalog.id).availableSqft < sqft) {
    request = createManualFilmDraft(o, catalog, sqft || 1, { widthMm, vendorId, note });
  } else if (request && request.status === 'draft' && request.source === 'manual_project_film') {
    const metres = manualFilmMetres(sqft, widthMm);
    request.qty = metres; request.sqftSnapshot = sqft; request.widthMm = widthMm;
    request.requirements = [{ widthMm, requiredM: metres, availableM: 0, shortageM: metres }];
    request.note = manualFilmRequestNote(o, sqft, note || request.manualNote);
    request.updatedAt = new Date().toISOString();
  }
  if (typeof invalidateProjectEstimate === 'function') invalidateProjectEstimate(o, `Плёнка «${name}» добавлена вручную`);
  o.timeline = o.timeline || [];
  o.timeline.push({ at: new Date().toISOString(), key: 'manual_film_added', by: state.currentUserId, note: `Плёнка «${name}» — нет на складе${request ? `, заявка ${request.number}` : ''}` });
  save();
  windowManualFilmReturn(oid, inMeasurement);
  if (request && typeof crmNotice === 'function') crmNotice(`Плёнка «${name}» добавлена. Заявка на закупку ${request.number} создана — её видно в «Закупки».`);
}

// ---------- УСЛУГА «ЗА КВ. ФУТ» В ЗАМЕРЕННЫЙ ПРОЕКТ: НА КАКИЕ ОКНА (Owner, 2026-10-24) ----------
// «Можно добавить услугу из списка, но она не добавляется в проект, не считается».
// A per-sq-ft service is priced by the windows that carry it. In a project whose
// windows are already measured (all with another service) it waited for a
// measurement that had already happened — $0 forever. Now the owner picks the
// windows right away; a window has one film service, so it is moved over.
function offeringWindowCandidates(o, offering) {
  const scope = offeringServiceType(offering);
  return measureAllWindows(o).filter(({ win }) => (win.measureScope || o.serviceType) === scope);
}
function openOfferingWindowsPicker(oid, offeringId, returnTo = 'card') {
  const o = getOrder(oid);
  const offering = serviceOffering(offeringId);
  if (!o || !offering || !orderUserCanSeeMoney(o, currentUser())) return;
  const rows = offeringWindowCandidates(o, offering);
  if (!rows.length) return;
  const d = rpDir(offeringServiceType(offering));
  const free = rows.filter(({ win }) => !win.offeringId);
  state.modal = `<div class="modal-backdrop" onclick="if(event.target===this) closeModal()"><div class="modal-content workspace-modal p-5" style="max-width:36rem;border-top:4px solid ${d.color}" onclick="event.stopPropagation()" data-rp-keep-layout>
    <button type="button" class="workspace-back mb-2" onclick="closeModal()">← К проекту</button>
    <div class="text-xs font-bold" style="color:${d.deep}">УСЛУГА ПО ЗАМЕРУ · ${academyEsc(measureScopeInfo(offeringServiceType(offering)).short || '')}</div>
    <h3 class="font-black text-xl">${academyEsc(offering.name)} — на какие окна?</h3>
    <p class="text-sm text-gray-600 mt-1">Цена считается по площади окон с этой услугой. У окна одна плёночная услуга — отмеченные окна перейдут на «${academyEsc(offering.name)}».</p>
    <div class="mt-3 grid gap-2">${rows.map(({ room, win }) => `<label class="flex items-center gap-3 rounded-lg border p-3" style="border-color:${win.offeringId === offering.id ? d.color : '#e2e8f0'}">
      <input type="checkbox" data-offering-window="${academyEsc(win.id)}" ${win.offeringId === offering.id || (!win.offeringId && free.length) ? 'checked' : ''} style="width:20px;height:20px">
      <span class="flex-1"><b>${academyEsc(room.name || 'Помещение')} · ${academyEsc(win.name || 'Окно')}</b><span class="block text-xs text-gray-500">${(windowActualAreaSqft(win) || 0).toFixed(1)} sq ft · ${win.offeringId ? (win.offeringId === offering.id ? 'уже эта услуга' : 'сейчас: ' + academyEsc(serviceOffering(win.offeringId)?.name || '—')) : 'без услуги'}</span></span></label>`).join('')}</div>
    <div class="flex gap-2 mt-4"><button class="btn-primary flex-1" style="background:${d.color}!important;border-color:${d.color}!important" onclick="saveOfferingWindows('${oid}','${jsQuote(offering.id)}','${returnTo}')">Поставить на отмеченные окна</button><button class="btn-ghost" onclick="closeModal()">Позже</button></div>
  </div></div>`;
  render();
}
function saveOfferingWindows(oid, offeringId, returnTo = 'card') {
  const o = getOrder(oid);
  const offering = serviceOffering(offeringId);
  if (!o || !offering || !orderUserCanSeeMoney(o, currentUser())) return;
  const checked = new Set([...document.querySelectorAll('[data-offering-window]')].filter(box => box.checked).map(box => box.dataset.offeringWindow));
  const film = projectOfferingCatalogId(o, offering.id);
  projectCardEdit(() => {
    offeringWindowCandidates(o, offering).forEach(({ win }) => {
      if (!checked.has(win.id) || win.offeringId === offering.id) return;
      applyWindowOffering(win, offering);
      if (film && !win.catalogId) { win.catalogId = film; win.filmType = catalogLabel(getCatalogItem(film)); }
    });
    o.offeringIds = [...new Set([...(o.offeringIds || []), offering.id])];
    projectEstimateMarkChanged(o, `Услуга «${offering.name}» поставлена на окна: ${checked.size}`);
    save();
  });
  closeModal();
  if (returnTo === 'direction' && typeof returnToProjectDirectionWindow === 'function') returnToProjectDirectionWindow();
  else render();
}

// ---------- ЛЕНТА ПРОЕКТА (Owner, 2026-10-24: approved mock-up «Лента проекта») ----------
// One page, sections in the order the work goes, each with a short summary and
// ONE button — as in TintWiz: Визиты → Клиент и объект → Услуги → Замер →
// Плёнка и закупка → КП → Оплата и счёт → Монтаж → Документы → История. The
// buttons open the same workspaces as before (projectCardOpenWorkspace etc.).
function projectFeedSection(num, title, body, { chip = '', button = '', id = '' } = {}) {
  return `<section class="project-feed-section" ${id ? `data-project-feed="${id}"` : ''}>
    <div class="project-feed-head"><h3><span class="project-feed-num">${num}</span>${academyEsc(title)}</h3>${chip}</div>
    <div class="project-feed-body">${body}</div>
    ${button ? `<div class="project-feed-actions">${button}</div>` : ''}
  </section>`;
}
function projectFeedChip(text, tone = 'quiet') {
  return `<span class="project-feed-chip ${tone}">${academyEsc(text)}</span>`;
}
function projectFeedRow(left, right = '', tone = '') {
  return `<div class="project-feed-row ${tone}"><span>${left}</span><b>${right}</b></div>`;
}
function projectFeedBtn(label, onclick, kind = 'ghost') {
  return `<button type="button" class="${kind === 'primary' ? 'btn-primary' : 'btn-ghost'} project-feed-btn" onclick="${onclick}">${academyEsc(label)}</button>`;
}
function projectFeedFilmRows(o) {
  const need = new Map();
  measureAllWindows(o).forEach(({ win }) => {
    if (!win.catalogId) return;
    need.set(win.catalogId, (need.get(win.catalogId) || 0) + (windowActualAreaSqft(win) || 0));
  });
  projectQuickLines(o).forEach(line => { if (line.catalogId && line.unit === 'sqft') need.set(line.catalogId, (need.get(line.catalogId) || 0) + (Number(line.qty) || 0)); });
  return [...need.entries()].map(([id, sqft]) => {
    const film = getCatalogItem(id);
    const stock = warehouseCatalogStockStats(id).availableSqft || 0;
    const request = typeof activeProjectFilmPurchaseRequest === 'function' ? activeProjectFilmPurchaseRequest(o.id, id) : null;
    const status = stock >= sqft ? '<span class="good">✓ на складе</span>' : request ? `<span class="warn">заявка ${academyEsc(request.number || '')}</span>` : '<span class="bad">нужна закупка</span>';
    return projectFeedRow(`${academyEsc(film ? catalogLabel(film) : 'Плёнка')} · нужно ${Math.round(sqft)} sq ft`, status);
  });
}
// Owner, 2026-10-24: «логика оплаты из КП не работает». The client signed the KP
// online and chose Zelle; the project still waited for «Отправить КП». Opening
// the project reads the KP from the server: viewed, signed, payment chosen, paid.
function premiumSyncClientProposal(oid) {
  const o = getOrder(oid);
  const prop = o && typeof getPremiumProposalByOrder === 'function' ? getPremiumProposalByOrder(oid) : null;
  if (!prop?.canonicalProposalId || typeof fetch !== 'function' || !orderUserCanSeeMoney(o, currentUser())) return;
  if (o.depositReceived && o.kpOnline?.depositStatus === 'paid') return;
  state._kpSyncAt = state._kpSyncAt || {};
  if (Date.now() - (state._kpSyncAt[oid] || 0) < 60000) return;
  state._kpSyncAt[oid] = Date.now();
  fetch(`/api/v1/proposals/${encodeURIComponent(prop.canonicalProposalId)}`, { credentials: 'include' })
    .then(response => (response.ok ? response.json() : null))
    .then(payload => { const server = payload?.data?.proposal; if (server) premiumApplyServerProposalState(oid, server); })
    .catch(() => {});
}
function premiumApplyServerProposalState(oid, server) {
  const o = getOrder(oid);
  const prop = typeof getPremiumProposalByOrder === 'function' ? getPremiumProposalByOrder(oid) : null;
  if (!o || !prop || !server) return false;
  const dep = server.deposit || null;
  const agreement = server.agreement || null;
  const kp = {
    depositId: dep?.deposit_id || '',
    depositStatus: dep?.status || '',
    amount: Number(dep?.amount) || 0,
    method: dep?.payment_method || '',
    signedAt: agreement?.status === 'signed' ? agreement.signed_at || '' : '',
    signer: agreement?.signer_name || '',
  };
  let changed = JSON.stringify(o.kpOnline || {}) !== JSON.stringify(kp);
  o.kpOnline = kp;
  o.timeline = o.timeline || [];
  if (server.client_viewed_at && ['Draft', 'Sent'].includes(prop.status)) {
    prop.status = 'Viewed';
    prop.viewedAt = prop.viewedAt || server.client_viewed_at;
    changed = true;
  }
  if (kp.signedAt && ['new', 'consultation_scheduled', 'measurement_scheduled', 'measurement_done', 'proposal_sent'].includes(o.status)) {
    o.timeline.push({ at: kp.signedAt, key: 'proposal_signed_online', by: null, note: `Клиент подписал КП онлайн${kp.signer ? ' · ' + kp.signer : ''}` });
    // The client's signature is the acceptance; no manager confirmation is asked.
    changeStatus(oid, 'proposal_accepted', null, { skipWorkflowGuard: true, openWorkspace: false, openMeasurement: false, openPayment: false });
    changed = true;
  }
  // A deposit marked in the CRM before the server could take it is sent again.
  if (o.depositReceived && dep?.deposit_id && dep.status !== 'paid' && typeof syncServerDepositPaid === 'function') setTimeout(() => syncServerDepositPaid(o), 0);
  if (dep?.status === 'paid' && !o.depositReceived) {
    const amount = Number(dep.amount) || 0;
    const date = String(dep.paid_at || new Date().toISOString()).slice(0, 10);
    if (amount > 0 && !orderPayments(o).some(pay => pay.kpDepositId === dep.deposit_id)) {
      addOrderPayment(oid, { amount, method: kpOnlinePaymentMethod(dep.payment_method) || 'card', date, note: 'Аванс по КП — оплачен онлайн' });
      const last = orderPayments(o)[orderPayments(o).length - 1];
      if (last) last.kpDepositId = dep.deposit_id;
    }
    markOrderDepositReceived(o, amount);
    changed = true;
  }
  if (changed) { save(); render(); }
  return changed;
}

// Owner, 2026-10-24: «и снова не могу назначить монтаж». R-261025-057 was paid in
// full by Zelle; the CRM still asked to make and send a KP before installation.
// Money received is the client's yes: the project goes on to installation.
function projectPaidWithoutProposal(o) {
  if (!o || !['measurement_done', 'proposal_sent'].includes(o.status) || o.paymentTerms === 'after_completion') return false;
  const revenue = orderRevenue(o);
  const paid = orderPaidTotal(o);
  if (!(revenue > 0) || !(paid > 0)) return false;
  return !!o.depositReceived || paid + 0.01 >= Math.min(companyDepositFor(revenue), revenue);
}
function projectPaidWithoutProposalAction(o) {
  return { icon: '💵', title: 'Оплачено → к монтажу', sub: `Клиент уже оплатил ${fmtMoney(orderPaidTotal(o))}. КП не нужно: расчёт подтвердится, дальше — точные размеры, производство и монтаж.`, variant: 'primary', onclick: `projectAcceptPaidWithoutProposal('${o.id}')` };
}
function projectAcceptPaidWithoutProposal(oid) {
  const o = getOrder(oid);
  if (!o || !orderUserCanSeeMoney(o, currentUser()) || !projectPaidWithoutProposal(o)) return;
  const issues = typeof projectEstimateReadiness === 'function' ? projectEstimateReadiness(o) : [];
  if (issues.length) { alert('Сначала поправьте расчёт: ' + issues.join(', ') + '.'); return; }
  const at = new Date().toISOString();
  o.timeline = o.timeline || [];
  if (!projectEstimateIsApproved(o)) {
    const internal = orderUserCanSeeInternalEconomics(o, currentUser());
    o.projectEstimateApprovedAt = at;
    o.projectEstimateApprovedBy = state.currentUserId;
    o.projectEstimateUpdatedAt = at;
    o.projectEstimateSnapshot = projectEstimateApprovalSnapshot(o, at, internal);
    o.projectEstimateFingerprint = projectEstimatePriceFingerprint(o);
    o.timeline.push({ at, key: 'project_estimate_approved', by: state.currentUserId, note: `Расчёт подтверждён оплатой: ${fmtMoney(orderRevenue(o))}` });
  }
  markOrderDepositReceived(o, orderPaidTotal(o));
  o.timeline.push({ at, key: 'accepted_by_payment', by: state.currentUserId, note: `Клиент оплатил ${fmtMoney(orderPaidTotal(o))} без КП — проект принят` });
  save();
  changeStatus(oid, 'proposal_accepted', state.currentUserId, { skipWorkflowGuard: true, openWorkspace: false, openMeasurement: false, openPayment: false });
  render();
}

/** The estimate the client signed for is approved again — without reopening the KP. */
function projectReapproveEstimate(o, note) {
  if (!o) return false;
  const at = new Date().toISOString();
  const internal = orderUserCanSeeInternalEconomics(o, currentUser());
  o.projectEstimateApprovedAt = at;
  o.projectEstimateApprovedBy = state.currentUserId;
  o.projectEstimateUpdatedAt = at;
  o.projectEstimateSnapshot = projectEstimateApprovalSnapshot(o, at, internal);
  o.projectEstimateFingerprint = projectEstimatePriceFingerprint(o);
  o.timeline = o.timeline || [];
  o.timeline.push({ at, key: 'project_estimate_approved', by: state.currentUserId, note: `${note || 'Расчёт подтверждён'}: ${fmtMoney(orderRevenue(o))}` });
  return true;
}
function projectReapproveEstimateFromProduction(oid) {
  const o = getOrder(oid);
  if (!o || !orderUserCanSeeMoney(o, currentUser())) return;
  projectReapproveEstimate(o, 'Расчёт подтверждён при подготовке производства');
  save();
  openProjectProductionWorkspace(oid);
}
/**
 * Owner's walkthrough, 2026-10-25: «Подтвердить готовность» stayed grey on
 * «недостаточно материала». The film is bought for the project (from China, cut
 * to size): a purchase request for the shortage lets production go on, and the
 * installation date is set after the film arrives.
 */
function projectOrderShortFilm(oid, catalogId) {
  const o = getOrder(oid);
  const catalog = getCatalogItem(catalogId);
  if (!o || !catalog || !orderUserCanManage(currentUser())) return;
  if (activeProjectFilmPurchaseRequest(o.id, catalogId)) { openProjectProductionWorkspace(oid); return; }
  const usage = filmPlanUsageByCatalog(o, calcFilmPlan(o))[catalogId];
  const stock = usage ? filmPlanInventoryStatus(catalogId, usage) : null;
  const shortages = stock?.shortages || [];
  const metres = Math.max(0.5, Math.ceil(shortages.reduce((sum, row) => sum + row.shortage, 0) * 1.1 * 2) / 2);
  const now = new Date().toISOString();
  const request = {
    id: 'pr_' + uid(), number: purchaseRequestNumber(), kind: 'film', itemId: catalog.id,
    itemNameSnapshot: catalogLabel(catalog), qty: metres, unit: 'м', orderId: o.id,
    vendorId: catalog.vendorId || null, responsibleId: null, neededBy: null,
    note: `Не хватает на проект ${o.number || ''}: ${usage ? usage.consumedSqft.toFixed(1) : '?'} sq ft по раскрою.`,
    requirements: shortages.map(row => ({ widthMm: row.width, requiredM: row.need, availableM: row.available, shortageM: row.shortage })),
    status: 'draft', source: 'project_production_shortage', requestedBy: state.currentUserId || null, createdAt: now, updatedAt: now,
  };
  db.purchaseRequests = db.purchaseRequests || [];
  db.purchaseRequests.push(request);
  o.purchaseRequestIds = Array.from(new Set([...(o.purchaseRequestIds || []), request.id]));
  o.timeline = o.timeline || [];
  o.timeline.push({ at: now, key: 'purchase_requested', by: state.currentUserId, note: `Заявка на закупку ${request.number}: ${request.itemNameSnapshot}, ${metres} м` });
  save();
  openProjectProductionWorkspace(oid);
}

function projectFeedHtml(o, c, u, ctx) {
  setTimeout(() => premiumSyncClientProposal(o.id), 0);
  const { canManage, canSeeMoney, primary, measureAction, recentTimeline } = ctx;
  const money = canSeeMoney;
  const lines = projectLines(o);
  const rooms = o.measurements?.rooms || [];
  const windows = measureAllWindows(o);
  const site = projectSiteInfo(o, c);
  const events = orderScheduledEvents(o).filter(ev => ev.type !== 'complaint' || o.status === 'complaint_open');
  const proposal = getPremiumProposalByOrder(o.id);
  const invoices = Array.isArray(o.invoices) ? o.invoices : [];
  const groups = projectServiceGroups(o);

  const visits = events.length
    ? events.map(ev => projectFeedRow(`${ev.icon} ${academyEsc(ev.title)}`, `${new Date(ev.at) < new Date() ? '✓ ' : ''}${fmtDateTime(ev.at)}`)).join('')
    : '<div class="project-feed-empty">Визитов пока нет</div>';
  const clientBody = `${projectFeedRow(academyEsc([c?.phone, c?.email].filter(Boolean).join(' · ') || 'контакты не заполнены'))}${projectFeedRow(`<span class="quiet">${academyEsc([orderSiteType(o) === 'COMMERCIAL' ? 'Commercial' : 'Residential', projectSiteSummary(o, c)].filter(Boolean).join(' · ') || 'доступ и парковка не заполнены')}</span>`)}`;
  const measureBody = rooms.length
    ? rooms.map(room => { const rw = (room.windows || []); const sq = rw.reduce((sum, win) => sum + (windowActualAreaSqft(win) || 0), 0); return projectFeedRow(`${academyEsc(room.name || 'Помещение')} · ${rw.length} ${projectWindowsWord(rw.length)}`, `${sq.toFixed(1)} sq ft`); }).join('') + projectFeedRow('Всего', `${windows.length} ${projectWindowsWord(windows.length)} · ${orderActualAreaSqft(o).toFixed(1)} sq ft`, 'total')
    : `<div class="project-feed-empty">${orderNeedsMeasurements(o) ? 'Замера ещё нет' : 'Замер не нужен: услуги без размеров'}</div>`;
  const measureChip = !windows.length ? '' : orderMeasurementVerificationIssues(o).length ? projectFeedChip('размеры клиента', 'warn') : projectFeedChip('точные размеры', 'good');
  const filmRows = projectFeedFilmRows(o);
  const proposalStatus = proposal ? (proposal.status || 'Draft') : '';
  const proposalChip = !proposal ? projectFeedChip('не собрано') : ['Accepted', 'Deposit Paid', 'Paid in Full'].includes(proposalStatus) ? projectFeedChip('подписано', 'good') : ['Sent', 'Viewed'].includes(proposalStatus) ? projectFeedChip(proposalStatus === 'Viewed' ? 'клиент смотрел' : 'отправлено', 'info') : projectFeedChip('черновик');
  const paid = Math.max(orderPaidTotal(o), Number(o.paid) || 0);
  const payBody = `${projectFeedRow('Аванс', o.depositReceived ? `✓ ${fmtMoney(orderExpectedDeposit(o) || 0)}` : fmtMoney(orderExpectedDeposit(o) || companyDepositFor(orderRevenue(o))))}${projectFeedRow('Оплачено', fmtMoney(paid))}${projectFeedRow('Остаток', fmtMoney(orderDebt(o)), orderDebt(o) > 0 ? 'total' : '')}${invoices.length ? projectFeedRow(`Счета: ${invoices.map(inv => academyEsc(inv.number)).join(', ')}`, '') : ''}`;
  const installBody = groups.length
    ? groups.map(group => { const plan = projectServiceAssignment(o, group); const crew = (plan?.installerIds || []).map(id => getUser(id)?.name).filter(Boolean).join(', '); return projectFeedRow(academyEsc(group.name), plan?.installationAt ? `${fmtDateTime(plan.installationAt)}${crew ? ' · ' + academyEsc(crew) : ''}` : '<span class="quiet">не назначено</span>'); }).join('')
    : '<div class="project-feed-empty">Сначала добавьте услуги</div>';
  const docs = `<div class="project-feed-chips">
      <button type="button" class="project-feed-doc" onclick="projectCardOpenWorkspace('documents')">${money ? 'КП и документы' : 'Документы'}</button>
      <button type="button" class="project-feed-doc" onclick="openWorkOrder('${o.id}')">Заказ-наряд</button>
      <button type="button" class="project-feed-doc" onclick="printTechnicalSheet('${o.id}')">ТЗ-лист</button>
      ${o.actSignature ? `<button type="button" class="project-feed-doc" onclick="openSignedActDocument('${o.id}')">Акт ✓</button>` : '<span class="project-feed-doc muted">Акт — после монтажа</span>'}
    </div>`;
  const history = recentTimeline.slice(0, 3).map(ev => `<div class="project-feed-row quiet"><span>${fmtDateTime(ev.at)} · ${academyEsc(T(ev.key))}${ev.note ? ' — ' + academyEsc(String(ev.note).slice(0, 60)) : ''}</span></div>`).join('') || '<div class="project-feed-empty">История пока пустая</div>';

  let n = 0;
  const next = () => ++n;
  return `<div class="project-feed">
    ${primary ? `<div class="project-feed-next"><div class="project-feed-next-kicker">Следующий шаг</div>${renderOrderActionCard(primary)}</div>` : ''}
    ${projectFeedSection(next(), 'Визиты', visits, { id: 'visits', chip: events.some(ev => new Date(ev.at) >= new Date()) ? projectFeedChip('запланировано', 'info') : '', button: canManage ? projectFeedBtn('Назначить визит', "projectCardOpenWorkspace('schedule')") : '' })}
    ${projectFeedSection(next(), 'Клиент и объект', clientBody, { id: 'client', button: projectFeedBtn(canManage ? 'Изменить' : 'Открыть', "projectCardOpenWorkspace('client')") })}
    ${lines.length || projectPendingSizedServices(o).length || canManage ? `<div class="project-feed-services" data-project-feed="services"><div class="project-feed-head"><h3><span class="project-feed-num">${next()}</span>Услуги</h3>${money ? `<b>${fmtMoney(orderRevenue(o))}</b>` : ''}</div>${renderProjectCardServices(o, { money, economics: ctx.canSeeInternalEconomics, manage: canManage })}</div>` : ''}
    ${projectFeedSection(next(), 'Замер', measureBody, { id: 'measure', chip: measureChip, button: projectFeedBtn('Открыть замер', measureAction, windows.length ? 'ghost' : 'primary') })}
    ${money && filmRows.length ? projectFeedSection(next(), 'Плёнка и закупка', filmRows.join(''), { id: 'film', button: projectFeedBtn('Открыть закупку', 'openProjectPurchaseRequests()') }) : ''}
    ${money ? projectFeedSection(next(), 'КП', (proposal ? projectFeedRow(`КП ${academyEsc(proposal.number || '')}`, fmtMoney(premiumProposalCalc(proposal)?.total || orderRevenue(o))) : '<div class="project-feed-empty">Соберите КП, когда услуги посчитаны</div>') + (projectProposalOptionalOfferings(o).length ? projectFeedRow(`<span class="quiet">Опции на выбор клиента: ${projectProposalOptionalOfferings(o).map(item => academyEsc(item.offering.name)).join(', ')}</span>`) : '') + ((o.kpClientOptions || []).length ? projectFeedRow(`Клиент выбрал: ${o.kpClientOptions.map(item => academyEsc(item.title)).join(', ')}`, '') : ''), { id: 'kp', chip: proposalChip, button: projectFeedBtn(proposal ? 'Открыть КП' : 'Собрать КП', `openProposalWizard('${o.id}')`, proposal ? 'ghost' : 'primary') + (proposal?.canonicalProposalId && proposal.status !== 'Draft' ? projectFeedBtn('Забрать выбор клиента', `premiumApplyClientOptions('${o.id}')`) : '') }) : ''}
    ${money ? projectFeedSection(next(), 'Оплата и счёт', payBody, { id: 'pay', button: `${projectFeedBtn('Счёт (Invoice)', `openProjectInvoice('${o.id}')`)}${orderDebt(o) > 0.01 ? projectFeedBtn('Отметить оплату', `openPaymentModal('${o.id}',{kind:'final'})`) : ''}` }) : ''}
    ${projectFeedSection(next(), 'Монтаж', installBody, { id: 'install', button: canManage ? projectFeedBtn('Назначить монтаж', "projectCardOpenWorkspace('schedule')") : '' })}
    ${projectFeedSection(next(), 'Документы', docs, { id: 'docs' })}
    ${projectFeedSection(next(), 'История и файлы', history, { id: 'history', button: projectFeedBtn('Вся история и фото', "projectCardOpenWorkspace('history')") })}
  </div>`;
}

// ---------- ОПЦИИ В КП: КЛИЕНТ ОТМЕЧАЕТ САМ (Owner, 2026-10-24) ----------
// «На замере подбираем плёнку, а в КП добавляем допы, и клиент сам выбирает»:
// smart standard = power supply with remotes; the KP offers voice control, a
// wall switch, a second remote, a 10-year warranty at $5/month. Services marked
// «Опция в КП» in the directory go to the KP unticked; the client ticks them on
// his page; «Забрать выбор клиента» puts the ticked ones into the project.
function projectProposalOptionalOfferings(o, { all = false } = {}) {
  const inProject = new Set([o?.offeringId, ...(o?.offeringIds || []), ...projectLines(o).map(line => line.offeringId)].filter(Boolean));
  const excluded = new Set(o?.kpOptionsExcluded || []);
  const directions = projectDirectionGroups(o).filter(direction => !projectDirectionExcluded(o, direction.key)).map(direction => direction.key);
  const seen = new Set();
  const out = [];
  directions.forEach(key => serviceOfferingsFor(serviceOfferingDirection(key)).forEach(offering => {
    if (seen.has(offering.id) || !offering.proposalOptional || offering.active === false || serviceOfferingIsDraft(offering) || !(Number(offering.pricePerSqft) > 0) || serviceOfferingNeedsSizes(offering) || inProject.has(offering.id)) return;
    seen.add(offering.id);
    if (all || !excluded.has(offering.id)) out.push({ offering, direction: key });
  }));
  return out;
}
function projectProposalOptionToggle(oid, offeringId, offered) {
  const o = getOrder(oid);
  if (!o || !orderUserCanSeeMoney(o, currentUser())) return;
  const set = new Set(o.kpOptionsExcluded || []);
  if (offered) set.delete(offeringId); else set.add(offeringId);
  o.kpOptionsExcluded = [...set];
  save();
  if (typeof openProposalWizard === 'function' && state._proposalWizard?.oid === oid) openProposalWizard(oid, 'compose');
}
function projectProposalOptionPriceText(offering) {
  const price = Number(offering.pricePerSqft) || 0;
  return offering.monthly ? `${fmtMoney(price)} / мес` : fmtMoney(price);
}
function projectProposalOptionsHtml(o) {
  const rows = projectProposalOptionalOfferings(o, { all: true });
  if (!rows.length) return `<div class="rp-kpwin-options"><div class="rp-kpwin-options-head">Опции для клиента</div><div class="rp-dirwin-hint">Отметьте в «Услугах и ценах» услуги как «Опция в КП» — например, голосовое управление, выключатель, второй пульт, расширенную гарантию. Клиент выберет их сам в КП.</div></div>`;
  const excluded = new Set(o.kpOptionsExcluded || []);
  return `<div class="rp-kpwin-options"><div class="rp-kpwin-options-head">Опции для клиента — он отмечает сам</div>
    ${rows.map(({ offering, direction }) => { const tone = rpDir(direction); return `<label class="rp-kpwin-option" style="--dir-color:${academyEsc(tone.color)}"><input type="checkbox" ${excluded.has(offering.id) ? '' : 'checked'} onchange="projectProposalOptionToggle('${o.id}','${jsQuote(offering.id)}',this.checked)"><span class="rp-kpwin-dot"></span><span class="flex-1">${academyEsc(offering.name)}</span><b>${projectProposalOptionPriceText(offering)}</b></label>`; }).join('')}
    <div class="rp-dirwin-hint">Отмеченные попадут в КП без галочки — клиент добавит то, что ему нужно, сумма и аванс пересчитаются.</div></div>`;
}
/** KP lines for the options: optional, unticked; a subscription shows its monthly price and adds $0 now. */
function projectProposalOptionItems(o) {
  return projectProposalOptionalOfferings(o).map(({ offering, direction }) => {
    const price = Math.round((Number(offering.pricePerSqft) || 0) * 100) / 100;
    const title = offering.nameEn || serviceOfferingEnglishGuess(offering) || offering.name;
    return {
      service_code: canonicalServiceCodeForOrderService(direction) || 'SOLAR_FILM',
      title_en: offering.monthly ? `${title} — $${price}/month` : title,
      description_en: offering.description || (offering.monthly ? 'Monthly subscription, billed separately.' : 'Optional upgrade.'),
      quantity: 1,
      unit_label: offering.monthly ? 'month' : (serviceOfferingUnitShort(offering) || 'item'),
      line_price: offering.monthly ? 0 : price,
      item_kind: 'addon',
      is_optional: true,
      client_selected: false,
      dynamic_fields: { offering_id: offering.id, optional: true, billing: offering.monthly ? 'monthly' : 'one_time', monthly_price: offering.monthly ? price : null, direction },
    };
  });
}
/** The options the client ticked on his KP page come into the project as its lines. */
async function premiumApplyClientOptions(oid, { quiet = false } = {}) {
  const o = getOrder(oid);
  const prop = getPremiumProposalByOrder(oid);
  if (!o || !prop?.canonicalProposalId || !orderUserCanSeeMoney(o, currentUser())) { if (!quiet) alert('КП ещё не опубликовано — клиент пока ничего не выбирал.'); return 0; }
  try {
    const response = await fetch(`/api/v1/proposals/${encodeURIComponent(prop.canonicalProposalId)}`, { credentials: 'same-origin', cache: 'no-store' });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.errors?.[0]?.message || `КП ${response.status}`);
    const items = Array.isArray(payload?.data?.proposal?.items) ? payload.data.proposal.items : [];
    const chosen = items.filter(item => item.is_optional && item.client_selected && item.dynamic_fields?.offering_id);
    const fresh = getOrder(oid);
    const have = new Set([...(fresh.offeringIds || []), ...projectLines(fresh).map(line => line.offeringId), ...(fresh.subscriptions || []).map(sub => sub.offeringId)].filter(Boolean));
    // Owner's walkthrough, 2026-10-25: the options the client ticked reopened the
    // estimate after he signed, and production refused «расчёт не подтверждён».
    // What the client signed for is the approved estimate.
    const wasApproved = projectEstimateIsApproved(fresh);
    let added = 0;
    projectCardEdit(() => chosen.forEach(item => {
      const id = item.dynamic_fields.offering_id;
      if (have.has(id) || !serviceOffering(id)) return;
      if (item.dynamic_fields.billing === 'monthly') {
        // A subscription is billed monthly: not a line, no crew, not in the price.
        fresh.subscriptions = fresh.subscriptions || [];
        fresh.subscriptions.push({ offeringId: id, name: serviceOffering(id).name, monthlyPrice: Number(item.dynamic_fields.monthly_price) || Number(serviceOffering(id).pricePerSqft) || 0, since: new Date().toISOString() });
      } else {
        projectAddOfferingLine(oid, id, item.dynamic_fields.direction || '');
      }
      have.add(id); added++;
    }));
    if (added && (wasApproved || projectProposalAccepted(fresh))) projectReapproveEstimate(fresh, 'Клиент выбрал опции в КП');
    fresh.kpClientOptions = chosen.map(item => ({ offeringId: item.dynamic_fields.offering_id, title: item.title_en, billing: item.dynamic_fields.billing || 'one_time', monthly: item.dynamic_fields.monthly_price || null }));
    fresh.kpClientOptionsAt = new Date().toISOString();
    if (added) { fresh.timeline = fresh.timeline || []; fresh.timeline.push({ at: fresh.kpClientOptionsAt, key: 'kp_client_options', by: state.currentUserId, note: `Клиент выбрал в КП: ${chosen.map(item => item.title_en).join(', ')}` }); }
    save(); render();
    if (!quiet) alert(added ? `Добавлено в проект: ${added}. ${chosen.map(item => item.title_en).join(', ')}` : chosen.length ? 'Выбранные клиентом опции уже в проекте.' : 'Клиент пока не отметил ни одной опции.');
    return added;
  } catch (error) {
    if (!quiet) alert('Не удалось забрать выбор клиента: ' + (error?.message || error));
    return 0;
  }
}

// ---------- УСЛУГИ ДОБАВЛЯЮТСЯ ПРЯМО В ОКНЕ НАПРАВЛЕНИЯ (Owner, 2026-10-24) ----------
// «Выбираем направление — оно открывается в отдельном окне, и тут же внутри
// добавляешь услуги, чтобы не прыгало туда-сюда». The services step lists the
// direction's services as cards; a tap adds it (a film is picked right there,
// in stock first); a new direction is chosen from a short list and opens its
// window. The cashier stays for the new-project form only.
function projectDirectionAddableOfferings(o, directionKey) {
  const inProject = new Set([o?.offeringId, ...(o?.offeringIds || []), ...projectLines(o).map(line => line.offeringId)].filter(Boolean));
  return serviceOfferingsFor(serviceOfferingDirection(directionKey)).filter(offering => offering.active !== false && !serviceOfferingIsDraft(offering) && !inProject.has(offering.id));
}
function projectDirectionPickService(oid, directionKey, offeringId) {
  const offering = serviceOffering(offeringId);
  const o = getOrder(oid);
  if (!o || !offering) return;
  const films = serviceCashierFilms(offering);
  if (films.length && serviceOfferingNeedsSizes(offering)) {
    state._directionWindow = { ...(state._directionWindow || {}), oid, key: directionKey, step: 'services', pick: offeringId };
    openProjectDirectionWindow(oid, directionKey, 'services');
    return;
  }
  projectDirectionAddService(oid, directionKey, offeringId, '');
}
function projectDirectionAddService(oid, directionKey, offeringId, catalogId = '') {
  const o = getOrder(oid);
  const offering = serviceOffering(offeringId);
  if (!o || !offering || !orderUserCanSeeMoney(o, currentUser())) return;
  const film = catalogId && serviceCashierFilms(offering).some(item => item.id === catalogId) ? getCatalogItem(catalogId) : null;
  projectCardEdit(() => {
    if (film) o.offeringCatalogIds = { ...(o.offeringCatalogIds || {}), [offering.id]: film.id };
    projectAddOfferingLine(oid, offering.id, directionKey);
    if (film) (o.measurements?.rooms || []).forEach(room => (room.windows || []).forEach(win => {
      if (win.offeringId === offering.id && !win.catalogId) { win.catalogId = film.id; win.filmType = catalogLabel(film); }
    }));
    save();
  });
  state._directionWindow = { ...(state._directionWindow || {}), oid, key: directionKey, step: 'services', pick: '' };
  openProjectDirectionWindow(oid, directionKey, 'services');
}
function projectDirectionAddHtml(o, directionKey) {
  const w = state._directionWindow || {};
  const picked = w.oid === o.id && w.key === directionKey && w.pick ? serviceOffering(w.pick) : null;
  if (picked) {
    const films = serviceCashierFilms(picked);
    const stock = films.filter(film => warehouseCatalogStockStats(film.id).availableSqft > 0);
    const order = films.filter(film => !(warehouseCatalogStockStats(film.id).availableSqft > 0));
    const filmBtn = film => `<button type="button" class="rp-dirwin-pick" onclick="projectDirectionAddService('${o.id}','${jsQuote(directionKey)}','${jsQuote(picked.id)}','${jsQuote(film.id)}')"><b>${academyEsc(catalogLabel(film))}</b><span>${warehouseCatalogStockStats(film.id).availableSqft > 0 ? `${warehouseCatalogStockStats(film.id).availableSqft.toFixed(0)} sq ft на складе` : 'под заказ'}</span></button>`;
    return `<div class="rp-dirwin-adder"><div class="rp-dirwin-group">${academyEsc(picked.name)} — какая плёнка?</div>
      <button type="button" class="rp-dirwin-pick soft" onclick="projectDirectionAddService('${o.id}','${jsQuote(directionKey)}','${jsQuote(picked.id)}','')"><b>Уточним на замере</b><span>плёнку выберет замер или менеджер</span></button>
      ${stock.length ? `<div class="rp-dirwin-sub">На складе</div>${stock.map(filmBtn).join('')}` : ''}
      ${order.length ? `<div class="rp-dirwin-sub">Нет на складе — под заказ</div>${order.map(filmBtn).join('')}` : ''}
      <button type="button" class="btn-ghost w-full mt-2" onclick="state._directionWindow.pick=''; openProjectDirectionWindow('${o.id}','${jsQuote(directionKey)}','services')">← Другая услуга</button></div>`;
  }
  const list = projectDirectionAddableOfferings(o, directionKey);
  if (!list.length) return '<div class="rp-dirwin-hint">Все услуги направления уже в проекте.</div>';
  return `<div class="rp-dirwin-adder"><div class="rp-dirwin-group">Добавить услугу</div>
    ${list.map(offering => `<button type="button" class="rp-dirwin-pick" onclick="projectDirectionPickService('${o.id}','${jsQuote(directionKey)}','${jsQuote(offering.id)}')"><b>${academyEsc(offering.name)}${offering.proposalOptional ? ' <small>опция в КП</small>' : ''}</b><span>${fmtMoney(Number(offering.pricePerSqft) || 0)} / ${offering.monthly ? 'мес' : academyEsc(serviceOfferingUnitShort(offering))}${serviceOfferingNeedsSizes(offering) ? ' · по замеру' : ''}</span></button>`).join('')}
  </div>`;
}
/** «+ Добавить направление»: a short list; the chosen direction opens its own window. */
function openProjectDirectionPicker(oid) {
  const o = getOrder(oid);
  if (!o || !orderUserCanSeeMoney(o, currentUser())) return;
  const have = new Set(projectDirectionGroups(o).map(direction => direction.key));
  const options = ORDER_PRIMARY_SERVICES.filter(direction => !have.has(direction.id) && serviceOfferingsFor(serviceOfferingDirection(direction.id)).some(offering => offering.active !== false && !serviceOfferingIsDraft(offering)));
  state.modal = `<div class="modal-backdrop" onclick="if(event.target===this) closeModal()"><div class="modal-content workspace-modal p-5" style="max-width:30rem" onclick="event.stopPropagation()" data-rp-keep-layout>
    <button type="button" class="workspace-back mb-2" onclick="closeModal()">← К проекту</button>
    <h3 class="font-black text-xl">Какое направление добавить?</h3>
    <div class="grid gap-2 mt-3">${options.map(direction => { const tone = rpDir(direction.id); return `<button type="button" class="rp-dirwin-pick" style="border-left:4px solid ${academyEsc(tone.color)}" onclick="closeModal(); openProjectDirectionWindow('${o.id}','${jsQuote(direction.id)}','services')"><b>${direction.icon} ${academyEsc(direction.title)}</b><span>${academyEsc(direction.desc || '')}</span></button>`; }).join('') || '<div class="rp-dirwin-hint">Все направления уже в проекте.</div>'}</div>
  </div></div>`;
  render();
}
