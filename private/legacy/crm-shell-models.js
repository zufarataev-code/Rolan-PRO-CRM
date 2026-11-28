// ---------- НОВЫЙ ИНТЕРФЕЙС: МОДЕЛИ ДЛЯ ЭКРАНОВ (Owner, 2026-11-17) ----------
// «Все экраны разные, каждый открывается по-своему, нет единого архитектурного
// решения… возьми единый шаблон, реализуй». Новые экраны (/crm) рисует один
// шаблон админки, а цифры и логику они берут отсюда: эти функции выполняются
// на сервере внутри того же кода CRM и только читают — суммы, этапы, следующий
// шаг, воронку считает рабочая CRM, второй копии расчётов нет.
// Модуль подключается только к серверному расчёту и в страницу CRM не входит.

/** The CRM card the signed-in employee works as: the same choice the CRM makes at start. */
function crmShellViewer(viewer) {
  let allowed = Array.isArray(viewer.legacyUserIds) ? viewer.legacyUserIds : [];
  if (Array.isArray(db._allowedLegacyUserIds)) allowed = allowed.filter(id => db._allowedLegacyUserIds.includes(id));
  const cards = allowed.map(getUser).filter(Boolean);
  const card = cards.find(item => item.role === viewer.role) || (cards.length === 1 ? cards[0] : null);
  if (!card) return null;
  // One card whose role lags behind the server role: the server role wins, in memory only.
  if (card.role !== viewer.role) card.role = viewer.role;
  return ['owner', 'manager'].includes(card.role) ? card : null;
}

function crmShellPct(part, whole) {
  return whole > 0 ? Math.max(0, Math.min(100, Math.round(100 * part / whole))) : 0;
}

/** Orders the CRM itself counts on the main screen: no unfinished quick-entry drafts. */
function crmShellOrders(user) {
  return visibleOrdersForUser(user).filter(order => !order?.quickEntryDraft || order?.quickProjectImportedCompleted === true);
}

