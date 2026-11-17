// «Пульт владельца» — пробный вид главного экрана (Owner, 2026-11-17).
//
// Composed into the legacy page by composeProductionHtml(), so only top-level
// functions live here. The board reads the same projects and calls the same
// helpers as «Пульс бизнеса» and the projects kanban (visibleOrdersForUser,
// pulseBusinessSnapshot, orderKanbanRevenue, orderPaidTotal, projectLines,
// ORDER_KANBAN_FUNNEL): no second calculation and no writes. It is shown only
// to the owner after the owner turns it on; the choice is kept on the device.

function ownerBoardEnabled(u) {
  if (!u || u.role !== 'owner') return false;
  try { return localStorage.getItem('rp_owner_board') === '1'; } catch (error) { return false; }
}

function ownerBoardToggle(on) {
  try {
    if (on) localStorage.setItem('rp_owner_board', '1');
    else localStorage.removeItem('rp_owner_board');
  } catch (error) { /* private mode: the trial view simply stays off */ }
  render();
}

/** One line above «Пульс бизнеса»: the only way into the trial board. */
function ownerBoardEntryBar(u) {
  if (!u || u.role !== 'owner') return '';
  return `<div style="display:flex;justify-content:flex-end;margin:0 0 8px">
    <button type="button" onclick="ownerBoardToggle(true)" style="font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;border:1px solid #cfe3d7;background:#f2f8f4;color:#17794a">Пульт владельца (проба)</button>
  </div>`;
}

/** The main screen: the trial board when the owner turned it on, otherwise «Пульс бизнеса» untouched. */
function ownerBoardScreen(u) {
  if (ownerBoardEnabled(u)) return ownerBoardHtml(u);
  return ownerBoardEntryBar(u) + renderManagerDashboard();
}

/** Everything the board shows, taken from the working CRM functions. */
function ownerBoardModel(user, now = new Date()) {
  const orders = visibleOrdersForUser(user).filter(order => !order?.quickEntryDraft || order?.quickProjectImportedCompleted === true);
  const closed = ['completed', 'review_received'];
  const active = orders.filter(order => !closed.includes(order.status));
  const revenueOf = order => Number(orderKanbanRevenue(order)) || 0;
  const paidOf = order => Math.min(revenueOf(order), Number(orderPaidTotal(order)) || Number(order.paid) || 0);
  const activeRevenue = active.reduce((sum, order) => sum + revenueOf(order), 0);
  const activePaid = active.reduce((sum, order) => sum + paidOf(order), 0);
  const stageOf = status => ORDER_KANBAN_FUNNEL.find(stage => stage.statuses.includes(status));
  const reached = active.filter(order => ['install', 'payment'].includes(stageOf(order.status)?.id));
  const awaiting = active.filter(order => ['installation_done', 'act_signed'].includes(order.status))
    .reduce((sum, order) => sum + Math.max(0, revenueOf(order) - paidOf(order)), 0);
  let lineTotal = 0;
  let lineDone = 0;
  const directions = new Map();
  active.forEach(order => {
    let lines = [];
    try { lines = projectLines(order) || []; } catch (error) { lines = []; }
    lines.forEach(line => {
      lineTotal += 1;
      if (projectServiceProgress(order, line.key).status === 'done') lineDone += 1;
      const title = projectLineDirectionInfo(line).title || 'Без направления';
      directions.set(title, (directions.get(title) || 0) + (Number(line.price) || 0));
    });
  });
  const palette = ['#178a52', '#2f62b8', '#a96a10', '#7d4fc4', '#0e8f9c', '#c2410c', '#64748b'];
  const directionRows = [...directions.entries()].filter(entry => entry[1] > 0).sort((a, b) => b[1] - a[1])
    .map((entry, index) => ({ title: entry[0], sum: entry[1], color: palette[index % palette.length] }));
  const columns = ORDER_KANBAN_FUNNEL.filter(stage => stage.id !== 'done').map(stage => {
    const items = active.filter(order => stage.statuses.includes(order.status));
    return { id: stage.id, title: stage.title, color: stage.color, count: items.length,
      sum: items.reduce((sum, order) => sum + revenueOf(order), 0),
      cards: items.slice(0, 6).map(order => ({ id: order.id, number: order.number || '', client: getClient(order.clientId)?.name || 'Клиент', sum: revenueOf(order) })) };
  });
  const month = pulseBusinessSnapshot(user, 'month', now);
  const pct = (part, whole) => whole > 0 ? Math.max(0, Math.min(100, Math.round(100 * part / whole))) : 0;
  return {
    activeCount: active.length, activeRevenue, activePaid, awaiting, reachedCount: reached.length, lineTotal, lineDone,
    directionRows, columns, month,
    paidPct: pct(activePaid, activeRevenue), reachedPct: pct(reached.length, active.length),
    linePct: pct(lineDone, lineTotal), awaitingPct: pct(awaiting, activeRevenue),
  };
}

