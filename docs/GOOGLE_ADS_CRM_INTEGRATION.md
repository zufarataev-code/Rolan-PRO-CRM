# Google Ads + ROLANPRO CRM integration runbook

The original transport was introduced in PR #140. The campaign attribution,
paid-job reporting and delivery completion is on
`codex/google-ads-roi-integration-20261026`. Code review, merge, deployment and
Google live acceptance are separate milestones. Keep live uploads disabled
until the controlled connection checklist below is complete.

## Campaign attribution and profitability (2026-10-26)

The existing cost script continues to work without replacing its CRM key. It
upserts campaign/day costs, clicks and impressions daily. Its rolling
`LAST_30_DAYS` range ends yesterday. The owner report defaults to the same 30
completed Pacific calendar days, including across daylight-saving changes.

The owner workspace uses server calculations at
`GET /api/v1/integrations/google-ads/report`. Optional `start_date`, `end_date`
and `customer_id` select the acquisition cohort. Accounts and currencies are
kept separate. When several accounts exist, configure the intended account or
pass its ID; do not pool their spending. The legacy `/roas` endpoint remains a
booked-conversion-value report, distinct from this collected-revenue report.

For each campaign the CRM shows leads, won projects, cost per lead, receipts,
closed-job revenue, ROAS and direct-cost ROI:

- ROAS = net collected revenue for closed jobs / ad spend.
- ROI = (that revenue - reviewed direct job costs - ad spend) / ad spend × 100.
- Deposits on open jobs remain visible as receipts, not closed-job revenue.
- Refunds use existing project-linked `expense/refund` finance records. Bank
  allocations do not duplicate the job's payment receipts.
- Costs come from the existing warehouse issue, stage payroll/accruals,
  confirmed payouts, actual expenses and project-linked finance entries.
  Payroll payments offset accruals for the same worker and stage only; fixed
  and separate unstaged payments remain costs even for a staged worker. Fixed
  installer/measurer job pay accrues on the existing installation/measurement
  completion event, including unpaid or partially paid obligations; later
  payments settle that accrual once, and pay-source changes invalidate review.
  Earned manager commissions and unstaged per-square-foot work require a separate
  OWNER settlement review in the existing payroll module before cost confirmation.
  The review control uses that module's current calculator and rejects unpaid or
  partial balances; it creates no payment or new money total. The server records
  only the owner's attestation against a source fingerprint. Changed job, rate,
  crew, payment or pricing facts reopen that gate, including on archived jobs.
  Project material/equipment purchases remain costs after warehouse film is
  consumed. Reconcile each potentially overlapping purchase as warehouse film,
  a linked actual project expense, or a separate purchase; a default empty
  expense link is not proof of overlap. A stock receipt proven by its existing
  inventory ID to fund a priced, warning-free film issue uses the consumed
  material cost rather than charging the whole unconsumed roll to the job.
  Quantity services also contribute quantity times their saved per-unit material
  cost, using the existing service-directory fallback when no snapshot exists.
  Missing or invalid unit costs prevent cost confirmation; source changes
  invalidate the review. Other payments explicitly marked as covering recorded
  material share one allowance per material type: issued film or quantity-service
  components. A component payment cannot consume the film allowance; payment excess
  remains a cost. Cancelled/lost quotes do not charge unconsumed service components;
  recorded purchases and other sunk actual costs remain. Project-linked vehicle/rental expenses marked
  variable follow the same explicit expense reconciliation as other direct costs.
  Bank entries that might pay an existing project expense require the owner
  to link that expense or explicitly mark the entry as additional. This prevents
  double charging without guessing which two records represent the same cost.
  The report does not create another costing ledger. Company overhead, taxes
  and advertising already in the denominator are excluded from direct costs.
- ROI remains unknown while work/material/expense facts are incomplete or a
  project awaits the owner's cost review. The owner confirms completeness
  after checking the amount and source records. Cancelled jobs may review only
  their sunk actual costs without completing abandoned work. Archived jobs retain
  their original financial history; archiving alone is not a sale retraction.
  A source-fact fingerprint
  invalidates that review when costs change. Missing costs never become a
  silently assumed zero-profit calculation.