/** The card's own stage line (renderOrderCleanProgress), read as data. */
function crmShellStages(o) {
  let html = '';
  try { html = renderOrderCleanProgress(o) || ''; } catch (error) { html = ''; }
  const plain = value => String(value || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
  const stages = [];
  const pattern = /<button type="button" class="order-clean-stage-btn (done|current|next|skipped)" style="--stage:([^"]+)"[^>]*>([\s\S]*?)<\/button>/g;
  let match;
  while ((match = pattern.exec(html))) {
    const label = match[3].match(/order-clean-stage-btn-label">([\s\S]*?)<\/span>/);
    const hint = match[3].match(/order-clean-stage-btn-hint">([\s\S]*?)<\/span>/);
    stages.push({ state: match[1], color: match[2], label: plain(label && label[1]), hint: plain(hint && hint[1]) });
  }
  return stages;
}

function crmShellNext(o) {
  let action = null;
  try { action = orderPrimaryNextAction(o); } catch (error) { action = null; }
  if (!action || !action.title) return null;
  return { title: String(action.title), sub: String(action.sub || ''), variant: String(action.variant || '') };
}

function crmShellUrgency(o) {
  let urgency = null;
  try { urgency = orderKanbanUrgency(o); } catch (error) { urgency = null; }
  return urgency ? String(urgency.label || '') : '';
}

/** The project's own job site (a client may have several addresses), as the working card resolves it. */
function crmShellAddress(o, client) {
  let address = '';
  try { address = orderAddress(o, client) || ''; } catch (error) { address = ''; }
  return String(address || client.address || '');
}

function crmShellCard(o) {
  const client = getClient(o.clientId) || {};
  const revenue = Number(orderKanbanRevenue(o)) || 0;
  const paid = Math.min(revenue, Math.max(Number(orderPaidTotal(o)) || 0, Number(o.paid) || 0));
  let lines = [];
  try { lines = projectLines(o) || []; } catch (error) { lines = []; }
  let accent = null;
  try { accent = orderKanbanAccent(o); } catch (error) { accent = null; }
  const next = crmShellNext(o);
  return {
    id: o.id,
    number: o.number || '',
    client: client.name || 'Клиент',
    address: crmShellAddress(o, client),
    status: statusLabel(o.status),
    sum: revenue,
    paid,
    debt: Math.max(0, revenue - paid),
    urgency: crmShellUrgency(o),
    accent: accent ? { label: String(accent.label || ''), color: String(accent.color || '') } : null,
    next: next ? next.title : '',
    installationAt: o.installationAt || '',
    services: lines.length,
    servicesDone: lines.filter(line => projectServiceProgress(o, line.key).status === 'done').length,
  };
}

function crmShellUser(user) {
  return { id: user.id, name: user.name || '', role: user.role, roleLabel: user.role === 'owner' ? 'Владелец' : 'Менеджер' };
}

/** Main screen: the owner board's own model plus what needs attention first. */
function crmShellOverview(user) {
  const board = ownerBoardModel(user);
  // In work = standing in a funnel stage before «Закрыто»; a status the funnel does not know is not work in progress.
  const open = ORDER_KANBAN_FUNNEL.filter(stage => stage.id !== 'done').flatMap(stage => stage.statuses);
  const active = crmShellOrders(user).filter(order => open.includes(order.status));
  const time = value => { const at = value ? new Date(value).getTime() : NaN; return Number.isFinite(at) ? at : Infinity; };
  const attention = active.map(crmShellCard)
    .sort((a, b) => Number(!!b.urgency) - Number(!!a.urgency) || time(a.installationAt) - time(b.installationAt))
    .slice(0, 6);
  const now = Date.now();
  const installs = active.filter(order => order.installationAt && time(order.installationAt) >= now - 12 * 36e5 && time(order.installationAt) <= now + 7 * 864e5)
    .sort((a, b) => time(a.installationAt) - time(b.installationAt)).slice(0, 6)
    .map(order => ({ id: order.id, number: order.number || '', client: (getClient(order.clientId) || {}).name || 'Клиент', at: order.installationAt,
      crew: (order.installerIds || []).map(id => (getUser(id) || {}).name).filter(Boolean) }));
  return {
    user: crmShellUser(user),
    activeCount: board.activeCount, activeRevenue: board.activeRevenue, activePaid: board.activePaid, awaiting: board.awaiting,
    reachedCount: board.reachedCount, lineTotal: board.lineTotal, lineDone: board.lineDone,
    paidPct: board.paidPct, reachedPct: board.reachedPct, linePct: board.linePct, awaitingPct: board.awaitingPct,
    directions: board.directionRows,
    funnel: board.columns.map(column => ({ id: column.id, title: column.title, color: column.color, count: column.count, sum: column.sum })),
    month: { revenue: board.month.revenue, paid: board.month.paid, created: board.month.created, clients: board.month.clients,
      bars: board.month.bars.map(bar => ({ label: bar.label, value: bar.value })) },
    attention, installs,
  };
}

/** Projects funnel: the CRM kanban's own columns and statuses. */
function crmShellProjects(user) {
  const orders = crmShellOrders(user);
  const recent = order => new Date(order.paidAt || order.actSignedAt || order.installationAt || order.createdAt || 0).getTime() || 0;
  const columns = ORDER_KANBAN_FUNNEL.map(stage => {
    const items = orders.filter(order => stage.statuses.includes(order.status));
    const closed = stage.id === 'done';
    const shown = closed ? [...items].sort((a, b) => recent(b) - recent(a)).slice(0, 12) : items;
    return { id: stage.id, title: stage.title, color: stage.color, count: items.length,
      sum: items.reduce((sum, order) => sum + (Number(orderKanbanRevenue(order)) || 0), 0),
      hidden: items.length - shown.length, cards: shown.map(crmShellCard) };
  });
  return { user: crmShellUser(user), columns };
}

/** One project: the working card's stages, next step, services and the tour data. */
function crmShellProject(user, projectId) {
  const o = crmShellOrders(user).find(order => order.id === projectId) || visibleOrdersForUser(user).find(order => order.id === projectId);
  if (!o) return { user: crmShellUser(user), project: null };
  const client = getClient(o.clientId) || {};
  const canSeeMoney = orderUserCanSeeMoney(o, user);
  const model = projectCabinetModel(o, client, user, { canSeeMoney });
  const windows = model.windows.map(item => ({
    key: `${item.room.id || ''}|${item.win.id || ''}`,
    roomId: item.room.id || '',
    room: item.room.name || 'Помещение',
    name: item.win.name || 'Окно',
    size: projectCabinetSizeLabel(item.win),
    sqft: Number(windowActualAreaSqft(item.win)) || 0,
    film: projectCabinetFilmLabel(item.win),
    verified: !!windowMeasurementIsVerified(item.win),
  }));
  return {
    user: crmShellUser(user),
    project: {
      id: o.id,
      number: o.number || '',
      status: statusLabel(o.status),
      client: { name: client.name || 'Клиент', phone: client.phone || '', address: crmShellAddress(o, client) },
      manager: (getUser(o.managerId) || {}).name || '',
      measurer: (getUser(o.measurerId) || {}).name || '',
      canSeeMoney,
      revenue: model.revenue, paid: model.paid, paidPct: model.paidPct,
      stagePct: model.stagePct, stageDone: model.stageDone, stageTotal: model.stageTotal,
      workPct: model.workPct, doneLines: model.doneLines,
      windowCount: model.windowCount, sizedCount: model.sizedCount, sqft: model.sqft,
      stages: crmShellStages(o),
      next: crmShellNext(o),
      urgency: crmShellUrgency(o),
      lines: model.lines.map(line => ({
        key: line.key, name: line.name, direction: line.direction.title || '', color: line.direction.color || '',
        qty: line.qty, unit: line.unit, price: canSeeMoney ? line.price : 0, crew: line.crew,
        installationAt: line.installationAt, status: line.status,
      })),
      windows,
      photos: model.photos.map(photo => ({ id: photo.id, url: photo.dataUrl, roomId: photo.roomId || '',
        marks: (photo.marks || []).map(mark => ({ key: `${mark.roomId}|${mark.windowId}`, x: Number(mark.x) || 0, y: Number(mark.y) || 0 })) })),
    },
  };
}

/** Which lead already has a project (open or archived): the leads screen offers «Открыть проект» instead of creating a second one. */
function crmShellLeadLinks(user) {
  const visible = new Set(visibleOrdersForUser(user).map(order => order.id));
  const links = {};
  (db.archivedOrders || []).forEach(order => {
    if (order && order.canonicalLeadId) links[order.canonicalLeadId] = { projectId: '', number: order.number || '', archived: true };
  });
  (db.orders || []).forEach(order => {
    if (order && order.canonicalLeadId && visible.has(order.id)) links[order.canonicalLeadId] = { projectId: order.id, number: order.number || '', archived: false };
  });
  return { user: crmShellUser(user), links };
}

/** Calendar: the working calendar's own events (calItemsInRange) for a range of local days. */
function crmShellCalendar(user, from, to) {
  const day = value => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '')); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null; };
  const start = day(from) || new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  let end = day(to) || start;
  // One screen never asks for more than two months.
  if (end < start || end - start > 62 * 864e5) end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  end = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
  const key = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const visible = new Set(visibleOrdersForUser(user).map(order => order.id));
  const events = calItemsInRange(start, end).map(ev => {
    const o = ev.o || {};
    const client = calendarClientForOrder(o) || {};
    const palette = calendarEventPalette(ev.kind);
    return {
      id: String(ev.id),
      kind: ev.kind,
      title: (ev.info && ev.info.title) || '',
      color: palette.color,
      at: ev.dt.toISOString(),
      day: key(ev.dt),
      time: calendarTimeLabel(ev.dt),
      client: client.name || 'Без клиента',
      people: calendarEventPeople(ev),
      address: crmShellAddress(o, client),
      note: ev.service ? `${ev.service.name}${ev.service.days > 1 ? ` · день ${ev.service.day} из ${ev.service.days}` : ''}` : String(ev.note || ''),
      number: o.number || '',
      // A consultation booked from a lead has no project yet.
      projectId: o._canonicalConsultationId || !visible.has(o.id) ? '' : o.id,
    };
  });
  return { user: crmShellUser(user), from: key(start), to: key(end), today: key(new Date()), events };
}

