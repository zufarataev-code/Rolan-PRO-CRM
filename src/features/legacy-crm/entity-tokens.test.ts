import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { ADDONS, DIRECTIONS, DIRECTION_ALIASES, DIRECTION_KEYS, ENTITY_TOKENS_HTML, STOCK } from './entity-tokens';

const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');

test('every direction, add-on and stock level has a full tone and an icon', () => {
  for (const key of DIRECTION_KEYS) {
    const t = DIRECTIONS[key];
    for (const field of ['color', 'tint', 'deep'] as const) assert.match(t[field], /^#[0-9A-Fa-f]{6}$/, `${key}.${field}`);
    assert.ok(t.icon.length > 10, `${key} icon`);
    assert.ok(t.short, `${key} short`);
  }
  for (const [key, t] of Object.entries(ADDONS)) assert.ok(t.icon && t.color && t.tint && t.deep, key);
  for (const [key, t] of Object.entries(STOCK)) assert.ok(t.color && t.tint && t.deep, key);
});

test('one colour — one meaning: the five directions do not share a full colour', () => {
  const colours = DIRECTION_KEYS.map((k) => DIRECTIONS[k].color.toLowerCase());
  assert.equal(new Set(colours).size, colours.length);
});

test('every legacy alias resolves to a declared direction', () => {
  for (const [alias, key] of Object.entries(DIRECTION_ALIASES)) assert.ok(DIRECTIONS[key], `${alias} → ${key}`);
  for (const key of DIRECTION_KEYS) {
    assert.equal(DIRECTION_ALIASES[key], key);
    assert.equal(DIRECTION_ALIASES[`${key}_film`], key);
  }
});

test('the head snippet carries CSS variables and window.RP_ENTITY', () => {
  assert.match(ENTITY_TOKENS_HTML, /^<style id="rolanpro-entity-tokens">:root\{--dir-solar:#D97706;/);
  assert.match(ENTITY_TOKENS_HTML, /--stock-low:#CA8A04;/);
  assert.match(ENTITY_TOKENS_HTML, /<script id="rolanpro-entity-tokens-js">window\.RP_ENTITY=\{"directions":/);
  assert.doesNotMatch(ENTITY_TOKENS_HTML, /<\/script>.*<\/script>/s, 'the JSON must not close the script early');
});

test('the legacy palettes read window.RP_ENTITY instead of keeping their own copies', () => {
  assert.doesNotMatch(html, /const ORDER_SERVICE_PALETTE = \{/);
  assert.doesNotMatch(html, /const CAT_COLORS = \{/);
  assert.doesNotMatch(html, /smart_film: \{ color: '#0284c7'/);
  assert.doesNotMatch(html, /firstCat === 'solar'\) return \{ color: '#0891b2'/);
  assert.match(html, /catalogCategory: 'privacy',\n {4}accent: rpDir\('privacy'\)\.color,/);
  assert.match(html, /id: 'smart',[\s\S]{0,200}color: rpDir\('smart'\)\.color,/);
});

test('rpDir resolves order and catalog keys to the same tone, unknown keys to neutral', () => {
  const context: any = vm.createContext({ console });
  vm.runInContext(ENTITY_TOKENS_HTML.replace(/^.*<script id="rolanpro-entity-tokens-js">/s, '').replace(/<\/script>$/, '').replace(/^window\./, 'var window = {}; window.'), context);
  vm.runInContext(html.slice(html.indexOf('// ---------- ENTITY COLOUR CODE'), html.indexOf('// ---------- ENGINEERING MEASUREMENT STUDIO')), context);
  assert.equal(context.rpDir('solar_film').color, DIRECTIONS.solar.color);
  assert.equal(context.rpDir('solar').color, DIRECTIONS.solar.color);
  assert.equal(context.rpDir('safety').color, DIRECTIONS.protective.color);
  assert.equal(context.rpDir('nope').short, 'Film');
  assert.deepEqual(context.orderServicePalette?.('smart_film') ?? { color: context.rpDir('smart_film').color }, { color: DIRECTIONS.smart.color, ...(context.orderServicePalette ? { bg: DIRECTIONS.smart.tint, deep: DIRECTIONS.smart.deep } : {}) });
  assert.match(context.rpStockBadge('out'), /нет/);
  assert.match(context.rpDirBadge('smart', 'Smart'), /<svg/);
});
