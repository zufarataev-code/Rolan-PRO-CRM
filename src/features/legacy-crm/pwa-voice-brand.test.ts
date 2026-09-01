import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacy = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
const proposal = readFileSync("src/components/client-proposal-view.tsx", "utf8");
const manifest = readFileSync("app/manifest.ts", "utf8");
const serviceWorker = readFileSync("public/sw.js", "utf8");

test("every proposal surface uses the real Rolan PRO logo asset", () => {
  assert.match(legacy, /\/landing\/rolan-logo\.webp/);
  assert.match(proposal, /proposal-print-logo/);
  assert.match(proposal, /src="\/landing\/rolan-logo\.webp"/);
  assert.doesNotMatch(proposal, /proposal-print-brand-mark/);
});

test("CRM is installable without caching private CRM records", () => {
  assert.match(manifest, /start_url: "\/"/);
  assert.match(manifest, /display: "standalone"/);
  assert.match(serviceWorker, /STATIC_ASSETS/);
  assert.doesNotMatch(serviceWorker, /caches\.match\(event\.request\).*\/api/s);
  assert.match(legacy, /installRolanProApp/);
});

test("voice input writes into the selected CRM field", () => {
  assert.match(legacy, /SpeechRecognition/);
  assert.match(legacy, /voiceInputTarget/);
  assert.match(legacy, /insertVoiceText/);
  assert.match(legacy, /Голосовой ввод/);
});
