import assert from "node:assert/strict";
import test from "node:test";

import { replaceLegacyBootstrapLogin } from "./html-shell";
import { injectSurveyorTaskActions } from "./surveyor-task-actions";

const shell = `<!doctype html><body>
<div id="app"><div>legacy bootstrap</div></div>
<script>cloudBoot()</script></body>`;

test("canonical legacy CRM injects the surveyor task action layout repair", () => {
  const result = replaceLegacyBootstrapLogin(shell);

  assert.match(result, /rolanpro-surveyor-task-actions-style/);
  assert.match(result, /data-rolanpro-surveyor-actions/);
  assert.match(result, /data-rolanpro-surveyor-action="measure"/);
  assert.match(result, /grid-template-columns: minmax\(112px, 0\.8fr\) minmax\(0, 1fr\) 44px 44px/);
  assert.match(result, /writing-mode: horizontal-tb/);
  assert.match(result, /word-break: normal/);
  assert.match(result, /roles\.includes\('card'\)/);
  assert.match(result, /roles\.includes\('call'\)/);
  assert.match(result, /MutationObserver/);
  assert.match(result, /cloudBoot\(\)/);
});

test("surveyor task action repair script is valid JavaScript", () => {
  const result = injectSurveyorTaskActions(shell);
  const script = result.match(
    /<script id="rolanpro-surveyor-task-actions-script">\s*([\s\S]*?)\s*<\/script>/,
  )?.[1];

  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
});

test("surveyor task action repair is injected only once", () => {
  const once = injectSurveyorTaskActions(shell);
  const twice = injectSurveyorTaskActions(once);

  assert.equal((twice.match(/id="rolanpro-surveyor-task-actions-style"/g) || []).length, 1);
  assert.equal((twice.match(/id="rolanpro-surveyor-task-actions-script"/g) || []).length, 1);
});
