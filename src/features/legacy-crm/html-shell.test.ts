import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";

import { replaceLegacyBootstrapLogin } from "./html-shell";

test("server removes the embedded PIN login before serving legacy CRM", () => {
  const result = replaceLegacyBootstrapLogin(`<!doctype html><body>
<div id="app"><input id="login-pin"><button>Войти</button></div>
<script>cloudBoot()</script></body>`);

  assert.match(result, /Загрузка ROLANPRO CRM/);
  assert.match(result, /cloudBoot\(\)/);
  assert.doesNotMatch(result, /login-pin/);
});

test("server fails closed when the legacy shell cannot be identified", () => {
  assert.throws(() => replaceLegacyBootstrapLogin("<html></html>"), /shell markers/);
});

test("real legacy CRM is served without its pre-rendered PIN screen", () => {
  const source = readFileSync(
    path.join(process.cwd(), "private", "legacy", "rolanpro-crm-cloud.html"),
    "utf8",
  );
  const result = replaceLegacyBootstrapLogin(source);
  const appStart = result.indexOf('<div id="app"');
  const scriptStart = result.indexOf("\n<script>", appStart);
  const bootstrapShell = result.slice(appStart, scriptStart);

  assert.match(bootstrapShell, /Загрузка ROLANPRO CRM/);
  assert.doesNotMatch(bootstrapShell, /login-pin|Быстрый вход|Demo PINs/);
  assert.doesNotMatch(result, /pin: '0000'|pin: '1111'|pin: '2111'|pin: '3111'/);
});

test("server injects a mobile-only Orders card adapter into the canonical legacy CRM", () => {
  const result = replaceLegacyBootstrapLogin(`<!doctype html><body>
<div id="app"><div>legacy bootstrap</div></div>
<script>cloudBoot()</script></body>`);

  assert.match(result, /rolanpro-mobile-orders-cards-style/);
  assert.match(result, /@media \(max-width: 520px\), \(max-width: 768px\) and \(pointer: coarse\)/);
  assert.match(result, /data-rolanpro-mobile-orders/);
  assert.match(result, /hasOrdersHeading/);
  assert.match(result, /looksLikeOrdersTable/);
  assert.match(result, /data-order-role/);
  assert.match(result, /data-order-hidden/);
  assert.match(result, /word-break: normal/);
  assert.match(result, /writing-mode: horizontal-tb/);
  assert.match(result, /MutationObserver/);
  assert.match(result, /rolanpro-mobile-workspace-style/);
  assert.match(result, /@media \(max-width: 520px\), \(max-width: 768px\) and \(pointer: coarse\)/);
  assert.match(result, /cloudBoot\(\)/);
});

test("mobile Orders card adapter is injected only once", () => {
  const source = `<!doctype html><body>
<div id="app"><div>legacy bootstrap</div></div>
<script>cloudBoot()</script></body>`;
  const first = replaceLegacyBootstrapLogin(source);

  assert.equal((first.match(/id="rolanpro-mobile-orders-cards-style"/g) || []).length, 1);
});

test("server injects a mobile-only Commercial Proposals registry adapter", () => {
  const result = replaceLegacyBootstrapLogin(`<!doctype html><body>
<div id="app"><div>legacy bootstrap</div></div>
<script>cloudBoot()</script></body>`);

  assert.match(result, /rolanpro-mobile-proposals-cards-style/);
  assert.match(result, /data-rolanpro-mobile-proposals/);
  assert.match(result, /КП \/ заказ/);
  assert.match(result, /Кому отправлено/);
  assert.match(result, /Менеджер/);
  assert.match(result, /Отправлено/);
  assert.match(result, /Просмотрено/);
  assert.match(result, /data-proposal-role/);
  assert.match(result, /data-proposal-hidden/);
  assert.match(result, /writing-mode: horizontal-tb/);
});

test("mobile Commercial Proposals registry adapter is injected only once", () => {
  const source = `<!doctype html><body>
<div id="app"><div>legacy bootstrap</div></div>
<script>cloudBoot()</script></body>`;
  const first = replaceLegacyBootstrapLogin(source);

  assert.equal((first.match(/id="rolanpro-mobile-proposals-cards-style"/g) || []).length, 1);
});

