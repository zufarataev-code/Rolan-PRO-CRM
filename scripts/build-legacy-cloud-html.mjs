import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const sourcePath = process.argv[2] || "/Users/zufarataev/Downloads/rolanpro-crm_3.html";
const outputPath = process.argv[3] || path.resolve("private/legacy/rolanpro-crm-cloud.html");

let html = await readFile(sourcePath, "utf8");

const replacements = [
  [/sk-ant-api[0-9A-Za-z_-]+/g, ""],
  [/\b\d{8,12}:[A-Za-z0-9_-]{20,}\b/g, ""],
  [/(authToken:\s*)'[^']*'/g, "$1''"],
  [/(apiKeySecret:\s*)'[^']*'/g, "$1''"],
  [/(textbelt:\s*\{\s*apiKey:\s*)'[^']*'/g, "$1''"],
  [/(s\.sms\.textbelt\.apiKey\s*=\s*)'[^']*'/g, "$1''"],
];

for (const [pattern, replacement] of replacements) {
  html = html.replace(pattern, replacement);
}

html = html.replace(
  "let db = null;  // reactive store",
  `let db = null;  // reactive store
const ROLANPRO_CLOUD = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
let cloudRevision = 0;
let cloudReady = false;
let cloudSaveTimer = null;
let cloudSaveInFlight = false;
let cloudSaveQueued = false;
let cloudAllowedLegacyIds = [];
let cloudCurrentUser = null;`,
);

html = html.replace(
  "function save() {\n  localStorage.setItem('rolanpro_crm', JSON.stringify(db));\n}",
  `function save() {
  localStorage.setItem('rolanpro_crm', JSON.stringify(db));
  if (ROLANPRO_CLOUD && cloudReady) cloudScheduleSave();
}`,
);

html = html.replace(
  "function renderLogin() {\n  const roleOrder",
  "function renderLogin() {\n  if (ROLANPRO_CLOUD) return renderCloudRoleChooser();\n  const roleOrder",
);

html = html.replace(
  "function logout() { state.currentUserId = null; render(); }",
  `function logout() {
  state.currentUserId = null;
  render();
}`,
);

const cloudBridge = `
function cloudStatus(text, tone = 'blue') {
  let node = document.getElementById('rolanpro-cloud-status');
  if (!node) {
    node = document.createElement('div');
    node.id = 'rolanpro-cloud-status';
    node.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:99999;padding:8px 12px;border-radius:999px;font:700 12px/1.2 Inter,system-ui;color:white;box-shadow:0 8px 24px rgba(15,23,42,.25)';
    document.body.appendChild(node);
  }
  node.textContent = text;
  node.style.background = tone === 'red' ? '#b91c1c' : tone === 'green' ? '#15803d' : '#2563eb';
}

function renderCloudRoleChooser() {
  const allowed = cloudAllowedLegacyIds.map(getUser).filter(Boolean);
  if (!allowed.length) {
    return '<div class="min-h-screen flex items-center justify-center p-6 bg-slate-950 text-white"><div class="max-w-lg text-center"><h1 class="text-2xl font-black">Доступ не настроен</h1><p class="mt-3 text-slate-300">Для этого аккаунта не назначена роль CRM.</p><button class="btn-primary mt-5" onclick="cloudServerLogout()">Выйти</button></div></div>';
  }
  return '<div class="min-h-screen brand-gradient flex items-center justify-center p-4"><div class="max-w-md w-full bg-white rounded-2xl shadow-2xl p-6"><h1 class="text-2xl font-black">Выберите роль</h1><p class="text-sm text-gray-500 mt-1 mb-4">' + academyEsc(cloudCurrentUser?.full_name || '') + '</p><div class="grid gap-2">' + allowed.map(u => '<button class="btn-primary w-full" onclick="cloudSelectRole(\\'' + u.id + '\\')">' + academyEsc(u.name) + ' · ' + T(u.role) + '</button>').join('') + '</div><button class="btn-ghost w-full mt-4" onclick="cloudServerLogout()">Выйти из аккаунта</button></div></div>';
}

function cloudSelectRole(userId) {
  if (!cloudAllowedLegacyIds.includes(userId)) return;
  const user = getUser(userId);
  if (!user) return;
  loginAsUser(user, '');
  render();
}

async function cloudServerLogout() {
  await fetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => null);
  location.assign('/login');
}

function cloudScheduleSave() {
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(cloudPersist, 700);
}

async function cloudPersist() {
  if (!cloudReady) return;
  if (cloudSaveInFlight) {
    cloudSaveQueued = true;
    return;
  }
  cloudSaveInFlight = true;
  cloudStatus('Сохраняем…');
  const snapshot = JSON.parse(JSON.stringify(db));
  try {
    const response = await fetch('/api/v1/legacy-crm/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: cloudRevision, payload: snapshot }),
    });
    const result = await response.json();
    if (response.status === 401) {
      location.assign('/login');
      return;
    }
    if (response.status === 409) {
      cloudReady = false;
      cloudStatus('Данные обновлены другим сотрудником', 'red');
      alert('Другой сотрудник уже изменил данные. CRM загрузит последнюю версию, чтобы не потерять изменения.');
      location.reload();
      return;
    }
    if (!response.ok) throw new Error(result?.errors?.[0]?.message || 'save failed');
    cloudRevision = result.data.revision;
    cloudStatus('Сохранено', 'green');
  } catch (error) {
    console.error('[Cloud CRM] save failed', error);
    cloudStatus('Нет связи — изменения сохранены локально', 'red');
  } finally {
    cloudSaveInFlight = false;
    if (cloudSaveQueued) {
      cloudSaveQueued = false;
      cloudScheduleSave();
    }
  }
}

async function cloudBoot() {
  cloudStatus('Загрузка…');
  try {
    const [meResponse, stateResponse] = await Promise.all([
      fetch('/api/v1/auth/me', { cache: 'no-store' }),
      fetch('/api/v1/legacy-crm/state', { cache: 'no-store' }),
    ]);
    if (meResponse.status === 401 || stateResponse.status === 401) {
      location.assign('/login');
      return;
    }
    const meResult = await meResponse.json();
    if (meResult.data?.user?.must_change_password) {
      location.assign('/change-password');
      return;
    }
    const stateResult = await stateResponse.json();
    if (!stateResponse.ok) throw new Error(stateResult?.errors?.[0]?.message || 'workspace unavailable');
    cloudCurrentUser = meResult.data.user;
    cloudAllowedLegacyIds = Array.isArray(cloudCurrentUser.legacy_user_ids) ? cloudCurrentUser.legacy_user_ids : [];
    cloudRevision = stateResult.data.revision;
    db = stateResult.data.payload;
    migrateSchema();
    normalizeClientAccountData();
    const firstAllowed = cloudAllowedLegacyIds.map(getUser).find(Boolean);
    state.currentUserId = firstAllowed?.id || null;
    state.lang = firstAllowed?.lang || state.lang;
    cloudReady = true;
    localStorage.setItem('rolanpro_crm', JSON.stringify(db));
    parseHash();
    render();
    cloudStatus('Сохранено', 'green');
  } catch (error) {
    console.error('[Cloud CRM] boot failed', error);
    cloudStatus('CRM временно недоступна', 'red');
    document.getElementById('app').innerHTML = '<div class="min-h-screen flex items-center justify-center p-6"><div class="max-w-lg text-center"><h1 class="text-2xl font-black">CRM временно недоступна</h1><p class="mt-3 text-gray-500">Обновите страницу через минуту.</p></div></div>';
  }
}
`;

html = html.replace(
  "// ---------- BOOT ----------\nload();\nparseHash();\nrender();",
  `// ---------- CLOUD BRIDGE ----------\n${cloudBridge}\n// ---------- BOOT ----------\nif (ROLANPRO_CLOUD) cloudBoot();\nelse { load(); parseHash(); render(); }`,
);

html = html.replace(/[ \t]+$/gm, "");

const forbidden = [
  /sk-ant-api[0-9A-Za-z_-]{20,}/,
  /\b\d{8,12}:[A-Za-z0-9_-]{20,}\b/,
  /authToken:\s*'[0-9a-f]{24,}'/i,
  /apiKeySecret:\s*'[^']{12,}'/i,
];

for (const pattern of forbidden) {
  if (pattern.test(html)) {
    throw new Error(`Refusing to write cloud HTML: credential pattern remains (${pattern})`);
  }
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, html, { mode: 0o600 });
console.log(`Wrote ${outputPath}`);
