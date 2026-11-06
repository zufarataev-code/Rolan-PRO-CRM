import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MetaCommentError,
  classifyFacebookComment,
  facebookCommentDueAt,
  facebookCommentStatusesForQuery,
  facebookCommentTaskTitle,
  fallbackFacebookCommentDraft,
  metaCommentNotifications,
  metaGraphFailureIsDefinite,
  metaObjectId,
  parseFacebookCommentAiResponse,
} from "./meta-comments-core";

const pageId = "100000000000001";
const personId = "200000000000002";
const postId = `${pageId}_300000000000003`;
const commentId = `${postId}_400000000000004`;
const createdTime = Math.floor(Date.now() / 1_000) - 60;

function feedPayload(overrides: Record<string, unknown> = {}) {
  return {
    object: "page",
    entry: [{
      id: pageId,
      time: createdTime,
      changes: [{
        field: "feed",
        value: {
          item: "comment",
          verb: "add",
          comment_id: commentId,
          post_id: postId,
          parent_id: null,
          from: { id: personId, name: "Facebook Customer" },
          message: "How much does smart film installation cost?",
          created_time: createdTime,
          permalink_url: `https://www.facebook.com/${commentId}`,
          ...overrides,
        },
      }],
    }],
  };
}

test("Meta Page feed parser accepts only new public comments from people", () => {
  const items = metaCommentNotifications(feedPayload(), pageId);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.comment_id, commentId);
  assert.equal(items[0]?.post_id, postId);
  assert.equal(items[0]?.author_id, personId);
  assert.equal(items[0]?.metadata.verb, "add");

  assert.deepEqual(metaCommentNotifications(feedPayload({ from: { id: pageId, name: "Rolan PRO" } }), pageId), []);
  assert.deepEqual(metaCommentNotifications(feedPayload({ verb: "edited" }), pageId), []);
  assert.deepEqual(metaCommentNotifications(feedPayload({ verb: "remove" }), pageId), []);
  assert.deepEqual(metaCommentNotifications(feedPayload({ item: "post" }), pageId), []);
  assert.deepEqual(metaCommentNotifications(feedPayload(), "999999999999999"), []);
});

test("Meta comment parser rejects unsafe provider IDs and malformed scoped payloads", () => {
  assert.equal(metaObjectId(commentId), commentId);
  assert.throws(() => metaObjectId(90_000_000_000_000_001), MetaCommentError);
  assert.throws(() => metaCommentNotifications(null, pageId), MetaCommentError);
  assert.throws(() => metaCommentNotifications({ object: "page", entry: [null] }, pageId), MetaCommentError);
  assert.throws(() => metaCommentNotifications(feedPayload({ from: { id: "bad", name: "Customer" } }), pageId), MetaCommentError);
  assert.throws(() => metaCommentNotifications(feedPayload({ message: "x".repeat(8_001) }), pageId), MetaCommentError);
});

test("classification and fallback drafts are multilingual, safe and actionable", () => {
  assert.equal(classifyFacebookComment("Need a quote for smart film"), "sales");
  assert.equal(classifyFacebookComment("This damaged my window and I want a refund"), "complaint");
  assert.equal(classifyFacebookComment("Спасибо, отличная работа!"), "praise");
  assert.equal(classifyFacebookComment("¿Cómo funciona la película?"), "question");
  assert.equal(classifyFacebookComment("https://spam.test https://spam2.test"), "spam");

  const draft = fallbackFacebookCommentDraft("Сколько стоит smart-плёнка?");
  assert.match(draft || "", /личные сообщения/i);
  assert.doesNotMatch(draft || "", /\$\s*\d/);
  assert.equal(fallbackFacebookCommentDraft("https://a.test https://b.test"), null);
});

