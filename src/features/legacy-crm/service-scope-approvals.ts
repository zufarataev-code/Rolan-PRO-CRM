import { serviceGroupIds, serviceGroupScope } from './service-solutions';
type Row = Record<string, any>;
const rows = (value: unknown): Row[] => Array.isArray(value) ? value : [];
const approvedStatuses = ['proposal_accepted','installation_scheduled','installation_accepted','installation_en_route','installation_in_progress','installation_done','act_signed','payment_received','completed','review_received'];
export function serviceScopeApproved(order: Row, id: string): boolean {
  if (!Array.isArray(order.serviceScopeApprovals)) return approvedStatuses.includes(order.status);
  return order.serviceScopeApprovals.some((entry: Row) => entry.serviceId === id && entry.scope === serviceGroupScope(order,id));
}
export function prepareServiceScopeApprovals(current: Row, next: Row, owner: boolean, managerIds: readonly string[], actor: string): string | null {
  for (const order of rows(next.orders)) {
    const before = rows(current.orders).find(value => value.id === order.id);
    if (!before || (!approvedStatuses.includes(before.status) && !approvedStatuses.includes(order.status))) continue;
    const baseline = Array.isArray(before.serviceScopeApprovals) ? structuredClone(before.serviceScopeApprovals)
      : serviceGroupIds(before).map(serviceId => ({serviceId,scope:serviceGroupScope(before,serviceId),approvedAt:before.proposalAcceptedAt || new Date().toISOString(),approvedBy:actor,source:'accepted_proposal'}));
    if (order.status === 'proposal_accepted' && before.status !== 'proposal_accepted') {
      order.serviceScopeApprovals = serviceGroupIds(order).map(serviceId => ({ serviceId, scope:serviceGroupScope(order,serviceId), approvedAt:new Date().toISOString(), approvedBy:actor, source:'accepted_proposal' }));
      continue;
    }
    const requests = rows(order.serviceScopeApprovals).filter(entry => entry.requestApproval === true);
    if (requests.length && !owner && !managerIds.includes(before.managerId)) return 'Дополнительные услуги согласует ответственный менеджер.';
    for (const request of requests) {
      if (!serviceGroupIds(order).includes(request.serviceId) || typeof request.note !== 'string' || request.note.trim().length < 3 || request.note.length > 500) return 'Запишите подтверждение клиента для дополнительной услуги.';
      const entry = { serviceId:request.serviceId, scope:serviceGroupScope(order,request.serviceId), approvedAt:new Date().toISOString(), approvedBy:actor, note:request.note.trim(), source:'client_change_order' };
      const index = baseline.findIndex((item:Row) => item.serviceId === request.serviceId);
      if(index < 0) baseline.push(entry); else baseline[index]=entry;
      order.timeline ||= [];order.timeline.push({at:entry.approvedAt,key:'service_change_approved',by:actor,serviceId:entry.serviceId,note:entry.note});
    }
    order.serviceScopeApprovals = baseline;
  }
  return null;
}
