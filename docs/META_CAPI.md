# Meta CRM stage delivery

CRM stage changes are captured in PostgreSQL `meta_capi_outbox`, separately from
Google's delivery queue. No API token or raw email/phone is stored in its payload.
New leads, contact attempts, contact, qualification, bookings, proposals, rejection,
loss and spam are separate events. `QualifiedLead` is one milestone per lead;
`ConvertedLead` can only be produced from an existing positive-value verified
`converted_lead` business event. Creating a project or changing a label cannot
produce a sale. Stage-history events use their persisted activity ID, so retries
reuse the same event. Re-entering qualification does not count it again.

## Supported source and matching

This is Meta's **Conversion Leads CRM integration**, for leads originally
downloaded from Meta instant forms (`external_source=meta_lead_ads`). It uses
`action_source=system_generated`, `custom_data.event_source=crm`, and
`custom_data.lead_event_source=RolanPRO CRM`. Native Meta lead IDs are sent without
hashing. Unknown advertising consent remains unknown: the native Meta lead ID
alone is used, without email or phone. Explicitly denied advertising consent
suppresses delivery. Contact identifiers are included only with a recorded
`ad_user_data=GRANTED` snapshot: trimmed/lowercase email and country-code phone
digits are SHA-256 hashed. The worker rechecks current consent before each send
and strips contact hashes if permission is no longer granted.

Website and CallRail/phone lead **stage updates** use ordinary CAPI with
`action_source=system_generated`, because the action is a CRM status change,
not another website submission or another telephone call. These ordinary events
omit native `lead_id` and the special CRM optimization custom parameters. They
require explicit `ad_user_data=GRANTED` and usable hashed contact matching;
unknown/denied consent is visibly suppressed. This does not recreate raw web/call
acquisition events or invent IP, browser or page context. Messenger-only/unknown
sources remain `suppressed/unsupported_source`. The transport never infers consent
from receipt of a form or changes an advertising goal.

## Configuration and activation

Required server environment names (values belong in the owning Infisical project
and its existing protected runtime consumer; do not put them in Git or browser
settings):

| Name | Meaning |
| --- | --- |
| `META_CAPI_DATASET_ID` | Verified CRM pixel/dataset numeric ID |
| `META_CAPI_ACCESS_TOKEN` | Dataset-scoped Conversions API token |
| `META_CAPI_UPLOAD_ENABLED` | Only literal `true` enables HTTP submissions; absent is off |
| `META_CAPI_TEST_EVENT_CODE` | Test Events code; keep set during provider validation |
| `GOOGLE_ADS_SYNC_SECRET` | Existing >=32-character scheduled-conversion bearer credential, if an external scheduler calls the process endpoint |

No credential is issued by this implementation. No vault, dataset assignment,
provider grant or live publication is implied by committed code. Apply migrations
before running this release. Configure the selected dataset/token privately and
verify `GET /api/v1/integrations/meta-capi/status` as the owner. Enable uploads with
a Test Events code first, process a task-authorized event, and independently
verify its exact event ID/name in Meta Events Manager. The owner process action is
`POST /api/v1/integrations/meta-capi/process` with optional `{ "limit": 10 }` (1–25).
The same endpoint accepts the existing scheduled conversion bearer credential.

The ten-minute Node scheduler runs independently of the Google scheduler and
Google upload pause. Each pass reconciles verified legacy project outcomes into
the existing business-event ledger before processing Meta's queue. Existing native
leads get their missing raw `Lead` event from the exact persisted intake receipt
timestamp when a later stage is captured; old events expire normally and are never
given a newer timestamp. HTTP submissions remain disabled until the Meta-specific
enable flag and valid dataset/token are present. Test acceptance is recorded as
`test_accepted`; it does not mark the live event delivered. Removing the test code
allows that same immutable event to be sent live. A live accepted event is not
sent again. An already-bound dataset is never silently changed: a mismatch needs
operator review. There is no automatic live activation or bidding-goal change.

## Reliability and evidence

Workers atomically claim a two-minute database lease. Only its token can complete
the claim. Expired leases may retry with the original `event_id`; the 8-second
HTTP deadline is well inside the lease. Network/timeout/429/transient/5xx failures
retry with exponential delay from one minute to six hours, at most eight
attempts. Authentication and permanent provider errors need operator action.
Graph bodies and exception messages are never returned or logged; status shows
only fixed error codes, queue totals and pending age, without lead identifiers.

`accepted` means Meta returned `events_received=1`. It does not prove matching,
attribution, training eligibility or a counted ad conversion; those need separate
Events Manager/Ads Manager verification. Test responses use the separate
`test_accepted` state. Missing matching data, invalid/expired timestamps and
unsupported sources remain visible as suppressed records, never deleted or
represented as successful sends. Events older than seven days are suppressed;
their timestamps are never rewritten to bypass the limit.

Before first submission/retry, a retracted sale is suppressed. The transport does
not erase previously accepted Meta events or claim that a Google refund adjustment
retracts a Meta event. Subsequent loss/spam/disqualification stages remain their
own negative/custom stage events. Meta's funnel configuration determines how
those stage names are used; no positive event is sent for them.

## Owning documentation

- [Meta CRM developer implementation](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/crm-integration/3-implementing-the-crm-integration)
- [Meta customer information parameters](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters)
- [Meta CRM integration overview](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration)

These documents define a distinct instant-form CRM payload, advertiser-defined
stage names, native lead-ID matching, regular uploads, original stage history,
and a seven-day backfill limit. This implementation uses Graph `v26.0`, matching
the existing Meta intake in this repository.
