import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { EMBED_FRAME_CSS, EMBED_FRAME_SCRIPT } from "../legacy-crm/embed-frame";

// Owner, 2026-11-27: «из CRM удалили нашего ИИ, который должен быть у всех».
test("every screen of the new interface has the agent; a working section keeps its own", () => {
  const shell = readFileSync("src/features/crm-shell/shell.tsx", "utf8");
  assert.match(shell, /<CrmAiAgent hidden=\{Boolean\(section\)\} \/>/);
  const agent = readFileSync("src/features/crm-shell/ai-agent.tsx", "utf8");
  assert.match(agent, /src="\/legacy-crm#\/ai"/);
  assert.match(agent, /\/landing\/rolan-mascot\.webp/);
});

test("#/ai opens the working CRM's agent alone in the panel", () => {
  const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
  assert.match(html, /if \(\/\^#\\\/ai\\\/\?\$\/\.test\(h\)\) \{ state\.aiSidebarOpen = true;/);
  assert.match(EMBED_FRAME_SCRIPT, /data-rp-embed-ai/);
  assert.match(EMBED_FRAME_CSS, /\[data-rp-embed-ai="1"\] \.ai-agent-panel \* \{ visibility: visible !important; \}/);
});
