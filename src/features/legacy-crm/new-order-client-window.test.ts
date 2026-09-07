import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

test("new client from order opens in its own workspace", () => {
  const start = html.indexOf("function openOrderModal");
  const end = html.indexOf("function selectOrderService", start);
  const orderModal = html.slice(start, end);

  assert.match(orderModal, /onclick="openOrderClientOverlay\(\)"/);
  assert.match(html, /function openOrderClientOverlay\(\)/);
  assert.match(html, /id="order-client-overlay" class="address-overlay"/);
  assert.match(html, /Новый заказ · карточка клиента/);
  assert.doesNotMatch(orderModal, /id="no-newclient"/);
});

test("saved client is selected back in the unfinished order", () => {
  const start = html.indexOf("function createOrderClientFromOverlay");
  const end = html.indexOf("function createOrder()", start);
  const saveClient = html.slice(start, end);

  assert.match(saveClient, /db\.clients\.push/);
  assert.match(saveClient, /closeOrderClientOverlay\(\)/);
  assert.match(saveClient, /selectOrderClient\(id\)/);
  assert.match(saveClient, /whatsappPhone/);
  assert.match(saveClient, /telegramUsername/);
  assert.match(saveClient, /instagramUsername/);
  assert.match(saveClient, /facebookProfile/);
});

test("order cannot be created without choosing a client", () => {
  assert.match(html, /Сначала выберите клиента из поиска или создайте нового клиента в отдельном окне/);
});