/** Clients: the working «Клиенты» section's own list, read as data (renderClients). */
function crmShellClients(user) {
  const clients = visibleClientsForUser(user);
  const orders = visibleOrdersForUser(user);
  const time = value => { const at = value ? new Date(value).getTime() : NaN; return Number.isFinite(at) ? at : 0; };
  const text = value => String(value || '').trim();
  const rows = clients.map(c => {
    const own = orders.filter(o => o.clientId === c.id);
    let money = [];
    try { money = financialOrders(own); } catch (error) { money = own; }
    const b2b = clientAccountType(c) === 'b2b';
    const relationship = clientRelationshipType(c);
    const book = clientAddressBook(c);
    const primary = clientAddressById(c, c.primaryAddressId);
    const referrer = c.referredBy ? getClient(c.referredBy) : null;
    const recent = [...own].sort((a, b) => time(b.createdAt) - time(a.createdAt));
    return {
      id: c.id,
      name: text(clientDisplayName(c) || c.name) || 'Клиент',
      companyType: b2b ? text(clientCompanyTypeLabel(c.companyType)) : '',
      representative: text(clientRepresentativeLine(c)),
      phone: text(c.phone),
      phoneVerified: !!c.phoneVerified,
      email: text(c.email),
      address: text((primary && primary.address) || c.address),
      b2b,
      regular: relationship === 'regular',
      relationship: relationshipLabel(relationship),
      source: text(sourceDisplayLabel(c.source)),
      referredBy: referrer ? text(clientDisplayName(referrer) || referrer.name) : '',
      projects: own.length,
      addresses: book.length,
      revenue: money.reduce((sum, o) => sum + (Number(orderRevenue(o)) || 0), 0),
      debt: money.reduce((sum, o) => sum + (Number(orderDebt(o)) || 0), 0),
      portal: !!clientPortalAccess(c),
      lastAt: recent[0] ? (recent[0].createdAt || '') : '',
      recent: recent.slice(0, 3).map(o => ({ id: o.id, number: o.number || '', status: statusLabel(o.status) })),
      search: [clientDisplayName(c), c.name, c.companyName, clientPersonName(c), c.contactTitle, c.phone, c.email, c.address,
        ...book.map(a => `${a.label || ''} ${a.address || ''} ${a.unit || ''}`)].map(text).join(' ').toLowerCase(),
    };
  }).sort((a, b) => time(b.lastAt) - time(a.lastAt) || a.name.localeCompare(b.name, 'ru'));
  return {
    user: crmShellUser(user),
    counts: { all: rows.length, b2c: rows.filter(row => !row.b2b).length, b2b: rows.filter(row => row.b2b).length, regular: rows.filter(row => row.regular).length },
    clients: rows,
  };
}