- This is an acquisition-cohort report: leads/spend belong to the selected
  dates; the same jobs' receipts and costs accumulate afterwards. Compare
  equally mature cohorts. It is not Google's conversion-date attribution UI.

### Required website setup

1. Keep Google Ads auto-tagging enabled. Configure the final URL suffix with
   the actual account ID and ValueTrack campaign ID, for example:
   `google_ads_customer_id=1234567890&campaign_id={campaignid}&utm_source=google&utm_medium=cpc&utm_campaign={campaignid}`.
   Preserve any existing tracking parameters instead of adding duplicate keys.
2. Capture `gclid`, `gbraid`, `wbraid`, landing URL, UTM values, the customer ID,
   campaign ID and capture time from the original paid visit. Keep the first
   applicable paid acquisition through navigation according to the site's
   consent/storage policy. A later direct visit must not erase it. The CRM
   landing form captures its current URL; rolan-pro.com's separate site needs
   its own navigation persistence and deployment.
3. Pass this `attribution` object to the existing HMAC-signed website ingest:

   ```json
   {
     "google_ads_customer_id": "1234567890",
     "google_ads_campaign_id": "987654321",
     "gclid": "original-click-id-if-present",
     "landing_page": "https://example.com/?campaign_id=987654321",
     "utm_source": "google",
     "utm_medium": "cpc",
     "captured_at": "2026-10-26T10:00:00-07:00",
     "consent": {
       "ad_user_data": "UNKNOWN",
       "ad_personalization": "UNKNOWN",
       "audience_marketing_eligible": false,
       "source": "actual-form-and-policy-version"
     }
   }
   ```

   Do not generate a click ID or infer consent. Browser code never receives
   `WEBSITE_LEAD_INGEST_SECRET`. The website server signs
   `timestamp + "." + rawJSON` with HMAC-SHA256; send the hexadecimal signature
   in `x-rolan-signature` and Unix seconds in `x-rolan-timestamp` to
   `POST /api/v1/integrations/website/leads`. Retry the same `submission_id` on
   uncertain delivery; the endpoint deduplicates it.
4. The authenticated lead API accepts the same Google customer/campaign IDs.
   The CRM-hosted public landing form also persists attribution and has a
   separate optional ad-measurement consent checkbox; SMS permission is not
   advertising permission.
5. When a lead becomes a project, retain `canonicalLeadId`. Proposal publishing
   verifies manager access and carries that original lead into the Deal.
   A manager cannot replace a saved original lead or reuse a lead already bound
   to another active/archived project; unused accessible leads remain valid.
   Attribution is selected from that lead, never guessed from another job
   sharing the same phone/email. Older records without a proven link remain
   unattributed until the owner reviews evidence.

### Phone calls and existing projects

Use a call-tracking provider's verified campaign/click evidence. A phone
number alone cannot identify an advertising campaign. In the Google Ads block,
the owner can link an existing project to an imported campaign, select Phone
or Website, and supply an original GCLID when available. This records one
immutable original acquisition and preserves the original website click IDs
when the lead already has them. It does not install dynamic-number insertion
or invent attribution for Zadarma calls.

Hashed contact uploads require recorded client consent. The owner must supply
the consent evidence source to record `GRANTED`; otherwise it remains unknown.
This is independent of Customer Match and never enrolls a person into an
advertising audience. Without a click ID or permitted customer identifier,
the outbox explains why delivery is suppressed.

### Business outcomes and delivery

Qualified Lead follows the explicitly selected stage; confirmed consultation
is recommended. Publishing a proposal link alone does not qualify it. Lead
and Deal paths share the same qualification identity, retaining existing
production transaction IDs on retries.

Signed agreement plus paid deposit keeps the existing sale gate. The working
legacy CRM also recognizes its explicit saved `accepted_by_payment` fact,
paid deposit and approved amount for sales completed without an online
signature. Stage labels alone never manufacture a sale or lock its value to
unknown. This is booked sale value for Google bidding, not paid-job profit.
Repeated reconciliation does not create another sale when the project later
gets a canonical Deal. Recorded refunds/cancellations produce immutable
restatements/retractions; their uploads wait for original Google confirmation.
Removing the last erroneous refund appends a restoring restatement to the
original sale value; prior corrections and unrelated manual restatements remain.
Corrections also reconcile for recorded consent-based sales without a click
touchpoint. Older click captures missing a leaf-account ID remain in the legacy
`/roas` report only when its cost feed identifies exactly one account.
Retractions are final, including backdated retractions; reopening a retracted sale needs operator review.

