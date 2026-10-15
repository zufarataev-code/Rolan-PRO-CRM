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
  if (projectStages(o).length && getUser(userId)?.payConfig?.type === 'per_sqft') return projectStages(o).reduce((sum,s) => sum + projectStageEmployeeAmount(o,s,userId),0) + orderInstallerPayoutForUser(projectStageUnstagedOrder(o),userId);
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
  return filmPayout + orderAdditionalWorkPayoutForUser(o, user, installerIds.length);
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
  projectWriteServiceProgress(o, line, status, user);
  save();
  projectSyncStatusFromServices(o);
  preservePositionForNextRender(); render();
}

function renderProjectCardServices(o, { money = false, economics = false, manage = false } = {}) {
  const lines = projectLines(o);
  const pending = projectPendingSizedServices(o);
  const production = projectCardInProduction(o);
  const plan = production && manage && money && PROJECT_PLANNING_STATUSES.includes(o.status);
  const edit = money && !CLOSED_PROJECT_STATUSES.includes(o.status);
  const tracking = PROJECT_SCHEDULED_STATUSES.includes(o.status) || CLOSED_PROJECT_STATUSES.includes(o.status);
  const chosen = projectCardChosenLine(o, lines);
  const total = field => lines.reduce((sum, line) => sum + (Number(line[field]) || 0), 0);
  const rows = lines.map(line => {
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
        <label>${tracking ? 'Ход работ' : 'Действия'}<div class="flex gap-1 mt-1">${tracking ? projectServiceProgressCell(o, line) : ''}${deletable ? `<button class="btn-ghost text-red-600" onclick="projectCardDeleteService('${o.id}','${jsQuote(source.id)}')">Удалить</button>` : ''}</div></label>
      </div>` : ''}
    </div>`;
  }).join('');
  const pendingRows = pending.map(offering => { const film = getCatalogItem(projectOfferingCatalogId(o, offering.id)); return `<div class="project-service-pending" data-project-pending="${academyEsc(offering.id)}"><b>${academyEsc(offering.name)}</b> · ${film ? academyEsc(catalogLabel(film)) : 'материал уточняется'} · ждёт замера ${edit ? `<button class="btn-ghost text-xs ml-2" onclick="openManagerMeasureModal('${o.id}')">Внести размеры</button>${o.offeringId !== offering.id ? `<button class="btn-ghost text-xs text-red-600 ml-1" onclick="projectCardRemovePending('${o.id}','${jsQuote(offering.id)}')">Убрать</button>` : ''}` : ''}</div>`; }).join('');
  return `<section class="project-service-ledger" data-project-card-services>
    <div class="project-service-ledger-head"><div><div class="project-service-ledger-title">Состав проекта <span class="tag">${lines.length + pending.length}</span></div><div class="project-service-ledger-sub">Каждая услуга имеет собственный материал, объём, цену, дату и исполнителя.</div></div>${money && edit ? projectOfferingPickerHtml(o, 'projectCardAddService') : ''}</div>
    <div class="project-service-list">${rows || '<div class="p-4 text-sm text-gray-500">В проекте пока нет услуг.</div>'}${pendingRows}</div>
    <div class="project-service-footer"><span>${economics ? `Материал ${fmtMoney(total('materialCost'))} · работа ${fmtMoney(total('installerPay'))}` : `${lines.length} позиций`}</span>${money ? `<strong>Клиенту ${fmtMoney(orderRevenue(o))}</strong>` : ''}</div>
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
  if (Array.isArray(o.serviceScopeApprovals)) {
    const approved = new Set(projectServiceGroups(o).filter(g=>projectScopeApproved(o,g.id)).map(g=>g.id));
    const filtered = {...o,measurements:{...o.measurements,rooms:(o.measurements?.rooms||[]).map(r=>({...r,windows:(r.windows||[]).filter(w=>approved.has(w.offeringId?'offering:'+w.offeringId:'direction:'+(w.measureScope||o.serviceType||'solar_film')))}))},extraServices:(o.extraServices||[]).filter(l=>approved.has('line:'+l.id))};
    return orderFilmRevenue(filtered)+orderExtraServicesRevenue(filtered);
  }
  return orderFilmRevenue(o) + orderExtraServicesRevenue(o);
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
          const catalog = getCatalogItem(line.catalogId);
          const filmName = catalog ? `${catalog.brand} ${catalog.model}` : line.serviceType;
          return sum + (Number(line.qty) || 0) * (serviceOfferingInstallerRate(line) || filmRate(filmName));
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
  const newCosts=payments.filter(t=>t.projectExpenseId!==undefined&&!expenses.some(e=>e.id===t.projectExpenseId)).reduce((sum,t)=>sum+(Number(t.amount)||0),0);
  return Math.max(planned,legacy)+newCosts;
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

function projectDirectExpensesHtml(o) {
  return `<section class="p-3 border-t" data-project-direct-expenses><h4 class="font-bold">Расходы проекта</h4>${(o.extraExpenses||[]).map(e=>`<div class="flex flex-wrap gap-2 mt-2" style="align-items:end"><label style="flex:2;min-width:0">Расход<input style="width:100%;min-height:44px" value="${academyEsc(e.label||'')}" onchange="projectEditDirectExpense('${o.id}','${e.id}','label',this.value)" ${e.stageDerived?'disabled':''}></label><label style="flex:1;min-width:0">Сумма, $<input style="width:100%;min-height:44px" type="number" min="0" value="${Number(e.amount)||0}" onchange="projectEditDirectExpense('${o.id}','${e.id}','amount',this.value)" ${e.stageDerived?'disabled':''}></label><label style="flex:1;min-width:0">Услуга<select onchange="projectEditDirectExpense('${o.id}','${e.id}','serviceId',this.value)" ${e.stageDerived?'disabled':''}><option value="">Весь проект</option>${projectLines(o).map(l=>`<option value="${academyEsc(l.key)}" ${e.serviceId===l.key?'selected':''}>${academyEsc(l.name)}</option>`).join('')}</select></label><label><input type="checkbox" ${e.actual?'checked':''} onchange="projectEditDirectExpense('${o.id}','${e.id}','actual',this.checked)" ${e.stageDerived?'disabled':''}> Факт</label>${!e.stageDerived?`<button class="btn-ghost" onclick="projectEditDirectExpense('${o.id}','${e.id}','delete','')">Удалить</button>`:'<span class="text-xs">Из этапа</span>'}</div>`).join('')}<button class="btn-ghost mt-2" onclick="projectEditDirectExpense('${o.id}','','add','')">+ Расход проекта</button></section>`;
}
function projectEditDirectExpense(oid,eid,field,value) {
  const o=getOrder(oid);if(!o||!orderUserCanManage(currentUser())||!orderUserCanSeeMoney(o,currentUser()))return;
  o.extraExpenses||=[];const e=o.extraExpenses.find(e=>e.id===eid);if(e?.stageDerived)return;
  if(field==='add')o.extraExpenses.push({id:uid(),type:'other',label:'Прямой расход',amount:0,actual:false,projectDirect:true,createdAt:new Date().toISOString()});
  else if(field==='delete')o.extraExpenses=o.extraExpenses.filter(e=>e.id!==eid);
  else if(e&&['amount','label','serviceId','actual'].includes(field))e[field]=field==='amount'?Math.max(0,Number(value)||0):value;
  save();if(field==='add'||field==='delete'){preservePositionForNextRender();render();}
}

function projectServiceScope(o, group) {
  const bases = { actualWidth:'width',actualHeight:'height',actualQty:'qty' };
  const pick = (item, fields) => Object.fromEntries(fields.filter(field => item?.[field] !== undefined && !(bases[field] && (Number(item[field])<=0 || Number(item[field])===Number(item[bases[field]])))).map(field=>[field,item[field]]));
  // Each window with its room (where the work is); their order is not part of it.
  const rooms = new Map(measureAllWindows(o).map(({ room, win }) => [win, room?.id ?? null]));
  const byId = (a, b) => String(a.id ?? '').localeCompare(String(b.id ?? ''));
  return JSON.stringify([...group.windows.map(win => ({ ...pick(win, PROJECT_SCOPE_WINDOW_FIELDS), roomId: rooms.get(win) ?? null })).sort(byId), ...group.lines.map(line => pick(line, PROJECT_SCOPE_LINE_FIELDS))], (_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
}