test("AI drafts reject invented prices and promises before public review", () => {
  assert.deepEqual(
    parseFacebookCommentAiResponse('{"intent":"question","reply":"Please send us a private message with your project details."}'),
    { intent: "question", reply: "Please send us a private message with your project details." },
  );
  assert.throws(
    () => parseFacebookCommentAiResponse('{"intent":"sales","reply":"It will cost $99."}'),
    /unsafe or unapproved/i,
  );
  assert.throws(
    () => parseFacebookCommentAiResponse('{"intent":"sales","reply":"Your appointment is definitely booked."}'),
    /unsafe or unapproved/i,
  );
  assert.throws(
    () => parseFacebookCommentAiResponse('{"intent":"sales","reply":"Comment your phone number here."}'),
    /unsafe or unapproved/i,
  );
  assert.throws(
    () => parseFacebookCommentAiResponse('{"intent":"sales","reply":"Visit https://example.test now."}'),
    /unsafe or unapproved/i,
  );
  assert.throws(() => parseFacebookCommentAiResponse("not json"), /invalid JSON/i);
});

test("complaints receive a shorter SLA than sales and general comments", () => {
  const start = new Date("2026-11-06T12:00:00.000Z");
  assert.equal(facebookCommentDueAt("complaint", start).toISOString(), "2026-11-06T12:15:00.000Z");
  assert.equal(facebookCommentDueAt("sales", start).toISOString(), "2026-11-06T13:00:00.000Z");
  assert.equal(facebookCommentDueAt("other", start).toISOString(), "2026-11-06T16:00:00.000Z");
});

test("comment list filters keep active defaults and expose closed history for all", () => {
  assert.deepEqual(facebookCommentStatusesForQuery(undefined), ["pending_review", "escalated", "publishing"]);
  assert.deepEqual(facebookCommentStatusesForQuery("replied"), ["replied"]);
  assert.equal(facebookCommentStatusesForQuery("all"), null);
  assert.deepEqual(facebookCommentStatusesForQuery("unknown"), ["pending_review", "escalated", "publishing"]);
});

test("Facebook task titles fit the database limit even for long Unicode names", () => {
  const title = facebookCommentTaskTitle("complaint", "😀".repeat(160));
  assert.equal(Array.from(title).length, 180);
  assert.match(title, /^Срочно: жалоба в Facebook/);
});

test("only explicit Graph client failures release a claimed public reply", () => {
  assert.equal(metaGraphFailureIsDefinite(400), true);
  assert.equal(metaGraphFailureIsDefinite(401), true);
  assert.equal(metaGraphFailureIsDefinite(404), true);
  assert.equal(metaGraphFailureIsDefinite(408), false);
  assert.equal(metaGraphFailureIsDefinite(425), false);
  assert.equal(metaGraphFailureIsDefinite(429), false);
  assert.equal(metaGraphFailureIsDefinite(500), false);
  assert.equal(metaGraphFailureIsDefinite(503), false);
});

test("legacy inbox keeps public replies behind explicit manager confirmation", () => {
  const source = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
  assert.match(source, /Комментарии Facebook/);
  assert.match(source, /Проверил · опубликовать/);
  assert.match(source, /Опубликовать этот ответ публично в Facebook\?/);
  assert.match(source, /\/api\/v1\/integrations\/facebook-comments\/\$\{encodeURIComponent\(id\)\}\/reply/);
  assert.match(source, /Создать лид и задачу менеджеру из этого комментария\?/);
  assert.match(source, /facebook_comment: \{ label: 'Комментарий Facebook'/);
  assert.match(source, /catch \(error\) \{\s*facebookCommentsRefreshedAt = Date\.now\(\);\s*console\.warn\('\[Cloud CRM\] Facebook comments unavailable'/);
  assert.match(source, /facebookCommentDrafts\.set\(id, value\)/);
  assert.match(source, /facebookCommentDrafts\.has\(item\.facebook_comment_id\)/);
});

test("draft and publish paths use status compare-and-set before external side effects", () => {
  const service = readFileSync("src/features/integrations/meta-comments.ts", "utf8");
  assert.match(service, /status: "publishing"/);
  assert.match(service, /facebookComment\.updateMany\(\{[\s\S]*?status: comment\.status,[\s\S]*?draft was being generated/);
  assert.match(service, /A timeout\/network failure is ambiguous:[\s\S]*?Keep the durable `publishing` claim/);
  assert.match(service, /if \(!metaGraphFailureIsDefinite\(response\.status\)\)[\s\S]*?Facebook reply status is uncertain/);
});