test("server injects cleanup for redundant New Order guidance sidebar", () => {
  const result = replaceLegacyBootstrapLogin(`<!doctype html><body>
<div id="app"><div>legacy bootstrap</div></div>
<script>cloudBoot()</script></body>`);

  assert.match(result, /rolanpro-order-intake-cleanup-style/);
  assert.match(result, /Что будет после создания/);
  assert.match(result, /Что происходит дальше/);
  assert.match(result, /data-rolanpro-order-intake-sidebar/);
  assert.match(result, /data-rolanpro-order-intake-layout/);
  assert.match(result, /Выберите контакт/);
  assert.match(result, /grid-template-columns: minmax\(0, 1fr\)/);
});

test("server defers film selection to measurement and keeps project parameter controls", () => {
  const result = replaceLegacyBootstrapLogin(`<!doctype html><body>
<div id="app"><div>legacy bootstrap</div></div>
<script>cloudBoot()</script></body>`);

  assert.match(result, /rolanpro-order-measurement-note/);
  assert.match(result, /Плёнка выбирается на замере/);
  assert.match(result, /подходящие модели со склада/);
  assert.match(result, /для помещения и отдельно для каждого окна/);
  assert.doesNotMatch(result, /rolanpro-new-order-material-list/);
  assert.doesNotMatch(result, /Плёнка по каждой услуге/);
  assert.doesNotMatch(result, /chosenMaterials/);
  assert.match(result, /materialCategoryKey/);
  assert.match(result, /смарт: 'smart'/);
  assert.match(result, /Выберите тип \/ серию/);
  assert.match(result, /Smart \/ PDLC/);
  assert.match(result, /db\.settings\.catalog/);
  assert.match(result, /catalogCategory/);
  assert.match(result, /materialCatalogId/);
  assert.match(result, /materialsByService/);
  assert.match(result, /selectedNewOrderServiceIds/);
  assert.match(result, /catalogMatchesCategory\(item, category\)/);
  assert.match(result, /catalogCanBeSelected\(item\)/);
  assert.match(result, /if \(!category\) return \[\]/);
  assert.match(result, /complexityCoef/);
  assert.match(result, /openRolanProOrderParameters/);
  assert.match(result, /saveRolanProOrderParameters/);
  assert.match(result, /rp-op-service/);
  assert.match(result, /rp-op-material/);
  assert.match(result, /rp-op-film-category/);
  assert.match(result, /rp-op-film-name/);
  assert.match(result, /rp-op-complexity/);
  assert.match(result, /openManagerProjectServicesModal/);
  assert.match(result, /order\.serviceTypes/);
  assert.match(result, /defaultCatalogByScope/);
  assert.match(result, /materialCategory/);
  assert.match(result, /materialName/);
  assert.match(result, /materialModel/);
  assert.doesNotMatch(result, /createdOrder\.materialCategory/);
  assert.match(result, /orderBuilder\.materialModel/);
  assert.doesNotMatch(result, /Категория, название и модель выбираются отдельно/);
  assert.doesNotMatch(result, /Выбранная модель станет материалом заказа/);
});

test("injected order film hierarchy remains valid JavaScript", () => {
  const result = replaceLegacyBootstrapLogin(`<!doctype html><body>
<div id="app"><div>legacy bootstrap</div></div>
<script>cloudBoot()</script></body>`);
  const script = result.match(/<script id="rolanpro-order-intake-cleanup-script">\s*([\s\S]*?)\s*<\/script>/)?.[1];

  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
});

test("New Order guidance and parameter patch is injected only once", () => {
  const source = `<!doctype html><body>
<div id="app"><div>legacy bootstrap</div></div>
<script>cloudBoot()</script></body>`;
  const first = replaceLegacyBootstrapLogin(source);

  assert.equal((first.match(/id="rolanpro-order-intake-cleanup-style"/g) || []).length, 1);
  assert.equal((first.match(/id="rolanpro-order-intake-cleanup-script"/g) || []).length, 1);
});