Corrections recorded before destination setup receive missing delivery rows
after configuration, through both the native worker and the owner adjustment
processor. Replays retain the original financial facts and any existing delivery
destination; changing settings does not resend a correction to another account.
Late owner campaign binding also fills missing Deal/Event attribution links and
retries only identifier-suppressed deliveries that were never submitted. It keeps
the original sale's transaction ID, value and time, and preserves established
lead/acquisition evidence.

The existing ten-minute worker and owner "send now" action reconcile these
facts into the same durable outboxes. Live mode requires both DB
`validate_only=false` and explicit server `GOOGLE_ADS_VALIDATE_ONLY=false`.
Missing/malformed environment configuration remains test mode and the screen
shows that effective state. Changing destination IDs resets DB validation.
Pausing/resuming delivery is explicit. Status polling leases each request,
backs off failures/processing, and continues to later requests. An uncertain
status check never queues a duplicate upload. OAuth caching is scoped to the
requested permissions; stale click identifiers are omitted after 90 days.

### Verification and rollout

- Run `npm test`, `npm run typecheck`, `npm run build`, and `npm run test:e2e`
  against an explicitly disposable local database. The Google E2E test refuses
  non-local/unmarked targets and keeps all Google delivery disabled.
- Run migrations on a disposable database and confirm no schema drift. This
  migration adds nullable attribution/legacy-link fields and indexes; it
  preserves existing customers, projects, events and financial records.
- After the owner's normal merge/deploy decision, verify website capture,
  consent, a paid-job report and one reviewed cost record on the actual site.
  Validate offline conversions before separately authorizing live delivery.
- Confirm a small live request in Data Manager diagnostics and Google Ads;
  HTTP 200/`requestId` is submission only, `confirmed` is processing success,
  and actual matching/attribution still requires Google's destination UI.
- This PR neither deploys the CRM/WordPress site nor changes campaigns,
  bidding goals, budgets, consent terms or live-upload settings.

## Principles

- PostgreSQL/Prisma CRM data is the business and financial source of truth.
- Google HTTP success does not mean a conversion was attributed or an audience member became active.
- Never put customer PII in URLs, transaction IDs, logs, or diagnostics.
- `gclid`, `gbraid`, and `wbraid` are preserved as click identifiers and are never hashed.
- Email and phone are normalized and SHA-256 hashed once before Customer Match/Data Manager upload.
- Unknown consent is never upgraded to granted.
- Revenue corrections use immutable adjustment records; the original conversion event is never rewritten.
- Live uploads are a separate explicit activation step. Normal settings cannot set `validate_only=false`.

## Data flow

Website lead:

`rolanpro.com -> HMAC website ingest -> Lead + attribution touchpoint + consent snapshot`

Lifecycle conversions:

`CRM stage transition -> ConversionEvent -> ConversionUploadOutbox -> Data Manager events:ingest`

Corrections:

`explicit finance reference -> ConversionAdjustment -> ConversionAdjustmentOutbox -> Google Ads v25 uploadConversionAdjustments`

Customer Match:

`explicit desired membership + consent -> CustomerMatchMembership -> CustomerMatchOutbox -> Data Manager audienceMembers:ingest/remove`

Reporting:

`Google Ads v25 SearchStream -> GoogleAdsDailyCost -> corrected CRM revenue -> ROAS`

## Safe defaults

Database defaults:

- `upload_enabled = false`
- `validate_only = true`
- `customer_match_enabled = false`
- `customer_match_terms_accepted = false`

Environment defaults in `.env.example`:

- `GOOGLE_ADS_UPLOAD_ENABLED=false`
- `GOOGLE_ADS_VALIDATE_ONLY=true`

A live request is impossible through the normal settings endpoint because it rejects `validate_only=false`.

## Required server credentials

Keep all values server-side. Never use `NEXT_PUBLIC_*` for these values.

