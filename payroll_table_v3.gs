// ROLANPRO PAYROLL TABLE v3
// Улучшения: четкое деление ЗП по неделям/месяцам/годам, статистика по услугам,
// детализация по сотрудникам, цветовые индикаторы и Telegram-уведомления.

var SERVICES = ['Солнцезащитная', 'Декоративная', 'Защитная', 'Смарт', 'Удаление', 'Силикон', 'Электрика'];
var WORKERS = ['Ринат', 'Нурик', 'Данил', 'Зуфар'];
var STATUSES = ['Новый', 'В работе', 'Завершен', 'Оплачено', 'Рекламация'];

var RATES = {
  'Солнцезащитная': { labor: 2.5, material: 1, unit: 'sqft' },
  'Декоративная': { labor: 2.5, material: 1, unit: 'sqft' },
  'Защитная': { labor: 3, material: 2, unit: 'sqft' },
  'Смарт': { labor: 5, material: 10, unit: 'sqft' },
  'Удаление': { labor: 1, material: 0, unit: 'sqft' },
  'Силикон': { labor: 1, material: 0, unit: 'sqft' },
  'Электрика': { labor: 400, material: 0, unit: 'шт' }
};

var MIN_CREW_PAY = 200;
var MANAGER_PERCENT = 0.05;
var ZUFAR_MEASURE_PERCENT = 0.02;

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ROLANPRO')
    .addItem('Создать таблицу v3', 'setupPayrollTable')
    .addItem('Пересчитать', 'recalculatePayroll')
    .addItem('Проверить Telegram', 'sendTestTelegramNotification')
    .addToUi();
}

function setupPayrollTable() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ['ВВОД_ЗАКАЗОВ', 'РАСЧЕТ_ЗП', 'АНАЛИТИКА', 'СОТРУДНИКИ_ПЕРИОДЫ', 'СТАВКИ', 'НАСТРОЙКИ_БОТА'].forEach(function(name) {
    deleteSheetIfExists_(ss, name);
  });

  var input = ss.insertSheet('ВВОД_ЗАКАЗОВ');
  var calc = ss.insertSheet('РАСЧЕТ_ЗП');
  var dash = ss.insertSheet('АНАЛИТИКА');
  var people = ss.insertSheet('СОТРУДНИКИ_ПЕРИОДЫ');
  var rates = ss.insertSheet('СТАВКИ');
  var bot = ss.insertSheet('НАСТРОЙКИ_БОТА');

  buildRates_(rates);
  buildInput_(input);
  buildCalcEmpty_(calc);
  buildDashboardEmpty_(dash);
  buildPeoplePeriodsEmpty_(people);
  buildBotSettings_(bot);

  SpreadsheetApp.getUi().alert('Готово: таблица v3 создана. Заполняй ВВОД_ЗАКАЗОВ и нажимай Пересчитать.');
}

