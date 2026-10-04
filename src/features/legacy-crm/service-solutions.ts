type Row = Record<string, any>;
const object = (x: unknown): Row => x && typeof x === 'object' && !Array.isArray(x) ? x as Row : {};
const rows = (x: unknown): Row[] => Array.isArray(x) ? x.map(object) : [];
const scope = (order: Row) => [...rows(order.extraServices), ...rows(object(order.measurements).rooms).flatMap(room => rows(room.windows))];

/** Managers receive customer prices; the owner alone maintains solution definitions. */
export function serviceSolutionsForViewer(payload: Row, owner: boolean, ownInstallerIds: readonly string[] = []): Row {
  if (owner) return payload;
  const copy = structuredClone(payload);
  for (const offering of rows(object(copy.settings).serviceOfferings)) delete offering.installerRatePerSqft;
  for (const order of rows(copy.orders)) {
    const windows = rows(object(order.measurements).rooms).flatMap(room => rows(room.windows));
    for (const item of scope(order)) {
      const id = windows.includes(item)
        ? item.offeringId ? `offering:${item.offeringId}` : `direction:${item.measureScope || order.serviceType || 'solar_film'}`
        : item.quickProjectLine && item.offeringId && Number(item.qty) === 0 ? `offering:${item.offeringId}` : `line:${item.id}`;
      const schedules = rows(order.serviceSchedules);
      const crew = schedules.length ? rows(order.serviceSchedules).find(plan => plan.id === id)?.installerIds
        : item.installerIds?.length ? item.installerIds : order.installerIds;
      // An installer needs the saved rate for their own service earnings only.
      if (!Array.isArray(crew) || !crew.some(id => ownInstallerIds.includes(id))) delete item.offeringInstallerRate;
    }
  }
  return copy;
}

export function prepareServiceSolutions(current: Row, next: Row, owner: boolean): string | null {
  const currentOfferings = rows(object(current.settings).serviceOfferings);
  const settings = object(next.settings);
  if (!owner) {
    // Restore server-owned rates before comparing. Redacted reads must round-trip.
    const submitted = rows(settings.serviceOfferings).map(offering => {
      const original = currentOfferings.find(item => item.id === offering.id);
      const copy = {...offering};
      if (original && 'installerRatePerSqft' in original) copy.installerRatePerSqft = original.installerRatePerSqft;
      else delete copy.installerRatePerSqft;
      return copy;
    });
    const normalize = (values: Row[]) => JSON.stringify(values.map(item => Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b)))).sort((a,b)=>String(a.id).localeCompare(String(b.id))));
    if (normalize(submitted) !== normalize(currentOfferings)) return 'Только владелец может менять справочник услуг.';
    if ('serviceOfferings' in object(current.settings)) settings.serviceOfferings = structuredClone(currentOfferings);
  }
  const offerings = rows(settings.serviceOfferings);
  const ids = new Set<string>();
  const films = rows(settings.catalog);
  for (const offering of offerings) {
    if (typeof offering.id !== 'string' || !/^[\w-]{1,120}$/.test(offering.id) || ids.has(offering.id)) return 'Некорректный или повторный ID услуги.';
    ids.add(offering.id);
    if (!['solar','smart','protective','decorative'].includes(offering.direction) || typeof offering.name !== 'string' || !offering.name.trim() || offering.name.length > 120) return 'Укажите направление и название услуги.';
    for (const field of ['pricePerSqft','installerRatePerSqft']) if (typeof offering[field] !== 'number' || !Number.isFinite(offering[field]) || offering[field] < 0) return 'Цена и ставка услуги должны быть неотрицательными числами.';
    if (offering.filmIds !== undefined && (!Array.isArray(offering.filmIds) || offering.filmIds.some((id: unknown) => !films.some(film => film.id === id && film.category === offering.direction)))) return 'Материалы должны принадлежать направлению услуги.';
  }
  for (const order of rows(next.orders)) {
    const oldOrder = rows(current.orders).find(item=>item.id===order.id) || {};
    const oldItems = scope(oldOrder);
    for (const item of scope(order)) {
      const old = oldItems.find(value=>value.id===item.id);
      const offering = offerings.find(value=>value.id===item.offeringId);
      if (!owner || item.offeringId !== old?.offeringId) {
        if (item.offeringId && item.offeringId === old?.offeringId && old && 'offeringInstallerRate' in old) item.offeringInstallerRate = old.offeringInstallerRate;
        else if (offering) {
          // A newly measured opening inherits the already selected project service,
          // whose rate is a server-owned historical snapshot, not the current catalog.
          const selected = oldItems.find(value => value.quickProjectLine && value.offeringId === item.offeringId);
          item.offeringInstallerRate = selected && 'offeringInstallerRate' in selected ? selected.offeringInstallerRate : offering.installerRatePerSqft;
        }
        else delete item.offeringInstallerRate;
      }
      // Old signed/history selections survive archival or changed material lists.
      if (item.offeringId && (item.offeringId !== old?.offeringId || item.catalogId !== old?.catalogId)) {
        const direction = ({solar_film:'solar',smart_film:'smart',protective_film:'protective',decorative_film:'decorative'} as Row)[item.measureScope || item.serviceType || order.serviceType];
        if (!offering || offering.active === false || offering.direction !== direction) return 'Услуга не соответствует направлению проекта.';
        if (item.catalogId && !offering.filmIds?.includes(item.catalogId)) return 'Плёнка не привязана к выбранной услуге.';
      }
    }
    if (JSON.stringify(order.serviceSchedules) !== JSON.stringify(oldOrder.serviceSchedules)) {
      if (!Array.isArray(order.serviceSchedules)) return 'Некорректные назначения услуг.';
      const seen = new Set();
      for (const plan of rows(order.serviceSchedules)) {
        if (typeof plan.id !== 'string' || seen.has(plan.id) || !/^\w[\w:-]{0,240}$/.test(plan.id) || typeof plan.installationAt !== 'string' || Number.isNaN(Date.parse(plan.installationAt)) || !Array.isArray(plan.installerIds) || !plan.installerIds.length) return 'Укажите дату и исполнителей каждой услуги.';
        seen.add(plan.id);
        if (plan.installerIds.some((id: unknown)=>!rows(next.users).some(user=>user.id===id && user.role==='installer'))) return 'Исполнитель услуги должен быть специалистом по установке.';
      }
    }
    if (Array.isArray(order.serviceSchedules) && order.serviceSchedules.length) {
      order.installerIds = [...new Set(rows(order.serviceSchedules).flatMap(plan => Array.isArray(plan.installerIds) ? plan.installerIds : []))];
      order.installationAt = rows(order.serviceSchedules).map(plan => plan.installationAt).filter(value=>typeof value === 'string').sort()[0];
    }
  }
  return null;
}
