# Google Ads + ROLANPRO CRM integration runbook

Status: implementation branch `feat/google-ads-crm-integration`, PR #140. Keep the PR draft and keep live uploads disabled until the controlled connection checklist is complete.

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

- `GOOGLE_ADS_DEVELOPER_TOKEN`
- OAuth refresh-token path:
  - `GOOGLE_ADS_OAUTH_CLIENT_ID`
  - `GOOGLE_ADS_OAUTH_CLIENT_SECRET`
  - `GOOGLE_ADS_OAUTH_REFRESH_TOKEN`
- OR service-account path:
  - `GOOGLE_ADS_SERVICE_ACCOUNT_EMAIL`
  - `GOOGLE_ADS_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_ADS_VALIDATE_ONLY=true` during connection and validation

Account/action/list identifiers are stored in `GoogleAdsIntegrationSetting`, not exposed as secrets.

## Owner endpoints

All normal integration endpoints below require an authenticated OWNER session.

### Settings

- `GET /api/v1/integrations/google-ads/settings`
- `PATCH /api/v1/integrations/google-ads/settings`

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

Reconciliation creates missing outbox rows for both configured `qualified_lead` and `converted_lead` events. Processing uses Google Data Manager and respects upload/validate gates.

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
- latest RETRACTION -> zero
- unknown revenue stays unknown and is reported, not silently converted to zero

Multi-currency results are reported separately; no implicit FX conversion is performed.

## Qualified Lead rule

There is no hard-coded `QUALIFIED` stage in the current CRM pipeline. The owner must explicitly select `qualification_rules.pipeline_status_code` through the settings endpoint.

Until that is configured, no Qualified Lead conversion is created.

The qualified transaction ID is stable per deal, so a later stage transition cannot create a duplicate Qualified Lead event.

## Controlled connection checklist

Do not perform live activation until all items are complete.

1. Identify the real ROLANPRO Google Ads Customer ID and optional manager Customer ID.
2. Confirm the Google Ads API developer token is approved for the account hierarchy being used.
3. Configure OAuth refresh-token credentials (preferred for the owner account) or a service account with appropriate access.
4. Identify/create the Qualified Lead and Converted Lead conversion actions.
5. Decide the CRM stage that means `Qualified Lead`; persist it explicitly.
6. If Customer Match is required, identify/create the audience list and confirm the Customer Match Terms in Google Ads. Only then set the CRM terms flag.
7. Set `upload_enabled=true` while keeping both DB and env validation flags true.
8. Reconcile outboxes.
9. Process a small controlled batch in validate-only mode for conversions, one correction test if available, and Customer Match if consented test data exists.
10. Review `/status` and all request IDs/errors. Fix all operator-action rows.
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
- developer token + OAuth/service-account credentials are present
- Converted Lead destination is configured
- server env explicitly has `GOOGLE_ADS_VALIDATE_ONLY=false`

The endpoint then sets DB `upload_enabled=true`, `validate_only=false`, and requeues previously `validated` conversion/correction/Customer Match rows. Workers still perform their own consent and stale-state checks.

## Recommended production cadence

The repository currently does not contain a canonical scheduler. Do not claim these jobs are automated until production scheduling is explicitly configured.

Once the real Ads account timezone is known, schedule:

- every 15 minutes: conversion reconciliation + conversion processor
- every 15 minutes: adjustment processor
- every 15 minutes: Customer Match processor
- nightly: Customer Match reconciliation
- daily, after the Google Ads account day has closed: import the previous account-local date of cost data
- daily: review retry/operator-action counts and re-import recent cost days to absorb late Ads reporting corrections

Cost imports are idempotent upserts by `customer + date + campaign`.

## Incident / rollback

To stop outbound activity immediately:

1. set DB `upload_enabled=false` through owner settings, and/or
2. set server `GOOGLE_ADS_UPLOAD_ENABLED=false`, and
3. set `GOOGLE_ADS_VALIDATE_ONLY=true`.

Do not delete business events or outbox history to stop delivery.

For invalid conversion value already sent, create a RESTATEMENT or RETRACTION tied to an explicit financial reference. Do not edit the original conversion event.

For Customer Match consent withdrawal, set desired state to REMOVED or run reconciliation; the stored applied hash snapshot is used for removal.

## Website deployment note

Website lead forwarding is developed separately in `AndyK888/rolan-pro` on `codex/google-ads-crm-ingest`. Its GitHub PR is intake/review only. The accepted website patch must be ported to the authoritative Gitea branch/worktree and pass the site's authoritative gates before deployment.
