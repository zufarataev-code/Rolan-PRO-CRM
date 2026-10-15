import { canonicalFilmCategory, serviceGroupIds, serviceGroupScope } from './service-solutions';
import { serviceScopeApproved } from './service-scope-approvals';
import { createHash } from 'node:crypto';

type Row = Record<string, any>;
const rows = (value: unknown): Row[] => Array.isArray(value) ? value : [];
const stable = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const active = ['installation_scheduled', 'installation_accepted', 'installation_en_route', 'installation_in_progress'];
const closed = ['installation_done', 'act_signed', 'payment_received', 'completed', 'review_received'];
const money = (value: number) => Math.round(value * 100) / 100;

export function productionStages(order: Row, serviceId?: string): Row[] {
  return rows(order.productionStages).filter(stage => !serviceId || stage.serviceId === serviceId);
}
export function stagePlanComplete(stage: Row): boolean {
  return !!stage.startsAt && !!stage.endsAt && Number.isFinite(Date.parse(stage.startsAt))
    && Date.parse(stage.endsAt) > Date.parse(stage.startsAt)
    && (rows(stage.contractors).length > 0 || (Array.isArray(stage.installerIds) && stage.installerIds.length > 0))
    && (stage.installerIds?.length ? stage.installerIds.includes(stage.responsibleId) : !!stage.contractors?.[0]?.name);
}
export function stageAssignments(order: Row, serviceId: string): Row | null {
  const stages = productionStages(order, serviceId);
  if (!stages.length) return null;
  return { id: serviceId, installationAt: stages.map(stage => stage.startsAt).filter(Boolean).sort()[0] || '',
    installerIds: [...new Set(stages.flatMap(stage => stage.installerIds || []))],
    externalExecutor: stages.some(stage => rows(stage.contractors).length > 0), stagesComplete: stages.every(stagePlanComplete) };
}

function windowArea(win: Row): number {
  if (rows(win.panels).length && win.actualPanels == null) {
    return rows(win.panels).filter(panel => Number(panel.width) > 0 && Number(panel.height) > 0).reduce((sum, panel) => sum + Number(panel.width || 0) * Number(panel.height || 0) / 92903.04, 0) * Number(win.qty || 1);
  }
  return Number(Number(win.actualWidth) > 0 ? win.actualWidth : win.width || 0) * Number(Number(win.actualHeight) > 0 ? win.actualHeight : win.height || 0)
    * Number(Number(win.actualQty) > 0 ? win.actualQty : win.qty || 1) / 92903.04;
}

/** Existing service rate and saved dimensions, never a submitted payroll total. */
export function serviceLaborBudget(payload: Row, order: Row, serviceId: string, user?: Row): number {
  const settings = payload.settings || {};
  const pc = user?.payConfig || {};
  const windows = rows(order.measurements?.rooms).flatMap(room => rows(room.windows)).filter(win =>
    (win.offeringId ? `offering:${win.offeringId}` : `direction:${win.measureScope || order.serviceType || 'solar_film'}`) === serviceId);
  const lines = rows(order.extraServices).filter(line => `line:${line.id}` === serviceId);
  const amountFor = (item: Row, sqft: boolean) => {
    const offering = rows(settings.serviceOfferings).find(value => value.id === item.offeringId);
    const film = rows(settings.catalog).find(value => value.id === item.catalogId);
    const category = canonicalFilmCategory(film?.category || item.measureScope || item.serviceType || order.serviceType);
    const code = ({ solar: 'SOLAR_FILM', smart: 'SMART_FILM', protective: 'SAFETY_FILM', decorative: 'DECORATIVE_FILM', privacy: 'PRIVACY_FILM' } as Row)[category];
    const savedOrder = rows(payload.orders).find(value => value.id === order.id);
    const savedItem = [...rows(savedOrder?.extraServices), ...rows(savedOrder?.measurements?.rooms).flatMap(room => rows(room.windows))].find(value => value.id === item.id);
    const own = Number(savedItem?.offeringInstallerRate ?? offering?.installerRatePerSqft) || 0;
    const rate = own > 0 ? own : sqft
      ? Number(pc.ratesByCategory?.[category] || pc.ratePerSqft || settings.installerRates?.serviceTypes?.[code]
        || settings.installerRates?._defaults?.[category] || settings.installerRates?._defaults?.other || 2.5)
      : Number(pc.ratesByWorkType?.[item.type] || settings.installerRates?.workTypes?.[item.type] || 0);
    const quantity = windows.includes(item) ? windowArea(item) : Number(item.qty) || 0;
    const coefficient = sqft ? Number(settings.complexityCoefs?.[order.complexity || 'standard'] ?? 1) : 1;
    return quantity * rate * coefficient;
  };
  return money(windows.reduce((sum, win) => sum + amountFor(win, true), 0)
    + lines.reduce((sum, line) => sum + amountFor(line, line.quickProjectLine === true && line.unit === 'sqft'), 0));
}