function recalculatePayroll() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var input = ss.getSheetByName('ВВОД_ЗАКАЗОВ');
  var calc = ss.getSheetByName('РАСЧЕТ_ЗП');
  var dash = ss.getSheetByName('АНАЛИТИКА');
  var people = ss.getSheetByName('СОТРУДНИКИ_ПЕРИОДЫ');
  if (!input || !calc || !dash || !people) {
    SpreadsheetApp.getUi().alert('Сначала запусти: Создать таблицу v3');
    return;
  }

  var last = input.getLastRow();
  var rows = [];
  if (last >= 7) rows = input.getRange(7, 1, last - 6, 16).getValues();

  var out = [];
  var byService = {};
  var byWorker = {};
  var byWorkerPeriod = {};
  var totals = { revenue: 0, material: 0, crew: 0, manager: 0, zufar: 0, profit: 0, hours: 0, orders: 0 };

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var date = r[0], orderNo = r[3], client = r[4], service = r[5];
    if (!orderNo && !client && !service) continue;

    var qty = num_(r[6]), sqft = num_(r[7]), revenue = num_(r[8]);
    var w1 = r[9], h1 = num_(r[10]), w2 = r[11], h2 = num_(r[12]), status = r[14];

    var rateObj = RATES[service] || { labor: 0, material: 0, unit: 'sqft' };
    var material = service === 'Электрика' ? 0 : sqft * rateObj.material;
    var crewFund = service === 'Электрика' ? qty * rateObj.labor : Math.max(sqft * rateObj.labor, MIN_CREW_PAY);
    var pay1 = w1 ? (w2 ? crewFund / 2 : crewFund) : 0;
    var pay2 = w2 ? crewFund / 2 : 0;
    var hours = h1 + h2;

    var managerProfitBase = revenue - material - crewFund;
    var managerPay = Math.max(0, managerProfitBase * MANAGER_PERCENT);
    var zufarPay = revenue * ZUFAR_MEASURE_PERCENT;
    var profit = revenue - material - crewFund - managerPay - zufarPay;
    var margin = revenue > 0 ? profit / revenue : 0;
    var flag = profit < 0 ? 'УБЫТОК' : (margin < 0.2 ? 'НИЗКАЯ' : (margin < 0.3 ? 'НОРМ' : 'ХОРОШО'));

    var dt = date ? new Date(date) : null;
    var month = dt ? Utilities.formatDate(dt, Session.getScriptTimeZone(), 'yyyy-MM') : '';
    var year = dt ? Utilities.formatDate(dt, Session.getScriptTimeZone(), 'yyyy') : '';
    var week = dt ? week_(dt) : '';

    out.push([date, year, month, week, orderNo, client, service, qty, sqft, revenue, w1, w2, hours, rateObj.labor, material, crewFund, pay1, pay2, managerProfitBase, managerPay, zufarPay, profit, margin, flag, status]);

    aggregateService_(byService, service, revenue, material, crewFund, profit, hours);
    aggregateWorker_(byWorker, w1, pay1, h1, 1);
    aggregateWorker_(byWorker, w2, pay2, h2, 1);
    aggregateWorker_(byWorker, 'Данил', managerPay, 0, 0);
    aggregateWorker_(byWorker, 'Зуфар', zufarPay, 0, 0);

    aggregateWorkerPeriod_(byWorkerPeriod, w1, year, month, week, pay1, h1, 1);
    aggregateWorkerPeriod_(byWorkerPeriod, w2, year, month, week, pay2, h2, 1);

    totals.revenue += revenue; totals.material += material; totals.crew += crewFund;
    totals.manager += managerPay; totals.zufar += zufarPay; totals.profit += profit;
    totals.hours += hours; totals.orders += 1;
  }

  buildCalc_(calc, out);
  buildDashboard_(dash, totals, byService, byWorker);
  buildPeoplePeriods_(people, byWorkerPeriod);
  maybeNotifyTelegram_(totals, out);

  SpreadsheetApp.getUi().alert('Готово. Расчет обновлен.');
}

function buildCalc_(sh, rows) {
  sh.clear(); sh.setHiddenGridlines(true);
  title_(sh, 'A1:Y1', 'РАСЧЕТ ЗАРПЛАТЫ');
  var headers = ['Дата','Год','Месяц','Неделя','№ заказа','Клиент','Услуга','Кол-во','Метраж sqft','Выручка $','Исп.1','Исп.2','Часы','Ставка','Материал $','Фонд ЗП $','ЗП 1 $','ЗП 2 $','База менед. $','Менеджер 5% $','Зуфар 2% $','Прибыль $','Маржа %','Индикатор','Статус'];
  sh.getRange(2, 1, 1, headers.length).setValues([headers]);
  header_(sh, 2, headers.length);
  sh.setFrozenRows(2);

  if (rows.length) {
    sh.getRange(3, 1, rows.length, headers.length).setValues(rows);
    sh.getRange(3, 10, rows.length, 13).setNumberFormat('$#,##0.00');
    sh.getRange(3, 23, rows.length, 1).setNumberFormat('0.0%');
  }
  borders_(sh, 'A2:Y600');
  applyWeekColors_(sh, 3, 4, 25, Math.max(rows.length, 500));
  flagColors_(sh, 'X3:X600');
  statusColors_(sh, 'Y3:Y600');
  sh.autoResizeColumns(1, headers.length);
}

