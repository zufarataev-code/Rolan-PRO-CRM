# CallRail incoming calls

CallRail sends **Post-Call** JSON to `/api/webhooks/callrail`. Do not register
Pre-Call, Outbound, SMS or Call Modified events at this endpoint. CallRail can
delay Post-Call for up to 20 minutes. Recording is not needed.

Set server-only `CALLRAIL_WEBHOOK_SIGNING_KEY` from Webhooks > Advanced settings
and `CALLRAIL_COMPANY_ID` to the **numeric company ID in the CallRail dashboard
URL** (the `company_id` field of its legacy-compatible webhook, not a `COM…`
API resource identifier). The production environment's protected GitHub Actions
secrets supply these values at deployment. The deployment backs up the prior
environment file and atomically updates only these two assignments. Never put
the signing key in the webhook URL, a browser, workspace JSON, logs or Git.

The endpoint verifies `Signature = base64(HMAC-SHA1(key, raw request bytes))`,
checks the company, and ignores outbound and provider-marked spam calls. Every
other completed inbound call, including a missed call or voicemail, is retained
as an enquiry/activity. Neither duration nor CallRail's AI/good-lead label
qualifies or sells it. Unknown/withheld numbers remain visible without inventing
a contact phone. No recordings, transcripts, IP addresses or raw payloads are
stored by this importer.

Each company/call ID has one receipt. Transaction locks serialize retries and
calls from the same phone. A single existing canonical lead, including an
already-handled one with a linked project, keeps the activity on that project. Its contact,
source, attribution, consent, assignment, notes and pipeline stage are preserved.
Multiple matching leads use one visibly flagged open review enquiry without
claiming acquisition until staff resolves the identity. Dismissed enquiries
without a project and resolved review enquiries cannot hide a new call: it
creates a fresh enquiry. A legacy client with no canonical lead is shown by the
existing contact-match UI before a manager creates a project.

New enquiries appear in **New Leads** with the CallRail badge, source and call
details. Creating a project preserves `canonicalLeadId` and `leadSource`; the
same authorized call history appears on its project card. Caller ID names are
provider labels; staff should confirm the person's identity.
The latest 20 authorized calls also remain visible at the top of New Leads,
including calls attached to handled projects, so missed callbacks do not vanish
with the lead's closed status.

For new leads, genuine provider click IDs and matching landing-page campaign
parameters enter the existing acquisition ledger with `source_channel=PHONE`.
Do not join a top-level click ID to another milestone's first-touch campaign.
No call implies advertising consent: caller identifiers are not uploaded without
the existing consent gate. The ordinary proposal-sent and agreement/deposit
reconciler creates the existing Qualified/Converted events once, with PHONE as
their source. Unknown campaign IDs remain unknown; do not guess a campaign from
its name or a phone number.

CallRail's native Google Ads connection reports the initial call separately.
Use one call action, exclude text/form imports already tracked by the website,
and initially keep imported actions Secondary until a real import is verified.
Do not run Google's website forwarding-number swap and CallRail DNI against the
same number. Retain existing campaign/bidding choices pending owner review.

Before activation, verify the website loader, public webhook auth rejection,
runtime configuration and release. Then follow a genuine incoming call through
CallRail and CRM (including actual company-ID format, source and click fields).
A later genuine proposal/sale must verify Google delivery and matching. Passing
offline tests, an active integration badge and a reachable route are separate
from those production results. Never create fake Google clicks, consent or sales
to make the validation appear complete.

Reference: https://apidocs.callrail.com/ (Webhooks, Security, Calls).