export function stagePayroll(payload: Row, order: Row, stage: Row): Row[] {
  const ids: string[] = [...new Set<string>(stage.installerIds || [])].sort();
  return ids.map((userId, index) => {
    const user = rows(payload.users).find(value => value.id === userId);
    if (user?.payConfig?.type !== 'per_sqft') return { userId, amount: 0 };
    const stages = productionStages(order, stage.serviceId).sort((a,b) => a.id.localeCompare(b.id));
    const before = stages.slice(0, stages.findIndex(item => item.id === stage.id)).reduce((sum,item) => sum + item.laborSharePct,0);
    const budgetCents = Math.round(serviceLaborBudget(payload, order, stage.serviceId, user) * 100);
    const totalCents = Math.round(budgetCents * (before + stage.laborSharePct) / 100) - Math.round(budgetCents * before / 100);
    // Round the entire stage budget first; deterministic cent allocation.
    return { userId, amount: (Math.floor(totalCents / ids.length) + (index < totalCents % ids.length ? 1 : 0)) / 100 };
  });
}

/** Role-safe field writes take only a requested status, with server timestamps. */
export function mergeFieldProductionStages(order: Row, submitted: unknown, identities: Set<string>, now = new Date().toISOString()): Row[] {
  return productionStages(order).map(stage => {
    const result = structuredClone(stage);
    const actor = (stage.installerIds || []).find((id: string) => identities.has(id));
    const request = rows(submitted).find(item => item.id === stage.id);
    if (!active.includes(String(order.status)) || !actor || !request || stage.status === 'done') return result;
    if (!['in_progress', 'done'].includes(request.status) || request.status === stage.status) return result;
    if (stage.dependsOn && productionStages(order).find(item => item.id === stage.dependsOn)?.status !== 'done') return result;
    result.status = request.status;
    result.startedAt ||= now;
    result.startedBy ||= actor;
    if (request.status === 'done') { result.doneAt = now; result.doneBy = actor; }
    return result;
  });
}