function buildPeoplePeriods_(sh, data) {
  sh.clear(); sh.setHiddenGridlines(true);
  title_(sh, 'A1:H1', 'СОТРУДНИКИ: НЕДЕЛЯ / МЕСЯЦ / ГОД');
  var headers = ['Сотрудник','Год','Месяц','Неделя','Заказов','Часы','ЗП','Ср.ЗП/заказ'];
  sh.getRange(2,1,1,8).setValues([headers]); header_(sh,2,8);

  var rows = [];
  for (var k in data) {
    var d = data[k];
    rows.push([d.worker, d.year, d.month, d.week, d.orders, d.hours, d.pay, d.orders ? d.pay / d.orders : 0]);
  }
  rows.sort(function(a,b){ return (a[0]+a[1]+a[3]).localeCompare(b[0]+b[1]+b[3]); });
  if (rows.length) sh.getRange(3,1,rows.length,8).setValues(rows);

  sh.getRange('G3:G1000').setNumberFormat('$#,##0.00');
  sh.getRange('H3:H1000').setNumberFormat('$#,##0.00');
  sh.getRange('F3:F1000').setNumberFormat('#,##0.00');
  borders_(sh, 'A2:H1000');
  applyWeekColors_(sh, 3, 4, 8, Math.max(rows.length, 500));
  sh.autoResizeColumns(1,8);
}

function buildDashboard_(sh, totals, byService, byWorker) { /* compact */
  sh.clear(); sh.setHiddenGridlines(true); title_(sh, 'A1:J1', 'АНАЛИТИКА ROLANPRO');
  var kpi = [['Заказов', totals.orders],['Выручка', totals.revenue],['Материал', totals.material],['Фонд ЗП', totals.crew],['Менеджер 5%', totals.manager],['Зуфар 2%', totals.zufar],['Прибыль после ЗП', totals.profit],['Маржа', totals.revenue > 0 ? totals.profit / totals.revenue : 0],['Часы', totals.hours]];
  sh.getRange(3,1,kpi.length,2).setValues(kpi); sh.getRange('A3:A11').setFontWeight('bold').setBackground('#D9EAF7');
  sh.getRange('B4:B9').setNumberFormat('$#,##0.00'); sh.getRange('B10').setNumberFormat('0.0%'); borders_(sh,'A3:B11');

  var sr = [['Услуга','Заказов','Выручка','Материал','Фонд ЗП','Прибыль','Маржа','Часы']];
  Object.keys(byService).forEach(function(s){ var x=byService[s]; sr.push([s,x.orders,x.revenue,x.material,x.crew,x.profit,x.revenue?x.profit/x.revenue:0,x.hours]); });
  sh.getRange(3,4,sr.length,8).setValues(sr); header_(sh,3,8,4); borders_(sh,'D3:K200'); sh.getRange('F4:J200').setNumberFormat('$#,##0.00'); sh.getRange('J4:J200').setNumberFormat('0.0%');

  var wr = [['Сотрудник','Заказов','Часы','ЗП']];
  Object.keys(byWorker).forEach(function(w){ var y=byWorker[w]; wr.push([w,y.orders,y.hours,y.pay]); });
  sh.getRange(15,1,wr.length,4).setValues(wr); header_(sh,15,4); sh.getRange('D16:D200').setNumberFormat('$#,##0.00'); borders_(sh,'A15:D200');
  sh.autoResizeColumns(1,11);
}

function buildInput_(sh) { sh.clear(); sh.setHiddenGridlines(true);
  sh.getRange('A1:P1').merge().setValue('ROLANPRO - ВВОД ЗАКАЗОВ').setFontSize(18).setFontWeight('bold').setFontColor('#FFF').setBackground('#17365D').setHorizontalAlignment('center');
  var headers = ['Дата','Месяц','Неделя','Номер заказа','Клиент','Услуга','Количество','Метраж sqft','Выручка $','Исполнитель 1','Часы 1','Исполнитель 2','Часы 2','Менеджер','Статус','Комментарий'];
  sh.getRange(6,1,1,16).setValues([headers]); header_(sh,6,16); sh.setFrozenRows(6);
  dropdown_(sh, 'F7:F1000', SERVICES); dropdown_(sh, 'J7:J1000', WORKERS); dropdown_(sh, 'L7:L1000', WORKERS); dropdown_(sh, 'N7:N1000', WORKERS); dropdown_(sh, 'O7:O1000', STATUSES);
  sh.getRange('A7:P1000').setBackground('#EAF3F8');
  sh.getRange('A:A').setNumberFormat('m/d/yyyy'); sh.getRange('I:I').setNumberFormat('$#,##0.00');
  statusColors_(sh, 'O7:O1000'); borders_(sh, 'A6:P1000');
  applyRowInputHighlight_(sh); applyWeekColors_(sh, 7, 3, 16, 1000); sh.autoResizeColumns(1,16);
}

