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
function projectCashierToggleAdd(oid) {
  state.projectCashierAdding = { ...(state.projectCashierAdding || {}), [oid]: !(state.projectCashierAdding?.[oid] === true) };
  preservePositionForNextRender();
  render();
}
function projectCashierMapHtml(o, directions, { money = false, edit = false } = {}) {
  // Keep the order local: production-stages.js is composed into the legacy page
  // as functions only, so top-level constants disappear in the production build.
  const directionOrder = ['smart_film', 'solar_film', 'protective_film', 'decorative_film'];
  const included = directions.filter(direction => !projectDirectionExcluded(o, direction.key));
  const primaryKey = included[0]?.key || '';
  // Owner, 2026-10-26 («как касса: карточки, тап, итог собирается сам»): the
  // project opens on the same four direction tiles as the new-project cashier.
  // A direction in the project is filled with its colour; one not in the project
  // is a tinted «+ добавить» tile. Either tap opens the direction's own window,
  // where services are added and removed — no picker in between. Directions
  // outside the four (general works) stay as their cards below.
  const byKey = new Map(directions.map(direction => [direction.key, direction]));
  // Owner, 2026-10-28: «нужно убрать другие ненужные окна по направлениям, это
  // создаёт лишний шум; изменить состав — через кнопку». Only the directions in
  // the project are tiles; the rest hide behind «+ Добавить направление».
  const missing = [];
  const tiles = directionOrder.map(key => {
    const service = ORDER_PRIMARY_SERVICES.find(item => item.id === key);
    if (!service) return '';
    const direction = byKey.get(key);
    const token = typeof rpDir === 'function' ? rpDir(key) : null;
    const color = token?.color || '#2563eb', tint = token?.tint || '#eff6ff', deep = token?.deep || color;
    const icon = typeof rpDirIcon === 'function' ? rpDirIcon(key, 18) : service.icon;
    if (!direction) {
      if (!(money && edit)) return '';
      missing.push(`<button type="button" class="project-cashier-direction add" style="--direction-color:${academyEsc(color)};--direction-tint:${academyEsc(tint)};--direction-deep:${academyEsc(deep)}" onclick="openProjectDirectionWindow('${o.id}','${jsQuote(key)}','services')" aria-label="Добавить направление ${academyEsc(service.title)}"><span class="project-cashier-direction-icon">${icon}</span><span><b>${academyEsc(service.short || service.title)}</b><span>+ добавить</span></span></button>`);
      return '';
    }
    const count = direction.lines.length + direction.pending.length;
    const total = direction.lines.filter(line => !line.excluded).reduce((sum, line) => sum + (Number(line.price) || 0), 0);
    const excluded = projectDirectionExcluded(o, direction.key);
    const windows = measureAllWindows(o).filter(({ win }) => projectDirectionKeyFromScope(win.measureScope || orderMeasureScope(o), win.offeringId) === key).length;
    return `<button type="button" class="project-cashier-direction on ${excluded ? 'excluded' : ''}" style="--direction-color:${academyEsc(color)};--direction-tint:${academyEsc(tint)};--direction-deep:${academyEsc(deep)}" onclick="openProjectDirectionWindow('${o.id}','${jsQuote(direction.key)}')" aria-label="Открыть направление ${academyEsc(direction.title)}"><span class="project-cashier-direction-icon">${icon}</span><span><b>${academyEsc(service.short || direction.title)}</b><span>${count} ${projectPlural(count, 'услуга', 'услуги', 'услуг')}${windows ? ` · ${windows} ок.` : ''}${money && total ? ` · ${fmtMoney(total)}` : ''}${excluded ? ' · вне расчёта' : ''}</span></span>${direction.key === primaryKey && included.length > 1 ? '<span class="project-cashier-primary">основное</span>' : ''}</button>`;
  }).join('');
  const active = (tiles.match(/project-cashier-direction on/g) || []).length;
  const adding = !active || state.projectCashierAdding?.[o.id] === true;
  const addHtml = !missing.length ? '' : adding
    ? `<div class="project-cashier-add-row">${missing.join('')}${active ? `<button type="button" class="project-cashier-add-cancel" onclick="projectCashierToggleAdd('${o.id}')">Отмена</button>` : ''}</div>`
    : `<button type="button" class="project-cashier-add-toggle" onclick="projectCashierToggleAdd('${o.id}')">+ Добавить направление</button>`;
  const rooms = o.measurements?.rooms?.length || 0;
  const windows = measureAllWindows(o).length;
  const area = orderActualAreaSqft(o);
  // The three buttons that stood here (Замер, Расчёт / КП, Заказ-наряд) repeated
  // the feed sections below; only the facts stay, so the square footage is
  // always in view (Owner, 2026-10-26: «нет метража, сто кнопок»).
  return `<div class="project-cashier-map" data-project-cashier-map>
    ${active ? `<div class="project-cashier-directions four count-${Math.min(active, 4)}">${tiles}</div>` : ''}${addHtml}
    <div class="project-cashier-flow"><div class="project-cashier-flow-facts"><span><b>${rooms}</b> ${projectPlural(rooms, 'помещение', 'помещения', 'помещений')}</span><span><b>${windows}</b> ${projectWindowsWord(windows)}</span><span><b>${area.toFixed(1)}</b> sq ft</span></div></div>
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
    const priceEditable = edit && line.kind !== 'included' && (line.kind === 'windows' || line.kind === 'work' || line.kind === 'quick' || line.kind === 'quantity');
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
    // Owner, 2026-10-25: «понятный механизм: выбираешь направление — открывается
    // отдельное окно, и уже в нём добавляешь и удаляешь лишнее». The card shows
    // each direction as one tile; services are added and removed in its window.
    const tone = typeof rpDir === 'function' ? rpDir(direction.key) : null;
    const count = directionLines.length + direction.pending.length;
    const open = `openProjectDirectionWindow('${o.id}','${jsQuote(direction.key)}')`;
    const compactRow = line => `<button type="button" class="project-direction-line" onclick="${open}"><span>${line.kind === 'included' ? '↳ ' : ''}${academyEsc(line.name)}</span><span>${academyEsc(projectLineQtyText(line))}${money ? ` · ${line.kind === 'included' ? 'в пакете' : fmtMoney(line.price)}` : ''}</span></button>`;
    const compactPending = offering => `<button type="button" class="project-direction-line pending" onclick="${open}"><span>${academyEsc(offering.name)}</span><span>нужен замер</span></button>`;
    return `<section class="project-direction-card ${excluded?'excluded':''}" data-project-direction="${academyEsc(direction.key)}" style="--direction-color:${academyEsc(tone?.color || '#2563eb')}">
      <button type="button" class="project-direction-tile" onclick="${open}" aria-label="Открыть направление ${academyEsc(direction.title)}">
        <span class="project-direction-tile-icon">${direction.icon}</span>
        <span class="project-direction-tile-text"><b>${academyEsc(direction.title)}</b><span>${count} ${projectPlural(count, 'услуга', 'услуги', 'услуг')}${excluded ? ' · Не входит в расчёт и КП' : ` · ${academyEsc(status)}`}${!excluded && dates.length ? ` · ${academyEsc(fmtDateTime(dates[0]))}` : ''}${economics && !excluded ? ` · материал+работа ${fmtMoney(amount('materialCost') + amount('installerPay'))}` : ''}</span></span>
        ${money ? `<span class="project-direction-tile-sum">${fmtMoney(amount('price'))}</span>` : ''}
        <span class="project-direction-tile-arrow">›</span>
      </button>
      <div class="project-direction-services">${production ? directionLines.map(row).join('') + direction.pending.map(pendingRow).join('') : directionLines.map(compactRow).join('') + direction.pending.map(compactPending).join('')}${!directionLines.length && !direction.pending.length ? `<button type="button" class="project-direction-line pending" onclick="${open}"><span>Услуг пока нет</span><span>добавить →</span></button>` : ''}</div>
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
      // A service that runs several days shows on each of them (Owner, 2026-10-25).
      const kind = typeof installWorkKind === 'function' ? installWorkKind(group) : 'film';
      const end = typeof installPlanEnd === 'function' ? installPlanEnd(assignment) : null;
      const dayKey = d => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
      const days = [new Date(dt)];
      const cursor = new Date(dt);
      while (end && days.length < 14) {
        cursor.setDate(cursor.getDate() + 1);
        cursor.setHours(dt.getHours(), dt.getMinutes(), 0, 0);
        if (dayKey(cursor) > dayKey(end)) break;
        days.push(new Date(cursor));
      }
      return days.map((day, index) => ({ id: `${o.id}_service_${group.id}${index ? `_${index}` : ''}`, o: scoped, kind: type, dt: day, info, note: group.name, service: { name: group.name, kind, end, day: index + 1, days: days.length } }));
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
/** What the ✕ in the direction window may take out: not a package part, not finished work. */
function projectDirectionLineRemovable(o, line) {
  if (!line || line.kind === 'included' || line.kind === 'quick') return false;
  if (projectServiceProgress(o, line.key).status === 'done') return false;
  return ['quantity', 'work'].includes(line.kind) ? !!line.sources?.[0]?.id && !line.sources[0].includedBy : line.kind === 'windows' && !!line.offeringId;
}
function projectDirectionRemoveLine(oid, directionKey, lineKey) {
  const o = getOrder(oid);
  if (!o || !orderUserCanSeeMoney(o, currentUser())) return;
  const line = projectLines(o).find(item => item.key === lineKey);
  if (!projectDirectionLineRemovable(o, line)) return;
  if (line.kind === 'windows') {
    const count = line.windows.length;
    if (!confirm(`Убрать «${line.name}» из проекта? Размеры ${count} ${projectWindowsWord(count)} останутся в замере — им можно выбрать другую услугу.`)) return;
    measureAllWindows(o).forEach(({ win }) => { if (win.offeringId === line.offeringId) { win.offeringId = ''; win.catalogId = ''; } });
    o.offeringIds = (o.offeringIds || []).filter(id => id !== line.offeringId);
    syncProjectIncludedServices(o);
    projectPrunePlans(o);
    projectCardSyncCrew(o);
    projectEstimateMarkChanged(o, `Убрана услуга «${line.name}»`);
    save();
  } else {
    if (!confirm(`Убрать «${line.name}» из проекта?`)) return;
    projectCardDeleteService(oid, line.sources[0].id);
  }
  openProjectDirectionWindow(oid, directionKey, 'services');
}
function projectDirectionRemovePending(oid, directionKey, offeringId) {
  const o = getOrder(oid);
  if (!o || o.offeringId === offeringId) return;
  if (!confirm(`Убрать «${serviceOffering(offeringId)?.name || 'услугу'}» из проекта?`)) return;
  projectCardRemovePending(oid, offeringId);
  openProjectDirectionWindow(oid, directionKey, 'services');
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
  const removeBtn = (onclick, name) => (edit && step === 'services' ? `<button type="button" class="rp-dirwin-remove" onclick="${onclick}" aria-label="Убрать ${academyEsc(name)}" title="Убрать из проекта">✕</button>` : '');
  const lineRemove = line => (projectDirectionLineRemovable(o, line) ? removeBtn(`projectDirectionRemoveLine('${o.id}','${jsQuote(directionKey)}','${jsQuote(line.key)}')`, line.name) : '');
  const lineRow = line => `<div class="rp-dirwin-row"><div><b>${line.kind === 'included' ? '↳ ' : ''}${academyEsc(line.name)}</b><span>${academyEsc(projectLineNote(line))}</span></div><div class="rp-dirwin-num">${academyEsc(projectLineQtyText(line))}${money ? `<b>${line.kind === 'included' ? 'в пакете' : fmtMoney(line.price)}</b>` : ''}</div>${lineRemove(line)}</div>`;
  const pendingRow = offering => { const film = getCatalogItem(projectOfferingCatalogId(o, offering.id)); return `<div class="rp-dirwin-row pending"><div><b>${academyEsc(offering.name)}</b><span>${film ? academyEsc(catalogLabel(film)) : 'материал уточним на замере'}</span></div>${(typeof offeringWindowCandidates === 'function' && offeringWindowCandidates(o, offering).length) ? `<button type="button" class="btn-ghost text-xs" onclick="openOfferingWindowsPicker('${o.id}','${jsQuote(offering.id)}','direction')">Выбрать окна</button>` : '<div class="rp-dirwin-num">нужен замер</div>'}${o.offeringId !== offering.id ? removeBtn(`projectDirectionRemovePending('${o.id}','${jsQuote(directionKey)}','${jsQuote(offering.id)}')`, offering.name) : ''}</div>`; };
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
    // Owner, 2026-10-26: the manager sees the price sheet and types a price by hand.
    body = `<p class="rp-dirwin-hint">${edit ? 'Цена из прайса — её можно поменять вручную: впишите цену за единицу, сумма пересчитается.' : 'Цена посчитана из услуг и замера этого направления.'}</p>
      ${direction.lines.map(line => (edit && money ? projectPriceRowHtml(o, directionKey, line) : lineRow(line))).join('')}${direction.pending.map(pendingRow).join('')}
      ${money ? `<div class="rp-dirwin-total"><span>Итого направление</span><b>${fmtMoney(total)}</b></div>` : ''}
      ${owner && total > 0 ? `<div class="rp-dirwin-owner"><div class="rp-dirwin-group">Видит только владелец</div><div class="rp-dirwin-row"><div><b>Материал и специалисты по установке</b><span>по строкам направления</span></div><div class="rp-dirwin-num"><b>${fmtMoney(cost)}</b></div></div><div class="rp-dirwin-row"><div><b>Прямая маржа</b><span>без общих расходов проекта</span></div><div class="rp-dirwin-num"><b>${fmtMoney(total - cost)} · ${total ? Math.round((total - cost) / total * 100) : 0}%</b></div></div></div>` : ''}
      ${money ? `<button type="button" class="btn-ghost w-full mt-2" onclick="state._directionWindow=null;openProjectEstimateWorkspace('${o.id}')">Полный расчёт проекта и КП</button>` : ''}`;
  } else {
    const excludedDir = projectDirectionExcluded(o, directionKey);
    body = `<div class="rp-dirwin-sub">В проекте</div>
      ${direction.lines.map(lineRow).join('')}${direction.pending.map(pendingRow).join('')}
      ${!direction.lines.length && !direction.pending.length ? '<div class="rp-dirwin-empty">Услуг пока нет — добавьте ниже.</div>' : ''}
      ${edit ? projectDirectionAddHtml(o, directionKey) : ''}
      ${edit && money ? `<label class="rp-dirwin-toggle"><input type="checkbox" ${excludedDir ? '' : 'checked'} onchange="projectToggleDirectionIncluded('${o.id}','${jsQuote(directionKey)}',this.checked); openProjectDirectionWindow('${o.id}','${jsQuote(directionKey)}','services')"> Направление входит в расчёт и КП</label>` : ''}`;
  }
  const next = index < steps.length - 1
    ? `<button type="button" class="btn-primary rp-dirwin-next" style="background:var(--dir-color) !important;border-color:var(--dir-color) !important;color:#fff !important" onclick="openProjectDirectionWindow('${o.id}','${jsQuote(directionKey)}','${steps[index + 1].id}')">Далее: ${steps[index + 1].label.toLowerCase()} →</button>`
    : `<button type="button" class="btn-primary rp-dirwin-next" style="background:var(--dir-color) !important;border-color:var(--dir-color) !important;color:#fff !important" onclick="closeProjectDirectionWindow()">✓ Готово — к проекту</button>`;
  return `<div class="modal-backdrop order-workspace-backdrop" onclick="if(event.target===this) closeProjectDirectionWindow()">
    <div class="modal-content workspace-modal order-workspace-modal rp-dirwin" style="--workspace-color:${academyEsc(tone.color)};--dir-color:${academyEsc(tone.color)};--dir-tint:${academyEsc(tone.tint)};--dir-deep:${academyEsc(tone.deep)}" onclick="event.stopPropagation()" role="dialog" aria-modal="true" aria-label="Направление ${academyEsc(direction.title)}">
      <header class="order-workspace-modal-head rp-dirwin-head">
        <button type="button" class="workspace-back" onclick="closeProjectDirectionWindow()">← К проекту</button>
        <div class="order-workspace-modal-heading"><span class="order-workspace-modal-icon rp-dirwin-icon">${rpIcon(tone, 20)}</span><div><div class="order-workspace-modal-kicker">${academyEsc(o.number)}${money ? ` · <span class="rp-dirwin-sum">${fmtMoney(total)}</span>` : ''}</div><h3>${academyEsc(direction.title)}</h3></div></div>
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
    body = `${proposalWizardSummaryHtml(o, groups, total, deposit, client)}
      <p class="rp-dirwin-hint">Так клиент увидит КП на телефоне. Язык и всё содержимое — как у клиента.</p>
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
      ${!['Accepted', 'Payment Pending', 'Deposit Paid', 'Paid in Full'].includes(prop.status) ? `<button type="button" class="rp-kpwin-channel rp-kpwin-agreed" onclick="projectAcceptProposalOffline('${o.id}')"><b>🤝 Клиент уже согласен</b><span>договор, звонок или переписка — сразу «КП принято»</span></button>` : ''}
      <button type="button" class="btn-ghost w-full mt-2" onclick="state._proposalWizard=null; openPremiumProposalManagerModal('${prop.token}')">Все настройки КП: оплата, версии</button>`;
    foot = `<button type="button" class="btn-primary rp-dirwin-next" style="background:var(--dir-color) !important;border-color:var(--dir-color) !important;color:#fff !important" onclick="closeProposalWizard()">✓ Готово — к проекту</button>`;
  } else {
    const row = direction => {
      const tone = rpDir(direction.key);
      const sum = direction.lines.filter(line => !line.excluded && line.kind !== 'included').reduce((s, line) => s + (Number(line.price) || 0), 0);
      return `<div class="rp-kpwin-dir" style="--dir-color:${academyEsc(tone.color)};--dir-tint:${academyEsc(tone.tint)};--dir-deep:${academyEsc(tone.deep)}">
        <div class="rp-kpwin-dir-head"><span class="rp-kpwin-dot"></span><b>${academyEsc(direction.title)}</b><span class="rp-kpwin-dir-sum">${fmtMoney(sum)}</span></div>
        ${direction.lines.map(line => `<div class="rp-kpwin-line"><span>${line.kind === 'included' ? '↳ ' : ''}${academyEsc(line.name)} · ${academyEsc(projectLineQtyText(line))}${projectLinePriceIsManual(o, line) ? ' · <b class="rp-price-manual">цена вручную</b>' : ''}</span><span>${line.kind === 'included' ? 'в пакете' : fmtMoney(line.price)}</span></div>`).join('')}
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
  return {
    number: form.number || invoiceNextNumber(o),
    issued, due: invoiceAddDays(issued, term.days), terms: term.id, termsLabel: term.label,
    mode, amount: Math.round(amount * 100) / 100, total, paid, balance, deposit,
    poNumber: String(form.po || '').trim().slice(0, 60),
    billTo: { name: String(form.billName ?? c.companyName ?? c.name ?? '').trim() || c.name || 'Client', attn: c.companyName && c.name !== c.companyName ? c.name : '', email: c.email || '', phone: c.phone || '', address: orderAddress(o, c) || '' },
    lines, methods: invoicePaymentMethods(), project: o.number || '', note: String(form.note || '').trim().slice(0, 500),
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
<style>body{font-family:Inter,Arial,sans-serif;color:#0f172a;max-width:780px;margin:28px auto;padding:0 22px;font-size:14px}h1{font-size:30px;margin:0;letter-spacing:.02em}.muted{color:#64748b}.top{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;border-bottom:3px solid #0f2440;padding-bottom:14px}.meta td{padding:2px 0 2px 14px;text-align:right}.grid{display:flex;justify-content:space-between;gap:24px;margin:18px 0}table.items{width:100%;border-collapse:collapse;margin-top:8px}table.items th{text-align:left;font-size:12px;text-transform:uppercase;color:#475569;border-bottom:1px solid #cbd5e1;padding:8px 6px}table.items td{border-bottom:1px solid #e2e8f0;padding:8px 6px;vertical-align:top}.r{text-align:right;white-space:nowrap}.totals{margin-left:auto;width:300px;margin-top:10px}.totals div{display:flex;justify-content:space-between;padding:4px 0}.due{font-size:18px;font-weight:800;border-top:2px solid #0f2440;padding-top:8px!important}.pay{margin-top:22px;padding:14px 16px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc}.pay pre{font-family:inherit;white-space:pre-wrap;margin:2px 0 10px}@media print{button{display:none}body{margin:0 auto}}</style></head><body>
<div class="top"><div><h1>INVOICE</h1><div style="font-weight:800;font-size:16px;margin-top:6px">${esc(company)}</div><div class="muted">${from}</div></div>
<table class="meta"><tr><td class="muted">Invoice #</td><td><b>${esc(inv.number)}</b></td></tr><tr><td class="muted">Date</td><td>${esc(invoiceUsDate(inv.issued))}</td></tr><tr><td class="muted">Terms</td><td>${esc(inv.termsLabel)}</td></tr><tr><td class="muted">Due date</td><td><b>${esc(invoiceUsDate(inv.due))}</b></td></tr>${inv.poNumber ? `<tr><td class="muted">PO #</td><td>${esc(inv.poNumber)}</td></tr>` : ''}<tr><td class="muted">Project</td><td>${esc(inv.project)}</td></tr></table></div>
<div class="grid"><div><div class="muted" style="font-size:12px;text-transform:uppercase">Bill to</div><b>${esc(inv.billTo.name)}</b>${inv.billTo.attn ? `<br>Attn: ${esc(inv.billTo.attn)}` : ''}<br>${esc(inv.billTo.address)}${inv.billTo.email ? `<br>${esc(inv.billTo.email)}` : ''}${inv.billTo.phone ? `<br>${esc(inv.billTo.phone)}` : ''}</div>
<div style="text-align:right"><div class="muted" style="font-size:12px;text-transform:uppercase">Amount due</div><div style="font-size:28px;font-weight:800">${money(inv.amount)}</div><div class="muted">by ${esc(invoiceUsDate(inv.due))}</div></div></div>
<table class="items"><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Amount</th></tr></thead><tbody>
${inv.lines.map(l => `<tr><td>${esc(l.title)}</td><td class="r">${l.qty ? `${l.qty} ${esc(l.unit)}` : ''}</td><td class="r">${money(l.amount)}</td></tr>`).join('')}
</tbody></table>
<div class="totals"><div><span>Project total</span><b>${money(inv.total)}</b></div>${inv.paid > 0 ? `<div><span>Paid to date</span><b>−${money(inv.paid).replace('−','')}</b></div>` : ''}<div><span>Balance</span><b>${money(inv.balance)}</b></div>${Math.abs(inv.amount - inv.balance) >= 0.01 ? `<div><span>${inv.mode === 'deposit' ? 'Deposit due now' : 'Due now'}</span><b>${money(inv.amount)}</b></div>` : ''}<div class="due"><span>Amount due</span><span>${money(inv.amount)}</span></div></div>
<div class="pay"><b>How to pay</b> <span class="muted">— no processing fee. Please include invoice # ${esc(inv.number)} in the payment memo.</span>
${inv.methods.map(m => `<div style="margin-top:8px"><b>${esc(m.title)}</b><pre>${esc(m.text)}</pre></div>`).join('')}</div>
${inv.note ? `<p style="margin-top:16px">${esc(inv.note)}</p>` : ''}
<p class="muted" style="margin-top:22px">Thank you for your business.</p>
<p><button onclick="print()" style="padding:10px 16px;font-weight:700">Print / Save as PDF</button></p></body></html>`;
}
function issueProjectInvoice(oid) {
  const o = getOrder(oid);
  if (!o) return;
  const inv = invoiceDraft(o, { ...(state._invoiceForm?.oid === oid ? state._invoiceForm : {}), ...invoiceFormValues() });
  if (inv.amount <= 0) { alert('Сумма счёта 0 — проект уже оплачен.'); return; }
  const win = window.open('', '_blank');
  if (!win) { alert('Разрешите всплывающие окна, чтобы открыть счёт.'); return; }
  win.document.write(invoiceDocumentHtml(inv));
  win.document.close();
  o.invoices = Array.isArray(o.invoices) ? o.invoices : [];
  const existing = o.invoices.find(i => i.number === inv.number);
  const record = { number: inv.number, issued: inv.issued, due: inv.due, terms: inv.terms, amount: inv.amount, mode: inv.mode, po: inv.poNumber, by: state.currentUserId || null, at: new Date().toISOString() };
  if (existing) Object.assign(existing, record); else o.invoices.push(record);
  o.timeline = o.timeline || [];
  o.timeline.push({ at: record.at, key: 'invoice_issued', by: state.currentUserId, note: `Счёт ${inv.number} на ${fmtMoney(inv.amount)}, оплатить до ${invoiceUsDate(inv.due)}` });
  state._invoiceForm = null;
  save();
  openProjectInvoice(oid);
}
function invoiceEmailText(inv) {
  return `Hello${inv.billTo.attn ? ' ' + inv.billTo.attn : ''},\n\nPlease find attached invoice ${inv.number} for project ${inv.project}.\nAmount due: $${inv.amount.toFixed(2)} — due ${invoiceUsDate(inv.due)} (${inv.termsLabel}).\n\nHow to pay (no processing fee; please reference ${inv.number}):\n${inv.methods.map(m => `\n${m.title}:\n${m.text}`).join('\n')}\n\nThank you,\n${db.settings?.companyName || 'ROLANPRO'}`;
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
// One project page. The stage bar and «Следующий шаг» already explain the
// sequence, therefore the content below is grouped by business object instead
// of repeating the funnel with numbered technical sections.
function projectFeedSection(title, body, { chip = '', button = '', id = '' } = {}) {
  return `<section class="project-feed-section" ${id ? `data-project-feed="${id}"` : ''}>
    <div class="project-feed-head"><h3>${academyEsc(title)}</h3>${chip}</div>
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

  // Owner, 2026-10-26: «клиент и адрес объекта заводятся в карточке клиента, в
  // шапке адрес уже виден — зачем лишний шум». The client/site block is gone; the
  // client name in the command header links to the client card instead.
  // Owner, 2026-10-26: rooms are tiles like the cashier — name, windows, sq ft,
  // and whether the sizes are still the client's (базовый) or the measurer's
  // (полный). A tap opens the one measurement window; «+ Помещение» too.
  const roomTile = room => { const rw = (room.windows || []); const sq = rw.reduce((sum, win) => sum + (windowActualAreaSqft(win) || 0), 0); const full = rw.length && rw.every(win => !win.quickMeasure); return `<button type="button" class="project-room-tile ${full ? 'full' : ''}" onclick="${measureAction}"><span class="project-room-tile-name">${academyEsc(room.name || 'Помещение')}</span><span class="project-room-tile-meta">${rw.length} ${projectWindowsWord(rw.length)} · ${sq.toFixed(1)} sq ft</span><span class="project-room-tile-chip">${rw.length ? (full ? 'полный ✓' : 'базовый') : 'без окон'}</span></button>`; };
  const measurementEvent = events.find(ev => ev.type === 'measure');
  const measurementEventRow = measurementEvent ? projectFeedRow('Выезд замерщика', `${new Date(measurementEvent.at) < new Date() ? '✓ ' : ''}${fmtDateTime(measurementEvent.at)}`) : '';
  const measureBody = measurementEventRow + (rooms.length
    ? `<div class="project-room-tiles">${rooms.map(roomTile).join('')}${canManage ? `<button type="button" class="project-room-tile add" onclick="${measureAction}"><span class="project-room-tile-name">+ Помещение</span><span class="project-room-tile-meta">или размеры с рулетки</span></button>` : ''}</div>` + projectFeedRow('Всего', `${windows.length} ${projectWindowsWord(windows.length)} · ${orderActualAreaSqft(o).toFixed(1)} sq ft`, 'total')
    : `<div class="project-feed-empty">${orderNeedsMeasurements(o) ? 'Размеры ещё не внесены' : 'Для выбранных услуг размеры не нужны'}</div>`);
  const measureChip = !windows.length ? '' : orderMeasurementVerificationIssues(o).length ? projectFeedChip('размеры клиента', 'warn') : projectFeedChip('точные размеры', 'good');
  const filmRows = projectFeedFilmRows(o);
  const proposalStatus = proposal ? (proposal.status || 'Draft') : '';
  const proposalChip = !proposal ? projectFeedChip('не собрано') : ['Accepted', 'Deposit Paid', 'Paid in Full'].includes(proposalStatus) ? projectFeedChip('подписано', 'good') : ['Sent', 'Viewed'].includes(proposalStatus) ? projectFeedChip(proposalStatus === 'Viewed' ? 'клиент смотрел' : 'отправлено', 'info') : projectFeedChip('черновик');
  const paid = Math.max(orderPaidTotal(o), Number(o.paid) || 0);
  const proposalBody = (proposal ? projectFeedRow(`КП ${academyEsc(proposal.number || '')}`, fmtMoney(premiumProposalCalc(proposal)?.total || orderRevenue(o))) : '<div class="project-feed-empty">КП ещё не собрано</div>') + (projectProposalOptionalOfferings(o).length ? projectFeedRow(`<span class="quiet">Опции для клиента: ${projectProposalOptionalOfferings(o).map(item => academyEsc(item.offering.name)).join(', ')}</span>`) : '') + ((o.kpClientOptions || []).length ? projectFeedRow(`Клиент выбрал: ${o.kpClientOptions.map(item => academyEsc(item.title)).join(', ')}`, '') : '');
  const payBody = `${proposalBody}<div class="project-feed-divider"></div>${projectFeedRow('Аванс', o.depositReceived ? `✓ ${fmtMoney(orderExpectedDeposit(o) || 0)}` : fmtMoney(orderExpectedDeposit(o) || companyDepositFor(orderRevenue(o))))}${projectFeedRow('Оплачено', fmtMoney(paid))}${projectFeedRow('Остаток', fmtMoney(orderDebt(o)), orderDebt(o) > 0 ? 'total' : '')}${invoices.length ? projectFeedRow(`Invoice: ${invoices.map(inv => academyEsc(inv.number)).join(', ')}`, '') : ''}`;
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

  return `<div class="project-feed">
    ${primary ? `<div class="project-feed-next"><div class="project-feed-next-kicker">Следующий шаг</div>${renderOrderActionCard(primary)}</div>` : ''}
    ${money ? projectCardGateChecklist(o, { canManage, owner: u?.role === 'owner' }) : ''}
    ${lines.length || projectPendingSizedServices(o).length || canManage ? `<div class="project-feed-services" data-project-feed="services"><div class="project-feed-head"><h3>Состав проекта</h3>${money ? `<b>${fmtMoney(orderRevenue(o))}</b>` : ''}</div>${renderProjectCardServices(o, { money, economics: ctx.canSeeInternalEconomics, manage: canManage })}</div>` : ''}
    ${projectFeedSection('Замер', measureBody, { id: 'measure', chip: measureChip, button: projectFeedBtn(windows.length ? 'Проверить размеры' : 'Внести размеры', measureAction, windows.length ? 'ghost' : 'primary') })}
    ${money && filmRows.length ? projectFeedSection('Материалы', filmRows.join(''), { id: 'film', button: projectFeedBtn('Склад и закупка', 'openProjectPurchaseRequests()') }) : ''}
    ${money ? projectFeedSection('КП и оплата', payBody, { id: 'commercial', chip: proposalChip, button: `${projectFeedBtn(proposal ? 'Открыть КП' : 'Собрать КП', `openProposalWizard('${o.id}')`, proposal ? 'ghost' : 'primary')}${proposal?.canonicalProposalId && proposal.status !== 'Draft' ? projectFeedBtn('Забрать выбор клиента', `premiumApplyClientOptions('${o.id}')`) : ''}${projectFeedBtn('Invoice', `openProjectInvoice('${o.id}')`)}${orderDebt(o) > 0.01 ? projectFeedBtn('Отметить оплату', `openPaymentModal('${o.id}',{kind:'final'})`) : ''}` }) : ''}
    ${projectFeedSection('Монтаж', installBody, { id: 'install', button: canManage ? projectFeedBtn('Назначить монтаж', "projectCardOpenWorkspace('schedule')") : '' })}
    ${projectFeedSection('Документы и история', `${docs}<div class="project-feed-divider"></div>${history}`, { id: 'docs-history', button: projectFeedBtn('Все фото и события', "projectCardOpenWorkspace('history')") })}
    ${money && (lines.length || projectPendingSizedServices(o).length) ? projectFeedCheckHtml(o, lines, proposal) : ''}
  </div>`;
}
/** The cashier receipt: total and the one next button, pinned to the bottom on a phone (Owner, 2026-10-26). */
function projectFeedCheckHtml(o, lines, proposal) {
  const count = lines.filter(line => !line.excluded && line.kind !== 'included').length;
  const pending = projectPendingSizedServices(o).length;
  const status = proposal ? (proposal.status || 'Draft') : '';
  const signed = ['Accepted', 'Deposit Paid', 'Paid in Full'].includes(status);
  const button = signed
    ? projectFeedBtn('Монтаж', "projectCardOpenWorkspace('schedule')", 'primary')
    : projectFeedBtn(proposal ? 'Открыть КП' : 'Собрать КП', `openProposalWizard('${o.id}')`, 'primary');
  return `<div class="project-feed-check" data-project-feed="check"><div><div class="project-feed-check-kicker">Чек проекта</div><div class="project-feed-check-total">${fmtMoney(orderRevenue(o))}<small>${count} ${projectPlural(count, 'позиция', 'позиции', 'позиций')}${pending ? ` · ${pending} без замера` : ''}</small></div></div>${button}</div>`;
}
// ---------- ЧЕК-ЛИСТ «ДО МОНТАЖА» + РАЗБЛОКИРОВКА ВЛАДЕЛЬЦУ (Owner, 2026-10-26) ----------
// «Не могу начать монтаж, вечно что-то блокирует». The chain КП→аванс→размеры is
// right, but the card never said in one place what is left. This checklist shows
// the four steps before installation and, for the owner, a «Начать монтаж всё
// равно» button that records a risk and bypasses the gates (system warns, does
// not hold). Once the project is scheduled or closed, the checklist disappears.
function projectInstallGateSteps(o) {
  const proposal = getPremiumProposalByOrder(o.id);
  const status = proposal ? (proposal.status || 'Draft') : '';
  const kpSigned = ['Accepted', 'Deposit Paid', 'Paid in Full'].includes(status);
  const deposit = !!o.depositReceived || (orderPaidTotal(o) > 0 && orderPaidTotal(o) >= (orderExpectedDeposit(o) || 0));
  const sizesOk = !orderMeasurementVerificationIssues(o).length || !!o.clientSizesAcceptedAt;
  return [
    { k: 'services', t: 'Услуги и замер добавлены', done: projectLines(o).length > 0, sub: '' },
    { k: 'kp', t: 'КП собрано и принято клиентом', done: kpSigned, sub: 'клиент подтверждает онлайн' },
    { k: 'deposit', t: 'Аванс получен', done: deposit, sub: 'после принятия КП' },
    { k: 'sizes', t: 'Точные размеры подтверждены', done: sizesOk, sub: 'или «по размерам клиента»' },
  ];
}
function projectCardGateChecklist(o, { canManage = false, owner = false } = {}) {
  if (!o || !canManage) return '';
  if (PROJECT_SCHEDULED_STATUSES.includes(o.status) || CLOSED_PROJECT_STATUSES.includes(o.status)) return '';
  const steps = projectInstallGateSteps(o);
  const left = steps.filter(step => !step.done).length;
  if (!left) return ''; // всё готово — обычная кнопка «Назначить монтаж» уже доступна
  let activeMarked = false;
  const rows = steps.map((step, index) => {
    let cls = 'done', mk = '✓';
    if (!step.done) { if (!activeMarked) { cls = 'todo'; activeMarked = true; } else cls = 'wait'; mk = String(index + 1); }
    return `<div class="gate-step ${cls}"><span class="gate-mk">${mk}</span><span class="gate-x">${academyEsc(step.t)}${step.sub ? ` <small>${academyEsc(step.sub)}</small>` : ''}</span></div>`;
  }).join('');
  const forced = o.installationForced
    ? `<div class="gate-forced">⚠ Монтаж запущен владельцем без полной готовности — в заказ-наряде это помечено как риск.</div>`
    : owner
      ? `<div class="gate-owner"><button type="button" class="project-feed-btn gate-force" onclick="projectForceInstallation('${o.id}')">Начать монтаж всё равно →</button><div class="gate-owner-note">Доступно владельцу. Система предупредит, но не остановит.</div></div>`
      : '';
  return `<div class="project-feed-gate" data-project-feed="gate"><div class="project-feed-gate-head"><span>До монтажа осталось</span><span class="project-feed-gate-cnt">${steps.length - left} из ${steps.length}</span></div><div class="project-feed-gate-list">${rows}</div>${forced}</div>`;
}
function projectForceInstallation(oid) {
  const o = getOrder(oid);
  if (!o || currentUser()?.role !== 'owner') return;
  if (!confirm('Начать монтаж без принятого КП, аванса или точных размеров?\n\nВ заказ-наряде это отметится как риск, ответственность на владельце. Продолжить?')) return;
  o.installationForced = { at: new Date().toISOString(), by: state.currentUserId };
  o.timeline = o.timeline || [];
  o.timeline.push({ at: o.installationForced.at, key: 'installation_forced', by: state.currentUserId, note: 'Монтаж начат без полной готовности — решение владельца' });
  save();
  scheduleInstallationPrompt(oid);
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

// ---------- GOOGLE ADS → CRM: КЛЮЧ И СКРИПТ (Owner, 2026-10-25) ----------
// «Сделай API ключ нашей CRM, чтобы подключить Google Ads для аналитики». The
// owner creates a CRM key here and pastes a ready script into Google Ads
// (Tools → Scripts). Every night the script sends campaign costs; this block
// sets them against the projects that came from Google.
function googleAdsCrmScriptText(key) {
  // Built line by line: a «}» alone on a line would end this function for the page composer.
  const url = `${location.origin}/api/public/google-ads/costs`;
  return [
    '// RolanPRO CRM — расходы Google Ads в CRM. Расписание: ежедневно.',
    `var CRM_URL = '${url}';`,
    `var CRM_KEY = '${key}';`,
    '',
    'function main() {',
    '  var report = AdsApp.report(',
    '    "SELECT segments.date, campaign.id, campaign.name, metrics.cost_micros, metrics.clicks, metrics.impressions " +',
    '    "FROM campaign WHERE segments.date DURING LAST_30_DAYS");',
    '  var rows = [];',
    '  var it = report.rows();',
    '  while (it.hasNext()) {',
    '    var r = it.next();',
    '    rows.push({',
    "      date: r['segments.date'],",
    "      campaign_id: String(r['campaign.id']),",
    "      campaign_name: r['campaign.name'],",
    "      cost_micros: Number(r['metrics.cost_micros']) || 0,",
    "      clicks: Number(r['metrics.clicks']) || 0,",
    "      impressions: Number(r['metrics.impressions']) || 0",
    '    });',
    '  }',
    '  var account = AdsApp.currentAccount();',
    '  var response = UrlFetchApp.fetch(CRM_URL, {',
    "    method: 'post',",
    "    contentType: 'application/json',",
    "    headers: { Authorization: 'Bearer ' + CRM_KEY },",
    '    payload: JSON.stringify({ customer_id: account.getCustomerId(), currency: account.getCurrencyCode(), rows: rows }),',
    '    muteHttpExceptions: true',
    '  });',
    "  Logger.log('CRM ответила ' + response.getResponseCode() + ': ' + response.getContentText());",
    '}',
    '',
  ].join('\n');
}
async function loadGoogleAdsCrm(force = false) {
  if (currentUser()?.role !== 'owner') return;
  const s = state.googleAdsCrm || {};
  if (s.loading || (!force && s.loadedAt && Date.now() - s.loadedAt < 60000)) return;
  state.googleAdsCrm = { ...s, loading: true };
  try {
    const [keyRes, sumRes] = await Promise.all([
      fetch('/api/v1/settings/integration-keys?integration=google_ads', { credentials: 'same-origin', cache: 'no-store' }),
      fetch('/api/v1/integrations/google-ads/summary?days=30', { credentials: 'same-origin', cache: 'no-store' }),
    ]);
    const key = keyRes.ok ? (await keyRes.json())?.data : null;
    const summary = sumRes.ok ? (await sumRes.json())?.data : null;
    state.googleAdsCrm = { key, summary, loadedAt: Date.now(), loading: false, error: !keyRes.ok || !sumRes.ok ? `Сервер ответил ${keyRes.status}/${sumRes.status}` : '' };
  } catch (error) {
    state.googleAdsCrm = { ...s, loading: false, loadedAt: Date.now(), error: error?.message || String(error) };
  }
  render();
}
/** Projects that came from Google over the same days, from the CRM's own records. */
function googleAdsCrmProjectsStats(startDate) {
  const from = String(startDate || '');
  const fromGoogle = o => /google/i.test(String(o.leadSource || o.marketing?.source || o.source || ''));
  const leads = (db.orders || []).filter(o => fromGoogle(o) && String(o.createdAt || '').slice(0, 10) >= from && o.status !== 'cancelled');
  const won = leads.filter(o => o.depositReceived || ['proposal_accepted', 'installation_scheduled', 'installation_accepted', 'installation_en_route', 'installation_in_progress', 'installation_done', 'act_signed', 'payment_received', 'completed', 'review_received'].includes(o.status));
  const revenue = won.reduce((sum, o) => sum + (Number(orderRevenue(o)) || 0), 0);
  const paid = won.reduce((sum, o) => sum + (Number(orderPaidTotal(o)) || 0), 0);
  return { leads: leads.length, won: won.length, revenue, paid };
}
function googleAdsCrmPanelHtml() {
  if (currentUser()?.role !== 'owner') return '';
  const g = state.googleAdsCrm;
  if (!g || (!g.loadedAt && !g.loading)) setTimeout(() => loadGoogleAdsCrm(), 0);
  const key = g?.key;
  const sum = g?.summary;
  const stats = googleAdsCrmProjectsStats(sum?.start_date);
  const spend = Number(sum?.total_cost) || 0;
  const per = (value, count) => (count > 0 && value > 0 ? fmtMoney(value / count) : '—');
  const roas = spend > 0 && stats.revenue > 0 ? `${(stats.revenue / spend).toFixed(1)}×` : '—';
  const connected = key?.active;
  const lastImport = sum?.last_imported_at ? new Date(sum.last_imported_at).toLocaleString('ru-RU') : '';
  return `<div class="p-4 border ${connected && lastImport ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}" data-google-ads-crm>
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="font-semibold text-sm mb-1">📈 Google Ads — расходы и окупаемость в CRM</div>
        <p class="text-xs text-gray-600">${connected ? `Ключ CRM активен (${academyEsc(key.key_prefix || '')}…)${key.last_used_at ? ` · скрипт присылал данные ${academyEsc(new Date(key.last_used_at).toLocaleString('ru-RU'))}` : ' · скрипт ещё не присылал данные'}` : 'Не подключено. Создайте ключ — CRM покажет готовый скрипт для Google Ads.'}</p>
        ${g?.error ? `<p class="text-xs text-red-700 mt-1">${academyEsc(g.error)}</p>` : ''}
      </div>
      <div class="flex gap-2 flex-wrap">
        <button class="btn-primary text-sm" onclick="googleAdsCrmCreateKey()">${connected ? 'Новый ключ и скрипт' : 'Создать ключ и скрипт'}</button>
        ${connected ? `<button class="btn-ghost text-sm text-red-600" onclick="googleAdsCrmRevokeKey()">Отключить</button>` : ''}
        <button class="btn-ghost text-sm" onclick="loadGoogleAdsCrm(true)">Обновить</button>
      </div>
    </div>
    ${sum && (sum.campaigns || []).length ? `<div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-sm">
      <div class="p-2 border bg-white"><div class="text-xs text-gray-500">Расход за ${sum.days} дн.</div><b>${fmtMoney(spend)}</b><div class="text-xs text-gray-500">${Number(sum.total_clicks || 0)} кликов</div></div>
      <div class="p-2 border bg-white"><div class="text-xs text-gray-500">Лиды из Google в CRM</div><b>${stats.leads}</b><div class="text-xs text-gray-500">цена лида ${per(spend, stats.leads)}</div></div>
      <div class="p-2 border bg-white"><div class="text-xs text-gray-500">Проекты из Google</div><b>${stats.won}</b><div class="text-xs text-gray-500">цена проекта ${per(spend, stats.won)}</div></div>
      <div class="p-2 border bg-white"><div class="text-xs text-gray-500">Выручка / окупаемость</div><b>${fmtMoney(stats.revenue)}</b><div class="text-xs text-gray-500">ROAS ${roas}</div></div>
    </div>
    <details class="mt-2"><summary class="text-xs cursor-pointer">Кампании · данные от ${academyEsc(lastImport)}</summary><div class="mt-2 space-y-1">${sum.campaigns.map(c => `<div class="flex justify-between gap-2 text-xs border-b py-1"><span>${academyEsc(c.campaign_name)}</span><span>${fmtMoney(c.cost)} · ${c.clicks} кл.</span></div>`).join('')}</div></details>
    <p class="text-xs text-gray-500 mt-2">Лид считается из Google, если в проекте источник «google». Ставьте его при создании проекта — тогда цена лида и окупаемость считаются точно.</p>` : connected ? '<p class="text-xs text-gray-500 mt-2">Данных пока нет: вставьте скрипт в Google Ads и нажмите там «Выполнить» — расходы появятся здесь.</p>' : ''}
    ${googleAdsConversionsPanelHtml()}
  </div>`;
}
async function googleAdsCrmCreateKey() {
  if (currentUser()?.role !== 'owner') return;
  if (state.googleAdsCrm?.key?.active && !confirm('Создать новый ключ? Старый перестанет работать — скрипт в Google Ads нужно будет заменить.')) return;
  try {
    const response = await fetch('/api/v1/settings/integration-keys', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ integration: 'google_ads' }) });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.data?.key) throw new Error(payload?.errors?.[0]?.message || `Сервер ответил ${response.status}`);
    googleAdsCrmShowScript(payload.data.key);
    state.googleAdsCrm = { ...(state.googleAdsCrm || {}), loadedAt: 0 };
    loadGoogleAdsCrm(true);
  } catch (error) {
    alert('Не удалось создать ключ: ' + (error?.message || error));
  }
}
/** The key is shown once, inside the script; it is not kept in the CRM page. */
function googleAdsCrmShowScript(key) {
  const script = googleAdsCrmScriptText(key);
  state.modal = `<div class="modal-backdrop" onclick="if(event.target===this) closeModal()"><div class="modal-content workspace-modal p-6" style="max-width:46rem">
    <h3 class="font-semibold text-lg mb-1">Скрипт для Google Ads</h3>
    <p class="text-sm text-gray-600 mb-3">Ключ CRM уже вставлен в скрипт. Он показан один раз: скопируйте скрипт сейчас.</p>
    <ol class="text-sm list-decimal ml-5 space-y-1 mb-3">
      <li>Google Ads → <b>Инструменты → Массовые действия → Скрипты</b> → <b>+</b> → Новый скрипт.</li>
      <li>Удалите всё в редакторе, вставьте скрипт ниже, нажмите <b>Авторизовать</b> и <b>Выполнить</b>.</li>
      <li>В журнале должно быть «CRM ответила 200». Поставьте расписание <b>Ежедневно</b> и сохраните.</li>
    </ol>
    <textarea id="google-ads-crm-script" readonly style="width:100%;height:16rem;font-family:monospace;font-size:12px">${academyEsc(script)}</textarea>
    <div class="flex gap-2 mt-3 justify-end"><button class="btn-primary" onclick="navigator.clipboard.writeText(document.getElementById('google-ads-crm-script').value); this.textContent='Скопировано'">Скопировать скрипт</button><button class="btn-ghost" onclick="closeModal()">Готово</button></div>
  </div></div>`;
  render();
}
async function googleAdsCrmRevokeKey() {
  if (currentUser()?.role !== 'owner' || !confirm('Отключить ключ? Скрипт в Google Ads перестанет присылать расходы.')) return;
  await fetch('/api/v1/settings/integration-keys?integration=google_ads', { method: 'DELETE', credentials: 'same-origin' }).catch(() => null);
  loadGoogleAdsCrm(true);
}