/** Validate, stamp and project operational stages into the established plans/costs. */
export function prepareProductionStages(current: Row, next: Row, owner: boolean, managerIds: readonly string[], field = false, actorId = ''): string | null {
  const now = new Date().toISOString();
  for (const order of rows(next.orders)) {
    const before = rows(current.orders).find(value => value.id === order.id) || {};
    // A service completed without a multi-stage plan is one complete stage.
    // Field progress was already merged and authorized before this preparation.
    for (const serviceId of serviceGroupIds(order)) {
      if (order.serviceProgress?.[serviceId]?.status !== 'done' || before.serviceProgress?.[serviceId]?.status === 'done'
        || productionStages(order, serviceId).length) continue;
      const assignment = rows(order.serviceSchedules).find(plan => plan.id === serviceId);
      const installerIds = assignment?.installerIds || order.installerIds || [];
      const startsAt = assignment?.installationAt || order.installationAt;
      if (!startsAt || !installerIds.length || !Number.isFinite(Date.parse(startsAt))) continue;
      order.productionStages ||= [];
      order.productionStages.push({
        id: 'service_' + createHash('sha256').update(serviceId).digest('hex').slice(0, 24),
        serviceId, title: 'Выполнение услуги', startsAt,
        endsAt: new Date(Date.parse(startsAt) + 8 * 3600000).toISOString(),
        installerIds: [...installerIds], responsibleId: installerIds[0], contractors: [],
        laborSharePct: 100, status: 'done', doneBy: order.serviceProgress[serviceId].doneBy,
        startedBy: order.serviceProgress[serviceId].doneBy,
      });
    }
    const stages = productionStages(order);
    const changed = stable(order.productionStages ?? []) !== stable(before.productionStages ?? []);
    if (!stages.length && !changed) continue;
    const manager = owner || managerIds.includes(String(before.managerId));
    if (changed && !manager && !field) return 'Этапы может менять только ответственный менеджер проекта.';
    if (changed && !['proposal_accepted', ...active].includes(String(before.status))) return 'Этапы планируют после принятия КП; закрытый проект сохраняет историю.';
    if (order.productionStages !== undefined && !Array.isArray(order.productionStages)) return 'Некорректные этапы проекта.';
    const services = new Set(serviceGroupIds(order));
    const ids = new Set<string>();
    if (stages.length > 200) return 'Слишком много этапов проекта.';
    for (const stage of stages) {
      if (!stage || typeof stage !== 'object' || Array.isArray(stage)) return 'Некорректный этап проекта.';
      if (typeof stage.id !== 'string' || !/^[\w-]{1,100}$/.test(stage.id) || ids.has(stage.id)) return 'Этап должен иметь уникальный идентификатор.';
      ids.add(stage.id);
      if (!services.has(stage.serviceId) || typeof stage.title !== 'string' || !stage.title.trim() || stage.title.length > 160) return 'Укажите услугу и название этапа.';
      const savedStage = productionStages(before).find(item => item.id === stage.id);
      if (!serviceScopeApproved(order,stage.serviceId) && (!savedStage || stage.status !== savedStage.status)) return 'Сначала согласуйте дополнительную услугу с клиентом.';
      if (!Array.isArray(stage.installerIds) || stage.installerIds.some((id: unknown) => !rows(next.users).some(user => user.id === id && user.role === 'installer' && user.active !== false))) return 'Выберите действующих специалистов этапа.';
      stage.installerIds = [...new Set(stage.installerIds)];
      if (!Number.isFinite(stage.laborSharePct) || stage.laborSharePct < 0 || stage.laborSharePct > 100) return 'Доля оплаты этапа должна быть от 0 до 100%.';
      if (!['planned', 'in_progress', 'done'].includes(stage.status)) return 'Некорректный статус этапа.';
      for (const key of ['startsAt', 'endsAt']) if (stage[key] && (typeof stage[key] !== 'string' || !Number.isFinite(Date.parse(stage[key])))) return 'Некорректная дата этапа.';
      if (stage.startsAt && stage.endsAt && Date.parse(stage.endsAt) <= Date.parse(stage.startsAt)) return 'Окончание этапа должно быть позже начала.';
      if (stage.responsibleId && !stage.installerIds.includes(stage.responsibleId)) return 'Ответственный должен входить в бригаду этапа.';
      if (stage.contractors !== undefined && !Array.isArray(stage.contractors)) return 'Некорректные подрядчики этапа.';
      if (rows(stage.contractors).length > 20) return 'Слишком много подрядчиков этапа.';
      for (const contractor of rows(stage.contractors)) {
        if (!contractor || typeof contractor !== 'object' || typeof contractor.name !== 'string' || !contractor.name.trim() || contractor.name.length > 160 || !Number.isFinite(contractor.amount) || contractor.amount < 0) return 'Укажите подрядчика и согласованную сумму.';
      }
      const old = productionStages(before).find(item => item.id === stage.id);
      // Neither client totals nor payout snapshots are accepted from browsers.
      delete stage.ownEarnings;
      stage.payroll = old?.payroll ? structuredClone(old.payroll) : [];
      if (old?.status === 'done' && stable({ ...stage, payroll: undefined }) !== stable({ ...old, payroll: undefined })) return 'Выполненный этап сохраняет даты, состав бригады и начисления.';
      if (stage.status !== 'planned' && old?.status !== 'done') {
        if (!active.includes(String(before.status)) || !stagePlanComplete(stage)) return 'Сначала подтвердите полный план монтажа.';
        if (stage.dependsOn && stages.find(item => item.id === stage.dependsOn)?.status !== 'done') return 'Сначала завершите предыдущий этап.';
        stage.startedAt = old?.startedAt || now;
        stage.startedBy = old?.startedBy || (field ? stage.startedBy : actorId || managerIds[0] || 'owner');
      }
      if (stage.status === 'done' && old?.status !== 'done') {
        stage.doneAt = now;
        stage.doneBy = field ? stage.doneBy : actorId || managerIds[0] || 'owner';
        stage.payroll = stagePayroll(current, order, stage);
        order.timeline ||= [];
        order.timeline.push({ at: now, key: 'production_stage_done', by: stage.doneBy, note: stage.title, stageId: stage.id, serviceId: stage.serviceId });
      }
    }
    for (const old of productionStages(before)) if (old.status === 'done' && !ids.has(old.id)) return 'Выполненный этап не удаляют.';
    for (const serviceId of new Set(productionStages(before).filter(stage => stage.status === 'done').map(stage => stage.serviceId))) {
      if (serviceGroupScope(before,serviceId) !== serviceGroupScope(order,serviceId)) return 'После первого выполненного этапа объём услуги зафиксирован.';
      if (productionStages(before,serviceId).some(old => productionStages(order,serviceId).find(stage => stage.id === old.id)?.laborSharePct !== old.laborSharePct)) return 'После первого начисления доли оплаты этапов зафиксированы.';
    }
    for (const stage of stages) {
      const trail = new Set<string>([stage.id]); let parent = stage.dependsOn;
      while (parent) {
        if (trail.has(parent)) return 'Этапы не могут зависеть друг от друга по кругу.';
        const previous = stages.find(item => item.id === parent);
        if (!previous) return 'Предыдущий этап отсутствует.';
        trail.add(parent); parent = previous.dependsOn;
      }
    }
    const enters = active.includes(String(order.status)) && !active.includes(String(before.status));
    const closes = closed.includes(String(order.status)) && !closed.includes(String(before.status));
    for (const serviceId of new Set(productionStages(before).map(stage => stage.serviceId))) if (!stages.some(stage => stage.serviceId === serviceId)) {
      const plan = rows(order.serviceSchedules).find(item => item.id === serviceId);
      if (plan) { delete plan.externalExecutor; delete plan.stagesComplete; }
    }
    for (const serviceId of new Set(stages.map(stage => stage.serviceId))) {
      const serviceStages = productionStages(order, serviceId);
      const share = serviceStages.reduce((sum, stage) => sum + stage.laborSharePct, 0);
      if (Math.abs(share - 100) > 0.001) return 'Доли оплаты всех этапов одной услуги должны составлять 100%.';
      if ((enters || closes) && serviceStages.some(stage => !stagePlanComplete(stage))) return 'Укажите даты, исполнителей и ответственного каждого этапа.';
      if (closes && serviceStages.some(stage => stage.status !== 'done')) return 'Сначала завершите все обязательные этапы проекта.';
      if (serviceStages.every(stage => stage.status === 'done')) {
        order.serviceProgress ||= {};
        const last = [...serviceStages].sort((a, b) => String(a.doneAt).localeCompare(String(b.doneAt))).pop()!;
        order.serviceProgress[serviceId] = { status: 'done', doneAt: last.doneAt, doneBy: last.doneBy, startedAt: serviceStages.map(stage => stage.startedAt).filter(Boolean).sort()[0] };
      } else if (serviceStages.some(stage => stage.status === 'in_progress' || stage.status === 'done')) {
        order.serviceProgress ||= {}; order.serviceProgress[serviceId] = { status: 'in_progress', startedAt: serviceStages.map(stage => stage.startedAt).filter(Boolean).sort()[0] };
      } else if (order.serviceProgress?.[serviceId]) delete order.serviceProgress[serviceId];
      const plan = stageAssignments(order, serviceId)!;
      order.serviceSchedules ||= [];
      order.serviceSchedules = rows(order.serviceSchedules).filter(item => item.id !== serviceId).concat(plan);
    }
    // Project one contractor obligation into one direct expense, not payroll.
    const stageExpenseIds = new Set([...productionStages(before), ...stages].map(stage => `stage:${stage.id}`));
    const expenseHistory = new Map(rows(order.extraExpenses).filter(expense => stageExpenseIds.has(expense.id)).map(expense => [expense.id,expense]));
    order.extraExpenses = rows(order.extraExpenses).filter(expense => !stageExpenseIds.has(expense.id));
    for (const stage of stages) if (rows(stage.contractors).length) order.extraExpenses.push({
      ...expenseHistory.get(`stage:${stage.id}`),
      id: `stage:${stage.id}`, type: 'subcontractor', label: `${stage.title}: ${stage.contractors.map((item: Row) => item.name).join(', ')}`,
      amount: money(stage.contractors.reduce((sum: number, item: Row) => sum + item.amount, 0)), serviceId: stage.serviceId,
      stageId: stage.id, stageDerived: true, projectDirect: true, actual: stage.status === 'done',
    });
    if (active.includes(String(order.status))) {
      order.installerIds = [...new Set(rows(order.serviceSchedules).flatMap(plan => plan.installerIds || []))];
      order.installationAt = rows(order.serviceSchedules).map(plan => plan.installationAt).filter(Boolean).sort()[0];
    }
  }
  return null;
}
