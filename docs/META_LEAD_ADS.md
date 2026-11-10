# Direct Meta instant form intake

Meta sends `leadgen` notifications directly to
`https://rolanpro-crm.143-110-136-211.sslip.io/api/webhooks/meta-lead-ads`.
No Zapier or website-form relay is involved.

Use the dedicated **RolanPro Lead Sync** app (`1727591805631700`) owned by
Rolan Pro Business Portfolio (`1641640146557596`). Keep PWI Ads MCP and the
owner’s Messenger app separate.

## Protected configuration

Keep these values only in protected server configuration, never in the UI or Git:

- `META_LEAD_ADS_APP_SECRET`: secret of the exact app signing the webhook.
- `META_LEAD_ADS_VERIFY_TOKEN`: random verification string, at least 32 characters.
- `META_LEAD_ADS_PAGE_ACCESS_TOKEN`: Page token for that same app with
  `leads_retrieval` and the Page's lead access. Subscription also requires
  `pages_manage_metadata` and an authorized Page advertiser.
- `META_LEAD_ADS_PAGE_ID`: `140034465868291` (Rolan&PRO).

Set these four protected settings in the GitHub `production` environment. Deployment
ships them over SSH stdin, backs up the prior mode-600 environment and atomically
updates the Meta assignments. With all four absent the sync is skipped; partial
configuration stops deployment. Existing runtime values are retained when skipped.

The public form allowlist, `META_LEAD_ADS_FORM_IDS`, is versioned in
`.github/workflows/deploy-production.yml` and deployed with those settings.
The legacy GitHub secret of the same name is ignored, so it cannot replace the
approved list with an older form. The approved forms are:

| Form | ID |
| --- | --- |
| Quote v1 | `1126644350232479` |
| Quote + Call v2 | `1805660454094850` |
| Quote + Call + Chat | `2227922148076022` |
| Weekend No Calls Test, Quote + Chat | `1330965225736016` |
| Regular quote form, optional email | `2548967978927243` |
| Weekend quote form, optional email | `2566162043862965` |

Review form additions and removals through a PR. These forms use single-value
contact/ZIP fields and a single-select service question. Multiline and multi-select
forms need parser changes before being allowlisted.

Missing configuration returns 503. GET verifies `hub.verify_token` and returns
the challenge; POST requires the exact raw-body `X-Hub-Signature-256` HMAC.
The body is streamed with a 128 KiB limit. IDs stay strings to prevent rounding.

Configure the app's Page `leadgen` webhook and subscribe the Page to that app.
Use an independent Lead Ads callback or a supported field-specific override.
Do **not** replace the live Messenger Worker's callback: it still handles messages.
Confirm app mode, permissions and Page lead access before subscribing. A development
app or unapproved lead access may work for app-role users yet fail for real customers.

## CRM behavior

The receiver retrieves contact/answer data from Graph v26.0 with the protected
Page token and app-secret proof. Webhook-provided contact fields are never trusted.
Both notification and retrieved lead must match the configured Page/form scope.
Email may be omitted, blank, an empty answer array, or an unanswered field.
With a valid name and phone, CRM stores the enquiry with `email: null` and
preserves ZIP and service. Email is not used to route the webhook.

Each provider lead ID creates one PostgreSQL `NEW_LEAD`, source `meta_lead_ads`,
visible in the existing **New Leads** inbox. ZIP and original custom answers
(including requested service) appear in notes. Campaign, ad set, ad and form IDs
and names enter the existing append-only acquisition ledger and receipt. An organic
submission is not labelled paid merely because it used an advertising form.
The existing Facebook source mapping continues into project creation.

Transaction-scoped advisory locking plus the existing unique external identity
prevent concurrent/retried notifications from duplicating the lead, attribution
or receipt. Committed retries do not retrieve data again or overwrite staff edits.
Different submissions remain separate enquiries; contact matching does not silently
combine people or change an existing enquiry's source or stage.

Existing first touch creates a notification when a manager or owner is available.
Welcome SMS requires a phone, an enabled SMS setting and configured Twilio access.
Receipt creation does not schedule, qualify, or produce an advertising conversion.
Advertising consent remains UNKNOWN and audience-marketing eligibility false.
Submitting an enquiry authorizes responding to that enquiry, not marketing reuse.

Non-200 responses leave delivery retryable. A batch is acknowledged only after
all scoped leads commit; previously committed entries are safe on the next retry.
Graph reads time out after 8 seconds. If sustained batches exceed Meta's response
deadline, replace synchronous reads with a durable queue before increasing volume.
Monitor `meta_lead_ads_ingest_failed` and provider delivery failures; logs omit
tokens, contacts, request bodies and Graph error payloads.
There is currently no Meta polling/backfill job. The control center's configuration
and last-received enquiry count cannot establish that every provider lead arrived.

## Release and evidence

Run unit tests, TypeScript, production build and the guarded disposable-database
E2E gate. Its provider response is mocked; no real Meta/CRM enquiry is submitted.
The gate calls the signed POST receiver with each email-free representation,
persists into the guarded disposable PostgreSQL database, and checks concurrent
delivery, committed retry, one receipt/notification, preserved staff notes and
no conversions. A tampered body must reach neither Graph nor lead creation.
Production changes follow reviewed main deployment, with server secrets set first.
Verify GET validation and unsigned POST rejection without creating a lead. Then
verify the Page subscription and retrieval access. A genuine first enquiry must be
followed through to the office inbox before claiming live end-to-end delivery.
Keep every campaign paused and all ad media empty until the owner supplies assets.

For live transport verification, use an explicitly approved synthetic submission
and follow its exact provider ID to `integration.meta_lead_ads.received` before
any manual replay. An organic testing-tool lead can verify automatic transport,
but does not prove paid attribution. Meta's API test endpoint can reject blank
email even when the customer-facing form permits it. A supported test with email
therefore proves transport separately from the email-free database fixture.
Final live confirmation is an actual blank-email submission whose exact provider
ID appears automatically in CRM with phone/ZIP/service intact and email null.
