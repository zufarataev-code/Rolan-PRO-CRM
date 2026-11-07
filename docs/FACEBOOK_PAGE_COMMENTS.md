# Facebook Page comments -> ROLANPRO CRM

This integration brings new public comments from the Rolan PRO Facebook Page into
the existing **New Leads** workspace. It does not publish an autonomous public
answer. A manager always reviews and confirms the final text.

## Flow

1. Meta sends a signed Page `feed` webhook to
   `/api/webhooks/meta-lead-ads`.
2. CRM accepts only `item=comment`, `verb=add` events for the configured Page.
   Page-authored replies, edits, removals and unrelated fields are ignored.
3. CRM classifies the comment as sales, question, complaint, praise, spam or
   other and creates a safe draft in the comment's language.
4. Non-spam comments create a manager task and notification. Complaints use a
   15-minute SLA and are visibly escalated.
5. In **New Leads -> Facebook comments**, a manager may edit/regenerate the
   draft, explicitly create a Lead, close or reopen the comment, or confirm a
   public reply.
6. Only the confirmation action calls the Graph API. The published text and
   provider reply ID are saved to the activity history.

The draft never invents price, discount, availability, warranty, technical
specification or an appointment. Sales comments invite the person into Messenger
for ZIP code and project details. Public comments do not grant marketing consent.

## Protected server configuration

The integration reuses the exact Meta app, Page and Page token already used by
Meta Lead Ads. Existing `META_LEAD_ADS_*` values are authoritative because one
callback cannot verify two different app signatures. The dedicated values below
are fallback values for a comment-only installation where Lead Ads is absent.

```dotenv
META_COMMENTS_APP_SECRET=""
META_COMMENTS_VERIFY_TOKEN=""
META_COMMENTS_PAGE_ACCESS_TOKEN=""
META_COMMENTS_PAGE_ID=""
META_GRAPH_API_VERSION="v26.0"
```

The server also reuses `FACEBOOK_MESSENGER_ACTOR_*` and optional
`FACEBOOK_MESSENGER_DEFAULT_MANAGER_*` to identify the CRM actor and assignee.
Those users must stay active Owner/Manager records.

Never place the app secret or Page token in legacy workspace JSON, browser code,
Git, screenshots or chat. The API returns only boolean connection state.

## Meta setup

In the Meta app that owns the configured Page token:

1. Keep the callback at
   `https://rolanpro-crm.143-110-136-211.sslip.io/api/webhooks/meta-lead-ads`.
2. Verify it with the protected verify token.
3. Subscribe the Rolan PRO Page to the `feed` webhook field in addition to any
   existing `leadgen` subscription.
4. Confirm the production Page token and app review/access for
   `pages_manage_metadata`, `pages_read_user_content` and
   `pages_manage_engagement` (plus existing Lead Ads permissions where used).
5. Keep the Messenger Worker callback unchanged; this Page callback receives
   Page feed events, while the Worker continues to handle private messages.

Do not claim production readiness based only on app-role accounts. Test one real
public comment from a non-role account and confirm that the task appears in CRM,
then publish one reviewed reply and verify it on Facebook.

## Safety and reliability

- `X-Hub-Signature-256` is checked against the exact raw request bytes.
- Provider IDs stay strings; unsafe numeric JSON IDs are rejected.
- Body size is limited to 128 KiB.
- `(page_id, external_comment_id)` is unique and transaction locking makes Meta
  retries idempotent.
- Page tokens stay server-side; Graph publishing uses `appsecret_proof` and a
  10-second timeout.
- Publishing first atomically claims the comment. A double-click or a second
  manager cannot create a duplicate reply. While the Graph request is in flight,
  `publishing` is locked and has no manual actions. Only after an ambiguous
  network outcome does it move to `publish_uncertain` for manual Facebook
  reconciliation instead of being retried. If the server exits after claiming
  but before recording the outcome, a two-minute lease converts that abandoned
  claim to `publish_uncertain`; a genuinely in-flight 10-second request remains
  locked. The
  workbench then requires the manager to open Facebook and choose either
  **Reply published** or **No reply — return to review**.
- A replied comment cannot be published twice. A dismissed comment must be
  reopened before replying; dismissed items remain visible in the workbench and
  reopening always returns them to active review (including former spam) and
  restores or creates their manager task.
- Public sending is an explicit manager action, never a background AI action.

## Release check

Before production activation:

1. Deploy the database migration for `facebook_comments`.
2. Confirm server secrets without exposing their values.
3. Verify callback challenge and unsigned-request rejection.
4. Subscribe `feed` in Meta and inspect webhook delivery status.
5. Post a controlled comment, verify CRM task/draft/lead creation, edit the draft
   and confirm one public reply.
6. Confirm complaints alert the manager and spam does not create a reply task.
