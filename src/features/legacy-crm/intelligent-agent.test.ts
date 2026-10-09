import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

test("the existing CRM assistant becomes a role-safe Rolan PRO agent", () => {
  const start = html.indexOf("// ---------- AI: ASSISTANT SIDEBAR ----------");
  const end = html.indexOf("// ---------- SMS ----------", start);
  const agent = html.slice(start, end);

  assert.match(agent, /function agentInsights\(\)/);
  assert.match(agent, /visibleOrdersForUser\(currentUser\(\)\)/);
  assert.match(agent, /visibleClientsForUser\(currentUser\(\)\)/);
  assert.match(agent, /canSeeMoney \? \{ revenue: orderRevenue\(o\), paid: o\.paid \|\| 0 \} : \{\}/);
  assert.match(agent, /\/landing\/rolan-mascot\.webp/);
  assert.match(agent, /Наблюдает · подсказывает · ставит задачи/);
});

test("agent suggestions are explainable and require confirmation before creating tasks", () => {
  const start = html.indexOf("function agentCreateSuggestedTask(");
  const end = html.indexOf("function toggleAiSidebar()", start);
  const suggestions = html.slice(start, end);

  assert.match(suggestions, /if \(!confirm\(`Создать задачу/);
  assert.match(suggestions, /agentKey: key, source: 'rolan_agent'/);
  assert.match(suggestions, /agentTaskExists\(key\)/);
  assert.match(suggestions, /Клиенты должны/);
  assert.match(suggestions, /agent_debt_\$\{user\.id\}_\$\{today\}/);
  assert.match(suggestions, /precisionManagerAction\(order\)/);
  assert.doesNotMatch(suggestions, /nextActionAt/);
  assert.match(suggestions, /agentBankReviewCount > 0/);
  assert.match(suggestions, /Подтвердите предложенные категории/);
});

test("field roles receive operational guidance without company money", () => {
  const start = html.indexOf("function agentInsights()");
  const end = html.indexOf("function agentToneStyle", start);
  const insights = html.slice(start, end);

  assert.match(insights, /user\.role === 'measurer'/);
  assert.match(insights, /user\.role === 'installer'/);
  assert.match(insights, /Открыть замер/);
  assert.match(insights, /Открыть Work Order/);
  assert.match(insights, /if \(user\.role === 'owner' && agentBankReviewCount > 0\).*bank_review/s);
});