function buildRates_(sh){ sh.clear(); var rows=[['Услуга','ЗП ставка $','Материал $','Единица'],['Солнцезащитная',2.5,1,'sqft'],['Декоративная',2.5,1,'sqft'],['Защитная',3,2,'sqft'],['Смарт',5,10,'sqft'],['Удаление',1,0,'sqft'],['Силикон',1,0,'sqft'],['Электрика',400,0,'шт']]; sh.getRange(1,1,rows.length,4).setValues(rows); header_(sh,1,4); borders_(sh,'A1:D20'); }
function buildDashboardEmpty_(sh){ sh.clear(); title_(sh,'A1:J1','АНАЛИТИКА ROLANPRO'); }
function buildPeoplePeriodsEmpty_(sh){ sh.clear(); title_(sh,'A1:H1','СОТРУДНИКИ: НЕДЕЛЯ / МЕСЯЦ / ГОД'); }
function buildBotSettings_(sh){ sh.clear(); title_(sh,'A1:D1','НАСТРОЙКИ TELEGRAM БОТА'); sh.getRange('A3:B6').setValues([['bot_token',''],['chat_id',''],['notify_on_recalc','YES'],['notify_on_loss_only','NO']]); header_(sh,3,2); borders_(sh,'A3:B6'); }

function maybeNotifyTelegram_(totals, out) {
  var cfg = getBotConfig_(); if (!cfg.bot_token || !cfg.chat_id) return;
  var hasLoss = out.some(function(r){ return r[21] < 0; });
  if (cfg.notify_on_loss_only === 'YES' && !hasLoss) return;
  if (cfg.notify_on_recalc !== 'YES' && !hasLoss) return;
  var text = 'ROLANPRO: расчет обновлен\nЗаказов: '+totals.orders+'\nВыручка: $'+totals.revenue.toFixed(2)+'\nПрибыль: $'+totals.profit.toFixed(2)+'\nМаржа: '+(totals.revenue? (totals.profit/totals.revenue*100).toFixed(1):'0')+'%'+(hasLoss?'\n⚠️ Есть убыточные заказы':'');
  sendTelegram_(cfg.bot_token, cfg.chat_id, text);
}
function sendTestTelegramNotification(){ var cfg = getBotConfig_(); if(!cfg.bot_token || !cfg.chat_id){ SpreadsheetApp.getUi().alert('Заполни bot_token и chat_id в НАСТРОЙКИ_БОТА'); return;} sendTelegram_(cfg.bot_token, cfg.chat_id, 'Тест: Telegram подключен к ROLANPRO ✅'); SpreadsheetApp.getUi().alert('Тест отправлен.'); }
function getBotConfig_(){ var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('НАСТРОЙКИ_БОТА'); if(!sh) return {}; var kv=sh.getRange('A3:B20').getValues(); var o={}; kv.forEach(function(r){ if(r[0]) o[String(r[0]).trim()]=String(r[1]).trim(); }); return o; }
function sendTelegram_(token, chatId, text){ UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/sendMessage',{method:'post',payload:{chat_id:chatId,text:text}}); }

function aggregateService_(obj, service, revenue, material, crew, profit, hours){ if(!obj[service]) obj[service]={orders:0,revenue:0,material:0,crew:0,profit:0,hours:0}; var s=obj[service]; s.orders++; s.revenue+=revenue; s.material+=material; s.crew+=crew; s.profit+=profit; s.hours+=hours; }
function aggregateWorker_(obj,name,pay,hours,orders){ if(!name) return; if(!obj[name]) obj[name]={pay:0,hours:0,orders:0}; obj[name].pay+=pay||0; obj[name].hours+=hours||0; obj[name].orders+=orders||0; }
function aggregateWorkerPeriod_(obj,name,year,month,week,pay,hours,orders){ if(!name||!year||!week) return; var k=[name,year,month,week].join('|'); if(!obj[k]) obj[k]={worker:name,year:year,month:month,week:week,pay:0,hours:0,orders:0}; obj[k].pay+=pay||0; obj[k].hours+=hours||0; obj[k].orders+=orders||0; }
function applyRowInputHighlight_(sh){ var r=sh.getRange('A7:P1000'); var rules=sh.getConditionalFormatRules(); rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$D7<>""').setBackground('#DFF3E3').setRanges([r]).build()); sh.setConditionalFormatRules(rules); }
function applyWeekColors_(sh, startRow, weekCol, colCount, rowCount){ var colors=['#F3F8FF','#F8F5FF','#F3FFF6','#FFF9F2','#FFF2F8','#F2FFFE']; var range=sh.getRange(startRow,1,rowCount,colCount); var rules=sh.getConditionalFormatRules(); for(var i=0;i<colors.length;i++){ var f='=MOD($'+colToLetter_(weekCol)+startRow+','+colors.length+')='+(i+1)+' '; rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(f).setBackground(colors[i]).setRanges([range]).build()); } sh.setConditionalFormatRules(rules); }
function colToLetter_(c){ var s=''; while(c>0){ var m=(c-1)%26; s=String.fromCharCode(65+m)+s; c=(c-m-1)/26; } return s; }

function deleteSheetIfExists_(ss,name){ var sh=ss.getSheetByName(name); if(sh) ss.deleteSheet(sh); }
function num_(v){ var n=Number(v); return isNaN(n)?0:n; }
function title_(sh, range, text){ sh.getRange(range).merge(); sh.getRange(range.split(':')[0]).setValue(text).setFontSize(16).setFontWeight('bold').setFontColor('#FFF').setBackground('#17365D').setHorizontalAlignment('center'); }
function header_(sh,row,cols,startCol){ startCol=startCol||1; sh.getRange(row,startCol,1,cols).setFontWeight('bold').setFontColor('#FFF').setBackground('#1F4E78').setHorizontalAlignment('center'); }
function borders_(sh,range){ sh.getRange(range).setBorder(true,true,true,true,true,true,'#D9D9D9',SpreadsheetApp.BorderStyle.SOLID); }
function dropdown_(sh,range,values){ var rule=SpreadsheetApp.newDataValidation().requireValueInList(values,true).setAllowInvalid(false).build(); sh.getRange(range).setDataValidation(rule); }
function statusColors_(sh, range){ var r=sh.getRange(range), rules=sh.getConditionalFormatRules(); rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Новый').setBackground('#D9EAF7').setRanges([r]).build()); rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('В работе').setBackground('#FFF2CC').setRanges([r]).build()); rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Завершен').setBackground('#D9EAD3').setRanges([r]).build()); rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Оплачено').setBackground('#B6D7A8').setRanges([r]).build()); rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Рекламация').setBackground('#F4CCCC').setRanges([r]).build()); sh.setConditionalFormatRules(rules); }
function flagColors_(sh, range){ var r=sh.getRange(range), rules=sh.getConditionalFormatRules(); rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('УБЫТОК').setBackground('#F4CCCC').setRanges([r]).build()); rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('НИЗКАЯ').setBackground('#FCE4D6').setRanges([r]).build()); rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('НОРМ').setBackground('#FFF2CC').setRanges([r]).build()); rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('ХОРОШО').setBackground('#D9EAD3').setRanges([r]).build()); sh.setConditionalFormatRules(rules); }
function week_(date){ var d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())); var day=d.getUTCDay(); if(day===0) day=7; d.setUTCDate(d.getUTCDate()+4-day); var ys=new Date(Date.UTC(d.getUTCFullYear(),0,1)); return Math.ceil((((d-ys)/86400000)+1)/7); }
