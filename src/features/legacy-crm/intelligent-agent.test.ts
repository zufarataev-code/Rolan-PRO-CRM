import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
const legacyRoute = readFileSync("app/legacy-crm/route.ts", "utf8");

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

test("the Rolan PRO agent remains reachable and usable on phones", () => {
  assert.match(html, /class="ai-agent-launcher/);
  assert.match(html, /aria-label="Открыть агента Rolan PRO"/);
  assert.match(html, /class="ai-agent-panel/);
  assert.match(html, /role="dialog" aria-modal="true" aria-label="Агент Rolan PRO"/);
  assert.match(html, /\.ai-agent-launcher \{[\s\S]*?bottom: calc\(82px \+ env\(safe-area-inset-bottom\)\);[\s\S]*?z-index: 64;/);
  assert.match(html, /\.ai-agent-panel\[role="dialog"\] \{[\s\S]*?inset: 0 !important;[\s\S]*?margin: 0 !important;[\s\S]*?width: 100vw !important;[\s\S]*?height: 100dvh !important;[\s\S]*?border-radius: 0 !important;/);
  assert.match(html, /\.ai-agent-header \{[\s\S]*?safe-area-inset-top/);
  assert.match(html, /\.ai-agent-input-bar \{[\s\S]*?safe-area-inset-bottom/);
});

test("owner and manager can start a protected realtime voice conversation", () => {
  assert.match(html, /Поговорить с агентом/);
  assert.match(html, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(html, /new RTCPeerConnection\(\)/);
  assert.match(html, /fetch\('\/api\/v1\/ai\/realtime'/);
  assert.match(html, /https:\/\/api\.openai\.com\/v1\/realtime\/calls/);
  assert.match(html, /Authorization:`Bearer \$\{ephemeralKey\}`/);
  assert.match(html, /type:'session\.close'/);
  assert.match(html, /\['owner','manager'\]\.includes\(currentUser\(\)\?\.role\)/);
  assert.match(html, /Говорите естественно\. Агента можно перебивать\./);
});

test("agent suggestions are explainable and require confirmation before creating tasks", () => {
  const start = html.indexOf("function agentCreateSuggestedTask(");
  const end = html.indexOf("function toggleAiSidebar()", start);
  const suggestions = html.slice(start, end);

  assert.match(suggestions, /if \(!confirm\(`Создать задачу/);
  assert.match(suggestions, /agentKey: key, source: 'rolan_agent'/);
  assert.match(suggestions, /agentTaskExists\(key\)/);
  assert.match(suggestions, /Клиенты должны/);
  assert.match(suggestions, /agent_debt_\$\{user\.id\}/);
  assert.doesNotMatch(suggestions, /agent_debt_\$\{user\.id\}_\$\{today\}/);
  assert.match(suggestions, /precisionManagerAction\(order\)/);
  assert.match(suggestions, /agentOpenOrder\('\$\{firstWorkflow\.order\.id\}'\)/);
  assert.match(suggestions, /actionLabel:'Открыть проект'/);
  assert.doesNotMatch(suggestions, /nextActionAt/);
  assert.match(suggestions, /agentBankReviewCount > 0/);
  assert.match(suggestions, /Подтвердите предложенные категории/);
});

test("agent dates use the CRM user's local calendar day and agent tasks are auditable", () => {
  assert.match(html, /function localDateKey\(value = new Date\(\)\)/);
  assert.match(html, /function taskDueDateKey\(value, task = null\)/);
  assert.match(html, /const today = localDateKey\(now\)/);
  assert.match(html, /const todayStr = localDateKey\(now\)/);
  assert.match(html, /taskDueDateKey\(task\.dueAt, task\) < today/);
  assert.match(html, /const d = taskDueDateKey\(t\.dueAt, t\)/);
  assert.match(html, /dueAt: due\.toISOString\(\)/);
  assert.match(html, /legacyUtc/);
  assert.match(html, /t\.source === 'rolan_agent'/);
  assert.match(html, /Агент Rolan PRO/);
});

test("field roles receive operational guidance without company money", () => {
  const start = html.indexOf("function agentInsights()");
  const end = html.indexOf("function agentToneStyle", start);
  const insights = html.slice(start, end);

  assert.match(insights, /user\.role === 'measurer'/);
  assert.match(insights, /futureMeasurements\.length \? futureMeasurements : measurements\.slice\(-1\)/);
  assert.match(insights, /agentOpenMeasurement\('\$\{pending\[0\]\.id\}'\)/);
  assert.match(insights, /user\.role === 'installer'/);
  assert.match(insights, /projectServiceAssignment\(order, group\)/);
  assert.match(insights, /item\.assignment\.installerIds/);
  assert.match(insights, /futureInstallations\.length \? futureInstallations : installations\.slice\(-1\)/);
  assert.match(insights, /Открыть замер/);
  assert.match(insights, /Открыть Work Order/);
  assert.match(insights, /if \(user\.role === 'owner' && agentBankReviewCount > 0\).*bank_review/s);
  assert.match(insights, /agentBankReviewCount === null/);
  assert.match(insights, /Статус банка недоступен/);
});

test("the bank pulse refreshes whenever the owner returns from bank review", () => {
  assert.match(html, /window\.addEventListener\('rolanpro-bank-closed'/);
  assert.match(legacyRoute, /window\.dispatchEvent\(new CustomEvent\('rolanpro-bank-closed'\)\)/);
  assert.match(html, /if \(state\.aiSidebarOpen && currentUser\(\)\?\.role === 'owner'\) refreshAgentBankPulse\(\)/);
});
