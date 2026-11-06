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
- `META_LEAD_ADS_FORM_IDS`: comma-separated, explicitly approved form IDs.
  Add only the created quote form, not every historical form on the Page.
  Its fields are single-value name/email/phone/ZIP and single-select service.
  Multiline and multi-select forms need parser changes before being allowlisted.

Set these five protected secrets in the GitHub `production` environment. Deployment
ships them over SSH stdin, backs up the prior mode-600 environment and atomically
updates only these assignments. With all five absent the sync is skipped; partial
configuration stops deployment. Existing runtime values are retained when skipped.

Missing configuration returns 503. GET verifies `hub.verify_token` and returns
the challenge; POST requires the exact raw-body `X-Hub-Signature-256` HMAC.
The body is streamed with a 128 KiB limit. IDs stay strings to prevent rounding.

Configure the app's Page `leadgen` webhook and subscribe the Page to that app.
Use an independent Lead Ads callback or a supported field-specific override.
Do **not** replace the live Messenger Worker's callback: it still handles messages.
Confirm app mode, permissions and Page lead access before subscribing. A development
app or unapproved lead access may work for app-role users yet fail for real customers.

The same CRM callback can also receive the Page `feed` field for reviewed public
comment replies. It must use the same Meta app signature and Page scope; see
`docs/FACEBOOK_PAGE_COMMENTS.md`. The Messenger Worker callback remains separate.

## CRM behavior

The receiver retrieves contact/answer data from Graph v26.0 with the protected
Page token and app-secret proof. Webhook-provided contact fields are never trusted.
Both notification and retrieved lead must match the configured Page/form scope.

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

Receipt creation does not schedule, qualify, send SMS, or produce a conversion.
Advertising consent remains UNKNOWN and audience-marketing eligibility false.
Submitting an enquiry authorizes responding to that enquiry, not marketing reuse.

Non-200 responses leave delivery retryable. A batch is acknowledged only after
all scoped leads commit; previously committed entries are safe on the next retry.
Graph reads time out after 8 seconds. If sustained batches exceed Meta's response
deadline, replace synchronous reads with a durable queue before increasing volume.
Monitor `meta_lead_ads_ingest_failed` and provider delivery failures; logs omit
tokens, contacts, request bodies and Graph error payloads.

## Release and evidence

Run unit tests, TypeScript, production build and the guarded disposable-database
E2E gate. Its provider response is mocked; no real Meta/CRM enquiry is submitted.
Production changes follow reviewed main deployment, with server secrets set first.
Verify GET validation and unsigned POST rejection without creating a lead. Then
verify the Page subscription and retrieval access. A genuine first enquiry must be
followed through to the office inbox before claiming live end-to-end delivery.
Keep every campaign paused and all ad media empty until the owner supplies assets.