- Enable Google Ads API access on the Cloud project used by the OAuth/service-account
  credentials, with an access level that permits the intended production operations.
  `GOOGLE_ADS_DEVELOPER_TOKEN` is an optional legacy value: [Google sunset developer
  tokens on September 9, 2026](https://developers.google.com/google-ads/api/docs/api-policy/developer-token).
- OAuth refresh-token path:
  - `GOOGLE_ADS_OAUTH_CLIENT_ID`
  - `GOOGLE_ADS_OAUTH_CLIENT_SECRET`
  - `GOOGLE_ADS_OAUTH_REFRESH_TOKEN`
- OR service-account path:
  - `GOOGLE_ADS_SERVICE_ACCOUNT_EMAIL`
  - `GOOGLE_ADS_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_ADS_VALIDATE_ONLY=true` during connection and validation

Instead of environment service-account credentials, an authenticated OWNER can
select the downloaded JSON key in Settings → Integrations → Google Ads. The file
picker accepts files up to 64 KiB, sends the parsed object directly to the OWNER
credentials endpoint, and clears the selection and temporary key references on
success or failure. It never renders the key text or saves it in browser/workspace
storage. The server encrypts the private key using the existing secret-encryption
mechanism; credential reads return only presence/source/account metadata, never
the key. Use a dedicated service account with access to the intended Google Ads
account. OAuth refresh-token credentials remain a supported alternative.

Account/action/list identifiers are stored in `GoogleAdsIntegrationSetting`, not exposed as secrets.

## Owner endpoints

All normal integration endpoints below require an authenticated OWNER session.

### Encrypted service-account credentials

- `GET /api/v1/integrations/google-ads/credentials` — safe presence/source summary
- `PUT /api/v1/integrations/google-ads/credentials` — `service_account_json` as a
  JSON object or JSON string, validated and encrypted on the server
- `DELETE /api/v1/integrations/google-ads/credentials` — remove the saved CRM key

Environment credentials take precedence; deleting the saved CRM key does not
remove credentials configured in the server environment. None of these calls
activates uploads or processes queued events.

### Settings

- `GET /api/v1/integrations/google-ads/settings`
- `PATCH /api/v1/integrations/google-ads/settings`

Ordinary ID/settings saves preserve the current database upload mode, including a
pause made from another tab; they do not replay cached upload or validation flags.
New configurations remain paused and validate-only. Use the separate Pause / Enable
validation controls to change delivery. A changed account/action destination still
forces validation, and live activation remains a separate controlled action.

Configure:

- Google Ads operating Customer ID
- optional manager/login Customer ID
- Qualified Lead conversion action ID
- Converted Lead conversion action ID
- qualification pipeline stage
- Customer Match user-list ID
- explicit Customer Match Terms acknowledgement
- Customer Match enable flag
- upload enable flag

Normal settings can turn validation mode on but cannot turn it off.

### Diagnostics

- `GET /api/v1/integrations/google-ads/status`

Shows safe configuration, credential presence booleans, outbox counts, problems, Customer Match state, and last cost-feed import. It never returns tokens or secret values.

### Conversion delivery

- `POST /api/v1/integrations/google-ads/conversions/reconcile`
- `POST /api/v1/integrations/google-ads/conversions/process`
- `POST /api/v1/integrations/google-ads/conversions/status`

Reconciliation creates missing outbox rows for both configured `qualified_lead` and `converted_lead` events. Processing uses Google Data Manager and respects upload/validate gates. Live Data Manager acceptance is asynchronous: the status endpoint resolves each returned `requestId` to `confirmed` only after Google reports `SUCCESS`; `FAILED` and `PARTIAL_SUCCESS` require operator review.

### Protected scheduler endpoint

- `POST /api/integrations/google-ads/sync`
- header: `Authorization: Bearer <GOOGLE_ADS_SYNC_SECRET>`

This server-to-server endpoint reconciles conversion events, processes a bounded upload batch, and checks asynchronous Google request status. It is intended for a production scheduler and is unavailable until a random `GOOGLE_ADS_SYNC_SECRET` of at least 32 characters is stored in the server secret manager. It never returns customer names, emails, phone numbers, click IDs, or secret values.

### Financial corrections

- `POST /api/v1/integrations/google-ads/adjustments`
- `POST /api/v1/integrations/google-ads/adjustments/process`

Every adjustment requires a real `financial_reference_id`.

- `RETRACTION`: no adjusted value; removes the original conversion value.
- `RESTATEMENT`: `adjusted_value` is the new final value, not a delta.

Google matching uses the stable CRM `orderId`/transaction ID.

### Customer Match

- `POST /api/v1/integrations/google-ads/customer-match/memberships`
- `POST /api/v1/integrations/google-ads/customer-match/reconcile`
- `POST /api/v1/integrations/google-ads/customer-match/process`

ADD requires the latest CRM consent snapshot to have:

- `ad_user_data = GRANTED`
- `ad_personalization = GRANTED`
- `audience_marketing_eligible = true`
- owner-confirmed Customer Match Terms

REMOVE deliberately does not require current consent. It uses the previously applied hashed identifier snapshot so a person can still be removed after consent withdrawal, contact changes, or deletion of the source Lead/Client record.

If account/list destination settings change, reconciliation does not perform destructive cross-list cleanup automatically. Treat that as a controlled migration/full-replacement operation.

### Cost import and ROAS

- `POST /api/v1/integrations/google-ads/costs/import`
  - body: `start_date`, `end_date` in `YYYY-MM-DD`
  - maximum 31 days per import request
- `GET /api/v1/integrations/google-ads/roas?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`

Cost import is read-only Google Ads API access. It stores both raw `cost_micros` and exact Decimal currency amount.

ROAS uses only CRM conversions whose selected attribution touchpoint contains `gclid`, `gbraid`, or `wbraid`. Revenue uses current CRM financial truth:

- no correction -> original conversion value
- latest RESTATEMENT -> adjusted final value
- any RETRACTION -> zero, including a backdated one
- unknown revenue stays unknown and is reported, not silently converted to zero

Multi-currency results are reported separately; no implicit FX conversion is performed.

## Qualified Lead rule

There is no hard-coded `QUALIFIED` stage in the current CRM pipeline. The owner must explicitly select `qualification_rules.pipeline_status_code` through the settings endpoint. For Rolan PRO, the recommended setting is `CONSULTATION_SCHEDULED`, so a real booked consultation becomes the Qualified Lead signal even when the CRM has not created a Deal yet.

Until that is configured, no Qualified Lead conversion is created.

Qualified transaction IDs are stable per original lead when present, with a deal/client fallback. Existing deal-based event IDs are reused, so a later stage transition does not create another qualification.

## Controlled connection checklist

Do not perform live activation until all items are complete.

1. Identify the real ROLANPRO Google Ads Customer ID and optional manager Customer ID.
2. Verify the credential's Google Cloud project has Google Ads API enabled and the required production access; a legacy developer token is no longer required.
3. Configure OAuth refresh-token credentials (preferred for the owner account) or a service account with appropriate access.
4. Identify/create the Qualified Lead and Converted Lead conversion actions in the actual conversion-owner account. Confirm the sale action supports adjustments and test a refund on its actual matching path; [Google restricts adjustment action types and identifiers](https://developers.google.com/google-ads/api/docs/conversions/upload-adjustments), including no WBRAID adjustments.
   Review account and campaign goals with the owner: decide which CRM outcome should drive bidding and which signals stay secondary. Check existing primary form/call actions and repeated lead-to-sale signals before enabling them together, so one customer journey does not unintentionally count as multiple bidding successes.
5. Decide the CRM stage that means `Qualified Lead`; persist it explicitly.
6. If Customer Match is required, identify/create the audience list and confirm the Customer Match Terms in Google Ads. Only then set the CRM terms flag.
7. Set `upload_enabled=true` while keeping both DB and env validation flags true.
8. Reconcile outboxes.
9. Process a small controlled batch in validate-only mode for conversions, one correction test if available, and Customer Match if consented test data exists.
10. Review `/status`, run request-status reconciliation, and inspect all request IDs/errors. Fix all operator-action rows.
11. Run a read-only cost import and verify spend against the Google Ads UI for the same date range.
12. Verify ROAS revenue against CRM sales and any known refund/restatement.
13. Only after owner approval, set the server environment `GOOGLE_ADS_VALIDATE_ONLY=false`.
14. Call the separate live activation endpoint with the exact confirmation phrase and the exact configured Customer ID. This switches DB validation off and requeues only rows that previously validated.
15. Process a very small live batch and verify results in Google before normal scheduling begins.

## Live activation endpoint

- `POST /api/v1/integrations/google-ads/live/activate`

Required body:

```json
{
  "confirmation": "ENABLE_LIVE_GOOGLE_ADS_UPLOADS",
  "customer_id": "1234567890"
}
```

Activation is rejected unless:

- caller is OWNER
- confirmation phrase is exact
- confirmed Customer ID matches CRM settings
- OAuth/service-account credentials are present (Data Manager does not require the separate Google Ads API developer token)
- Converted Lead destination is configured
- server env explicitly has `GOOGLE_ADS_VALIDATE_ONLY=false`

The endpoint then sets DB `upload_enabled=true`, `validate_only=false`, and requeues previously `validated` conversion/correction/Customer Match rows. Workers still perform their own consent and stale-state checks.

## Recommended production cadence

The application already has a ten-minute process-local worker for conversion
reconciliation, uploads, request-status checks, adjustments and Customer Match
uploads. `GOOGLE_ADS_AUTO_SYNC=off` disables its timer. Verify that this worker
starts and remains active in the production runtime; code registration alone
does not prove production liveness. It requires configured credentials and
enabled CRM delivery settings. The first timed pass occurs after ten minutes.

The built-in worker does not need `GOOGLE_ADS_SYNC_SECRET`. That secret belongs
to the optional externally scheduled protected endpoint, which handles only
conversion reconciliation, uploads and status checks. An external replacement
must also arrange adjustment processing and, if used, Customer Match processing.

Keep these separate operational tasks:

- daily, after the account-local day closes: run the Google Ads cost script or
  a configured API import; neither cost path is run by the ten-minute worker
- daily: review retry/operator-action counts and refresh recent cost days to
  absorb late reporting corrections; the script's rolling 30-day import does this
- if optional Customer Match is used: reconcile desired memberships separately,
  for example nightly; the worker processes uploads rather than membership rules

Cost imports are idempotent upserts by `customer + date + campaign`.

## Incident / rollback

To pause new outbound processing:

1. set DB `upload_enabled=false` through owner settings; an explicit stored
   pause takes precedence over the legacy `GOOGLE_ADS_UPLOAD_ENABLED` fallback
2. also set server `GOOGLE_ADS_UPLOAD_ENABLED=false` (or unset it), and
3. set `GOOGLE_ADS_VALIDATE_ONLY=true` and apply environment changes to the
   running processes as an independent gate against live mutations.

An already-in-flight request may finish. Validation mode can still send test
requests; it does not mean there is no network traffic.

Do not delete business events or outbox history to stop delivery.

For invalid conversion value already sent, create a RESTATEMENT or RETRACTION tied to an explicit financial reference. Do not edit the original conversion event.

For Customer Match consent withdrawal, set desired state to REMOVED or run reconciliation; the stored applied hash snapshot is used for removal.

## Website deployment note

Website lead capture and forwarding are a separate implementation dependency.
The historical [website prototype PR #1](https://github.com/AndyK888/rolan-pro/pull/1)
is still a draft. The website has migrated to GitLab; use the authoritative
repository and review workflow recorded in the website's own `PROJECT.md`.
Its GitHub copy is backup-only. Do not deploy the prototype unchanged.

The website change must satisfy the contract above: persist the original paid
visit through navigation and later organic UTM visits; capture and forward the
explicit account/campaign IDs, original landing URL/time and supported click
IDs; preserve actual consent evidence; and retain failed submissions for safe,
idempotent replay. The old prototype omits the explicit IDs and original
landing/time, can replace paid attribution on later UTM visits, and only retries
delivery synchronously. Port and complete it in a reviewed website merge request.

Existing `utm_campaign=rp_residential_{campaignid}` (and analogous commercial/
smart labels) is a label, not a substitute for the explicit numeric ID fields.
Keep existing UTMs and add the real `google_ads_customer_id` plus
`campaign_id={campaignid}` to effective Google Ads tracking, including PMax.
Verify form and phone outcomes separately. The CRM PR does not create Google
conversion actions or change the campaign goals used for bidding.

Current Event, IngestEventsRequest and request-status field/status names were checked against the [official Data Manager v1 discovery schema](https://datamanager.googleapis.com/$discovery/rest?version=v1) on 2026-10-26. This is contract verification, not live account acceptance.
