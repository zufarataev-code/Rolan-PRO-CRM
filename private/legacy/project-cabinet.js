// «Кабинет проекта» — пробный вид карточки Project (Owner, 2026-11-17).
//
// Composed into the legacy page by composeProductionHtml(), so only top-level
// functions live here. The cabinet reads the same Project and calls the same
// helpers as the working card (projectLines, orderRevenue, orderPaidTotal,
// orderPrimaryNextAction, projectSetServiceProgress): no second calculation.
// It is shown only to the owner and only after the owner turns it on; the
// choice is kept on the device, not in the workspace.

function projectCabinetEnabled(u) {
  if (!u || u.role !== 'owner') return false;
  try { return localStorage.getItem('rp_project_cabinet') === '1'; } catch (error) { return false; }
}

function projectCabinetToggle(on) {
  try {
    if (on) localStorage.setItem('rp_project_cabinet', '1');
    else localStorage.removeItem('rp_project_cabinet');
  } catch (error) { /* private mode: the trial view simply stays off */ }
  render();
}

/** One line above the working card: the only way into the trial view. */
function projectCabinetEntryBar(o, u) {
  if (!o || !u || u.role !== 'owner') return '';
  return `<div style="display:flex;justify-content:flex-end;margin:0 0 8px">
    <button type="button" onclick="projectCabinetToggle(true)" style="font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;border:1px solid #cfe3d7;background:#f2f8f4;color:#17794a">Кабинет проекта (проба)</button>
  </div>`;
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
  const accepted = reached('proposal_accepted');
  const noDeposit = o.paymentTerms === 'after_completion' || !!o.depositWaivedAt;
  const depositDone = accepted && (noDeposit || !!o.depositReceived || (Number(orderPaidTotal(o)) || Number(o.paid) || 0) > 0);
  const stages = [
    { name: 'Замер', done: reached('measurement_done'), note: reached('measurement_done') ? 'выполнен' : o.status === 'measurement_scheduled' ? 'назначен' : 'не начат', pct: reached('measurement_done') ? 100 : 0 },
    { name: 'КП', done: accepted, note: accepted ? 'принято' : o.status === 'proposal_sent' ? 'у клиента' : 'не отправлено', pct: accepted ? 100 : o.status === 'proposal_sent' ? 50 : 0 },
    { name: 'Аванс', done: depositDone, note: !accepted ? 'после КП' : noDeposit ? 'без аванса' : depositDone ? 'получен' : 'ждём', pct: depositDone ? 100 : 0 },
    { name: 'Монтаж', done: installDone, note: `${workPct}%`, pct: workPct },
    { name: 'Акт', done: reached('act_signed'), note: reached('act_signed') ? 'подписан' : 'после монтажа', pct: reached('act_signed') ? 100 : 0 },
    { name: 'Оплата', done: reached('payment_received'), note: reached('payment_received') ? 'получена' : 'после акта', pct: reached('payment_received') ? 100 : 0 },
  ];
  const current = stages.findIndex(stage => !stage.done);
  stages.forEach((stage, index) => { stage.state = stage.done ? 'done' : index === current ? 'now' : 'wait'; });
  let primary = null;
  try { primary = orderPrimaryNextAction(o); } catch (error) { primary = null; }
  const photos = (o.photos || []).filter(photo => photo && photo.dataUrl && photo.kind !== 'video');
  return {
    lines, doneLines, workPct, windows, windowCount, sizedCount, sqft, revenue, paid, stages, primary, photos, canSeeMoney,
    stagePct: Math.round(100 * stages.filter(stage => stage.done).length / stages.length),
    paidPct: revenue > 0 ? Math.min(100, Math.round(100 * paid / revenue)) : 0,
  };
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
      <p class="rpc-note">Добавьте фото в замере — оно появится здесь, и на нём можно будет отметить окна.</p>
      ${canManage ? `<button type="button" class="rpc-btn ghost" style="margin-top:10px" onclick="openManagerMeasureModal('${oid}')">Открыть замер</button>` : ''}
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
  return `<section class="rpc-card"><h2>Тур по объекту · фото ${model.photos.indexOf(photo) + 1} из ${model.photos.length}</h2>
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
      <h1>Проект ${academyEsc(o.number || '')}<small>${academyEsc(c?.name || 'Клиент')}${address ? ' · ' + academyEsc(address) : ''}</small></h1>
      <span class="rpc-chip">${academyEsc(statusLabel(o.status))}</span>
      <button type="button" class="rpc-btn small ghost" onclick="projectCabinetToggle(false)">Обычная карточка</button>
    </header>
    <section class="rpc-g4">
      ${projectCabinetRing(model.stagePct, `${model.stages.filter(stage => stage.done).length} из ${model.stages.length}`, 'этапов пройдено', '#178a52')}
      ${projectCabinetRing(model.workPct, `${model.doneLines} из ${model.lines.length}`, 'услуг выполнено', '#a96a10')}
      ${projectCabinetRing(model.windowCount ? 100 * model.sizedCount / model.windowCount : 0, `${model.sizedCount} из ${model.windowCount}`, `окон с размерами · ${model.sqft.toFixed(0)} sq ft`, '#2f62b8')}
      ${model.canSeeMoney ? projectCabinetRing(model.paidPct, fmtMoney(model.paid), `оплачено из ${fmtMoney(model.revenue)}`, '#7d4fc4') : projectCabinetRing(model.workPct, `${model.sqft.toFixed(0)} sq ft`, 'по замеру', '#7d4fc4')}
    </section>
    <section class="rpc-card"><h2>Этапы проекта</h2>
      <div class="rpc-rail">${model.stages.map((stage, index) => `<div class="rpc-st ${stage.state}"><em>${String(index + 1).padStart(2, '0')} · ${academyEsc(stage.note)}</em><b>${stage.name}</b><div class="rpc-bar"><i style="width:${stage.pct}%"></i></div></div>`).join('')}</div>
    </section>
    <section class="rpc-card"><h2>Следующий шаг</h2>
      ${primary ? `<div class="rpc-next"><div style="flex:1;min-width:220px"><b>${primary.icon || ''} ${academyEsc(primary.title || '')}</b><span>${academyEsc(primary.sub || '')}</span></div>${primary.href && !primary.disabled ? `<a class="rpc-btn" href="${primary.href}" target="_blank" rel="noopener">${academyEsc(primary.title || 'Открыть')}</a>` : primary.onclick && !primary.disabled ? `<button type="button" class="rpc-btn" onclick="${primary.onclick}">${academyEsc(primary.title || 'Открыть')}</button>` : ''}</div>` : '<span class="rpc-note">Для этого проекта нет действия.</span>'}
    </section>
    <section class="rpc-card"><h2>Услуги проекта</h2>
      ${works || '<p class="rpc-note">Услуги ещё не добавлены. Добавить их можно в обычной карточке.</p>'}
    </section>
    ${projectCabinetTourHtml(o, model, canManage)}
    <p class="rpc-note" style="text-align:center">Пробный вид для владельца. Суммы, статусы и следующий шаг считают те же функции, что и в обычной карточке.</p>
  </div>`;
}