/** Склад: the working «Склад и снабжение» overview, read with the working CRM's own helpers. */
function crmShellInventory(user) {
  const text = value => String(value || '').trim();
  const num = value => Number(value) || 0;
  const r2 = value => Math.round(num(value) * 100) / 100;
  const vendorName = id => { const v = id ? (db.vendors || []).find(x => x.id === id) : null; return v ? text(v.name) : ''; };
  const name = id => { const u = id ? getUser(id) : null; return u ? text(u.name) : ''; };
  // A project card opens only for someone who can see that project; others get its name without a link.
  const visible = new Set(visibleOrdersForUser(user).map(order => order.id));
  const project = id => { const o = id ? getOrder(id) : null; return o ? { id: String(o.id), label: text(warehouseOrderLabel(o)), open: visible.has(o.id) } : null; };
  const supplies = ensureSupplies();
  const summary = inventorySummary();
  // The same sum as the working overview: film left at its lot price plus supplies at their unit cost.
  const stockValue = Object.values(summary).reduce((s, x) => s + num(x.value), 0) + supplies.reduce((s, x) => s + num(x.qty) * num(x.costPerUnit), 0);
  const needs = warehouseNeedItems().map(x => {
    const draft = activeReorderPurchaseRequest(x.kind, x.id, x.vendorId);
    return { id: `${x.kind}:${x.id}`, kind: x.kind, name: text(x.name), qty: r2(x.qty), min: r2(x.min), target: r2(x.target), unit: text(x.unit), vendor: vendorName(x.vendorId), critical: Boolean(x.critical) || num(x.qty) <= 0, draft: draft ? text(draft.number) : '' };
  });
  const purchaseRow = p => {
    const status = PURCHASE_STATUS[p.status] || PURCHASE_STATUS.requested;
    return { id: String(p.id), number: text(p.number), createdAt: text(p.createdAt), item: text(p.itemNameSnapshot) || 'Материал', qty: r2(p.qty), unit: text(p.unit), project: project(p.orderId), responsible: name(p.responsibleId), vendor: vendorName(p.vendorId), status: p.status in PURCHASE_STATUS ? p.status : 'requested', statusLabel: status[0], neededBy: text(p.neededBy) };
  };
  const purchases = [...(db.purchaseRequests || [])].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const active = purchases.filter(p => !['received', 'cancelled'].includes(p.status));
  const low = new Map(lowStockItems().map(x => [x.catalogId, x.status]));
  const preferred = ['smart', 'solar', 'protective', 'privacy', 'decorative'];
  const film = (db.settings.catalog || []).filter(c => c && filmWarehouseRolls(c.id).length).map(c => {
    const stats = warehouseCatalogStockStats(c.id);
    const category = canonicalCatalogCategory(c.category) || text(c.category);
    return { id: String(c.id), name: text(catalogLabel(c)), category, categoryLabel: category ? text(catLabel(category)) : 'Прочее', rolls: stats.rolls, lengthM: r2(stats.lengthM), sqft: Math.round(stats.availableSqft), status: low.get(c.id) || 'ok', vendor: vendorName(c.vendorId) };
  }).sort((a, b) => {
    const ai = preferred.indexOf(a.category), bi = preferred.indexOf(b.category);
    return ((ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)) || a.categoryLabel.localeCompare(b.categoryLabel, 'ru') || a.name.localeCompare(b.name, 'ru', { numeric: true });
  });
  const supplyRows = supplies.map(s => ({ id: String(s.id), name: text(s.name) || 'Расходник', qty: r2(s.qty), min: s.minQty == null ? null : r2(s.minQty), unit: text(supplyUnitLabel(s.unit)), location: text(s.location), status: s.minQty != null && num(s.qty) <= num(s.minQty) ? (num(s.qty) <= 0 ? 'critical' : 'low') : 'ok' }))
    .sort((a, b) => (a.status === 'ok') - (b.status === 'ok') || a.name.localeCompare(b.name, 'ru'));
  const tools = ensureTools().map(t => ({ id: String(t.id), name: text(t.name) || 'Инструмент', number: text(t.invNumber), condition: text(toolConditionInfo(t.condition).label), problem: t.condition !== 'good', tone: t.condition === 'good' ? 'ok' : t.condition === 'worn' ? 'warn' : 'danger', holder: name(t.holderId) }));
  const movements = (db.inventoryMovements || []).slice(0, 30).map(m => ({ id: String(m.id), at: text(m.at), receipt: m.direction === 'receipt', item: text(m.itemName) || 'Материал', qty: r2(m.qty), unit: text(m.unit), project: project(m.orderId), who: name(m.createdBy) || name(m.responsibleId) }));
  return {
    user: crmShellUser(user),
    kpi: { stockValue: Math.round(stockValue), needs: needs.length, out: needs.filter(x => x.qty <= 0).length, active: active.length },
    needs, active: active.map(purchaseRow), purchasesTotal: purchases.length, film, supplies: supplyRows, tools, movements,
  };
}

