// «Кабинет проекта» — пробный вид карточки Project (Owner, 2026-11-17).
//
// Composed into the legacy page by composeProductionHtml(), so only top-level
// functions live here. The cabinet reads the same Project and calls the same
// helpers as the working card (projectLines, orderRevenue, orderPaidTotal,
// orderPrimaryNextAction, projectSetServiceProgress): no second calculation.
// Owner, 2026-11-17 (evening): the cabinet must be visible on the project
// card itself, not behind a trial button. So the owner's working card now
// opens with the cabinet's rings and the tour above it; every function of the
// working card stays below, untouched. «Весь кабинет» opens the full view on
// that device (kept in localStorage, not in the workspace).

function projectCabinetEnabled(u) {
  if (!u || u.role !== 'owner') return false;
  try { return localStorage.getItem('rp_project_cabinet') === '1'; } catch (error) { return false; }
}

function projectCabinetToggle(on) {
  try {
    if (on) localStorage.setItem('rp_project_cabinet', '1');
    else localStorage.removeItem('rp_project_cabinet');
  } catch (error) { /* private mode: the full view simply stays off */ }
  render();
}

/** Above the owner's working card (Owner, 2026-11-22: «новый дизайн поверх старого — зачем?»):
 * no second set of rings and no tour on top of the card any more — only a light
 * link to the overview. Nothing is computed here, so the card opens faster. */
function projectCabinetEntryBar(o, u) {
  if (!o || !u) return '';
  // Managers get the edit button too (the window checks the lock itself).
  if (u.role === 'manager') return (typeof orderUserCanSeeMoney !== 'function' || orderUserCanSeeMoney(o, u)) ? `<div style="display:flex;justify-content:flex-end;gap:8px;margin:0 0 8px"><button type="button" class="btn-primary text-sm" onclick="projectEditStart('${jsQuote(o.id)}')">✏️ Редактировать проект</button></div>` : '';
  if (u.role !== 'owner') return '';
  return `<div style="display:flex;justify-content:flex-end;gap:8px;margin:0 0 8px"><button type="button" class="btn-ghost text-sm" onclick="projectCabinetToggle(true)">Обзор проекта · кольца и тур</button><button type="button" class="btn-primary text-sm" onclick="projectEditStart('${jsQuote(o.id)}')">✏️ Редактировать проект</button></div>`;
}

function projectCabinetToggleTour(open) {
  projectCabinetUi().tourOpen = open;
  preservePositionForNextRender(); render();
}

