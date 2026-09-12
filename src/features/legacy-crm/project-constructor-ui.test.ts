import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const legacyCrm = fs.readFileSync(
  path.join(process.cwd(), "private/legacy/rolanpro-crm-cloud.html"),
  "utf8",
);

test("canonical project constructor stays inside the one legacy CRM shell", () => {
  assert.match(legacyCrm, /\['canonicalProjects', 'Проекты', '🏗'\]/);
  assert.ok(legacyCrm.includes("const canonicalProject = h.match(/^#\\/projects\\/([^/]+)$/)"));
  assert.match(legacyCrm, /renderCanonicalProjects\(\)/);
  assert.match(legacyCrm, /\/api\/v1\/projects\/constructor/);
  assert.doesNotMatch(legacyCrm, /canonicalProjectRequest\([^)]*localStorage/);
});

test("legacy CRM inline script remains valid JavaScript", () => {
  const script = legacyCrm.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
});

test("Solar V1 UI exposes source, inheritance, French cells, glass and removal", () => {
  assert.match(legacyCrm, /Клиент · не проверено/);
  assert.match(legacyCrm, /Замерщик · подтверждено/);
  assert.match(legacyCrm, /Плёнка для помещения/);
  assert.match(legacyCrm, /Плёнка для проёма/);
  assert.match(legacyCrm, /Переопределить плёнку/);
  assert.match(legacyCrm, /canonicalFilmPickerHtml/);
  assert.match(legacyCrm, /canonicalFilmPickerChanged/);
  assert.match(legacyCrm, /Категория<select/);
  assert.match(legacyCrm, /Название<select/);
  assert.match(legacyCrm, /Модель<select/);
  assert.match(legacyCrm, /Французское окно/);
  assert.match(legacyCrm, /Французская дверь/);
  assert.match(legacyCrm, /Конструкция стекла/);
  assert.match(legacyCrm, /Термоупрочнённое/);
  assert.match(legacyCrm, /Low-E/);
  assert.match(legacyCrm, /Removal/);
  assert.match(legacyCrm, /NOT RECOMMENDED/);
  assert.match(legacyCrm, /film\.appearance_code \|\| film\.category_name_ru/);
  assert.match(legacyCrm, /film\.model_name_ru/);
  assert.match(legacyCrm, /film\.model_code/);
});

test("legacy catalog stores film category, product name and model separately", () => {
  assert.match(legacyCrm, /item\.filmCategory = item\.appearance/);
  assert.match(legacyCrm, /item\.productName = item\.series/);
  assert.match(legacyCrm, /item\.modelCode = item\.sku/);
  assert.match(legacyCrm, /Категория плёнки/);
  assert.match(legacyCrm, /placeholder="Prime"/);
  assert.match(legacyCrm, /placeholder="NE2"/);
});

test("new order form stays compact without redundant guidance", () => {
  assert.doesNotMatch(legacyCrm, /Фиксируем только ядро/);
  assert.doesNotMatch(legacyCrm, /Сначала ищем существующего клиента/);
  assert.doesNotMatch(legacyCrm, /Выберите одно или несколько направлений/);
  assert.doesNotMatch(legacyCrm, /Минимум для старта/);
  assert.doesNotMatch(legacyCrm, /Что будет после создания/);
  assert.doesNotMatch(legacyCrm, /Что происходит дальше/);
  assert.doesNotMatch(legacyCrm, /Допуслуги, рекомендации пленки/);
});

test("surveyor uses assigned canonical projects without finance controls", () => {
  assert.match(legacyCrm, /\['canonicalProjects', 'Замеры проектов', '🏗'\]/);
  assert.match(legacyCrm, /currentUser\(\)\?\.role === 'measurer'/);
  assert.match(legacyCrm, /sourceSelect\.disabled = true/);
});
