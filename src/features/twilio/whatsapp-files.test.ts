import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { twilioInboundMedia, twilioMessageMediaList } from "./service";

test("inbound WhatsApp media keeps only Twilio URLs and their types", () => {
  const media = twilioInboundMedia({
    NumMedia: "3",
    MediaUrl0: "https://api.twilio.com/2010-04-01/Accounts/AC1/Messages/MM1/Media/ME1",
    MediaContentType0: "image/jpeg",
    MediaUrl1: "https://evil.example.com/x.jpg",
    MediaContentType1: "image/jpeg",
    MediaUrl2: "https://api.twilio.com/2010-04-01/Accounts/AC1/Messages/MM1/Media/ME3",
    MediaContentType2: "application/pdf",
  });
  assert.deepEqual(media.map((item) => item.contentType), ["image/jpeg", "application/pdf"]);
  assert.equal(twilioInboundMedia({ NumMedia: "0" }).length, 0);
});

test("stored media is exposed without Twilio URLs: inbound via the proxy index, outbound via the storage key", () => {
  const list = twilioMessageMediaList({ media: [{ url: "https://api.twilio.com/x", contentType: "image/png" }, { key: "whatsapp/2026/a.pdf", contentType: "application/pdf" }] });
  assert.deepEqual(list, [{ index: 0, contentType: "image/png" }, { index: 1, contentType: "application/pdf", key: "whatsapp/2026/a.pdf" }]);
  const service = readFileSync("src/features/twilio/service.ts", "utf8");
  assert.match(service, /\/api\/v1\/integrations\/twilio\/media\?sid=/);
  assert.match(service, /form\.append\("MediaUrl", presignUrl\(/);
  const route = readFileSync("app/api/v1/integrations/twilio/media/route.ts", "utf8");
  assert.match(route, /requireRequestSession/);
  assert.match(route, /fetchTwilioMessageMedia\(sid, index\)/);
});

test("the CRM shows photos inline and sends files from both WhatsApp windows", () => {
  const legacy = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
  assert.match(legacy, /function messageMediaHtml\(message, light = false\)/);
  assert.match(legacy, /onchange="clientConversationSendFiles\(this\)"/);
  assert.match(legacy, /onchange="whatsappThreadSendFiles\(this\)"/);
  assert.match(legacy, /crmUploadMedia\(file, 'whatsapp'\)/);
  assert.match(legacy, /body: caption, channel: 'whatsapp'[^)]*media \}/);
  assert.match(legacy, /\$\{messageMediaHtml\(x, !incoming\)\}/);
  assert.match(legacy, /\$\{messageMediaHtml\(x, mine\)\}/);
});