/** Everything the cabinet shows, taken from the working CRM functions. */
function projectCabinetModel(o, c, u, opts = {}) {
  const at = key => STATUSES.findIndex(status => status.key === key);
  const now = at(o.status);
  const reached = key => now >= at(key);
  const canSeeMoney = !!opts.canSeeMoney;
  const lines = projectLines(o).map(line => {
    const progress = projectServiceProgress(o, line.key);
    const direction = projectLineDirectionInfo(line);
    return {
      key: line.key,
      name: line.name || direction.title,
      direction,
      qty: Number(line.qty) || 0,
      unit: line.unitShort || line.unit || '',
      price: Number(line.price) || 0,
      crew: (line.installerIds || []).map(id => getUser(id)?.name).filter(Boolean),
      installationAt: line.installationAt || '',
      status: progress.status,
      canMark: projectCanMarkService(o, line, u),
    };
  });
  const doneLines = lines.filter(line => line.status === 'done').length;
  const installDone = reached('installation_done');
  const workPct = installDone ? 100 : lines.length ? Math.round(100 * doneLines / lines.length) : 0;
  const windows = measureAllWindows(o);
  const qtyOf = win => Number(win.actualQty) > 0 ? Number(win.actualQty) : Number(win.qty) || 1;
  const windowCount = windows.reduce((sum, item) => sum + qtyOf(item.win), 0);
  const sizedCount = windows.filter(item => windowActualAreaSqft(item.win) > 0).reduce((sum, item) => sum + qtyOf(item.win), 0);
  const sqft = windows.reduce((sum, item) => sum + windowActualAreaSqft(item.win), 0);
  const revenue = canSeeMoney ? Number(orderRevenue(o)) || 0 : 0;
  const paid = canSeeMoney ? Number(orderPaidTotal(o)) || Number(o.paid) || 0 : 0;
  // The project's stage logic is the working card's own stage line
  // (renderOrderCleanProgress): the cabinet shows that line and only counts it.
  let stageHtml = '';
  try { stageHtml = renderOrderCleanProgress(o) || ''; } catch (error) { stageHtml = ''; }
  const stageTotal = (stageHtml.match(/class="order-clean-stage-btn /g) || []).length;
  const stageDone = (stageHtml.match(/class="order-clean-stage-btn (done|skipped)"/g) || []).length;
  let primary = null;
  try { primary = orderPrimaryNextAction(o); } catch (error) { primary = null; }
  const photos = (o.photos || []).filter(photo => photo && photo.dataUrl && photo.kind !== 'video');
  return {
    lines, doneLines, workPct, windows, windowCount, sizedCount, sqft, revenue, paid, stageHtml, stageTotal, stageDone, primary, photos, canSeeMoney,
    stagePct: stageTotal ? Math.round(100 * stageDone / stageTotal) : 0,
    paidPct: revenue > 0 ? Math.min(100, Math.round(100 * paid / revenue)) : 0,
  };
}

/** A stage whose window lives on the working card: switch to the card, then open it there. */
function projectCabinetOpenWorkspace(key) {
  try { localStorage.removeItem('rp_project_cabinet'); } catch (error) { /* nothing to remember in private mode */ }
  // The window is built from the card's own DOM, so the card must be painted first.
  renderNow();
  return projectCardOpenWorkspace(key);
}

function projectCabinetRing(pct, title, sub, color) {
  const length = 2 * Math.PI * 27;
  const value = Math.max(0, Math.min(100, Number(pct) || 0));
  return `<div class="rpc-card rpc-ring"><div class="rpc-ring-w"><svg width="66" height="66" viewBox="0 0 66 66" aria-hidden="true"><circle cx="33" cy="33" r="27" fill="none" stroke="rgba(16,60,38,.1)" stroke-width="6"/><circle cx="33" cy="33" r="27" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${length}" stroke-dashoffset="${length * (1 - value / 100)}" transform="rotate(-90 33 33)"/></svg><i>${Math.round(value)}%</i></div><div><b>${academyEsc(title)}</b><span>${academyEsc(sub)}</span></div></div>`;
}

function projectCabinetCss() {
  return `<style>
    .rpc{--ink:#11261b;--muted:#5f7468;--line:rgba(16,60,38,.12);--acc:#178a52;--acc2:#34bd79;--warn:#a96a10;--info:#2f62b8;--sunk:rgba(16,60,38,.045);color:var(--ink);max-width:1280px;margin:0 auto;display:grid;gap:12px;font-size:13.5px;line-height:1.45}
    .rpc *{box-sizing:border-box}
    .rpc-card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:15px;box-shadow:0 1px 2px rgba(16,60,38,.05),0 10px 28px -16px rgba(16,60,38,.22);min-width:0}
    .rpc h2{font-size:11px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:var(--muted);margin:0 0 12px}
    .rpc-top{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
    .rpc-top h1{font-size:22px;font-weight:800;line-height:1.15;margin:0 auto 0 0;min-width:0}
    .rpc-top h1 small{display:block;font-size:12px;font-weight:500;color:var(--muted);margin-top:3px}
    .rpc-chip{display:inline-flex;align-items:center;gap:7px;padding:5px 10px;border-radius:99px;border:1px solid var(--line);font-size:11.5px;font-weight:700;color:var(--acc);white-space:nowrap}
    .rpc-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:9px 15px;border-radius:10px;font-weight:700;font-size:13px;background:linear-gradient(135deg,var(--acc2),var(--acc));color:#fff;border:0;cursor:pointer}
    .rpc-btn.ghost{background:var(--sunk);color:var(--ink);border:1px solid var(--line)}
    .rpc-btn.small{padding:6px 10px;font-size:12px}
    .rpc-g4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    .rpc-g2{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:12px}
    .rpc-ring{display:flex;align-items:center;gap:13px}
    .rpc-ring-w{position:relative;width:66px;height:66px;flex:none}
    .rpc-ring-w i{position:absolute;inset:0;display:grid;place-items:center;font-style:normal;font-weight:700;font-size:13px}
    .rpc-ring b{display:block;font-size:20px;font-weight:800;line-height:1.1}
    .rpc-ring span{color:var(--muted);font-size:11.5px}
    .rpc-rail{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px}
    .rpc-st{padding:10px 9px;border-radius:11px;border:1px solid var(--line);background:var(--sunk);min-width:0}
    .rpc-st em{font-style:normal;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
    .rpc-st b{display:block;font-size:13px;margin:2px 0 7px}
    .rpc-st.done{border-color:rgba(23,138,82,.4)} .rpc-st.done em{color:var(--acc)}
    .rpc-st.now{border-color:var(--warn);box-shadow:0 0 22px -9px var(--warn)} .rpc-st.now em{color:var(--warn)}
    .rpc-bar{height:6px;border-radius:9px;background:rgba(16,60,38,.1);overflow:hidden}
    .rpc-bar i{display:block;height:100%;border-radius:9px;background:linear-gradient(90deg,var(--acc),var(--acc2))}
    .rpc-st.now .rpc-bar i{background:var(--warn)}
    .rpc-next{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
    .rpc-next b{display:block;font-size:19px;font-weight:800;line-height:1.2}
    .rpc-next span{color:var(--muted);font-size:12px}
    .rpc-row{display:grid;grid-template-columns:36px minmax(0,1.6fr) minmax(0,1fr) auto auto;align-items:center;gap:11px;padding:10px 0;border-top:1px solid var(--line)}
    .rpc-row:first-of-type{border-top:0}
    .rpc-ico{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:var(--sunk);border:1px solid var(--line);font-size:16px}
    .rpc-row b{display:block;font-size:13.5px} .rpc-row small{color:var(--muted);font-size:11.5px}
    .rpc-pill{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;border-radius:99px;border:1px solid currentColor;white-space:nowrap}
    .rpc-pill.done{color:var(--acc)} .rpc-pill.prog{color:var(--warn)} .rpc-pill.wait{color:#7b8c82} .rpc-pill.info{color:var(--info)}
    .rpc-num{font-variant-numeric:tabular-nums;font-weight:700;text-align:right}
    .rpc-tour{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:12px;align-items:start}
    .rpc-photo{position:relative;border-radius:12px;overflow:hidden;border:1px solid var(--line);background:#0a130f;line-height:0}
    .rpc-photo img{display:block;width:100%;height:auto;max-height:70vh;object-fit:contain}
    .rpc-photo.pick{cursor:crosshair;outline:3px solid var(--acc2)}
    .rpc-mark{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:rgba(255,255,255,.2);border:2px solid #fff;display:grid;place-items:center;cursor:pointer;padding:0;box-shadow:0 1px 6px rgba(0,0,0,.5)}
    .rpc-mark::before{content:"";width:8px;height:8px;border-radius:50%;background:#fff}
    .rpc-mark.on{background:var(--acc);border-color:#9df0b8}
    .rpc-thumbs{display:flex;gap:6px;overflow-x:auto;margin-top:8px}
    .rpc-thumbs button{flex:none;width:74px;height:54px;border-radius:8px;overflow:hidden;border:2px solid transparent;padding:0;background:none;cursor:pointer}
    .rpc-thumbs button.on{border-color:var(--acc)} .rpc-thumbs img{width:100%;height:100%;object-fit:cover}
    .rpc-win{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:9px 8px;border-top:1px solid var(--line);border-radius:8px}
    .rpc-win:first-of-type{border-top:0} .rpc-win.on{background:rgba(52,189,121,.12)}
    .rpc-win small{display:block;color:var(--muted);font-size:11.5px}
    .rpc-note{color:var(--muted);font-size:11.5px;margin:8px 0 0}
    @media (max-width:980px){ .rpc-g4{grid-template-columns:repeat(2,minmax(0,1fr))} .rpc-g2,.rpc-tour{grid-template-columns:minmax(0,1fr)} .rpc-rail{grid-template-columns:repeat(3,minmax(0,1fr))} .rpc-row{grid-template-columns:36px minmax(0,1fr) auto} .rpc-row .rpc-crew{grid-column:2/-1} }
  </style>`;
}

function projectCabinetUi() {
  if (!state._projectCabinet) state._projectCabinet = { photoId: '', pick: '', selected: '' };
  return state._projectCabinet;
}

function projectCabinetSizeLabel(win) {
  const width = Number(win.actualWidth) > 0 ? Number(win.actualWidth) : Number(win.width) || 0;
  const height = Number(win.actualHeight) > 0 ? Number(win.actualHeight) : Number(win.height) || 0;
  if (!(width > 0 && height > 0)) return 'размеры не внесены';
  if (db.settings.inputUnits === 'mm') return `${Math.round(width)} × ${Math.round(height)} мм`;
  const inches = value => Math.round(mm_to_inches(value) * 10) / 10;
  return `${inches(width)}″ × ${inches(height)}″`;
}

function projectCabinetFilmLabel(win) {
  const catalog = windowCatalog(win);
  if (catalog) return catalogLabel(catalog);
  return win.filmType || 'плёнка не выбрана';
}

function projectCabinetSelectPhoto(photoId) {
  const ui = projectCabinetUi();
  ui.photoId = photoId; ui.pick = ''; ui.selected = '';
  preservePositionForNextRender(); render();
}

/** «Поставить точку»: the next tap on the photo links it to this window. */
function projectCabinetPickWindow(windowKey) {
  const ui = projectCabinetUi();
  ui.pick = ui.pick === windowKey ? '' : windowKey;
  ui.selected = windowKey;
  preservePositionForNextRender(); render();
}

function projectCabinetSelectWindow(windowKey) {
  const ui = projectCabinetUi();
  ui.selected = windowKey; ui.pick = '';
  preservePositionForNextRender(); render();
}

function projectCabinetPhotoTap(event, oid, photoId) {
  const ui = projectCabinetUi();
  if (!ui.pick || !orderUserCanManage(currentUser())) return;
  const o = getOrder(oid);
  const photo = (o?.photos || []).find(item => item.id === photoId);
  const box = event.currentTarget.getBoundingClientRect();
  if (!photo || !(box.width > 0 && box.height > 0)) return;
  const [roomId, windowId] = ui.pick.split('|');
  const x = Math.round(1000 * (event.clientX - box.left) / box.width) / 10;
  const y = Math.round(1000 * (event.clientY - box.top) / box.height) / 10;
  // One point per window on a photo: a new tap moves it.
  photo.marks = (photo.marks || []).filter(mark => !(mark.roomId === roomId && mark.windowId === windowId));
  photo.marks.push({ id: uid(), roomId, windowId, x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
  ui.pick = '';
  save();
  preservePositionForNextRender(); render();
}

function projectCabinetRemoveMark(oid, photoId, markId) {
  if (!orderUserCanManage(currentUser())) return;
  const o = getOrder(oid);
  const photo = (o?.photos || []).find(item => item.id === photoId);
  if (!photo) return;
  photo.marks = (photo.marks || []).filter(mark => mark.id !== markId);
  save();
  preservePositionForNextRender(); render();
}

function projectCabinetTourHtml(o, model, canManage) {
  const ui = projectCabinetUi();
  const oid = jsQuote(o.id);
  if (!model.photos.length) {
    return `<section class="rpc-card"><h2>Тур по объекту</h2>
      <div style="font-size:16px;font-weight:800">Фото объекта пока нет</div>
      <p class="rpc-note">Добавьте фото объекта — оно появится здесь, и на нём можно будет отметить окна точками.</p>
      ${canManage ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px"><button type="button" class="rpc-btn" onclick="addOrderPhoto('${oid}')">Добавить фото</button><button type="button" class="rpc-btn ghost" onclick="openManagerMeasureModal('${oid}')">Открыть замер</button></div>` : ''}
    </section>`;
  }
  const photo = model.photos.find(item => item.id === ui.photoId) || model.photos[0];
  const marks = photo.marks || [];
  const key = item => `${item.room.id || ''}|${item.win.id || ''}`;
  // Windows of the photo's room go first; a photo without a room shows all.
  const ordered = [...model.windows].sort((a, b) => Number(b.room.id === photo.roomId) - Number(a.room.id === photo.roomId));
  const rows = ordered.map(item => {
    const windowKey = key(item);
    const mark = marks.find(entry => `${entry.roomId}|${entry.windowId}` === windowKey);
    const area = windowActualAreaSqft(item.win);
    const verified = windowMeasurementIsVerified(item.win);
    return `<div class="rpc-win ${ui.selected === windowKey ? 'on' : ''}">
      <div onclick="projectCabinetSelectWindow('${jsQuote(windowKey)}')" style="cursor:pointer;min-width:0">
        <b>${academyEsc(item.room.name || 'Помещение')} · ${academyEsc(item.win.name || 'Окно')}</b>
        <small>${academyEsc(projectCabinetSizeLabel(item.win))} · ${area > 0 ? area.toFixed(1) + ' sq ft' : 'нет площади'} · ${academyEsc(projectCabinetFilmLabel(item.win))}</small>
        <small><span class="rpc-pill ${verified ? 'done' : 'wait'}">${verified ? 'замер проверен' : 'со слов клиента'}</span>${mark ? ' <span class="rpc-pill info">на фото</span>' : ''}</small>
      </div>
      ${canManage ? `<div style="display:grid;gap:4px;align-content:start">
        <button type="button" class="rpc-btn small ${ui.pick === windowKey ? '' : 'ghost'}" onclick="projectCabinetPickWindow('${jsQuote(windowKey)}')">${ui.pick === windowKey ? 'Нажмите на фото' : mark ? 'Перенести точку' : 'Поставить точку'}</button>
        ${mark ? `<button type="button" class="rpc-btn small ghost" onclick="projectCabinetRemoveMark('${oid}','${jsQuote(photo.id)}','${jsQuote(mark.id)}')">Убрать точку</button>` : ''}
      </div>` : ''}
    </div>`;
  }).join('');
  return `<section class="rpc-card"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px"><h2 style="margin:0">Тур по объекту · фото ${model.photos.indexOf(photo) + 1} из ${model.photos.length}</h2>${canManage ? `<button type="button" class="rpc-btn small ghost" onclick="addOrderPhoto('${oid}')">+ Фото</button>` : ''}</div>
    <div class="rpc-tour">
      <div>
        <div class="rpc-photo ${ui.pick ? 'pick' : ''}" onclick="projectCabinetPhotoTap(event,'${oid}','${jsQuote(photo.id)}')">
          <img src="${photo.dataUrl}" alt="Фото объекта">
          ${marks.map(mark => `<button type="button" class="rpc-mark ${ui.selected === `${mark.roomId}|${mark.windowId}` ? 'on' : ''}" style="left:${Number(mark.x) || 0}%;top:${Number(mark.y) || 0}%" aria-label="Окно на фото" onclick="event.stopPropagation();projectCabinetSelectWindow('${jsQuote(`${mark.roomId}|${mark.windowId}`)}')"></button>`).join('')}
        </div>
        ${model.photos.length > 1 ? `<div class="rpc-thumbs">${model.photos.map(item => `<button type="button" class="${item.id === photo.id ? 'on' : ''}" onclick="projectCabinetSelectPhoto('${jsQuote(item.id)}')"><img src="${item.dataUrl}" alt=""></button>`).join('')}</div>` : ''}
        <p class="rpc-note">${ui.pick ? 'Нажмите на окно на фото — точка привяжется к выбранному окну.' : 'Нажмите на точку, чтобы увидеть окно. Точки ставит владелец или менеджер.'}</p>
      </div>
      <div>${rows || '<p class="rpc-note">В проекте ещё нет окон.</p>'}</div>
    </div>
  </section>`;
}

function projectCabinetHtml(o, c, u, opts = {}) {
  const model = projectCabinetModel(o, c, u, opts);
  const canManage = !!opts.canManage;
  const oid = jsQuote(o.id);
  const address = orderAddress(o, c);
  const labels = { planned: ['wait', 'в плане'], in_progress: ['prog', 'в работе'], done: ['done', 'готово'] };
  const primary = model.primary;
  const works = model.lines.map(line => {
    const label = labels[line.status] || labels.planned;
    const when = line.installationAt ? fmtDate(line.installationAt) : 'дата не назначена';
    const next = line.status === 'planned' ? ['in_progress', 'Начать'] : line.status === 'in_progress' ? ['done', 'Готово'] : null;
    return `<div class="rpc-row">
      <span class="rpc-ico">${line.direction.icon || '▫️'}</span>
      <span style="min-width:0"><b>${academyEsc(line.name)}</b><small>${academyEsc(line.direction.title || '')} · ${line.qty ? `${line.qty} ${academyEsc(line.unit)}` : 'без объёма'}</small></span>
      <span class="rpc-crew" style="min-width:0"><small>${academyEsc(line.crew.join(', ') || 'исполнитель не назначен')} · ${academyEsc(when)}</small></span>
      <span>${model.canSeeMoney ? `<span class="rpc-num">${fmtMoney(line.price)}</span>` : ''}</span>
      <span style="display:flex;gap:6px;align-items:center;justify-content:flex-end"><span class="rpc-pill ${label[0]}">${label[1]}</span>${line.canMark && next ? `<button type="button" class="rpc-btn small ghost" onclick="projectSetServiceProgress('${oid}','${jsQuote(line.key)}','${next[0]}')">${next[1]}</button>` : ''}</span>
    </div>`;
  }).join('');
  return `${projectCabinetCss()}<div class="rpc">
    <header class="rpc-card rpc-top">
      <button type="button" class="rpc-btn small ghost" onclick="state.view='orders'; location.hash=''; render();">← Проекты</button>
      <h1>Проект ${academyEsc(o.number || '')}<small>${academyEsc(c?.name || 'Клиент')}${address ? ' · ' + academyEsc(address) : ''}</small></h1>
      <span class="rpc-chip">${academyEsc(statusLabel(o.status))}</span>
      <button type="button" class="rpc-btn small" onclick="projectEditStart('${oid}')">✏️ Редактировать проект</button>
    </header>
    <section class="rpc-g4">
      ${projectCabinetRing(model.stagePct, `${model.stageDone} из ${model.stageTotal}`, 'этапов пройдено', '#178a52')}
      ${projectCabinetRing(model.workPct, `${model.doneLines} из ${model.lines.length}`, 'услуг выполнено', '#a96a10')}
      ${projectCabinetRing(model.windowCount ? 100 * model.sizedCount / model.windowCount : 0, `${model.sizedCount} из ${model.windowCount}`, `окон с размерами · ${model.sqft.toFixed(0)} sq ft`, '#2f62b8')}
      ${model.canSeeMoney ? projectCabinetRing(model.paidPct, fmtMoney(model.paid), `оплачено из ${fmtMoney(model.revenue)}`, '#7d4fc4') : projectCabinetRing(model.workPct, `${model.sqft.toFixed(0)} sq ft`, 'по замеру', '#7d4fc4')}
    </section>
    <section class="rpc-card"><h2>Этапы проекта</h2>
      ${model.stageHtml.split('projectCardOpenWorkspace(').join('projectCabinetOpenWorkspace(') || '<span class="rpc-note">Этапы недоступны.</span>'}
      <p class="rpc-note">Та же линия этапов, что в обычной карточке: нажатие открывает окно этого шага.</p>
    </section>
    <section class="rpc-card"><h2>Следующий шаг</h2>
      ${primary ? `<div class="rpc-next"><div style="flex:1;min-width:220px"><b>${primary.icon || ''} ${academyEsc(primary.title || '')}</b><span>${academyEsc(primary.sub || '')}</span></div>${primary.href && !primary.disabled ? `<a class="rpc-btn" href="${primary.href}" target="_blank" rel="noopener">${academyEsc(primary.title || 'Открыть')}</a>` : primary.onclick && !primary.disabled ? `<button type="button" class="rpc-btn" onclick="${primary.onclick}">${academyEsc(primary.title || 'Открыть')}</button>` : ''}</div>` : '<span class="rpc-note">Для этого проекта нет действия.</span>'}
    </section>
    <section class="rpc-card"><h2>Услуги проекта</h2>
      ${works || '<p class="rpc-note">Услуги ещё не добавлены. Добавить их можно в обычной карточке.</p>'}
    </section>
    ${projectCabinetTourHtml(o, model, canManage)}
    <p class="rpc-note" style="text-align:center">Суммы, статусы и следующий шаг считают те же функции, что и в обычной карточке.</p>
  </div>`;
}

// ---------- Редактирование проекта и запрос менеджера (Owner, 2026-11-22) ----------
// «В понятной карточке нужна кнопка „Редактировать“, а у менеджера — запрос на
// редактирование: без меня он не может редактировать». The owner edits at once:
// the button opens the working card. A manager edits freely while the project is
// in work; once it is closed (act / payment / done) the card turns read-only for
// him and he asks the owner. An approval opens editing for 24 hours.
const PROJECT_EDIT_LOCKED_STATUSES = ['act_signed', 'payment_received', 'completed', 'review_received'];
const PROJECT_EDIT_GRANT_HOURS = 24;

function projectEditGrantActive(o, u) {
  const grant = o?.editAccess;
  return !!grant && !!u && grant.userId === u.id && new Date(grant.until).getTime() > Date.now();
}

/** True when this user may not change the project without the owner's approval. */
function projectEditLocked(o, u) {
  if (!o || !u || u.role !== 'manager') return false;
  if (!PROJECT_EDIT_LOCKED_STATUSES.includes(o.status)) return false;
  return !projectEditGrantActive(o, u);
}

/** Guard for every action that changes a project: a locked manager gets the request offer instead. */
function projectEditBlocked(oid) {
  const o = getOrder(oid);
  const u = currentUser();
  if (!projectEditLocked(o, u)) return false;
  if (projectEditPendingRequest(o, u.id)) {
    if (typeof cloudStatus === 'function') cloudStatus('Проект закрыт — запрос владельцу уже отправлен', 'red');
  } else if (confirm('Проект закрыт. Изменить его можно только с разрешения владельца. Отправить запрос?')) {
    projectEditRequest(oid);
  }
  return true;
}

function projectEditPendingRequest(o, userId) {
  return (o?.editRequests || []).find(r => r.status === 'pending' && (!userId || r.by === userId)) || null;
}

/** Owner (or a manager with access): leave the overview and open the editable working card. */
function projectEditStart(oid) {
  const o = getOrder(oid);
  const u = currentUser();
  if (!o || !u) return;
  if (projectEditLocked(o, u)) { projectEditRequest(oid); return; }
  // Owner, 2026-11-22 19:24: «нажал „Редактировать проект“ — попадаю в карточку проекта,
  // где видны все услуги, удаление, добавление и вход в каждую услугу для размеров».
  // One place to edit — the working card itself, not a separate window.
  if (!projectEditorCanEdit(o, u)) { alert('Нет прав на редактирование этого проекта.'); return; }
  closeModal();
  state.projectCabinetBypass = oid;
  if (state.view !== 'orderDetails' || state.openOrderId !== oid) openOrder(oid);
  else render();
  setTimeout(() => document.querySelector('[data-service-row]')?.closest('section,.card,div')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60);
}

function projectEditRequest(oid) {
  const o = getOrder(oid);
  const u = currentUser();
  if (!o || !u || u.role !== 'manager') return;
  if (projectEditPendingRequest(o, u.id)) {
    if (typeof cloudStatus === 'function') cloudStatus('Запрос уже отправлен владельцу', 'blue');
    return;
  }
  const answer = prompt('Что нужно изменить в проекте? Владелец увидит это в запросе.', '');
  if (answer === null) return; // cancelled: no request
  const reason = String(answer).trim().slice(0, 300);
  const now = new Date().toISOString();
  o.editRequests = o.editRequests || [];
  o.editRequests.push({ id: uid(), by: u.id, at: now, reason, status: 'pending' });
  o.timeline = o.timeline || [];
  o.timeline.push({ at: now, key: 'edit_requested', by: u.id, note: reason ? `Запрос на редактирование: ${reason}` : 'Запрос на редактирование' });
  (db.users || []).filter(x => x.role === 'owner' && x.active !== false).forEach(owner => {
    pushInAppNotification(owner.id, `✏️ Запрос на редактирование · ${o.number || ''}`,
      `${u.name || 'Менеджер'} просит изменить проект${reason ? ': ' + reason : ''}`, `#/order/${o.id}`);
  });
  save();
  render();
  if (typeof cloudStatus === 'function') cloudStatus('Запрос отправлен владельцу', 'green');
}

function projectEditDecide(oid, requestId, allow) {
  const o = getOrder(oid);
  const u = currentUser();
  if (!o || !u || u.role !== 'owner') return;
  const request = (o.editRequests || []).find(r => r.id === requestId);
  if (!request || request.status !== 'pending') return;
  const now = new Date();
  request.status = allow ? 'approved' : 'declined';
  request.decidedAt = now.toISOString();
  request.decidedBy = u.id;
  if (allow) {
    o.editAccess = { userId: request.by, by: u.id, at: now.toISOString(), until: new Date(now.getTime() + PROJECT_EDIT_GRANT_HOURS * 3600000).toISOString() };
  }
  o.timeline = o.timeline || [];
  o.timeline.push({ at: now.toISOString(), key: allow ? 'edit_approved' : 'edit_declined', by: u.id, note: allow ? `Редактирование разрешено на ${PROJECT_EDIT_GRANT_HOURS} ч` : 'Редактирование отклонено' });
  pushInAppNotification(request.by, allow ? `✅ Можно редактировать · ${o.number || ''}` : `⛔ Редактирование отклонено · ${o.number || ''}`,
    allow ? `Владелец разрешил изменить проект на ${PROJECT_EDIT_GRANT_HOURS} ч.` : 'Владелец не разрешил изменения.', `#/order/${o.id}`);
  save();
  render();
}

/** One line above the card: the owner sees requests, a manager sees why he cannot edit. */
function projectEditBanner(o, u) {
  if (!o || !u) return '';
  const oid = jsQuote(o.id);
  const box = (tone, body) => `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 12px;padding:10px 14px;border-radius:12px;border:1px solid ${tone[0]};background:${tone[1]};color:${tone[2]};font-size:.88rem">${body}</div>`;
  if (u.role === 'owner') {
    return (o.editRequests || []).filter(r => r.status === 'pending').map(r => {
      const who = getUser(r.by)?.name || 'Менеджер';
      return box(['#fcd34d', '#fffbeb', '#92400e'], `<span style="flex:1;min-width:220px">✏️ <b>${academyEsc(who)}</b> просит редактировать проект${r.reason ? `: «${academyEsc(r.reason)}»` : ''}</span>
        <button type="button" class="btn-primary text-sm" onclick="projectEditDecide('${oid}','${jsQuote(r.id)}',true)">Разрешить на ${PROJECT_EDIT_GRANT_HOURS} ч</button>
        <button type="button" class="btn-ghost text-sm" onclick="projectEditDecide('${oid}','${jsQuote(r.id)}',false)">Отклонить</button>`);
    }).join('');
  }
  if (u.role !== 'manager' || !PROJECT_EDIT_LOCKED_STATUSES.includes(o.status)) return '';
  if (projectEditGrantActive(o, u)) {
    return box(['#86efac', '#f0fdf4', '#166534'], `✅ Владелец разрешил редактирование до <b>${fmtDateTime(o.editAccess.until)}</b>`);
  }
  const pending = projectEditPendingRequest(o, u.id);
  return box(['#cbd5e1', '#f8fafc', '#334155'], `<span style="flex:1;min-width:220px">🔒 Проект закрыт — изменения только с разрешения владельца.</span>
    ${pending ? `<span class="tag">Запрос отправлен ${fmtDateTime(pending.at)}</span>` : `<button type="button" class="btn-primary text-sm" onclick="projectEditRequest('${oid}')">✏️ Запросить редактирование</button>`}`);
}

// ---------- Окно «Редактировать проект» (Owner, 2026-11-22 09:45) ----------
// «Если я открываю „Редактировать проект“, оно должно открываться в новом окне и в
// нормальном виде, и там в составе я могу добавлять услуги, удалять и изменять
// существующие». One window, one list of the project's services: quantity, price,
// delete, «+ Добавить услугу». The owner may correct a closed (historical) project;
// a manager only while the project is open or the owner approved his request.
// The lines are the same projectLines() the card, the proposal and payroll read.

function projectEditorCanEdit(o, u = currentUser()) {
  if (!o || !u || !orderUserCanSeeMoney(o, u)) return false;
  if (u.role === 'owner') return true;
  return u.role === 'manager' && !projectEditLocked(o, u);
}

function projectEditorLines(o) {
  return projectLines(o).filter(line => line.kind !== 'included' && !line.excluded);
}

function openProjectEditor(oid) {
  const o = getOrder(oid);
  const u = currentUser();
  if (!o || !u) return;
  if (!projectEditorCanEdit(o, u)) { if (!projectEditBlocked(oid)) alert('Нет прав на редактирование этого проекта.'); return; }
  state.modal = projectEditorHtml(o, getClient(o.clientId));
  render();
}

function projectEditorQtyEditable(line) {
  return ['quantity', 'quick'].includes(line.kind) || !!line.unitPriced;
}

function projectEditorHtml(o, c) {
  const oid = jsQuote(o.id);
  const closed = CLOSED_PROJECT_STATUSES.includes(o.status);
  const rows = projectEditorLines(o).map(line => {
    const key = jsQuote(line.key);
    const done = projectServiceProgress(o, line.key).status === 'done';
    const qtyCell = projectEditorQtyEditable(line)
      ? `<label class="rpe-field"><span>Кол-во, ${academyEsc(line.unitShort || line.unit || 'шт')}</span><input type="number" min="0" step="0.01" inputmode="decimal" value="${Number(line.qty) || 0}" onchange="projectEditorSetQty('${oid}','${key}',this.value)"></label>`
      : `<div class="rpe-field"><span>Объём</span><b>${academyEsc(projectLineQtyText(line) || '—')}</b>${line.kind === 'windows' ? `<button type="button" class="rpe-measure" onclick="closeModal(); openManagerMeasureModal('${oid}')">📐 Окна и размеры</button>` : ''}</div>`;
    return `<div class="rpe-row">
      <button type="button" class="rpe-name rpe-open" title="Открыть услугу: материал, объём, исполнитель, дата" onclick="projectEditorOpenService('${oid}','${key}')"><span class="rpe-ico">${line.direction?.icon || '▫️'}</span><span><b>${academyEsc(line.name)} <span class="rpe-go">✏️ Изменить ›</span></b><small>${academyEsc(line.direction?.title || '')}${done ? ' · выполнено' : ''}</small></span></button>
      ${qtyCell}
      <label class="rpe-field"><span>Сумма клиенту, $</span><input type="number" min="0" step="1" inputmode="decimal" value="${Math.round((Number(line.price) || 0) * 100) / 100}" onchange="projectEditorSetPrice('${oid}','${key}',this.value)"></label>
      <button type="button" class="rpe-del" title="Удалить услугу" aria-label="Удалить ${academyEsc(line.name)}" onclick="projectEditorRemove('${oid}','${key}')">✕</button>
    </div>`;
  }).join('');
  return `<div class="modal-backdrop" onclick="if(event.target===this) closeModal()">
    <div class="modal-content workspace-modal rpe" style="max-width:860px;width:min(860px,96vw);padding:0">
      <style>
        .rpe-head{display:flex;align-items:flex-start;gap:12px;padding:18px 20px;border-bottom:1px solid #e2e8f0}
        .rpe-head h3{margin:0;font-size:1.2rem;font-weight:900}
        .rpe-head small{display:block;color:#64748b;font-weight:600;margin-top:2px}
        .rpe-body{padding:14px 20px;display:grid;gap:14px;max-height:70vh;overflow:auto}
        .rpe-sec h4{margin:0 0 8px;font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:#64748b}
        .rpe-row{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(120px,.8fr) minmax(130px,.8fr) 40px;gap:10px;align-items:end;padding:10px 0;border-bottom:1px solid #f1f5f9}
        .rpe-name{display:flex;gap:10px;align-items:center;min-width:0}
        .rpe-name b{display:block}.rpe-name small{color:#64748b}
        .rpe-ico{font-size:1.2rem}
        .rpe-field{display:grid;gap:3px;font-size:.72rem;color:#64748b;min-width:0}
        .rpe-field input{min-height:38px;font-weight:800;color:#0f172a}
        .rpe-field b{color:#0f172a;font-size:.86rem}
        .rpe-link{border:0;background:none;color:#15803d;font-weight:700;padding:0;text-align:left;font-size:.72rem;cursor:pointer}
        .rpe-open{border:1px solid transparent;background:none;border-radius:8px;padding:6px;text-align:left;cursor:pointer;color:inherit}
        .rpe-open:hover{border-color:#bbf7d0;background:#f0fdf4}
        .rpe-go{display:inline-block;margin-left:6px;padding:2px 8px;border-radius:6px;background:#15803d;color:#fff;font-size:.72rem;font-weight:800;vertical-align:middle}
        .rpe-measure{margin-top:4px;min-height:32px;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:8px;font-weight:800;font-size:.78rem;padding:0 10px;cursor:pointer}
        .rpe-del{min-height:38px;border:1px solid #fecaca;background:#fff1f2;color:#b91c1c;border-radius:8px;font-weight:900;cursor:pointer}
        .rpe-foot{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:14px 20px;border-top:1px solid #e2e8f0}
        .rpe-note{font-size:.78rem;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 10px}
        @media (max-width:700px){.rpe-row{grid-template-columns:1fr 1fr 40px}.rpe-name{grid-column:1/-1}}
      </style>
      <div class="rpe-head">
        <div style="flex:1;min-width:0"><h3>✏️ Редактировать проект ${academyEsc(o.number || '')}</h3><small>${academyEsc(c?.name || 'Клиент')}${orderAddress(o, c) ? ' · ' + academyEsc(orderAddress(o, c)) : ''}</small></div>
        <button type="button" class="btn-ghost text-sm" onclick="closeModal()">✕ Закрыть</button>
      </div>
      <div class="rpe-body">
        ${closed ? `<div class="rpe-note">Проект закрыт. Изменения пересчитают сумму, долг, зарплату и списание плёнки по этому проекту.</div>` : ''}
        <div class="rpe-sec"><h4>Клиент и объект</h4>
          <button type="button" class="btn-ghost text-sm" onclick="closeModal(); openClientContactProfile('${jsQuote(c?.id || '')}','${oid}')">Изменить клиента, телефон, адрес</button>
        </div>
        <div class="rpe-sec"><h4>Состав проекта</h4>
          ${rows || '<p class="text-sm text-gray-500">Услуг пока нет.</p>'}
          <div style="margin-top:10px"><button type="button" class="btn-primary text-sm" onclick="openServiceCashier('${oid}','editor')">+ Добавить услугу</button></div>
        </div>
      </div>
      <div class="rpe-foot">
        <b style="flex:1">Итого клиенту: ${fmtMoney(orderRevenue(o))}</b>
        <span class="text-sm text-gray-500">Оплачено ${fmtMoney(orderPaidTotal(o) || Number(o.paid) || 0)}</span>
        <button type="button" class="btn-primary" onclick="closeModal()">Готово</button>
      </div>
    </div>
  </div>`;
}

function projectEditorLine(oid, key) {
  const o = getOrder(oid);
  if (!o || !projectEditorCanEdit(o)) return {};
  return { o, line: projectLines(o).find(item => item.key === key) || null };
}

function projectEditorSaved(o, reason) {
  projectEstimateMarkChanged(o, reason);
  save();
  // Re-open the editor only when the change came from it; the card's 🗑 stays in the card.
  if (String(state.modal || '').includes('workspace-modal rpe')) state.modal = projectEditorHtml(o, getClient(o.clientId));
  preservePositionForNextRender(); render();
}

// Owner, 2026-11-22 14:25: «в „Редактировать проект“ нажал на услугу — должна
// открыться сама услуга для редактирования; маленькую кнопку „в замере“ не найти».
// The service name opens that service in the working card (material, scope, price,
// crew, date, stages), scrolled into view; windows services get a clear «📐 Окна и размеры».
function projectEditorOpenService(oid, key) {
  const o = getOrder(oid);
  if (!o) return;
  closeModal();
  state.projectCabinetBypass = oid; // the overview has no service editing — show the working card
  state.projectCardSelection = { ...(state.projectCardSelection || {}), [oid]: key };
  if (state.view !== 'orderDetails' || state.openOrderId !== oid) openOrder(oid);
  else render();
  setTimeout(() => {
    const row = Array.from(document.querySelectorAll('[data-service-row]')).find(el => el.getAttribute('data-service-row') === key);
    if (row) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, 60);
}

/** «🗑» on a service row in the project card: the same removal as the editor window. */
function projectCardRemoveLine(oid, key) {
  projectEditorRemove(oid, key);
}

function projectEditorSetQty(oid, key, value) {
  const { o, line } = projectEditorLine(oid, key);
  const source = line?.sources?.[0];
  if (!o || !source || !projectEditorQtyEditable(line)) return;
  const qty = Math.max(0, parseFloat(value) || 0);
  if (line.kind === 'quick') {
    source.qty = qty; // a quick row keeps its total
    if (qty > 0 && Number(source.price) > 0) source.unitPrice = Number(source.price) / qty;
  } else {
    const unit = Number(source.unitPrice) || (Number(source.qty) > 0 ? Number(source.price) / Number(source.qty) : 0);
    source.qty = qty;
    source.unitPrice = unit;
    source.price = Math.round(unit * qty * 100) / 100;
  }
  if (line.kind === 'quick') projectEstimateSyncQuickServices(o);
  projectEditorSaved(o, `Изменено количество «${line.name}»: ${qty}`);
}

function projectEditorSetPrice(oid, key, value) {
  const { o, line } = projectEditorLine(oid, key);
  if (!o || !line) return;
  const total = Math.max(0, parseFloat(value) || 0);
  let unit = total;
  if (line.kind === 'windows') {
    const sqft = line.windows.reduce((sum, win) => sum + (windowActualAreaSqft(win) || 0), 0);
    if (!(sqft > 0)) { alert('Сначала внесите размеры окон — цена считается за sq ft.'); return; }
    unit = total / sqft;
  } else if (line.kind === 'quantity' || line.unitPriced) {
    const qty = Number(line.sources?.[0]?.qty) || 0;
    if (!(qty > 0)) { alert('Сначала укажите количество.'); return; }
    unit = total / qty;
  }
  if (currentUser()?.role !== 'owner') {
    const offering = serviceOffering(line.offeringId);
    const range = projectServicePriceRange(offering);
    if (range && ((range.min > 0 && unit < range.min - 0.005) || (range.max > 0 && unit > range.max + 0.005))) {
      alert(`Цена «${offering.name}»: от ${fmtMoney(range.min)}${range.max ? ` до ${fmtMoney(range.max)}` : ''}.`);
      return;
    }
  }
  if (!projectApplyLineUnitPrice(line, unit)) return;
  if (line.kind === 'quick') projectEstimateSyncQuickServices(o);
  projectEditorSaved(o, `Изменена сумма «${line.name}»: ${fmtMoney(total)}`);
}

function projectEditorRemove(oid, key) {
  const { o, line } = projectEditorLine(oid, key);
  if (!o || !line) return;
  const done = projectServiceProgress(o, line.key).status === 'done';
  // A completed service is history (revenue, schedule, installer pay). Only the
  // owner may deliberately correct it; for everyone else it stays (as in the card).
  if (done && currentUser()?.role !== 'owner') { alert(`«${line.name}»: услуга выполнена — её не удаляют. Попросите владельца.`); return; }
  if (!confirm(`Удалить «${line.name}» из проекта?${done ? ' Услуга отмечена выполненной — зарплата и списание по ней пересчитаются.' : ''}`)) return;
  if (line.kind === 'windows') {
    measureAllWindows(o).forEach(({ win }) => { if (win.offeringId === line.offeringId) { win.offeringId = ''; win.catalogId = ''; } });
    o.offeringIds = (o.offeringIds || []).filter(id => id !== line.offeringId);
  } else {
    const ids = new Set((line.sources || []).map(source => source.id).filter(Boolean));
    if (!ids.size) return;
    o.extraServices = (o.extraServices || []).filter(item => !ids.has(item.id));
  }
  if (o.serviceProgress) delete o.serviceProgress[line.key];
  syncProjectIncludedServices(o);
  projectPrunePlans(o);
  projectCardSyncCrew(o);
  if (line.kind === 'quick') projectEstimateSyncQuickServices(o);
  projectEditorSaved(o, `Удалена услуга «${line.name}»`);
}
