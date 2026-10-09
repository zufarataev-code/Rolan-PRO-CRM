type Row = Record<string, any>;
const object = (x: unknown): Row => x && typeof x === 'object' && !Array.isArray(x) ? x as Row : {};
const rows = (x: unknown): Row[] => Array.isArray(x) ? x.map(object) : [];
const scope = (order: Row) => [...rows(order.extraServices), ...rows(object(order.measurements).rooms).flatMap(room => rows(room.windows))];

export const SERVICE_DIRECTIONS = ['solar', 'smart', 'protective', 'decorative', 'privacy'] as const;
export const SERVICE_UNITS = ['sqft', 'lft', 'piece', 'zone', 'fixed', 'custom'] as const;
// Project statuses for planning its services (Owner, 2026-10-09).
const SCHEDULED_PROJECT_STATUSES = ['installation_scheduled', 'installation_accepted', 'installation_en_route', 'installation_in_progress'];
const CLOSED_PROJECT_STATUSES = ['installation_done', 'act_signed', 'payment_received', 'completed', 'review_received'];
/**
 * The services of a project as the CRM plans them (projectServiceGroups): the
 * windows of one service together, every other row on its own, quick lines
 * only before measurement. Each needs its own plan to enter installation.
 */
function serviceGroupIds(order: Row): string[] {
  const windows = rows(object(order.measurements).rooms).flatMap(room => rows(room.windows));
  const ids = windows.map(win => typeof win.offeringId === 'string' && win.offeringId ? `offering:${win.offeringId}` : `direction:${win.measureScope || order.serviceType || 'solar_film'}`);
  for (const line of rows(order.extraServices)) if (line.quickProjectLine !== true || !windows.length) ids.push(`line:${line.id}`);
  return [...new Set(ids)];
}
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
    // The removal price per sq ft is part of the directory (Owner, 2026-10-08).
    if (settings.removalPricePerSqft !== object(current.settings).removalPricePerSqft) return 'Только владелец может менять справочник услуг.';
  }
  if (settings.removalPricePerSqft !== undefined && (typeof settings.removalPricePerSqft !== 'number' || !Number.isFinite(settings.removalPricePerSqft) || settings.removalPricePerSqft <= 0 || settings.removalPricePerSqft > 1000)) return 'Цена снятия плёнки должна быть положительным числом.';
  const offerings = rows(settings.serviceOfferings);
  const ids = new Set<string>();
  const films = rows(settings.catalog);
  for (const offering of offerings) {
    if (typeof offering.id !== 'string' || !/^[\w-]{1,120}$/.test(offering.id) || ids.has(offering.id)) return 'Некорректный или повторный ID услуги.';
    ids.add(offering.id);
    if (!(SERVICE_DIRECTIONS as readonly string[]).includes(offering.direction) || typeof offering.name !== 'string' || !offering.name.trim() || offering.name.length > 120) return 'Укажите направление и название услуги.';
    for (const field of ['pricePerSqft','installerRatePerSqft','minPricePerUnit','maxPricePerUnit']) {
      if (offering[field] !== undefined && (typeof offering[field] !== 'number' || !Number.isFinite(offering[field]) || offering[field] < 0)) return 'Цена, диапазон и ставка услуги должны быть неотрицательными числами.';
    }
    const minPrice = Number(offering.minPricePerUnit) || 0;
    const maxPrice = Number(offering.maxPricePerUnit) || 0;
    if (minPrice > 0 && maxPrice > 0 && minPrice > maxPrice) return 'Минимальная цена услуги не может быть выше максимальной.';
    if (offering.unit !== undefined && !(SERVICE_UNITS as readonly string[]).includes(offering.unit)) return 'Неизвестная единица услуги.';
    if (offering.unitLabel !== undefined && (typeof offering.unitLabel !== 'string' || offering.unitLabel.length > 30)) return 'Название единицы — до 30 символов.';
    if (offering.materialCostPerUnit !== undefined && (typeof offering.materialCostPerUnit !== 'number' || !Number.isFinite(offering.materialCostPerUnit) || offering.materialCostPerUnit < 0)) return 'Стоимость материала услуги должна быть неотрицательным числом.';
    if (offering.includes !== undefined && (!Array.isArray(offering.includes) || offering.includes.length > 20 || offering.includes.some((id: unknown) => typeof id !== 'string'))) return 'Некорректный состав услуги.';
    // Film categories are compared as the CRM reads them («privacy_film», «Солнцезащитная»…).
    if (offering.filmIds !== undefined && (!Array.isArray(offering.filmIds) || offering.filmIds.some((id: unknown) => !films.some(film => film.id === id && canonicalFilmCategory(film.category) === offering.direction)))) return 'Материалы должны принадлежать направлению услуги.';
  }
  for (const offering of offerings) {
    for (const id of Array.isArray(offering.includes) ? offering.includes : []) {
      const child = offerings.find(item => item.id === id);
      if (!child || child.id === offering.id) return 'В состав услуги входят только другие услуги из справочника.';
      if (!child.unit || child.unit === 'sqft') return 'В состав услуги входят только услуги без размеров.';
      if (Array.isArray(child.includes) && child.includes.length) return 'Пакет внутри пакета не поддерживается.';
    }
  }
  for (const order of rows(next.orders)) {
    const oldOrder = rows(current.orders).find(item=>item.id===order.id) || {};
    const oldItems = scope(oldOrder);
    const extraValues = Array.isArray(order.extraServices) ? order.extraServices : [];
    const extras = rows(extraValues);
    const parentIds = new Set([
      ...rows(object(order.measurements).rooms).flatMap(room => rows(room.windows)).map(win => win.offeringId),
      ...extras.filter(line => line.offeringId && !line.includedBy && line.quickProjectLine !== true).map(line => line.offeringId),
    ].filter((id): id is string => typeof id === 'string' && !!id));
    // An included component cannot be removed or repointed independently while
    // its parent service remains in the project. Restore it from the saved
    // record; removing the parent still removes the component normally.
    for (const oldLine of rows(oldOrder.extraServices).filter(line => typeof line.includedBy === 'string' && parentIds.has(line.includedBy))) {
      let submitted = extras.find(line => line.id === oldLine.id);
      if (!submitted) {
        submitted = structuredClone(oldLine);
        extraValues.push(submitted);
        extras.push(submitted);
      }
      submitted.includedBy = oldLine.includedBy;
      submitted.offeringId = oldLine.offeringId;
      submitted.type = oldLine.type;
      submitted.unit = oldLine.unit;
      submitted.unitLabel = oldLine.unitLabel;
      submitted.unitPrice = 0;
      submitted.price = 0;
    }
    if (!Array.isArray(order.extraServices) && extras.length) order.extraServices = extraValues;
    for (const item of scope(order)) {
      const old = oldItems.find(value=>value.id===item.id);
      const offering = offerings.find(value=>value.id===item.offeringId);
      let included = false;
      if (extras.includes(item) && item.includedBy !== undefined) {
        const parent = offerings.find(value => value.id === item.includedBy);
        const wasIncluded = !!old && old.includedBy === item.includedBy && old.offeringId === item.offeringId;
        included = typeof item.includedBy === 'string' && parentIds.has(item.includedBy) && !!item.offeringId
          && (wasIncluded || (Array.isArray(parent?.includes) && parent.includes.includes(item.offeringId)));
        if (!included) delete item.includedBy;
      }
      if (!owner || item.offeringId !== old?.offeringId) {
        if (item.offeringId && item.offeringId === old?.offeringId && old && 'offeringInstallerRate' in old) item.offeringInstallerRate = old.offeringInstallerRate;
        else if (offering) item.offeringInstallerRate = offering.installerRatePerSqft;
        else delete item.offeringInstallerRate;
        if (item.offeringId && item.offeringId === old?.offeringId && old && 'offeringMaterialCost' in old) item.offeringMaterialCost = old.offeringMaterialCost;
        else if (offering && typeof offering.materialCostPerUnit === 'number') item.offeringMaterialCost = offering.materialCostPerUnit;
        else delete item.offeringMaterialCost;
      }
      // Customer price comes from the directory as a default, but a manager may
      // override it inside the owner-defined corridor. Historical unchanged
      // prices stay valid so a later catalog edit never rewrites a signed job.
      if (offering && item.offeringId && !included) {
        const priceField = extras.includes(item) && item.type === 'offering' ? 'unitPrice' : 'pricePerSqft';
        const submittedPrice = item[priceField];
        const oldPrice = old?.[priceField];
        if (submittedPrice !== undefined && submittedPrice !== null && submittedPrice !== '' && submittedPrice !== oldPrice) {
          const price = Number(submittedPrice);
          if (!Number.isFinite(price) || price < 0) return 'Цена услуги должна быть неотрицательным числом.';
          const min = Number(offering.minPricePerUnit) || 0;
          const max = Number(offering.maxPricePerUnit) || 0;
          if (min > 0 && price < min) return `Цена «${offering.name}» ниже разрешённого минимума ${min.toFixed(2)}.`;
          if (max > 0 && price > max) return `Цена «${offering.name}» выше разрешённого максимума ${max.toFixed(2)}.`;
        }
      }
      // A service without sizes is «quantity × price» (Owner, 2026-10-05). The
      // server decides what a row is from where it is and what it was, not from
      // the submitted flags: an extra-service row with a directory service is a
      // quantity line unless it already was a quick-entry line (those are per
      // sq ft). Only a service that is not per sq ft can be a quantity line; the
      // server keeps its unit and unit price and derives the line price. Only a
      // saved row that keeps its service is left as it was (older data).
      if (item.offeringId && extras.includes(item)) {
        const quick = old ? old.quickProjectLine === true : item.quickProjectLine === true;
        if (old) {
          if (old.quickProjectLine === true) item.quickProjectLine = true;
          else delete item.quickProjectLine;
        }
        const sizeFreeOffering = !!offering && !!offering.unit && offering.unit !== 'sqft';
        const packageDetached = !!old?.includedBy && !parentIds.has(old.includedBy);
        const wasQuantityLine = !!old && old.type === 'offering' && !!old.unit && old.unit !== 'sqft' && old.quickProjectLine !== true;
        const newService = !old || old.offeringId !== item.offeringId || packageDetached;
        if (quick) {
          if (newService && sizeFreeOffering) return 'Быстрая строка проекта считается по кв. футам.';
        } else if (newService || sizeFreeOffering || wasQuantityLine || item.type === 'offering') {
          item.type = 'offering';
          const sameService = !packageDetached && wasQuantityLine && old.offeringId === item.offeringId;
          const min = Number(offering?.minPricePerUnit) || 0;
          const max = Number(offering?.maxPricePerUnit) || 0;
          const corridorAllowsOverride = min > 0 || max > 0;
          const submittedUnitPrice = Number(item.unitPrice);
          if (!sameService) {
            if (!offering || offering.active === false) return 'Услуга не найдена в справочнике.';
            if (!offering.unit || offering.unit === 'sqft') return 'Услуга за кв. фут считается по замеру окон, а не количеством.';
            item.unit = offering.unit;
            item.unitLabel = offering.unit === 'custom' && typeof offering.unitLabel === 'string' ? offering.unitLabel : '';
            item.unitPrice = corridorAllowsOverride && Number.isFinite(submittedUnitPrice) && submittedUnitPrice >= 0
              ? submittedUnitPrice
              : typeof offering.pricePerSqft === 'number' ? offering.pricePerSqft : 0;
          } else {
            item.unit = old.unit;
            item.unitLabel = old.unitLabel;
            item.unitPrice = corridorAllowsOverride && Number.isFinite(submittedUnitPrice) && submittedUnitPrice >= 0
              ? submittedUnitPrice
              : old.unitPrice;
          }
          if (included) item.unitPrice = 0;
          const unitPrice = Number(item.unitPrice) || 0;
          if (!included && min > 0 && unitPrice < min) return `Цена «${offering?.name || 'услуги'}» ниже разрешённого минимума ${min.toFixed(2)}.`;
          if (!included && max > 0 && unitPrice > max) return `Цена «${offering?.name || 'услуги'}» выше разрешённого максимума ${max.toFixed(2)}.`;
          const qty = Number(item.qty);
          if (!Number.isFinite(qty) || qty < 0) return 'Количество услуги должно быть неотрицательным числом.';
          item.qty = qty;
          item.price = Math.round((Number(item.unitPrice) || 0) * qty * 100) / 100;
        }
      }
      // Old signed/history selections survive archival or changed material lists.
      if (item.offeringId && (item.offeringId !== old?.offeringId || item.catalogId !== old?.catalogId)) {
        const direction = DIRECTION_BY_SERVICE_TYPE[item.measureScope || item.serviceType || order.serviceType];
        if (!offering || offering.active === false || offering.direction !== direction) return 'Услуга не соответствует направлению проекта.';
        if (item.catalogId && !offering.filmIds?.includes(item.catalogId)) return 'Плёнка не привязана к выбранной услуге.';
      }
    }
    // The unit each chosen service had when the project chose it: a new entry
    // must match the directory; saved entries cannot be rewritten.
    const units = object(order.offeringUnits);
    const oldUnits = object(oldOrder.offeringUnits);
    for (const [id, unit] of Object.entries(units)) {
      if (id in oldUnits) {
        if (oldUnits[id] !== unit) return 'Единицу услуги проекта нельзя изменить.';
        continue;
      }
      const offering = offerings.find(value => value.id === id);
      if (!offering || unit !== (offering.unit || 'sqft')) return 'Единица услуги не совпадает со справочником.';
    }
    for (const id of Object.keys(oldUnits)) if (!(id in units)) units[id] = oldUnits[id];
    if (Object.keys(units).length) order.offeringUnits = units;
    // A service is planned in its row on the project card (Owner, 2026-10-09):
    // its specialist and date may be chosen one after the other, so a saved
    // plan may still miss one of them. «Монтаж назначен» needs them all.
    if (JSON.stringify(order.serviceSchedules) !== JSON.stringify(oldOrder.serviceSchedules)) {
      if (!Array.isArray(order.serviceSchedules)) return 'Некорректные назначения услуг.';
      const seen = new Set();
      for (const plan of rows(order.serviceSchedules)) {
        if (typeof plan.id !== 'string' || seen.has(plan.id) || !/^\w[\w:-]{0,240}$/.test(plan.id) || !Array.isArray(plan.installerIds)) return 'Некорректные назначения услуг.';
        if (plan.installationAt !== undefined && plan.installationAt !== '' && (typeof plan.installationAt !== 'string' || Number.isNaN(Date.parse(plan.installationAt)))) return 'Некорректная дата услуги.';
        seen.add(plan.id);
        if (plan.installerIds.some((id: unknown)=>!rows(next.users).some(user=>user.id===id && user.role==='installer'))) return 'Исполнитель услуги должен быть специалистом по установке.';
      }
    }
    const complete = (plan: Row) => typeof plan.installationAt === 'string' && !Number.isNaN(Date.parse(plan.installationAt)) && Array.isArray(plan.installerIds) && plan.installerIds.length > 0;
    const schedulesChanged = JSON.stringify(order.serviceSchedules) !== JSON.stringify(oldOrder.serviceSchedules);
    // A finished project keeps its crew and dates: they are its history and its pay.
    if (schedulesChanged && CLOSED_PROJECT_STATUSES.includes(String(oldOrder.status))) return 'Проект закрыт: исполнителей и даты услуг не меняют.';
    // Entering installation (from the card, the schedule window or the kanban)
    // needs a complete plan for every service of the project.
    const entersInstallation = SCHEDULED_PROJECT_STATUSES.includes(String(order.status))
      && !SCHEDULED_PROJECT_STATUSES.includes(String(oldOrder.status)) && !CLOSED_PROJECT_STATUSES.includes(String(oldOrder.status));
    if (entersInstallation && oldOrder.id !== undefined) {
      const plans = rows(order.serviceSchedules);
      if (plans.some(plan => !complete(plan))) return 'Укажите дату и исполнителей каждой услуги.';
      if (serviceGroupIds(order).some(id => !plans.some(plan => plan.id === id))) return 'Укажите дату и исполнителей каждой услуги.';
    }
    // Once «Монтаж назначен», a planned service may change its specialist or
    // date but not lose them; a service added later is planned step by step.
    if (schedulesChanged && SCHEDULED_PROJECT_STATUSES.includes(String(order.status))) {
      for (const before of rows(oldOrder.serviceSchedules).filter(complete)) {
        const after = rows(order.serviceSchedules).find(plan => plan.id === before.id);
        if (after && !complete(after)) return 'Монтаж назначен: у услуги должны остаться исполнитель и дата.';
      }
    }
    // A plan made at «КП принято» is a draft: the project crew and date (what
    // the client and the field crew see) follow it once installation is scheduled.
    if (Array.isArray(order.serviceSchedules) && order.serviceSchedules.length && SCHEDULED_PROJECT_STATUSES.includes(String(order.status))) {
      order.installerIds = [...new Set(rows(order.serviceSchedules).flatMap(plan => Array.isArray(plan.installerIds) ? plan.installerIds : []))];
      order.installationAt = rows(order.serviceSchedules).map(plan => plan.installationAt).filter(value => typeof value === 'string' && value !== '').sort()[0];
    }
  }
  return null;
}
