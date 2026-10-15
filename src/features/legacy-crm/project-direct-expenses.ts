type Row = Record<string, any>;
const rows = (value: unknown): Row[] => Array.isArray(value) ? value : [];
const stable = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);

/** Direct project costs are entered by the owner or its assigned manager.
 * They remain one expense, whether attached to a work line or the whole site.
 */
export function validateProjectDirectExpenses(current: Row, next: Row, owner: boolean, managerIds: readonly string[]): string | null {
  for (const order of rows(next.orders)) {
    const before = rows(current.orders).find(item => item.id === order.id);
    if (stable(before?.extraExpenses ?? []) === stable(order.extraExpenses ?? [])) continue;
    const manual = (value: Row | undefined) => rows(value?.extraExpenses).filter(expense => !(expense.stageDerived === true
      && rows(value?.productionStages).some(stage => expense.id === `stage:${stage.id}`)));
    if (!owner && stable(manual(before)) !== stable(manual(order)) && (!before || !managerIds.includes(String(before.managerId)))) return 'Расходы может менять только ответственный менеджер проекта.';
    if (!Array.isArray(order.extraExpenses)) return 'Некорректные расходы проекта.';
    const serviceIds = new Set([
      ...rows(order.extraServices).map(line => `line:${line.id}`),
      ...rows(order.measurements?.rooms).flatMap(room => rows(room.windows)).map(win => win.offeringId
        ? `offering:${win.offeringId}` : `direction:${win.measureScope || order.serviceType || 'solar_film'}`),
    ]);
    const seen = new Set<string>();
    for (const expense of order.extraExpenses) {
      if (!expense || typeof expense !== 'object' || Array.isArray(expense)
        || typeof expense.id !== 'string' || !expense.id || seen.has(expense.id)) return 'Расход должен иметь уникальный идентификатор.';
      seen.add(expense.id);
      if (stable(rows(before?.extraExpenses).find(item => item.id === expense.id)) === stable(expense)) continue;
      if (typeof expense.amount !== 'number' || !Number.isFinite(expense.amount) || expense.amount < 0) return 'Сумма расхода должна быть неотрицательным числом.';
      if (expense.serviceId && !serviceIds.has(expense.serviceId)) return 'Расход привязан к отсутствующей услуге проекта.';
      if (expense.actual !== undefined && typeof expense.actual !== 'boolean') return 'Некорректный статус расхода.';
    }
  }
  return null;
}
