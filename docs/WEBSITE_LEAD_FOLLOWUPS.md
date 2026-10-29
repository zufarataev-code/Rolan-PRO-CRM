# Website quote follow-ups

Initial quotes keep using the existing HMAC-signed `POST /api/v1/integrations/website/leads`.
An update never creates another lead. The website sends `PATCH` to that same exact
path, signed over fresh Unix seconds + `.` + the exact raw JSON with the existing
server-only website ingest secret and headers. The signature expires after five minutes.

```json
{
  "submission_id": "the-unchanged-original-submission-id",
  "event_id": "11111111-1111-4111-8111-111111111111",
  "revision": 1,
  "occurred_at": "2026-10-29T12:00:00+00:00",
  "contact": { "email": "customer@example.com" },
  "follow_up": { "kind": "callback_requested", "message": "The full submitted quote context and callback request" }
}
```

- `submission_id`: 1–191 characters, unchanged from the accepted initial request.
- `event_id`: a new UUID for each committed website change, reused on retry.
- `revision`: consecutive positive integer, at most 2147483647, per original submission.
- `occurred_at`: the original update time, an ISO timestamp with timezone, frozen on retry.
- `contact`: optional object; `{}` is valid. Include only changed nonempty fields:
  name up to 160 characters, phone 3–40 valid phone characters, valid email up to 191.
  Omission preserves a field; empty strings/null are rejected rather than clearing contacts.
- `follow_up.kind`: `quote_updated` or `callback_requested`.
- `follow_up.message`: 1–16000 characters of the complete submitted context.
- Other root/contact/follow-up fields are rejected. Acquisition, consent, staff notes,
  assignment and business milestones cannot be changed by this protocol.

Success is a flat object: `ok`, `lead_id`, `event_id`, `revision`, `current_revision`,
`duplicate`, `applied`. A new revision has applied true/duplicate false. An identical
replay has applied false/duplicate true, and may report a newer current revision.
The website must verify the event ID/revision and exactly one of applied/duplicate.

Errors preserve the initial endpoint shape: `{ "ok": false, "error": { "code": "...", "message": "..." } }`.
409 responses also include `current_revision`:

| Code | Sender action |
| --- | --- |
| `initial_submission_missing` | Retry after initial delivery; never create a replacement submission. |
| `revision_gap` | Deliver prior revisions first, then retry the same event. |
| `idempotency_conflict` | Stop for review: the event UUID was reused with another payload. |
| `revision_conflict` | Stop for review: the revision belongs to another event. |

Persist the website change and its outbox revision atomically. Freeze event payloads;
only refresh signing timestamps/signatures. Process each submission in order while
allowing unrelated submissions to progress. Do not acknowledge a bare initial-POST
duplicate response as a successful PATCH. Deploy the CRM receiver before enabling
the publisher; retain queued updates until the compatible receiver is verified.

CRM stores receipts and immutable customer history in the existing ActivityLog,
with event and lead/revision uniqueness and transaction locks. It preserves current
contact before-images labeled `observed_before_update`; these are not a claim to
have recovered the historic initial website payload. Original notes remain unchanged.
Changed B2C display names clear redundant old name parts so later contact creation
uses the corrected full name. Names collapse internal whitespace as on initial
intake. For B2B, `contact.name` corrects the representative using the existing
first-token/remainder convention (80 characters per part); the company display
name, company identity and representative title are preserved. No linked
client/contact or project is overwritten.

The existing scoped leads API exposes only display history, not receipt metadata.
Office users see the history in New Leads and the original lead's project card after
conversion. Field roles do not receive this history. Project polling waits while a
modal is open and updates only the customer-history slot without redrawing editable
project fields. Callback requests are
not appointments, qualifications or sales. The endpoint sends no SMS/email or Google
request and does not change Google delivery settings.

Verification uses disposable guarded PostgreSQL/API tests and authenticated phone/
desktop browser conversion tests. Production records and credentials are never fixtures.