function ownerBoardDonut(rows) {
  const total = rows.reduce((sum, row) => sum + row.sum, 0);
  if (!(total > 0)) return '<p class="rpc-note">В активных проектах пока нет услуг с ценой.</p>';
  const length = 2 * Math.PI * 42;
  let offset = 0;
  const arcs = rows.map(row => {
    const part = length * row.sum / total;
    const arc = `<circle cx="60" cy="60" r="42" fill="none" stroke="${row.color}" stroke-width="16" stroke-dasharray="${part} ${length - part}" stroke-dashoffset="${-offset}" transform="rotate(-90 60 60)"/>`;
    offset += part;
    return arc;
  }).join('');
  return `<div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center">
    <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="Доли направлений в сумме активных проектов">${arcs}</svg>
    <div style="flex:1;min-width:160px;display:grid;gap:6px">${rows.map(row => `<div style="display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:8px;align-items:center"><i style="width:10px;height:10px;border-radius:3px;background:${row.color}"></i><span>${academyEsc(row.title)}</span><b class="rpc-num">${academyEsc(fmtMoney(row.sum))}</b></div>`).join('')}</div>
  </div>`;
}

function ownerBoardHtml(user) {
  const model = ownerBoardModel(user);
  const money = value => academyEsc(fmtMoney(value));
  const max = Math.max(1, ...model.month.bars.map(bar => bar.value));
  const bars = model.month.bars.map(bar => `<div style="flex:1;min-width:0;display:grid;gap:6px;justify-items:center;align-content:end">
      <small class="rpc-num" style="font-size:11px">${bar.value > 0 ? money(bar.value) : '—'}</small>
      <div style="width:100%;max-width:56px;height:${Math.max(3, Math.round(120 * bar.value / max))}px;border-radius:6px 6px 2px 2px;background:linear-gradient(180deg,#34bd79,#178a52)"></div>
      <small style="color:var(--muted);font-size:11px;white-space:nowrap">${academyEsc(bar.label)}</small>
    </div>`).join('');
  const board = model.columns.map(column => `<div class="rpo-col">
      <header><span><i style="background:${column.color}"></i>${academyEsc(column.title)} · ${column.count}</span><b class="rpc-num">${money(column.sum)}</b></header>
      ${column.cards.map(card => `<button type="button" class="rpo-card" style="border-left-color:${column.color}" onclick="openOrder('${jsQuote(card.id)}')"><b>${academyEsc(card.client)}</b><small>${academyEsc(card.number)}</small><span class="rpc-num">${money(card.sum)}</span></button>`).join('')}
      ${column.count > column.cards.length ? `<small class="rpc-note" style="margin:0">ещё ${column.count - column.cards.length}</small>` : ''}
      ${column.count ? '' : '<small class="rpc-note" style="margin:0">пусто</small>'}
    </div>`).join('');
  return `${projectCabinetCss()}<style>
    .rpo-kan{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(170px,1fr);gap:9px;overflow-x:auto;padding-bottom:4px}
    .rpo-col{border:1px solid var(--line);border-radius:12px;background:var(--sunk);padding:9px;display:grid;gap:7px;align-content:start;min-width:0}
    .rpo-col header{display:flex;justify-content:space-between;gap:8px;font-size:11px;font-weight:700;color:var(--muted)}
    .rpo-col header i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
    .rpo-card{display:grid;gap:2px;text-align:left;padding:9px 10px;border-radius:10px;background:#fff;border:1px solid var(--line);border-left:3px solid;cursor:pointer;font-size:12.5px;min-width:0}
    .rpo-card small{color:var(--muted)} .rpo-card .rpc-num{text-align:left}
  </style><div class="rpc">
    <header class="rpc-card rpc-top">
      <h1>Пульт владельца<small>${model.activeCount} активных проектов · ${money(model.activeRevenue)} в работе</small></h1>
      <button type="button" class="rpc-btn small ghost" onclick="ownerBoardToggle(false)">Пульс бизнеса</button>
    </header>
    <section class="rpc-g4">
      ${projectCabinetRing(model.paidPct, fmtMoney(model.activePaid), `оплачено из ${fmtMoney(model.activeRevenue)}`, '#178a52')}
      ${projectCabinetRing(model.reachedPct, `${model.reachedCount} из ${model.activeCount}`, 'проектов дошли до монтажа', '#2f62b8')}
      ${projectCabinetRing(model.linePct, `${model.lineDone} из ${model.lineTotal}`, 'услуг выполнено', '#a96a10')}
      ${projectCabinetRing(model.awaitingPct, fmtMoney(model.awaiting), 'ждёт акта и оплаты', '#7d4fc4')}
    </section>
    <section class="rpc-g2">
      <div class="rpc-card"><h2>Оплаченные проекты за месяц · ${money(model.month.revenue)}</h2>
        <div style="display:flex;gap:10px;align-items:flex-end;min-height:170px">${bars}</div>
        <p class="rpc-note">Стоимость проектов с датой оплаты, по неделям. Те же цифры, что в «Пульсе бизнеса».</p>
      </div>
      <div class="rpc-card"><h2>Активные проекты по направлениям</h2>${ownerBoardDonut(model.directionRows)}</div>
    </section>
    <section class="rpc-card"><h2>Воронка проектов</h2>
      <div class="rpo-kan">${board}</div>
      <p class="rpc-note">Карточка открывает проект. Перенос между этапами — в разделе «Проекты», здесь только просмотр.</p>
    </section>
    <p class="rpc-note" style="text-align:center">Пробный вид для владельца. Суммы и этапы считают те же функции, что «Пульс бизнеса» и канбан проектов.</p>
  </div>`;
}
