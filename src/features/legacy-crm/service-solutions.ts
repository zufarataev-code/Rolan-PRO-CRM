type Row = Record<string, any>;
const object = (x: unknown): Row => x && typeof x === 'object' && !Array.isArray(x) ? x as Row : {};
const rows = (x: unknown): Row[] => Array.isArray(x) ? x.map(object) : [];
const scope = (order: Row) => [...rows(order.extraServices), ...rows(object(order.measurements).rooms).flatMap(room => rows(room.windows))];

export const SERVICE_DIRECTIONS = ['solar', 'smart', 'protective', 'decorative', 'privacy'] as const;
export const SERVICE_UNITS = ['sqft', 'piece', 'zone', 'fixed', 'custom'] as const;
/** Owner-only economics of a service: the installer rate and the material cost per unit. */
const OWNER_OFFERING_FIELDS = ['installerRatePerSqft', 'materialCostPerUnit'] as const;

/** The CRM's film category for a catalog value (mirrors canonicalCatalogCategory in the legacy page). */
export function canonicalFilmCategory(value: unknown): string {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const aliases: Record<string, string> = {
    solar_film: 'solar', sun: 'solar', sun_control: 'solar', window_film: 'solar', солнцезащитная: 'solar', солнцезащитная_пленка: 'solar',
    smart_film: 'smart', pdlc: 'smart', switchable: 'smart', switchable_film: 'smart', смарт: 'smart', смарт_пленка: 'smart',
    protective_film: 'protective', safety: 'protective', safety_film: 'protective', security: 'protective', security_film: 'protective',
    anti_graffiti: 'protective', antigraffiti: 'protective', защитная: 'protective', защитная_пленка: 'protective',
    decorative_film: 'decorative', frost: 'decorative', frosted: 'decorative', frosted_film: 'decorative', декоративная: 'decorative', декоративная_пленка: 'decorative',
    privacy_film: 'privacy', приватная: 'privacy', приватная_пленка: 'privacy',
  };
  return aliases[normalized] || normalized;
}

const DIRECTION_BY_SERVICE_TYPE: Row = { solar_film: 'solar', smart_film: 'smart', protective_film: 'protective', decorative_film: 'decorative', privacy_film: 'privacy' };

/** Managers receive customer prices; the owner alone maintains solution definitions. */
export function serviceSolutionsForViewer(payload: Row, owner: boolean, ownInstallerIds: readonly string[] = []): Row {
  if (owner) return payload;
  const copy = structuredClone(payload);
  for (const offering of rows(object(copy.settings).serviceOfferings)) for (const field of OWNER_OFFERING_FIELDS) delete offering[field];
  for (const order of rows(copy.orders)) {
    const windows = rows(object(order.measurements).rooms).flatMap(room => rows(room.windows));
    for (const item of scope(order)) {
      const id = windows.includes(item)
        ? item.offeringId ? `offering:${item.offeringId}` : `direction:${item.measureScope || order.serviceType || 'solar_film'}`
        : `line:${item.id}`;
      const schedules = rows(order.serviceSchedules);
      const crew = schedules.length ? rows(order.serviceSchedules).find(plan => plan.id === id)?.installerIds
        : item.installerIds?.length ? item.installerIds : order.installerIds;
      // An installer needs the saved rate for their own service earnings only.
      if (!Array.isArray(crew) || !crew.some(id => ownInstallerIds.includes(id))) delete item.offeringInstallerRate;
      // Material cost is the owner's economics.
      delete item.offeringMaterialCost;
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
      for (const field of OWNER_OFFERING_FIELDS) {
        if (original && field in original) copy[field] = original[field];
        else delete copy[field];
      }
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
    if (!(SERVICE_DIRECTIONS as readonly string[]).includes(offering.direction) || typeof offering.name !== 'string' || !offering.name.trim() || offering.name.length > 120) return 'Укажите направление и название услуги.';
    for (const field of ['pricePerSqft','installerRatePerSqft']) if (typeof offering[field] !== 'number' || !Number.isFinite(offering[field]) || offering[field] < 0) return 'Цена и ставка услуги должны быть неотрицательными числами.';
    if (offering.unit !== undefined && !(SERVICE_UNITS as readonly string[]).includes(offering.unit)) return 'Неизвестная единица услуги.';
    if (offering.unitLabel !== undefined && (typeof offering.unitLabel !== 'string' || offering.unitLabel.length > 30)) return 'Название единицы — до 30 символов.';
    if (offering.materialCostPerUnit !== undefined && (typeof offering.materialCostPerUnit !== 'number' || !Number.isFinite(offering.materialCostPerUnit) || offering.materialCostPerUnit < 0)) return 'Стоимость материала услуги должна быть неотрицательным числом.';
    // Film categories are compared as the CRM reads them («privacy_film», «Солнцезащитная»…).
    if (offering.filmIds !== undefined && (!Array.isArray(offering.filmIds) || offering.filmIds.some((id: unknown) => !films.some(film => film.id === id && canonicalFilmCategory(film.category) === offering.direction)))) return 'Материалы должны принадлежать направлению услуги.';
  }
  for (const order of rows(next.orders)) {
    const oldOrder = rows(current.orders).find(item=>item.id===order.id) || {};
    const oldItems = scope(oldOrder);
    for (const item of scope(order)) {
      const old = oldItems.find(value=>value.id===item.id);
      const offering = offerings.find(value=>value.id===item.offeringId);
      if (!owner || item.offeringId !== old?.offeringId) {
        if (item.offeringId && item.offeringId === old?.offeringId && old && 'offeringInstallerRate' in old) item.offeringInstallerRate = old.offeringInstallerRate;
        else if (offering) item.offeringInstallerRate = offering.installerRatePerSqft;
        else delete item.offeringInstallerRate;
        if (item.offeringId && item.offeringId === old?.offeringId && old && 'offeringMaterialCost' in old) item.offeringMaterialCost = old.offeringMaterialCost;
        else if (offering && typeof offering.materialCostPerUnit === 'number') item.offeringMaterialCost = offering.materialCostPerUnit;
        else delete item.offeringMaterialCost;
      }
      // A service without sizes is «quantity × price» (Owner, 2026-10-05): only a
      // directory service that is not per sq ft can be a line, and the server
      // keeps its unit and unit price and derives the line price.
      if (item.type === 'offering' && item.offeringId && !item.quickProjectLine) {
        const sameService = old && old.offeringId === item.offeringId && old.type === 'offering';
        if (!sameService) {
          if (!offering || offering.active === false) return 'Услуга не найдена в справочнике.';
          if (!offering.unit || offering.unit === 'sqft') return 'Услуга за кв. фут считается по замеру окон, а не количеством.';
          item.unit = offering.unit;
          item.unitLabel = offering.unit === 'custom' && typeof offering.unitLabel === 'string' ? offering.unitLabel : '';
          item.unitPrice = typeof offering.pricePerSqft === 'number' ? offering.pricePerSqft : 0;
        } else {
          item.unit = old.unit;
          item.unitLabel = old.unitLabel;
          item.unitPrice = old.unitPrice;
        }
        const qty = Number(item.qty);
        if (!Number.isFinite(qty) || qty < 0) return 'Количество услуги должно быть неотрицательным числом.';
        item.qty = qty;
        item.price = Math.round((Number(item.unitPrice) || 0) * qty * 100) / 100;
      }
      // Old signed/history selections survive archival or changed material lists.
      if (item.offeringId && (item.offeringId !== old?.offeringId || item.catalogId !== old?.catalogId)) {
        const direction = DIRECTION_BY_SERVICE_TYPE[item.measureScope || item.serviceType || order.serviceType];
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