// ---------- GOOGLE ADS: КОНВЕРСИИ ИЗ CRM (Owner, 2026-10-25, спецификация) ----------
// «Вот что нужно делать» (Google Ads CRM integration spec): qualified leads and
// sales with their value go from the CRM to Google Ads through Data Manager
// API. The owner pastes the service-account key and the conversion IDs here;
// the server sends every 10 minutes, test mode first, live after confirmation.
async function loadGoogleAdsConversions(force = false) {
  if (currentUser()?.role !== 'owner') return;
  const s = state.googleAdsConv || {};
  if (s.loading || (!force && s.loadedAt && Date.now() - s.loadedAt < 60000)) return;
  state.googleAdsConv = { ...s, loading: true };
  const get = async url => { const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store' }); return r.ok ? (await r.json())?.data : null; };
  try {
    const [settings, status, access] = await Promise.all([get('/api/v1/integrations/google-ads/settings'), get('/api/v1/integrations/google-ads/status'), get('/api/v1/integrations/google-ads/credentials')]);
    state.googleAdsConv = { settings, status, access, loadedAt: Date.now(), loading: false };
  } catch (error) {
    state.googleAdsConv = { ...s, loading: false, loadedAt: Date.now(), error: error?.message || String(error) };
  }
  render();
}
function googleAdsConversionsPanelHtml() {
  if (currentUser()?.role !== 'owner') return '';
  const g = state.googleAdsConv;
  if (!g || (!g.loadedAt && !g.loading)) setTimeout(() => loadGoogleAdsConversions(), 0);
  const st = g?.settings || {};
  const access = g?.access || {};
  const status = g?.status || {};
  const outbox = status.conversions?.outbox || {};
  const waiting = status.conversions?.awaiting_configuration || {};
  const problems = status.conversions?.recent_problems || [];
  const ids = st.conversion_owner_customer_id && st.converted_lead_action_id;
  const live = st.upload_enabled && st.validate_only === false;
  const step = (done, n, title, body) => `<div class="p-3 border bg-white mt-2" style="border-left:4px solid ${done ? '#16a34a' : '#d97706'}"><div class="text-sm font-semibold">${done ? '✓' : n} ${title}</div>${body}</div>`;
  const field = (id, label, value, hint) => `<label class="block text-xs mt-2">${label}<input id="${id}" value="${academyEsc(value || '')}" placeholder="${academyEsc(hint || '')}" inputmode="numeric"></label>`;
  const counts = Object.entries(outbox).map(([k, v]) => `${academyEsc(k)}: ${Number(v)}`).join(' · ') || 'пока пусто';
  return `<div class="p-4 border border-slate-200 bg-slate-50 mt-3" data-google-ads-conversions>
    <div class="font-semibold text-sm">🎯 Конверсии в Google Ads — квалифицированные лиды и продажи с суммой</div>
    <p class="text-xs text-gray-600 mt-1">CRM сама отправляет в Google: «квалифицированный лид», когда КП отправлено клиенту, и «продажу» с суммой, когда клиент подписал КП и аванс получен. Google учится приводить таких клиентов, а не просто клики.</p>
    ${g?.error ? `<p class="text-xs text-red-700 mt-1">${academyEsc(g.error)}</p>` : ''}
    ${step(access.configured, '1', 'Доступ CRM к Google', access.configured
      ? `<p class="text-xs text-gray-600 mt-1">Сервисный аккаунт: <code>${academyEsc(access.service_account_email || 'задан на сервере')}</code>. Он должен быть добавлен пользователем в Google Ads (Админ → Доступ и безопасность → «+», роль «Стандартный»).</p>${access.source === 'crm' ? `<button class="btn-ghost text-xs text-red-600 mt-1" onclick="googleAdsConvClearAccess()">Удалить ключ</button>` : ''}`
      : `<ol class="text-xs list-decimal ml-4 mt-1 space-y-1"><li>console.cloud.google.com → создайте проект → «APIs & Services» → включите <b>Data Manager API</b>.</li><li>«IAM & Admin → Service Accounts» → создайте аккаунт → «Keys → Add key → JSON» — скачается файл.</li><li>Откройте файл, скопируйте всё содержимое и вставьте сюда.</li><li>В Google Ads: Админ → Доступ и безопасность → «+» → email сервисного аккаунта, роль «Стандартный».</li></ol>
        <textarea id="gads-sa-json" rows="4" style="width:100%;font-family:monospace;font-size:11px" placeholder='{"type": "service_account", ...}' autocomplete="off"></textarea>
        <button class="btn-primary text-sm mt-1" onclick="googleAdsConvSaveAccess()">Сохранить доступ</button><p class="text-xs text-gray-500 mt-1">Ключ уходит прямо на сервер и хранится зашифрованным; в CRM и чате его больше не видно.</p>`)}
    ${step(ids, '2', 'ID аккаунта и конверсий', `<p class="text-xs text-gray-600 mt-1">В Google Ads: Цели → Конверсии → «+ Новое действие» → «Импорт» → «CRM, файлы и другие источники» → «Отслеживать конверсии по кликам». Создайте два действия: <b>CRM – Qualified Lead</b> (категория «Квалифицированный лид», ценность одна, учитывать одну) и <b>CRM – Converted Lead</b> (категория «Конвертированный лид», ценность из CRM, учитывать каждую). Пока ставьте их «вторичными». ID действия — число в адресе страницы действия (ctId=…).</p>
      ${field('gads-customer', 'Customer ID аккаунта Google Ads (123-456-7890)', st.conversion_owner_customer_id, '1234567890')}
      ${field('gads-login', 'Login customer ID — только если вход через управляющий аккаунт (MCC)', st.login_customer_id, 'необязательно')}
      ${field('gads-project', 'ID проекта Google Cloud', st.cloud_project_id, 'rolanpro-ads')}
      ${field('gads-qualified', 'ID действия «CRM – Qualified Lead»', st.qualified_lead_action_id, 'число')}
      ${field('gads-converted', 'ID действия «CRM – Converted Lead»', st.converted_lead_action_id, 'число')}
      <label class="block text-xs mt-2">Когда лид считается квалифицированным<select id="gads-stage"><option value="" ${st.qualification_pipeline_status_code ? '' : 'selected'}>Не отправлять квалифицированных</option><option value="PROPOSAL_SENT" ${st.qualification_pipeline_status_code === 'PROPOSAL_SENT' ? 'selected' : ''}>КП отправлено клиенту</option></select></label>
      <button class="btn-primary text-sm mt-2" onclick="googleAdsConvSaveSettings()">Сохранить</button>`)}
    ${step(live, '3', live ? 'Живая отправка включена' : 'Тестовый режим → живая отправка', live
      ? '<p class="text-xs text-gray-600 mt-1">Google принимает события. Смотрите «Конверсии» в Google Ads через 1–2 дня. Через 4 недели стабильных данных можно переводить кампании на «Максимум ценности конверсий».</p>'
      : `<p class="text-xs text-gray-600 mt-1">Сейчас Google только проверяет события и ничего не записывает. Когда в «Состоянии» появятся «validated» без ошибок — включайте живую отправку.</p><button class="btn-ghost text-sm mt-1" ${access.configured && ids ? '' : 'disabled'} onclick="googleAdsConvGoLive()">Включить живую отправку</button>`)}
    <div class="p-3 border bg-white mt-2"><div class="flex justify-between items-center gap-2"><div class="text-sm font-semibold">Состояние</div><div class="flex gap-2"><button class="btn-ghost text-xs" onclick="googleAdsConvSyncNow()">Отправить сейчас</button><button class="btn-ghost text-xs" onclick="loadGoogleAdsConversions(true)">Обновить</button></div></div>
      <p class="text-xs text-gray-600 mt-1">Очередь: ${counts}.${Number(waiting.converted_lead) || Number(waiting.qualified_lead) ? ` Ждут настройки ID: продажи ${Number(waiting.converted_lead) || 0}, квалифицированные ${Number(waiting.qualified_lead) || 0}.` : ''} Отправка идёт сама каждые 10 минут.</p>
      ${problems.length ? `<div class="text-xs text-red-700 mt-1">${problems.slice(0, 3).map(p => academyEsc(String(p.last_error?.message || p.processing_status || 'ошибка').slice(0, 140))).join('<br>')}</div>` : ''}
    </div>
  </div>`;
}
async function googleAdsConvRequest(url, method, body) {
  const response = await fetch(url, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.errors?.[0]?.message || `Сервер ответил ${response.status}`);
  return payload?.data;
}
async function googleAdsConvSaveAccess() {
  const box = document.getElementById('gads-sa-json');
  const json = box?.value || '';
  if (!json.trim()) return alert('Вставьте содержимое JSON-файла ключа.');
  try {
    await googleAdsConvRequest('/api/v1/integrations/google-ads/credentials', 'PUT', { service_account_json: json });
    if (box) box.value = '';
    loadGoogleAdsConversions(true);
  } catch (error) { if (box) box.value = ''; alert('Ключ не сохранён: ' + (error?.message || error)); }
}
async function googleAdsConvClearAccess() {
  if (!confirm('Удалить ключ доступа к Google? Отправка конверсий остановится.')) return;
  await googleAdsConvRequest('/api/v1/integrations/google-ads/credentials', 'DELETE').catch(error => alert(error.message));
  loadGoogleAdsConversions(true);
}
async function googleAdsConvSaveSettings() {
  const value = id => (document.getElementById(id)?.value || '').trim();
  try {
    await googleAdsConvRequest('/api/v1/integrations/google-ads/settings', 'PATCH', {
      conversion_owner_customer_id: value('gads-customer') || null,
      login_customer_id: value('gads-login') || null,
      cloud_project_id: value('gads-project') || null,
      qualified_lead_action_id: value('gads-qualified') || null,
      converted_lead_action_id: value('gads-converted') || null,
      qualification_pipeline_status_code: value('gads-stage') || null,
      upload_enabled: true,
    });
    loadGoogleAdsConversions(true);
  } catch (error) { alert('Не сохранено: ' + (error?.message || error)); }
}
async function googleAdsConvGoLive() {
  const customer = state.googleAdsConv?.settings?.conversion_owner_customer_id || '';
  const typed = prompt(`Включить живую отправку конверсий в Google Ads ${customer}? Введите Customer ID аккаунта для подтверждения.`, '');
  if (typed === null) return;
  try {
    await googleAdsConvRequest('/api/v1/integrations/google-ads/live/activate', 'POST', { confirmation: 'ENABLE_LIVE_GOOGLE_ADS_UPLOADS', customer_id: typed });
    loadGoogleAdsConversions(true);
  } catch (error) { alert('Не включено: ' + (error?.message || error)); }
}
async function googleAdsConvSyncNow() {
  try {
    const result = await googleAdsConvRequest('/api/v1/integrations/google-ads/sync-now', 'POST');
    const why = { not_enabled: 'сначала сохраните ID на шаге 2', no_credentials: 'сначала сохраните доступ на шаге 1', already_running: 'отправка уже идёт' };
    alert(result?.skipped ? `Не отправлено: ${why[result.skipped] || result.skipped}.` : `Готово: отправлено ${result?.uploads || 0}, проверено статусов ${result?.statuses || 0}.`);
    loadGoogleAdsConversions(true);
  } catch (error) { alert('Ошибка отправки: ' + (error?.message || error)); }
}

// ---------- НАЗНАЧИТЬ МОНТАЖ ПО УСЛУГАМ (Owner, 2026-10-25, макет 12–14) ----------
// «Назначить монтаж» opens its own window: the project's services in order,
// each with its specialists, a start and an end. What is known now is planned
// now; the rest stays «не назначено» and is planned when its time comes. The
// calendar and the kanban show each service as a coloured stripe.
function installWorkKind(group) {
  const offering = serviceOffering(group?.lines?.[0]?.offeringId || '');
  const text = `${group?.name || ''} ${offering?.name || ''}`.toLowerCase();
  if (group?.windows?.length) return 'film';
  if (/силикон|silicon|герметик|sealant/.test(text) || offering?.unit === 'lft') return 'silicone';
  if (/блок|питан|электр|провод|power|wiring|electric/.test(text)) return 'electric';
  if (/плёнк|пленк|film|монтаж/.test(text)) return 'film';
  return 'other';
}
function installWorkKindMeta(kind) {
  return ({
    film: { color: '#DC2626', label: 'Монтаж плёнки' },
    electric: { color: '#2563EB', label: 'Электрика' },
    silicone: { color: '#6B7280', label: 'Силикон' },
    other: { color: '#475569', label: 'Работа' },
  })[kind] || { color: '#475569', label: 'Работа' };
}
/** The planned end: saved, else the start plus 8 hours. */
function installPlanEnd(plan) {
  const end = Date.parse(plan?.endsAt || '');
  if (!Number.isNaN(end)) return new Date(end);
  const start = Date.parse(plan?.installationAt || '');
  return Number.isNaN(start) ? null : new Date(start + 8 * 3600 * 1000);
}
function installPlanComplete(plan) {
  return !!plan?.installationAt && (plan.installerIds || []).length > 0;
}
/** Services in order with their plan, kind and state. */
function installWindowRows(o) {
  const plans = projectPlannedSchedules(o);
  const rows = projectServiceGroups(o).map(group => {
    const plan = plans.find(item => item.id === group.id) || { id: group.id, installationAt: '', installerIds: [] };
    const kind = installWorkKind(group);
    const done = projectServiceProgress(o, group.id).status === 'done';
    return { group, plan, kind, meta: installWorkKindMeta(kind), done, planned: installPlanComplete(plan) };
  });
  // Owner, 2026-10-26: Smart goes electrician first, then the film.
  const smart = measureAllWindows(o).some(({ win }) => win.measureScope === 'smart_film');
  const rank = row => (smart && row.kind === 'electric' ? 0 : 1);
  return rows.map((row, i) => ({ row, i })).sort((a, b) => rank(a.row) - rank(b.row) || a.i - b.i).map(({ row }, index) => ({ ...row, index }));
}
function installRangeText(plan) {
  const start = plan?.installationAt ? new Date(plan.installationAt) : null;
  const end = installPlanEnd(plan);
  if (!start || Number.isNaN(start.getTime())) return '';
  const day = d => d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d => d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (!end) return `${day(start)} ${time(start)}`;
  return start.toDateString() === end.toDateString() ? `${day(start)} ${time(start)}–${time(end)}` : `${day(start)} ${time(start)} → ${day(end)} ${time(end)}`;
}
function installCrewText(plan) {
  return (plan?.installerIds || []).map(id => getUser(id)?.name).filter(Boolean).join(', ');
}
/** Other jobs of this specialist that overlap the given time. */
function installBusyWith(userId, startIso, endIso, skipOrderId, skipKey) {
  const start = Date.parse(startIso || '');
  const end = Date.parse(endIso || '') || (start + 8 * 3600 * 1000);
  if (Number.isNaN(start)) return [];
  return (db.orders || []).flatMap(order => (order.serviceSchedules || [])
    .filter(plan => (plan.installerIds || []).includes(userId) && !(order.id === skipOrderId && plan.id === skipKey) && !CLOSED_PROJECT_STATUSES.includes(order.status) && order.status !== 'cancelled')
    .filter(plan => { const s = Date.parse(plan.installationAt || ''); const e = installPlanEnd(plan)?.getTime(); return !Number.isNaN(s) && e && s < end && e > start; })
    .map(() => order.number));
}
function openInstallWindow(oid, key = '') {
  const o = getOrder(oid);
  if (!o || !orderUserCanSeeMoney(o, currentUser())) return;
  state._installWindow = { oid, key, draft: null };
  if (key) {
    const row = installWindowRows(o).find(item => item.group.id === key);
    if (row) state._installWindow.draft = { installerIds: [...(row.plan.installerIds || [])], installationAt: row.plan.installationAt || '', endsAt: row.plan.endsAt || installPlanEnd(row.plan)?.toISOString() || '', note: row.plan.note || '' };
  }
  state.modal = installWindowHtml(o);
  render();
}
function closeInstallWindow() {
  state._installWindow = null;
  closeModal();
}
function installWindowHtml(o) {
  const w = state._installWindow || {};
  const rows = installWindowRows(o);
  const plannedCount = rows.filter(row => row.planned).length;
  const readinessIssues = o.status === 'proposal_accepted' && typeof projectProductionReadiness === 'function'
    ? projectProductionReadiness(o)
    : [];
  const readinessBox = readinessIssues.length ? `<div class="rp-dirwin-warn" style="background:#eff6ff;border-color:#60a5fa;color:#1e3a8a">
      <b>План можно сохранить уже сейчас.</b>
      <div style="margin-top:6px">До публикации дат в календарь нужно: ${readinessIssues.slice(0, 5).map(academyEsc).join('; ')}${readinessIssues.length > 5 ? `; и ещё ${readinessIssues.length - 5}` : ''}.</div>
      <div style="margin-top:6px">Исполнитель и даты не потеряются — закончите проверку и вернитесь к подтверждению.</div>
    </div>` : '';
  const technicalWarnings = typeof orderInstallationTechnicalWarnings === 'function'
    ? orderInstallationTechnicalWarnings(o)
    : [];
  const warningBox = technicalWarnings.length ? `<div class="rp-dirwin-warn" style="background:#fff7ed;border-color:#fb923c;color:#9a3412">
      <b>⚠ Монтаж можно назначить, но на объекте нужно уточнить:</b>
      <ul style="margin:6px 0 0 18px">${technicalWarnings.slice(0, 5).map(item => `<li>${academyEsc(item)}</li>`).join('')}${technicalWarnings.length > 5 ? `<li>И ещё ${technicalWarnings.length - 5}</li>` : ''}</ul>
      <div style="margin-top:6px">Это попадёт в заказ-наряд как обязательное уточнение до начала работ.</div>
    </div>` : '';
  const head = (kicker, title, sub, back) => `<header class="order-workspace-modal-head rp-dirwin-head">
      <button type="button" class="workspace-back" onclick="${back}">${back.startsWith('closeInstallWindow') ? '← К проекту' : '← Все услуги'}</button>
      <div class="order-workspace-modal-heading"><div><div class="order-workspace-modal-kicker">${kicker}</div><h3>${title}</h3>${sub ? `<div class="text-xs text-gray-500">${sub}</div>` : ''}</div></div>
    </header>`;
  const shell = (color, inner) => `<div class="modal-backdrop order-workspace-backdrop" onclick="if(event.target===this) closeInstallWindow()">
    <div class="modal-content workspace-modal order-workspace-modal rp-dirwin install-window" style="--workspace-color:${color};--dir-color:${color}" onclick="event.stopPropagation()" role="dialog" aria-modal="true" aria-label="Назначить монтаж">${inner}</div></div>`;
  const row = rows.find(item => item.group.id === w.key);
  if (row && w.draft) {
    const d = w.draft;
    const users = usersByRole('installer').filter(user => user.active !== false);
    const prev = rows[row.index - 1];
    const chips = users.map(user => {
      const on = d.installerIds.includes(user.id);
      const busy = installBusyWith(user.id, d.installationAt, d.endsAt, o.id, row.group.id);
      return `<button type="button" class="install-chip ${on ? 'on' : ''}" aria-pressed="${on}" onclick="installDraftToggle('${user.id}')">${on ? '✓ ' : ''}${academyEsc(user.name)}${user.installerLevel === 'senior' ? ' ★' : ''}${busy.length ? `<small>занят: ${academyEsc(busy[0])}</small>` : ''}</button>`;
    }).join('') || '<div class="text-sm text-gray-500">В команде нет специалистов по установке — добавьте их в «Команде».</div>';
    const quick = [['4 часа', 4, 0], ['1 день', 0, 1], ['2 дня', 0, 2], ['3 дня', 0, 3]].map(([label, hours, days]) => `<button type="button" class="install-quick" onclick="installDraftDuration(${hours}, ${days})">${label}</button>`).join('')
      + (prev?.planned ? `<button type="button" class="install-quick" onclick="installDraftAfterPrevious()">После услуги ${prev.index + 1}</button>` : '');
    return shell(row.meta.color, `${head(`УСЛУГА ${row.index + 1} ИЗ ${rows.length} · ${academyEsc(row.meta.label)}`, academyEsc(row.group.name), `${academyEsc(o.number)} · ${academyEsc(getClient(o.clientId)?.name || '')}`, `openInstallWindow('${o.id}')`)}
      <div class="order-workspace-modal-body rp-dirwin-body">
        ${row.done ? '<div class="rp-dirwin-warn">Услуга выполнена — её даты и исполнители остаются как история.</div>' : ''}
        ${readinessBox}
        ${warningBox}
        <div class="rp-dirwin-sub">Исполнители</div>
        <div class="install-chips">${chips}</div>
        ${installDateTimeHtml(d)}
        <div class="install-quicks">${quick}</div>
        <label class="install-note">Заметка бригаде<input value="${academyEsc(d.note || '')}" placeholder="доступ, парковка, что взять" onchange="installDraftSet('note', this.value)"></label>
      </div>
      <div class="rp-dirwin-foot install-foot">
        ${row.done ? '' : `<button type="button" class="btn-primary rp-dirwin-next" style="background:${row.meta.color} !important;border-color:${row.meta.color} !important;color:#fff !important" onclick="installSaveService('${o.id}','${jsQuote(row.group.id)}')">Назначить эту услугу</button>`}
        <button type="button" class="btn-ghost w-full" onclick="openInstallWindow('${o.id}')">Пока не назначать</button>
        ${row.planned && !row.done && !PROJECT_SCHEDULED_STATUSES.includes(o.status) ? `<button type="button" class="btn-ghost w-full text-red-600" onclick="installClearService('${o.id}','${jsQuote(row.group.id)}')">Снять назначение</button>` : ''}
      </div>`);
  }
  const list = rows.map(item => {
    const state_ = item.done ? ['ВЫПОЛНЕНО', '#15803D', '#DCFCE7'] : item.planned ? ['НАЗНАЧЕНО', '#15803D', '#DCFCE7'] : ['НЕ НАЗНАЧЕНО', '#92400E', '#FEF3C7'];
    return `<button type="button" class="install-row ${item.planned || item.done ? '' : 'open'}" style="--work-color:${item.meta.color}" onclick="openInstallWindow('${o.id}','${jsQuote(item.group.id)}')">
      <span class="install-row-top"><b>${item.index + 1} · ${academyEsc(item.group.name)}</b><span class="install-state" style="color:${state_[1]};background:${state_[2]}">${state_[0]}</span></span>
      <span class="install-row-meta">${academyEsc(item.meta.label)}${item.group.windows.length ? ` · ${item.group.windows.length} ${projectWindowsWord(item.group.windows.length)}` : ''}</span>
      ${item.planned ? `<span class="install-row-when">📅 ${academyEsc(installRangeText(item.plan))}</span><span class="install-row-who">👷 ${academyEsc(installCrewText(item.plan))}</span>` : '<span class="install-row-go">Назначить исполнителя и даты →</span>'}
    </button>`;
  }).join('');
  const draft = o.status === 'proposal_accepted';
  const footer = draft
    ? (plannedCount ? `<button type="button" class="btn-primary rp-dirwin-next" style="background:#0F2440 !important;border-color:#0F2440 !important;color:#fff !important" onclick="installConfirm('${o.id}')">${readinessIssues.length ? 'Проверить готовность и опубликовать' : 'Опубликовать монтаж'}: ${plannedCount} ${projectPlural(plannedCount, 'услуга', 'услуги', 'услуг')}</button>` : '<div class="text-sm text-gray-500 text-center">Назначьте хотя бы одну услугу — остальные можно позже.</div>')
    : `<button type="button" class="btn-primary rp-dirwin-next" style="background:#0F2440 !important;border-color:#0F2440 !important;color:#fff !important" onclick="closeInstallWindow()">Готово</button>`;
  return shell('#DC2626', `${head(`НАЗНАЧИТЬ МОНТАЖ · ${academyEsc(o.number)}`, academyEsc(getClient(o.clientId)?.name || 'Проект'), `Назначено ${plannedCount} из ${rows.length} · остальные можно назначить позже`, 'closeInstallWindow()')}
    <div class="install-progress"><span style="width:${rows.length ? Math.round(plannedCount / rows.length * 100) : 0}%"></span></div>
    <div class="order-workspace-modal-body rp-dirwin-body">
      ${readinessBox}
      ${warningBox}
      <div class="rp-dirwin-sub">Услуги проекта по порядку</div>
      ${list || '<div class="rp-dirwin-empty">В проекте нет услуг.</div>'}
      <div class="install-hint">Назначайте то, что известно сейчас. Остальные услуги останутся «не назначено» — назначите, когда подойдёт время. Клиент получит сообщение о датах.</div>
    </div>
    <div class="rp-dirwin-foot">${footer}</div>`);
}
function installRerender() {
  const o = getOrder(state._installWindow?.oid);
  if (!o) return;
  preservePositionForNextRender();
  state.modal = installWindowHtml(o);
  render();
}
function installDraftToggle(userId) {
  const d = state._installWindow?.draft;
  if (!d) return;
  d.installerIds = d.installerIds.includes(userId) ? d.installerIds.filter(id => id !== userId) : [...d.installerIds, userId];
  installRerender();
}
function installDraftSet(field, value) {
  const d = state._installWindow?.draft;
  if (!d) return;
  if (field === 'note') { d.note = String(value || '').slice(0, 300); return; }
  if (d._parts) { delete d._parts[field === 'installationAt' ? 'start' : 'end']; if (field === 'installationAt') delete d._parts.end; }
  const at = value ? new Date(value) : null;
  d[field] = at && !Number.isNaN(at.getTime()) ? at.toISOString() : '';
  if (field === 'installationAt' && d.installationAt && (!d.endsAt || Date.parse(d.endsAt) <= Date.parse(d.installationAt))) d.endsAt = new Date(Date.parse(d.installationAt) + 8 * 3600 * 1000).toISOString();
  installRerender();
}
/** «4 часа» from the start; «2 дня» = the start day and the next one, 8 working hours each. */
function installDraftDuration(hours, days = 0) {
  const d = state._installWindow?.draft;
  if (!d) return;
  // Owner, 2026-10-25: the time is always chosen, never guessed.
  if (!d.installationAt) return alert('Сначала укажите дату и время начала.');
  const start = Date.parse(d.installationAt);
  const span = days > 0 ? (days - 1) * 24 * 3600 * 1000 + 8 * 3600 * 1000 : hours * 3600 * 1000;
  d.endsAt = new Date(start + span).toISOString();
  installRerender();
}
function installDraftAfterPrevious() {
  const w = state._installWindow;
  const o = getOrder(w?.oid);
  const rows = o ? installWindowRows(o) : [];
  const index = rows.findIndex(item => item.group.id === w.key);
  const prev = rows[index - 1];
  const end = prev ? installPlanEnd(prev.plan) : null;
  if (!end || !w.draft) return;
  const next = new Date(end);
  next.setDate(next.getDate() + 1); next.setHours(9, 0, 0, 0);
  w.draft.installationAt = next.toISOString();
  w.draft.endsAt = new Date(next.getTime() + 8 * 3600 * 1000).toISOString();
  installRerender();
}
function installSaveService(oid, key) {
  const o = getOrder(oid);
  const d = state._installWindow?.draft;
  if (!o || !d) return;
  if (!projectCardCanPlan(o)) return alert('План монтажа можно сохранять после принятия КП. До этого завершите расчёт и согласование с клиентом.');
  if (!d.installerIds.length) return alert('Выберите хотя бы одного исполнителя.');
  if (!d.installationAt) return alert('Укажите дату и время начала — без времени монтаж не назначается.');
  const endsAt = d.endsAt && Date.parse(d.endsAt) > Date.parse(d.installationAt) ? d.endsAt : new Date(Date.parse(d.installationAt) + 8 * 3600 * 1000).toISOString();
  const entry = projectCardSchedule(o, key);
  const next = { ...entry, installerIds: [...d.installerIds], installationAt: d.installationAt, endsAt, note: d.note || '' };
  if (!projectCardKeepsPlan(o, entry, next)) return;
  const wasPlanned = installPlanComplete(entry);
  Object.assign(entry, next);
  projectCardSyncCrew(o);
  o.timeline = o.timeline || [];
  o.timeline.push({ at: new Date().toISOString(), key: 'service_planned', by: state.currentUserId, note: `${projectServiceGroups(o).find(group => group.id === key)?.name || 'Услуга'}: ${installRangeText(entry)} · ${installCrewText(entry)}` });
  save();
  // Once the project is scheduled, a newly planned service is the client's news too.
  if (PROJECT_SCHEDULED_STATUSES.includes(o.status) && !wasPlanned && typeof notifyClientEventScheduled === 'function') notifyClientEventScheduled(oid, 'install');
  openInstallWindow(oid);
}
function installClearService(oid, key) {
  const o = getOrder(oid);
  if (!o || !projectCardCanPlan(o) || PROJECT_SCHEDULED_STATUSES.includes(o.status)) return;
  const entry = projectCardSchedule(o, key);
  entry.installerIds = []; entry.installationAt = ''; delete entry.endsAt;
  projectCardSyncCrew(o);
  save();
  openInstallWindow(oid);
}
/** «Подтвердить монтаж» with what is planned; the rest stays to plan later. */
function installConfirm(oid) {
  const o = getOrder(oid);
  if (!o) return;
  state._installWindow = null;
  closeModal();
  projectCardConfirmInstallation(oid);
}
/** Coloured stripes of a project's services for the kanban card. */
function installStripesHtml(o) {
  const rows = installWindowRows(o);
  if (!rows.length || !['proposal_accepted', ...PROJECT_PLANNING_STATUSES, ...CLOSED_PROJECT_STATUSES].includes(o.status)) return '';
  // One labelled colour stripe per service: «Монтаж плёнки · Ceramic · пн, 2 нояб.» red, «Силикон — не назначено» grey dashed.
  const stripes = rows.map(row => {
    const when = row.done ? '✓ готово' : row.planned ? installRangeText(row.plan).split(' ').slice(0, 3).join(' ') : 'не назначено';
    const label = row.meta.label === row.group.name ? row.group.name : `${row.meta.label} · ${row.group.name}`;
    const style = row.planned || row.done ? `background:${row.meta.color};color:#fff` : `border:1.5px dashed ${row.meta.color};color:#475569;background:#fff`;
    return `<div class="install-stripe" style="${style}"><span>${academyEsc(label)}</span><b>${academyEsc(when)}</b></div>`;
  }).join('');
  return `<div class="install-stripes" data-install-stripes>${stripes}</div>`;
}

// ---------- СТАВКИ И РАСХОДЫ — ОДИН ИСТОЧНИК ПРАВДЫ (Owner, 2026-10-25) ----------
// «Один источник правды, где пишем ставки и зарплаты, постоянные и переменные
// расходы». Every number has one home and this section edits that home:
// people's pay lives in the employee (payConfig), the per-unit installer rate
// and material in the service, fixed and variable payments in db.opex, the
// percentages in pricingDefaults. Salaries are mirrored into fixed costs
// automatically (opx_salary_<userId>), so break-even always sees them.
function ratesMonthlySalary(user) {
  const pc = user?.payConfig || {};
  return Math.max(0, Number(pc.monthlySalary) || Math.round((Number(pc.weeklySalary) || 0) * 4.33) || 0);
}
/** Mirrors every salaried employee into the fixed costs; retires the old owner/measurer plans. */
function syncTeamSalaryPlans() {
  if (!db || !Array.isArray(db.users)) return false;
  try { if (currentUser()?.role !== 'owner') return false; } catch (_) { return false; }
  db.opex = Array.isArray(db.opex) ? db.opex : [];
  let changed = false;
  const set = (plan, values) => Object.entries(values).forEach(([key, value]) => { if (plan[key] !== value) { plan[key] = value; changed = true; } });
  [['opx_owner_salary', 'owner'], ['opx_measurer_salary', 'measurer']].forEach(([id, role]) => {
    const plan = db.opex.find(item => item.id === id);
    if (!plan || plan.retiredBy) return;
    const people = (db.users || []).filter(user => user && user.active !== false && user.role === role);
    if (people.length !== 1) return; // nobody or several people: it stays a manual plan
    const user = people[0];
    user.payConfig = user.payConfig || {};
    if ((user.payConfig.type !== 'salary' || !(ratesMonthlySalary(user) > 0)) && plan.active !== false && Number(plan.amount) > 0) {
      user.payConfig.type = 'salary';
      user.payConfig.monthlySalary = Number(plan.amount) || 0;
    }
    set(plan, { active: false, retiredBy: 'team', retiredAt: plan.retiredAt || new Date().toISOString(), userId: user.id });
  });
  db.users.forEach(user => {
    if (!user?.id) return;
    const amount = user.payConfig?.type === 'salary' ? ratesMonthlySalary(user) : 0;
    const id = 'opx_salary_' + user.id;
    let plan = db.opex.find(item => item.id === id);
    if (!plan && !(amount > 0 && user.active !== false)) return;
    if (!plan) { plan = { id, addedAt: new Date().toISOString() }; db.opex.push(plan); changed = true; }
    set(plan, { name: `Оклад — ${user.name || 'сотрудник'}`, amount, frequency: 'monthly', category: 'payroll', scope: 'business', costBehavior: 'fixed', active: amount > 0 && user.active !== false, autoFrom: 'team', userId: user.id });
  });
  return changed;
}
function ratesPayText(user) {
  const pc = user?.payConfig || {};
  if (pc.type === 'salary') return { text: `Оклад ${fmtMoney(ratesMonthlySalary(user))} / мес`, ok: ratesMonthlySalary(user) > 0 };
  if (pc.type === 'commission') return { text: `${Number(pc.commissionPct) || 0}% от выручки проекта`, ok: Number(pc.commissionPct) > 0 };
  if (pc.type === 'per_sqft') return { text: 'Сдельно — ставка из услуги', ok: true };
  if (pc.type === 'fixed_per_job') return { text: `${fmtMoney(Number(pc.fixedPerJob) || 0)} за заказ`, ok: Number(pc.fixedPerJob) > 0 };
  if (pc.type === 'hourly') return { text: `${fmtMoney(Number(pc.hourlyRate) || 0)} / час`, ok: Number(pc.hourlyRate) > 0 };
  if (pc.type === 'none') return { text: 'Не оплачивается через CRM', ok: true };
  return { text: 'Оплата не настроена', ok: false };
}
/** Services with their own rate: active, filled in, edited in their home direction. */
function ratesWorkServices() {
  return serviceOfferingsAll().filter(item => item.active !== false && !serviceOfferingIsDraft(item));
}
function ratesBusinessPlans(behavior) {
  return (db.opex || []).map((plan, index) => ({ plan, index }))
    .filter(({ plan }) => !plan.retiredBy && !(plan.autoFrom === 'team' && plan.active === false) && plan.scope !== 'personal' && plan.category !== 'tax' && (behavior === 'variable' ? plan.costBehavior === 'variable' : plan.costBehavior !== 'variable'));
}
function ratesCostsSummary() {
  const people = activeUsers();
  const salaried = people.filter(user => user.payConfig?.type === 'salary');
  const services = ratesWorkServices();
  const pd = db.settings.pricingDefaults || {};
  return {
    people: people.length,
    unpaid: people.filter(user => !ratesPayText(user).ok).length,
    salaries: salaried.reduce((sum, user) => sum + ratesMonthlySalary(user), 0),
    services: services.length,
    noRate: services.filter(item => !(Number(item.installerRatePerSqft) > 0)).length,
    fixed: companyFixedMonthlyBurn(),
    fixedCount: ratesBusinessPlans('fixed').filter(({ plan }) => plan.active !== false).length,
    managerPct: Number(pd.managerPct) || 0,
    marketingPct: Number(pd.marketingPct) || 0,
  };
}
function openRatesTab(tab = '') {
  state.ratesTab = tab;
  if (state.view !== 'ratesCosts') state.view = 'ratesCosts';
  try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) {}
  render();
}
function ratesSetDefault(field, value) {
  if (currentUser()?.role !== 'owner') return;
  db.settings.pricingDefaults = db.settings.pricingDefaults || {};
  db.settings.pricingDefaults[field] = Math.max(0, Number(value) || 0);
  save();
}
function ratesSetCommission(userId, value) {
  const user = getUser(userId);
  if (!user || currentUser()?.role !== 'owner') return;
  user.payConfig = user.payConfig || {};
  user.payConfig.type = 'commission';
  user.payConfig.commissionPct = Math.max(0, Number(value) || 0);
  save();
}
function ratesUpdateOffering(id, field, value, control) {
  updateServiceOffering(id, field, value, control);
  if (field === 'installerRatePerSqft') control?.closest('.rates-row')?.classList.toggle('rates-row-missing', !(Number(serviceOffering(id)?.installerRatePerSqft) > 0));
}
function ratesHeadHtml(icon, title, sub) {
  return `<div class="rates-head"><button type="button" class="rates-back" onclick="openRatesTab('')">← Ставки и расходы</button><div class="rates-head-title"><span>${icon}</span><div><h2>${title}</h2><p>${sub}</p></div></div></div>`;
}
function ratesPlanRowHtml({ plan, index }) {
  const auto = plan.autoFrom === 'team';
  const open = auto ? `openUserPayConfig('${plan.userId}')` : `financeOpenPlanModal(${index},'${plan.costBehavior === 'variable' ? 'company-variable' : 'company-fixed'}')`;
  const freq = ({ daily: 'каждый день', weekly: 'каждую неделю', monthly: 'каждый месяц', quarterly: 'каждый квартал', yearly: 'каждый год' })[plan.frequency] || 'каждый месяц';
  return `<button type="button" class="rates-row ${plan.active === false ? 'rates-row-off' : ''}" onclick="${open}"><div class="rates-row-main"><b>${academyEsc(plan.name || 'Без названия')}</b><small>${auto ? '👷 из «Люди и оплата» — меняется у сотрудника' : `${academyEsc(financeCategoryLabel(plan.category))} · ${freq}${plan.active === false ? ' · выключен' : ''}`}</small></div><div class="rates-row-sum">${fmtMoney(opexMonthly({ ...plan, active: true }))}<small>в месяц</small></div></button>`;
}
function renderRatesCosts() {
  if (currentUser()?.role !== 'owner') return '<div class="card">Доступ только владельцу</div>';
  if (syncTeamSalaryPlans()) save();
  const sum = ratesCostsSummary();
  const tab = state.ratesTab || '';
  const pd = db.settings.pricingDefaults || {};
  if (tab === 'people') {
    const rows = activeUsers().map(user => {
      const pay = ratesPayText(user);
      return `<button type="button" class="rates-row ${pay.ok ? '' : 'rates-row-missing'}" onclick="openUserPayConfig('${user.id}')"><div class="rates-row-main"><b>${academyEsc(user.name || '—')}</b><small>${academyEsc(({ owner: 'Владелец', manager: 'Менеджер', installer: 'Монтажник', measurer: 'Замерщик' })[user.role] || T(user.role))}</small></div><div class="rates-row-sum">${academyEsc(pay.text)}<small>изменить →</small></div></button>`;
    }).join('') || '<div class="rates-empty">В команде пока никого — добавьте сотрудников в «Команде».</div>';
    return `<div class="rates-page">${ratesHeadHtml('👷', 'Люди и оплата', 'Оклад, процент, фикс за заказ или сдельно — у каждого сотрудника одна запись')}
      <div class="rates-list">${rows}</div>
      <div class="rates-note">Оклады сами попадают в «Постоянные расходы»: сейчас <b>${fmtMoney(sum.salaries)}</b> в месяц. Сдельная оплата монтажника — ставка услуги во вкладке <button type="button" class="rates-link" onclick="openRatesTab('work')">«За единицу работы»</button>.</div></div>`;
  }
  if (tab === 'work') {
    const groups = SERVICE_OFFERING_DIRECTIONS.map(direction => {
      const items = ratesWorkServices().filter(item => item.direction === direction);
      if (!items.length) return '';
      const rows = items.map(item => {
        const per = serviceOfferingUnitShort(item);
        const sized = serviceOfferingNeedsSizes(item);
        const missing = !(Number(item.installerRatePerSqft) > 0);
        return `<div class="rates-row rates-row-edit ${missing ? 'rates-row-missing' : ''}"><div class="rates-row-main"><b>${academyEsc(item.name)}</b><small>клиенту ${fmtMoney(Number(item.pricePerSqft) || 0)} / ${academyEsc(per)}</small></div>
          <label>Монтажнику, $ / ${academyEsc(per)}<input type="number" min="0" step="0.25" inputmode="decimal" value="${Number(item.installerRatePerSqft) || ''}" placeholder="0" onchange="ratesUpdateOffering('${item.id}','installerRatePerSqft',this.value,this)"></label>
          ${sized ? '<label>Материал<span class="rates-muted">по плёнке со склада</span></label>' : `<label>Материал, $ / ${academyEsc(per)}<input type="number" min="0" step="0.5" inputmode="decimal" value="${Number(item.materialCostPerUnit) || ''}" placeholder="0" onchange="ratesUpdateOffering('${item.id}','materialCostPerUnit',this.value,this)"></label>`}</div>`;
      }).join('');
      return `<div class="rates-group"><div class="rates-group-title">${serviceOfferingDirectionTitle(direction)}</div>${rows}</div>`;
    }).join('') || '<div class="rates-empty">Услуг пока нет — добавьте их в «Услуги и цены».</div>';
    return `<div class="rates-page">${ratesHeadHtml('🔧', 'За единицу работы', 'Сколько платим монтажнику и сколько стоит материал за sq ft, штуку или зону')}
      ${sum.noRate ? `<div class="rates-warn">Без ставки монтажнику: ${sum.noRate} — по ним начислится $0.</div>` : ''}
      ${groups}
      <div class="rates-note">Это те же поля, что в «Услуги и цены» — меняете здесь или там, значение одно. Если на объекте несколько монтажников, сумма по услуге делится поровну.</div></div>`;
  }
  if (tab === 'fixed') {
    const analysis = breakEvenAnalysis();
    const plans = ratesBusinessPlans('fixed');
    return `<div class="rates-page">${ratesHeadHtml('🏠', 'Постоянные расходы', 'Платим каждый месяц, даже без заказов: аренда, страховка, сервисы, оклады')}
      <div class="rates-kpis"><div><small>В месяц</small><b>${fmtMoney(analysis.burn)}</b></div><div><small>В день</small><b>${fmtMoney(analysis.burn / 30)}</b></div><div><small>Заказов / мес. до нуля</small><b>${analysis.ordersToBreakEven > 0 ? analysis.ordersToBreakEven.toFixed(1) : '—'}</b></div><div><small>sq ft / мес. до нуля</small><b>${analysis.sqftToBreakEven > 0 ? Math.ceil(analysis.sqftToBreakEven).toLocaleString() : '—'}</b></div></div>
      <div class="rates-list">${plans.map(ratesPlanRowHtml).join('') || '<div class="rates-empty">Добавьте аренду, страховку, сервисы и другие обязательные платежи.</div>'}</div>
      <button type="button" class="btn-primary rates-add" onclick="financeOpenPlanModal(-1,'company-fixed')">+ Постоянный расход</button>
      <div class="rates-note">Это управленческий план, а не списание денег со счёта. Оклады меняются у сотрудника во вкладке <button type="button" class="rates-link" onclick="openRatesTab('people')">«Люди и оплата»</button>.</div></div>`;
  }
  if (tab === 'variable') {
    const managers = activeUsers(['manager']);
    const plans = ratesBusinessPlans('variable');
    const field = (label, key, step, hint = '') => `<label class="rates-field">${label}<input type="number" min="0" step="${step}" inputmode="decimal" value="${Number(pd[key]) || 0}" onchange="ratesSetDefault('${key}',this.value)">${hint ? `<small>${hint}</small>` : ''}</label>`;
    return `<div class="rates-page">${ratesHeadHtml('📦', 'Переменные расходы', 'Растут вместе с продажами: проценты, бензин, расходники, хелпер')}
      <div class="rates-group"><div class="rates-group-title">От выручки</div>
        ${managers.map(user => `<label class="rates-field">Комиссия — ${academyEsc(user.name)}, %<input type="number" min="0" step="0.5" inputmode="decimal" value="${user.payConfig?.type === 'commission' ? Number(user.payConfig.commissionPct) || 0 : ''}" placeholder="не на проценте" onchange="ratesSetCommission('${user.id}',this.value)"></label>`).join('')}
        ${field('Комиссия менеджера по умолчанию, %', 'managerPct', '0.5', 'Для проектов без назначенного менеджера.')}
        ${field('Реклама, % от выручки прошлого месяца', 'marketingPct', '0.5')}
        ${typeof companyAdBudgetHint === 'function' ? companyAdBudgetHint() : ''}
      </div>
      <div class="rates-group"><div class="rates-group-title">На каждый проект</div>
        ${field('Бензин, $ / км', 'gasPerKm', '0.05')}
        ${field('Расходники, $ / sq ft', 'consumablesPerSqft', '0.05')}
        ${field('Хелпер, $ / заказ', 'helperPerJob', '5')}
        <div class="rates-note">Монтажник и материал — во вкладке <button type="button" class="rates-link" onclick="openRatesTab('work')">«За единицу работы»</button>.</div>
      </div>
      <div class="rates-group"><div class="rates-group-title">Регулярные переменные платежи</div>
        <div class="rates-list">${plans.map(ratesPlanRowHtml).join('') || '<div class="rates-empty">Нет — например, комиссия платёжной системы или подписка, которая растёт с заказами.</div>'}</div>
        <button type="button" class="btn-ghost rates-add" onclick="financeOpenPlanModal(-1,'company-variable')">+ Переменный платёж</button>
      </div></div>`;
  }
  const tile = (key, icon, title, value, sub, warn = '') => `<button type="button" class="rates-tile ${warn ? 'rates-tile-warn' : ''}" onclick="openRatesTab('${key}')"><span class="rates-tile-icon">${icon}</span><span class="rates-tile-title">${title}</span><b>${value}</b><small>${warn || sub}</small><span class="rates-tile-go">→</span></button>`;
  return `<div class="rates-page">
    <div class="rates-hero"><small>Нужно покрыть в месяц</small><b>${fmtMoney(sum.fixed)}</b><span>постоянные расходы вместе с окладами · переменные считаются в каждом проекте</span></div>
    <div class="rates-tiles">
      ${tile('people', '👷', 'Люди и оплата', `${sum.people} чел.`, `оклады ${fmtMoney(sum.salaries)} / мес`, sum.unpaid ? `не настроено: ${sum.unpaid}` : '')}
      ${tile('work', '🔧', 'За единицу работы', `${sum.services} услуг`, 'ставка монтажнику и материал', sum.noRate ? `без ставки: ${sum.noRate}` : '')}
      ${tile('fixed', '🏠', 'Постоянные расходы', fmtMoney(sum.fixed), `${sum.fixedCount} платежей в месяц`)}
      ${tile('variable', '📦', 'Переменные расходы', `${sum.managerPct}% · ${sum.marketingPct}%`, 'менеджер · реклама · бензин · расходники')}
    </div>
    <div class="rates-note">Одно место для всех ставок и расходов. Здесь и в «Команде», «Услугах и ценах», «Деньгах» — одни и те же цифры: меняете в одном месте — меняются везде.</div>
  </div>`;
}

