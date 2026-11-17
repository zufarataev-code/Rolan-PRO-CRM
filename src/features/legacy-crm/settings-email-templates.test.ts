import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');

function functionSource(name: string) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  return html.slice(start, html.indexOf('\n}\n', start) + 3);
}

test('email templates use an explicit tablet-safe open button', () => {
  const render = functionSource('renderEmailChannelSettings');
  assert.match(render, /type="button" class="w-full min-h-\[48px\]/);
  assert.match(render, /aria-expanded="false" onclick="toggleEmailTemplatePanel\(this\)"/);
  assert.match(render, /data-template-toggle-label>Открыть/);
  assert.match(render, /<div class="px-3 pb-3 border-t bg-white" hidden>/);
  assert.doesNotMatch(render, /<details|<summary/, 'native details control is no longer the only hit target');
});

test('template button opens and closes its own editor without rerendering settings', () => {
  const context: Record<string, unknown> = {};
  vm.createContext(context);
  vm.runInContext(`${functionSource('toggleEmailTemplatePanel')}; this.toggleEmailTemplatePanel = toggleEmailTemplatePanel;`, context);
  const label = { textContent: 'Открыть' };
  const panel = { hidden: true };
  const attributes = new Map<string, string>();
  const button = {
    nextElementSibling: panel,
    setAttribute: (key: string, value: string) => attributes.set(key, value),
    querySelector: () => label,
  };
  const toggle = context.toggleEmailTemplatePanel as (target: typeof button) => void;

  toggle(button);
  assert.equal(panel.hidden, false);
  assert.equal(attributes.get('aria-expanded'), 'true');
  assert.equal(label.textContent, 'Закрыть');

  toggle(button);
  assert.equal(panel.hidden, true);
  assert.equal(attributes.get('aria-expanded'), 'false');
  assert.equal(label.textContent, 'Открыть');
});
