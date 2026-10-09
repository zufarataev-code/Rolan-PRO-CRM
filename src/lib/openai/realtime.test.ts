import assert from "node:assert/strict";
import test from "node:test";

import { createRealtimeClientSecret, OpenAIRealtimeError } from "./realtime";

test("realtime voice uses a short-lived browser secret and keeps the standard key server-side", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const result = await createRealtimeClientSecret({
    apiKey: "sk-project-server-only",
    safetyIdentifier: "hashed-user",
    crmContext: "24 active projects",
    fetchImpl: async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify({ value: "ek_short_lived" }), { status: 200 });
    },
  });

  assert.equal(capturedUrl, "https://api.openai.com/v1/realtime/client_secrets");
  assert.equal((capturedInit?.headers as Record<string, string>).Authorization, "Bearer sk-project-server-only");
  assert.equal((capturedInit?.headers as Record<string, string>)["OpenAI-Safety-Identifier"], "hashed-user");
  assert.equal(result.value, "ek_short_lived");
  const body = JSON.parse(String(capturedInit?.body));
  assert.equal(body.expires_after.seconds, 60);
  assert.equal(body.session.model, "gpt-realtime-2.1");
  assert.match(body.session.instructions, /24 active projects/);
  assert.match(body.session.instructions, /явное подтверждение/);
});

test("realtime voice refuses to start without a protected server key", async () => {
  await assert.rejects(
    () => createRealtimeClientSecret({ apiKey: "", safetyIdentifier: "hashed-user" }),
    (error: unknown) => error instanceof OpenAIRealtimeError && error.code === "voice_not_configured",
  );
});