// ---------- ДАТА И ВРЕМЯ ОБЯЗАТЕЛЬНЫ (Owner, 2026-10-25) ----------
// «Когда назначается монтаж или консультация, обязательно нужно указать время.»
// Date and time are two separate fields plus quick time chips; nothing is
// saved, and no time is guessed, until both are chosen.
function scheduleLocalParts(iso) {
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return { date: '', time: '' };
  const pad = n => String(n).padStart(2, '0');
  return { date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`, time: `${pad(at.getHours())}:${pad(at.getMinutes())}` };
}
function scheduleTimeChips() { return ['08:00', '09:00', '10:00', '12:00', '14:00', '16:00']; }
/** Date + time fields for a schedule modal; read them back with scheduleReadDateTime(id, what). */
function scheduleDateTimeHtml(id, iso, label = 'Когда') {
  const p = scheduleLocalParts(iso);
  const chips = scheduleTimeChips().map(t => `<button type="button" class="sched-chip ${p.time === t ? 'on' : ''}" onclick="scheduleSetTimeChip('${id}','${t}')">${t}</button>`).join('');
  return `<div class="sched-dt" data-sched-dt="${id}">
    <div class="sched-dt-label">${label} <span class="sched-req">дата и время обязательны</span></div>
    <div class="sched-dt-row"><label>Дата<input type="date" id="${id}-date" value="${p.date}" oninput="scheduleClearError('${id}')"></label><label>Время<input type="time" id="${id}-time" step="900" value="${p.time}" oninput="scheduleClearError('${id}')"></label></div>
    <div class="sched-dt-chips">${chips}</div>
    <div class="sched-error" id="${id}-error" hidden></div>
  </div>`;
}
function scheduleSetTimeChip(id, time) {
  const input = document.getElementById(id + '-time');
  if (input) input.value = time;
  document.querySelectorAll(`[data-sched-dt="${id}"] .sched-chip`).forEach(chip => chip.classList.toggle('on', chip.textContent === time));
  scheduleClearError(id);
}
function scheduleClearError(id) {
  const box = document.getElementById(id + '-error');
  if (box) box.hidden = true;
  ['date', 'time'].forEach(part => document.getElementById(`${id}-${part}`)?.classList.remove('sched-missing'));
}
/** The chosen moment as ISO, or null with the missing field marked red. */
function scheduleReadDateTime(id, what = '') {
  const date = document.getElementById(id + '-date')?.value || '';
  const time = document.getElementById(id + '-time')?.value || '';
  const at = date && time ? new Date(`${date}T${time}`) : null;
  if (at && !Number.isNaN(at.getTime())) return at.toISOString();
  const missing = !date && !time ? 'дату и время' : !date ? 'дату' : 'время';
  const box = document.getElementById(id + '-error');
  if (box) { box.textContent = `Укажите ${missing}${what ? ' ' + what : ''}.`; box.hidden = false; }
  if (!date) document.getElementById(id + '-date')?.classList.add('sched-missing');
  if (!time) document.getElementById(id + '-time')?.classList.add('sched-missing');
  (document.getElementById(`${id}-${!date ? 'date' : 'time'}`))?.focus?.();
  if (!box) alert(`Укажите ${missing}${what ? ' ' + what : ''}.`);
  return null;
}
/** Start and end of a service in the install window: date + time each, chips for the start time. */
function installDateTimeHtml(d) {
  const part = (which, iso) => ({ ...scheduleLocalParts(iso), ...((d._parts || {})[which] || {}) });
  const sp = part('start', d.installationAt);
  const ep = part('end', d.endsAt);
  const chips = scheduleTimeChips().map(t => `<button type="button" class="sched-chip ${sp.time === t ? 'on' : ''}" onclick="installDraftPart('start','time','${t}')">${t}</button>`).join('');
  const hint = sp.date && !sp.time ? 'Выберите время начала' : !sp.date && sp.time ? 'Выберите дату начала' : '';
  return `<div class="rp-dirwin-sub">Начало <span class="sched-req">дата и время обязательны</span></div>
    <div class="sched-dt-row"><label>Дата<input type="date" class="${!sp.date && sp.time ? 'sched-missing' : ''}" value="${sp.date}" onchange="installDraftPart('start','date',this.value)"></label><label>Время<input type="time" step="900" class="${sp.date && !sp.time ? 'sched-missing' : ''}" value="${sp.time}" onchange="installDraftPart('start','time',this.value)"></label></div>
    <div class="sched-dt-chips">${chips}</div>
    ${hint ? `<div class="sched-error">${hint}</div>` : ''}
    <div class="rp-dirwin-sub">Окончание</div>
    <div class="sched-dt-row"><label>Дата<input type="date" value="${ep.date}" onchange="installDraftPart('end','date',this.value)"></label><label>Время<input type="time" step="900" value="${ep.time}" onchange="installDraftPart('end','time',this.value)"></label></div>`;
}
function installDraftPart(which, part, value) {
  const d = state._installWindow?.draft;
  if (!d) return;
  const field = which === 'start' ? 'installationAt' : 'endsAt';
  d._parts = d._parts || {};
  const parts = { ...scheduleLocalParts(d[field]), ...(d._parts[which] || {}), [part]: String(value || '') };
  if (parts.date && parts.time) {
    delete d._parts[which];
    return installDraftSet(field, `${parts.date}T${parts.time}`);
  }
  d._parts[which] = parts;
  d[field] = '';
  installRerender();
}

// ---------- ЦЕНА ВРУЧНУЮ (Owner, 2026-10-26) ----------
// «Менеджер видит лист расчёта, и у него должна быть возможность писать цену
// вручную.» Every line of the «Цена» step has its unit price: per sq ft for
// windows, per unit for a quantity service, the sum for other work. The list
// price stays visible; a changed price is marked «вручную» and can be reset.
// The owner's «минимум / максимум» in the directory still bounds the price.
function projectLineUnitPrice(o, line) {
  const coefficient = Number(db.settings.complexityCoefs?.[o.complexity || 'standard'] ?? 1) || 1;
  if (line.kind === 'windows') return line.qty > 0 ? line.price / line.qty / coefficient : Number(line.windows?.[0]?.pricePerSqft) || 0;
  if (line.kind === 'quantity') return Number(line.sources?.[0]?.unitPrice) || 0;
  return Number(line.price) || 0;
}
/** The directory price of a line, or null when it has none (custom work). */
function projectLineListPrice(line) {
  const offering = serviceOffering(line.offeringId);
  if (!offering || !['windows', 'quantity'].includes(line.kind)) return null;
  return Number(offering.pricePerSqft) || 0;
}
function projectLinePriceIsManual(o, line) {
  const list = projectLineListPrice(line);
  return list != null && Math.abs(projectLineUnitPrice(o, line) - list) > 0.004;
}
function projectPriceRowHtml(o, directionKey, line) {
  if (line.kind === 'included') return `<div class="rp-dirwin-row"><div><b>↳ ${academyEsc(line.name)}</b><span>${academyEsc(projectLineNote(line))}</span></div><div class="rp-dirwin-num">${academyEsc(projectLineQtyText(line))}<b>в пакете</b></div></div>`;
  const unit = line.kind === 'windows' ? 'sq ft' : line.kind === 'work' ? '' : line.unitShort;
  const list = projectLineListPrice(line);
  const manual = projectLinePriceIsManual(o, line);
  const range = projectServicePriceRange(serviceOffering(line.offeringId));
  const bound = range ? `можно от ${fmtMoney(range.min)}${range.max ? ` до ${fmtMoney(range.max)}` : ''}` : '';
  const value = Math.round(projectLineUnitPrice(o, line) * 100) / 100;
  return `<div class="rp-dirwin-row rp-price-row ${manual ? 'manual' : ''}" data-price-line="${academyEsc(line.key)}">
    <div class="rp-price-main"><b>${academyEsc(line.name)}</b><span>${academyEsc(projectLineQtyText(line))}${list != null ? ` · прайс ${fmtMoney(list)}${unit ? ' / ' + academyEsc(unit) : ''}` : ''}${bound ? ` · ${bound}` : ''}</span></div>
    <label class="rp-price-input"><span>${unit ? `Цена, $ / ${academyEsc(unit)}` : 'Сумма, $'}</span><input type="number" min="0" step="0.25" inputmode="decimal" value="${value}" aria-label="Цена: ${academyEsc(line.name)}" onchange="projectDirectionSetPrice('${o.id}','${jsQuote(directionKey)}','${jsQuote(line.key)}',this.value)"></label>
    <div class="rp-price-total"><b>${fmtMoney(line.price)}</b>${manual ? `<span class="rp-price-manual">вручную</span><button type="button" class="rp-price-reset" onclick="projectDirectionSetPrice('${o.id}','${jsQuote(directionKey)}','${jsQuote(line.key)}','${list}')">↺ прайс</button>` : ''}</div>
  </div>`;
}
/** One price setter for the card and the direction window. Returns true when saved. */
function projectSetLinePrice(oid, key, value) {
  const o = getOrder(oid);
  if (!o || !orderUserCanSeeMoney(o, currentUser()) || CLOSED_PROJECT_STATUSES.includes(o.status)) return false;
  const line = projectLines(o).find(item => item.key === key);
  if (!line || !['windows', 'quantity', 'work'].includes(line.kind)) return false;
  const price = Math.max(0, parseFloat(value) || 0);
  const offering = serviceOffering(line.offeringId);
  const range = projectServicePriceRange(offering);
  if (range && ((range.min > 0 && price < range.min) || (range.max > 0 && price > range.max))) {
    alert(`Цена «${offering.name}»: от ${fmtMoney(range.min)}${range.max ? ` до ${fmtMoney(range.max)}` : ''}`);
    return false;
  }
  const source = line.sources?.[0];
  if (line.kind === 'windows') line.windows.forEach(win => { win.pricePerSqft = price; });
  else if (line.kind === 'quantity' && source) {
    source.unitPrice = price;
    source.price = Math.round(price * (Number(source.qty) || 0) * 100) / 100;
  } else if (source) source.price = price;
  else return false;
  projectEstimateMarkChanged(o, `Изменена цена «${line.name}»: ${fmtMoney(price)}`);
  save();
  return true;
}
function projectCardSetPrice(oid, key, value) {
  projectSetLinePrice(oid, key, value);
  preservePositionForNextRender(); render();
}
function projectDirectionSetPrice(oid, directionKey, key, value) {
  projectSetLinePrice(oid, key, value);
  openProjectDirectionWindow(oid, directionKey, 'price');
}

/** Owner, 2026-10-26: before sending, the manager sees everything the client gets — to whom, every line with its price, total, deposit and terms. */
function proposalWizardSummaryHtml(o, groups, total, deposit, client) {
  const unitText = line => {
    if (line.kind === 'included') return 'в пакете';
    const unit = line.kind === 'windows' ? 'sq ft' : line.kind === 'work' ? '' : line.unitShort;
    return unit ? `${fmtMoney(projectLineUnitPrice(o, line))} / ${unit}` : 'сумма';
  };
  const lines = groups.flatMap(direction => direction.lines.filter(line => !line.excluded).map(line => `<div class="rp-kpsum-line">
      <span><b>${line.kind === 'included' ? '↳ ' : ''}${academyEsc(line.name)}</b><small>${academyEsc(direction.title)} · ${academyEsc(projectLineQtyText(line))} · ${academyEsc(unitText(line))}${projectLinePriceIsManual(o, line) ? ' · <em class="rp-price-manual">цена вручную</em>' : ''}</small></span>
      <b>${line.kind === 'included' ? '$0' : fmtMoney(line.price)}</b></div>`)).join('');
  const pending = groups.reduce((n, direction) => n + direction.pending.length, 0);
  const terms = o.paymentTerms === 'after_completion' ? 'Оплата после выполнения' : 'Аванс до производства';
  const contact = (label, value, missing) => `<div class="rp-kpsum-contact ${value ? '' : 'missing'}"><span>${label}</span><b>${academyEsc(value || missing)}</b></div>`;
  return `<div class="rp-kpsum" data-kp-summary>
    <div class="rp-kpsum-title">Проверьте перед отправкой — это получит клиент</div>
    <div class="rp-kpsum-contacts">${contact('Клиент', client.name, 'без имени')}${contact('Телефон', client.phone, 'нет телефона')}${contact('Email', client.email, 'нет email')}</div>
    <div class="rp-kpsum-lines">${lines || '<div class="rp-kpsum-empty">В КП нет позиций</div>'}</div>
    ${pending ? `<div class="rp-dirwin-warn">Без замера: ${pending} — в КП не попадут.</div>` : ''}
    <div class="rp-kpsum-totals"><div><span>Итого</span><b>${fmtMoney(total)}</b></div><div><span>${o.paymentTerms === 'after_completion' ? 'При подписи' : 'Аванс при подписи'}</span><b>${fmtMoney(deposit)}</b></div><div><span>Условия</span><b>${terms}</b></div></div>
  </div>`;
}

// ---------- SMART ПРОЩЕ (Owner, 2026-10-26) ----------
// «В смарте выбираешь услугу и окна — значит подключение зон: одно окно = одна
// зона, это должно идти сразу. Электрика — только если требуется. Ты усложнил.»
// The room card shows what joins the KP: zones (automatic, one per panel),
// the power block and the electrician only when ticked. A service missing in
// the price list never blocks the project: the owner creates it right here.
function smartRoleDefaults(role, capacityW = 0) {
  return ({
    zone: { name: 'Подключение зоны', unit: 'zone' },
    power: { name: capacityW ? `Блок питания ${capacityW}W` : 'Блок питания', unit: 'piece' },
    multi: { name: 'Блок питания мультизона', unit: 'piece' },
    electric: { name: 'Электрические работы', unit: 'piece' },
  })[role] || null;
}
function smartCreateOffering(oid, rid, role, capacityW = 0, inputId = '') {
  if (typeof serviceOfferingCanEdit === 'function' && !serviceOfferingCanEdit()) return;
  const base = smartRoleDefaults(role, Number(capacityW) || 0);
  if (!base) return;
  const input = document.getElementById(inputId || `smart-new-${rid}-${role}`);
  const price = Math.max(0, Number(input?.value) || 0);
  if (!(price > 0)) { input?.classList.add('sched-missing'); input?.focus?.(); return; }
  db.settings.serviceOfferings = Array.isArray(db.settings.serviceOfferings) ? db.settings.serviceOfferings : [];
  const sort = Math.max(0, ...serviceOfferingsAll().map(item => Number(item.sort) || 0)) + 1;
  db.settings.serviceOfferings.push({ id: 'svc_' + uid(), direction: 'smart', name: base.name, unit: base.unit, pricePerSqft: price, installerRatePerSqft: 0, active: true, sort, createdFrom: 'smart-measure' });
  const o = getOrder(oid);
  if (o && typeof syncSmartCashierServices === 'function') syncSmartCashierServices(o);
  if (o) invalidateProjectEstimate(o, `Создана услуга «${base.name}»`);
  save();
  refreshManagerMeasureModal(oid);
}
function managerSmartRoomFieldsHtml(oid, room) {
  const system = syncSmartRoomPlan(room);
  if (!system) return '';
  const canCreate = currentUser()?.role === 'owner'; // the directory check alerts, so a render asks the role directly
  const row = (role, label, qty, capacityW = 0) => {
    const offering = smartCashierOffering(role, capacityW);
    const priced = offering && Number(offering.pricePerSqft) > 0;
    if (priced) return `<div class="smart-kp-row ready"><span>${academyEsc(label)}</span><b>${academyEsc(offering.name)} · ${qty} × ${fmtMoney(Number(offering.pricePerSqft) || 0)} = ${fmtMoney(qty * (Number(offering.pricePerSqft) || 0))}</b></div>`;
    if (offering) return `<div class="smart-kp-row missing"><span>${academyEsc(label)}</span><b>«${academyEsc(offering.name)}» без цены — укажите её в «Услугах и ценах»</b></div>`;
    const name = smartRoleDefaults(role, capacityW)?.name || label;
    return `<div class="smart-kp-row missing"><span>${academyEsc(label)} · ${qty}</span>${canCreate ? `<div class="smart-kp-create"><b>«${academyEsc(name)}» нет в прайсе</b><input id="smart-new-${room.id}-${role}" type="number" min="0" step="1" inputmode="decimal" placeholder="Цена, $"><button type="button" class="btn-primary" onclick="smartCreateOffering('${oid}','${room.id}','${role}',${Number(capacityW) || 0})">Создать услугу</button></div>` : `<b>«${academyEsc(name)}» нет в прайсе — в КП не войдёт. Попросите владельца добавить.</b>`}</div>`;
  };
  const toggle = (field, on, title, sub, next = String(!on)) => `<button type="button" class="smart-toggle ${on ? 'on' : ''}" aria-pressed="${on}" onclick="managerUpdateSmartRoom('${oid}','${room.id}','${field}',${next})"><span class="smart-toggle-box">${on ? '✓' : ''}</span><span><b>${title}</b><small>${sub}</small></span></button>`;
  return `<section class="manager-smart-room-system">
    <div class="manager-smart-room-head"><div><span>SMART · ${academyEsc(room.name || 'Помещение')}</span><h4>${system.zones} ${projectPlural(system.zones, 'зона', 'зоны', 'зон')} · 1 окно = 1 зона</h4></div><b>${system.areaSqft.toFixed(1)} sq ft</b></div>
    <div class="smart-toggles">
      ${toggle('electricianNeeded', system.electricianNeeded, '⚡ Нужен электрик', 'Только если требуется подключение к сети')}
      ${toggle('powerBlockNeeded', system.powerBlockNeeded, '🔌 Нужен блок питания', system.powerSupplyModel ? `Подходит ${academyEsc(system.powerSupplyModel)} · ${system.requiredW}W` : 'После ввода размеров')}
    </div>
    ${system.powerBlockNeeded ? `<div class="qm-chips smart-block-type"><span>Тип блока:</span><button type="button" class="${system.controlMode !== 'multi' ? 'on' : ''}" onclick="managerUpdateSmartRoom('${oid}','${room.id}','controlMode','group')">Обычный${system.powerSupplyModel ? ` · ${academyEsc(system.powerSupplyModel)}` : ''}</button><button type="button" class="${system.controlMode === 'multi' ? 'on' : ''}" onclick="managerUpdateSmartRoom('${oid}','${room.id}','controlMode','multi')">Мультизона — каждая зона отдельно</button></div>` : ''}
    ${system.powerBlockNeeded && system.engineeringRequired ? '<div class="alert alert-warning mt-3">Нагрузка больше 1000W — разделите питание или подтвердите инженерное решение.</div>' : ''}
    <div class="smart-kp">
      <div class="smart-kp-title">Попадёт в КП</div>
      ${row('zone', 'Подключение зон', system.zones)}
      ${system.powerBlockNeeded && system.controlMode === 'multi' ? row('multi', 'Блок питания · мультизона', 1) : system.powerBlockNeeded && system.capacityW ? row('power', 'Блок питания', 1, system.capacityW) : ''}
      ${system.electricianNeeded ? row('electric', 'Электрик', 1) : ''}
    </div>
    ${system.powerBlockNeeded || system.electricianNeeded ? `<details class="manager-smart-technical mt-3">
      <summary>Где блок и как тянем провод</summary>
      <div class="manager-window-fields mt-3">
        <div class="manager-window-field"><label>Размещение блока</label><select onchange="managerUpdateSmartRoom('${oid}','${room.id}','blockPlacement',this.value)">${SMART_BLOCK_PLACEMENTS.map(item => `<option value="${item.id}" ${system.blockPlacement === item.id ? 'selected' : ''}>${academyEsc(item.label)}</option>`).join('')}</select></div>
        <div class="manager-window-field"><label>Точное место</label><input value="${academyEsc(system.powerSupplyLocation || '')}" placeholder="Шкаф, потолок, серверная…" onchange="managerUpdateSmartRoom('${oid}','${room.id}','powerSupplyLocation',this.value)"></div>
        <div class="manager-window-field wide"><label>Трасса</label><input value="${academyEsc(system.wirePath || '')}" placeholder="Окна → блок → управление" onchange="managerUpdateSmartRoom('${oid}','${room.id}','wirePath',this.value)"></div>
      </div>
    </details>` : ''}
  </section>`;
}

// ---------- ЗАМЕР: ОДНО ОКНО (Owner, 2026-10-27) ----------
// «Быстрый замер не нужен отдельным окном — пусть будет одно окно, но с
// возможностью выбирать поля, которые знает менеджер.» The separate quick window
// was removed; the measurement window shows only the fields each person picks.
/** Client sizes do not block production and installation: one explicit «по размерам клиента». */
function projectAcceptClientSizes(oid, reopen = 'production') {
  const o = getOrder(oid);
  if (!o || !orderUserCanManage(currentUser())) return false;
  const issues = orderMeasurementVerificationIssues(o);
  if (!issues.length) return true;
  if (!confirm(`Размеры от клиента ещё не уточнил замерщик (${issues.length}). Продолжить по размерам клиента? Замерщик уточнит позже — бригада увидит, какие размеры точные.`)) return false;
  o.clientSizesAcceptedAt = new Date().toISOString();
  o.clientSizesAcceptedBy = state.currentUserId;
  o.timeline = o.timeline || [];
  o.timeline.push({ at: o.clientSizesAcceptedAt, key: 'client_sizes_accepted', by: state.currentUserId, note: `Продолжили по размерам клиента: ${issues.length}` });
  save();
  if (reopen === 'production') openProjectProductionWorkspace(oid);
  return true;
}

// ---------- КЛИЕНТ УЖЕ СОГЛАСЕН (Owner, 2026-10-27) ----------
// «Я внёс замер, сформировал КП, у нас был договор — а монтаж не назначить»:
// a formed KP stayed «не отправлено», so the project stood at «Замер». An offline
// agreement (contract, call, message) marks the KP sent and accepted in one step.
function projectAcceptProposalOffline(oid) {
  const o = getOrder(oid);
  if (!o || !orderUserCanSeeMoney(o, currentUser())) return;
  const prop = getPremiumProposalByOrder(oid);
  if (!prop || !prop.publishedAt) { alert('Сначала сформируйте КП.'); return; }
  if (!confirm('Клиент уже согласился (договор, звонок, переписка)?\n\nКП отметится отправленным и принятым. Подписанное КП нельзя будет изменить — только новой версией.')) return;
  if (prop.status === 'Draft' && !premiumProposalLocked(prop)) {
    prop.status = 'Sent';
    prop.sentAt = new Date().toISOString();
    o.proposalSentAt = o.proposalSentAt || prop.sentAt;
    o.timeline = o.timeline || [];
    o.timeline.push({ at: prop.sentAt, key: 'premium_proposal_sent', by: state.currentUserId, note: 'КП согласовано с клиентом напрямую (договор)' });
  }
  if (['new', 'consultation_scheduled', 'measurement_scheduled', 'measurement_done'].includes(o.status)) o.status = 'proposal_sent';
  if (typeof closeProposalWizard === 'function') closeProposalWizard(); else closeModal();
  changeStatus(oid, 'proposal_accepted');
}

// ---------- ПОЛЯ ЗАМЕРА ПО ВЫБОРУ (Owner, 2026-10-27) ----------
// One measurement window; each person picks which extra fields to see. Sizes,
// quantity, service and film are always there; the rest is optional (the
// measurer sees everything by default, the manager only the basics).
function measureFieldGroups() {
  return [['direction', 'Направление плёнки'], ['tech', 'Стекло и доступ'], ['notes', 'Примечания и фото'], ['smart', 'Smart: зона и подключение']];
}
function measureFieldPrefsKey() { return 'rp_measure_fields_' + (currentUser()?.id || ''); }
function measureFieldPrefs() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(measureFieldPrefsKey()) || 'null'); } catch (_) { saved = null; }
  if (Array.isArray(saved)) return new Set(saved);
  return new Set(currentUser()?.role === 'measurer' ? measureFieldGroups().map(([key]) => key) : []);
}
function measureToggleField(oid, key) {
  const on = measureFieldPrefs();
  if (on.has(key)) on.delete(key); else on.add(key);
  try { localStorage.setItem(measureFieldPrefsKey(), JSON.stringify([...on])); } catch (_) {}
  refreshManagerMeasureModal(oid);
}
function measureHiddenClasses() {
  const on = measureFieldPrefs();
  return measureFieldGroups().filter(([key]) => !on.has(key)).map(([key]) => 'mm-hide-' + key).join(' ');
}
function measureFieldsBarHtml(oid) {
  const on = measureFieldPrefs();
  return `<div class="qm-chips mm-fields-bar"><span>Поля:</span><button type="button" class="on" disabled>✓ Размеры и количество</button>${measureFieldGroups().map(([key, label]) => `<button type="button" class="${on.has(key) ? 'on' : ''}" aria-pressed="${on.has(key)}" onclick="measureToggleField('${oid}','${key}')">${on.has(key) ? '✓ ' : '+ '}${label}</button>`).join('')}</div>`;
}

// ---------- РЕЖИМ ВНЕДРЕНИЯ (Owner, 2026-10-27) ----------
// «Мы должны сейчас внедрить CRM и внести задним числом заказы, а CRM мешает».
// While the owner keeps it on, the owner and the manager move projects to any
// stage without the step checks (KP, deposit, exact sizes, production,
// planned services, booking time), no messages go to clients, and closing an
// old project does not take film from today's stock.
function crmImportMode() {
  try { return db?.settings?.importMode?.on === true && ['owner', 'manager'].includes(currentUser()?.role); } catch (_) { return false; }
}
function setCrmImportMode(on) {
  if (currentUser()?.role !== 'owner') return;
  if (on && !confirm('Включить режим внедрения?\n\nПока он включён: проекты можно переводить на любой этап без проверок, клиентам ничего не отправляется, склад при закрытии старых проектов не списывается.\n\nВыключите, когда перенесёте старые заказы.')) return;
  db.settings.importMode = { on: !!on, at: new Date().toISOString(), by: state.currentUserId };
  save();
  render();
}
function crmImportBannerHtml() {
  if (!crmImportMode()) return '';
  const owner = currentUser()?.role === 'owner';
  return `<div class="crm-import-banner" role="status"><span>🗂 <b>Режим внедрения:</b> этапы без проверок, клиентам ничего не отправляется, склад не списывается.</span>${owner ? '<button type="button" onclick="setCrmImportMode(false)">Выключить</button>' : ''}</div>`;
}
function crmImportModePanelHtml() {
  const on = db?.settings?.importMode?.on === true;
  return `<div class="crm-import-panel"><div><b>🗂 Режим внедрения — перенос старых заказов</b><p>Для ввода заказов задним числом: любой этап без проверок КП, аванса, размеров и производства; клиентам не уходят SMS и письма; склад при закрытии не списывается. Включите на время переноса и выключите после.</p></div><button type="button" class="${on ? 'btn-ghost' : 'btn-primary'}" onclick="setCrmImportMode(${!on})">${on ? 'Выключить' : 'Включить'}</button></div>`;
}
