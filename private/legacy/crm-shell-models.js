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
    address: client.address || '',
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
  const closed = ['completed', 'review_received'];
  const active = crmShellOrders(user).filter(order => !closed.includes(order.status));
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
      client: { name: client.name || 'Клиент', phone: client.phone || '', address: client.address || '' },
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

/** Entry point of the server calculation: one workspace in, one JSON model out. */
function crmShellRun(input) {
  const { payload, viewer, request } = JSON.parse(input);
  // Reading only: nothing computed here is ever written back.
  save = function () {};
  db = payload;
  migrateSchema();
  normalizeClientAccountData();
  const user = crmShellViewer(viewer);
  if (!user) return JSON.stringify({ error: 'no_card' });
  state.currentUserId = user.id;
  state.lang = 'ru';
  if (request.model === 'overview') return JSON.stringify(crmShellOverview(user));
  if (request.model === 'projects') return JSON.stringify(crmShellProjects(user));
  if (request.model === 'project') return JSON.stringify(crmShellProject(user, String(request.projectId || '')));
  return JSON.stringify({ error: 'unknown_model' });
}