/** Entry point of the server calculation: one workspace in, one JSON model out. */
/** Tasks: the working «Задачи» section's own list (renderTasksView), with each due day in the viewer's time zone. */
function crmShellTasks(user) {
  const text = value => String(value || '').trim();
  const all = Array.isArray(db.tasks) ? db.tasks : [];
  const name = id => { const u = id ? getUser(id) : null; return u ? text(u.name) : ''; };
  const row = t => {
    const due = text(t.dueAt);
    const dueKey = due ? taskDueDateKey(due, t) : '';
    const timeMatch = /T(\d{2}):(\d{2})/.exec(due);
    const hasTime = timeMatch && !(timeMatch[1] === '00' && timeMatch[2] === '00');
    let time = '';
    if (hasTime) {
      // Same rule as taskDueDateKey: older call/follow-up tasks are UTC with the "Z" dropped.
      const legacyUtc = !/(?:Z|[+-]\d{2}:?\d{2})$/.test(due)
        && (/^📞 Перезвонить:/.test(t.title || '') || /^AI follow-up:/.test(t.title || ''));
      const stamp = legacyUtc ? `${due}Z` : due;
      const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/.test(stamp);
      const at = zoned ? new Date(stamp) : null;
      time = at && Number.isFinite(at.getTime()) ? `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}` : `${timeMatch[1]}:${timeMatch[2]}`;
    }
    const team = (t.teamIds || []).map(name).filter(Boolean);
    const client = t.clientId ? getClient(t.clientId) : null;
    return {
      id: String(t.id),
      title: text(t.title) || 'Задача',
      dueKey,
      time,
      team,
      responsible: name(t.responsibleId),
      mine: t.responsibleId === user.id || (t.teamIds || []).includes(user.id),
      client: client ? text(clientDisplayName(client) || client.name) : '',
      clientId: client ? client.id : '',
      notes: text(t.notes),
      agent: t.source === 'rolan_agent',
      done: t.status === 'done',
      doneAt: text(t.doneAt),
    };
  };
  const open = all.filter(t => t && t.status !== 'done').map(row)
    .sort((a, b) => (a.dueKey || '9999').localeCompare(b.dueKey || '9999') || (a.time || '99').localeCompare(b.time || '99'));
  const done = all.filter(t => t && t.status === 'done').map(row)
    .sort((a, b) => b.doneAt.localeCompare(a.doneAt)).slice(0, 20);
  return { user: crmShellUser(user), open, done, doneTotal: all.filter(t => t && t.status === 'done').length };
}

function crmShellRun(input) {
  const { payload, viewer, request, consultations } = JSON.parse(input);
  // Reading only: nothing computed here is ever written back.
  save = function () {};
  db = payload;
  migrateSchema();
  normalizeClientAccountData();
  const user = crmShellViewer(viewer);
  if (!user) return JSON.stringify({ error: 'no_card' });
  state.currentUserId = user.id;
  state.lang = 'ru';
  // Consultations booked from leads live in the database, not in the workspace.
  if (Array.isArray(consultations)) canonicalConsultations = consultations;
  if (request.model === 'overview') return JSON.stringify(crmShellOverview(user));
  if (request.model === 'projects') return JSON.stringify(crmShellProjects(user));
  if (request.model === 'project') return JSON.stringify(crmShellProject(user, String(request.projectId || '')));
  if (request.model === 'leadLinks') return JSON.stringify(crmShellLeadLinks(user));
  if (request.model === 'calendar') return JSON.stringify(crmShellCalendar(user, request.from, request.to));
  if (request.model === 'clients') return JSON.stringify(crmShellClients(user));
  if (request.model === 'tasks') return JSON.stringify(crmShellTasks(user));
  if (request.model === 'inventory') return JSON.stringify(crmShellInventory(user));
  return JSON.stringify({ error: 'unknown_model' });
}
