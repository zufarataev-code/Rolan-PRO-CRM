# Facebook Messenger -> ROLANPRO CRM booking

This integration lets the Facebook Messenger bot create or reuse a canonical CRM Lead, show live consultation availability, and book a canonical Consultation in PostgreSQL.

It does not create a second bot database. The bot remains a conversation channel; ROLANPRO CRM remains the system of record.

## CRM endpoints

All three endpoints are server-to-server JSON `POST` requests:

- `/api/integrations/facebook-messenger/leads`
- `/api/integrations/facebook-messenger/slots`
- `/api/integrations/facebook-messenger/bookings`

Every request must include:

- `content-type: application/json`
- `x-rolanpro-timestamp: <Unix timestamp in seconds>`
- `x-rolanpro-signature: sha256=<hex HMAC>`

The HMAC input is exactly:

```text
<timestamp>.<raw JSON request body>
```

The HMAC algorithm is SHA-256 and the key is the shared secret stored separately in CRM and Cloudflare.

Requests older than five minutes are rejected. Repeated Messenger events are idempotent: the same `external_event_id` and payload return the original result instead of creating a duplicate.

## CRM environment variables

Set these only in the protected production server environment:

```dotenv
FACEBOOK_MESSENGER_SHARED_SECRET="random-secret-at-least-32-characters"

# CRM user that performs automated writes. Must be OWNER or MANAGER.
FACEBOOK_MESSENGER_ACTOR_EMAIL="owner-or-manager@rolan-pro.com"
# Optional alternative:
# FACEBOOK_MESSENGER_ACTOR_USER_ID="postgres-user-uuid"

# Manager assigned to new Messenger leads. If omitted, the actor is used.
FACEBOOK_MESSENGER_DEFAULT_MANAGER_EMAIL="manager@rolan-pro.com"
# Optional alternative:
# FACEBOOK_MESSENGER_DEFAULT_MANAGER_USER_ID="postgres-user-uuid"

# Consultant / surveyor whose CRM calendar the bot offers.
FACEBOOK_MESSENGER_DEFAULT_CONSULTANT_EMAIL="surveyor@rolan-pro.com"
# Optional alternative:
# FACEBOOK_MESSENGER_DEFAULT_CONSULTANT_USER_ID="postgres-user-uuid"
```

Use either email or user ID for each role. If both are set, user ID takes precedence. The endpoint fails closed with `503 integration_not_configured` when the secret or required users are missing or have the wrong CRM role.

## 1. Capture a lead

Call this as soon as the bot has at least the customer's name and phone number.

```json
{
  "external_event_id": "mid.$cAA...lead-captured",
  "external_contact_id": "facebook-page-scoped-user-id",
  "page_id": "facebook-page-id",
  "name": "John Smith",
  "phone": "+18185551212",
  "email": "john@example.com",
  "service_type": "Smart Film",
  "property_type": "Residential",
  "city": "Westlake Village",
  "address": "123 Example St",
  "message": "Customer wants a free consultation."
}
```

Response data:

```json
{
  "lead_id": "uuid",
  "created": true,
  "source": "facebook_messenger",
  "idempotent_replay": false
}
```

The CRM preserves an existing lead's original attribution. It only assigns `facebook_messenger` as the source when it creates a new Lead.

## 2. Ask CRM for available slots

The Worker decides which business-hour windows may be offered. The CRM removes conflicts from the configured consultant's canonical CalendarEvent records.

```json
{
  "windows": [
    {
      "start_at": "2026-09-24T09:00:00-07:00",
      "end_at": "2026-09-24T17:00:00-07:00"
    },
    {
      "start_at": "2026-09-25T09:00:00-07:00",
      "end_at": "2026-09-25T17:00:00-07:00"
    }
  ],
  "duration_minutes": 60,
  "step_minutes": 30,
  "limit": 8
}
```

Response data:

```json
{
  "consultant": {
    "user_id": "uuid",
    "full_name": "Surveyor Name"
  },
  "slots": [
    {
      "start_at": "2026-09-24T16:00:00.000Z",
      "end_at": "2026-09-24T17:00:00.000Z"
    }
  ]
}
```

The Worker should display the returned UTC timestamps in `America/Los_Angeles` time.

## 3. Book the selected consultation

Use a distinct Messenger event ID for the booking action. The CRM checks availability again inside the database transaction; a slot that was taken after it was displayed returns `409 slot_unavailable`.

```json
{
  "external_event_id": "mid.$cAA...booking-confirmed",
  "external_contact_id": "facebook-page-scoped-user-id",
  "page_id": "facebook-page-id",
  "name": "John Smith",
  "phone": "+18185551212",
  "email": "john@example.com",
  "service_type": "Smart Film",
  "property_type": "Residential",
  "city": "Westlake Village",
  "address": "123 Example St",
  "message": "Customer selected the offered appointment.",
  "scheduled_start_at": "2026-09-24T12:00:00-07:00",
  "scheduled_end_at": "2026-09-24T13:00:00-07:00"
}
```

A successful booking creates or reuses the Lead, then creates the existing canonical CRM records:

```text
Lead
  -> CalendarEvent
  -> Consultation
  -> draft Survey
  -> pipeline status CONSULTATION_SCHEDULED
  -> consultant notification
```

## Cloudflare Worker request helper

Use this helper with a Cloudflare secret named `ROLANPRO_CRM_SHARED_SECRET` and a CRM base URL such as `https://<crm-host>`.

```ts
function toHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function signBody(rawBody: string, timestamp: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${rawBody}`),
  );
  return `sha256=${toHex(signature)}`;
}

export async function postToRolanproCrm(
  env: { ROLANPRO_CRM_URL: string; ROLANPRO_CRM_SHARED_SECRET: string },
  path: string,
  payload: unknown,
) {
  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await signBody(rawBody, timestamp, env.ROLANPRO_CRM_SHARED_SECRET);
  const response = await fetch(`${env.ROLANPRO_CRM_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-rolanpro-timestamp": timestamp,
      "x-rolanpro-signature": signature,
    },
    body: rawBody,
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.errors?.[0]?.code || `CRM HTTP ${response.status}`);
  }
  return result.data;
}
```

## Worker conversation flow

1. Receive the Messenger webhook and acknowledge Meta quickly.
2. Continue the current qualification conversation.
3. Collect name, phone, service, property type, city/address, and optional email.
4. Call `/leads` once the phone is captured.
5. Call `/slots` with the next allowed business-hour windows.
6. Present three to five CRM-returned slots as Messenger quick replies.
7. When the customer chooses a slot, call `/bookings`.
8. Only after CRM confirms success, tell the customer that the appointment is booked.
9. On `409 slot_unavailable`, fetch slots again and offer replacements.
10. Reuse the same `external_event_id` when retrying a failed HTTP delivery; do not generate a new ID for every retry.

## Rollout checklist

1. Merge and deploy the CRM change from `main` after CI is green.
2. Add CRM production environment variables; do not commit their values.
3. Add matching Cloudflare Worker secrets.
4. Connect the active Worker source repository or provide the current Worker code.
5. Add the request helper and three CRM calls to the Worker.
6. Test with an internal Facebook account and a non-customer phone number.
7. Confirm one Lead, one Consultation, one CalendarEvent, one draft Survey, and one consultant notification in CRM.
8. Retry the same Messenger event and confirm no duplicate records are created.
9. Attempt the same slot concurrently and confirm only one booking succeeds.

## Production Worker

The source of the active Cloudflare Worker `rolanpro-bot` is now tracked in
`integrations/facebook-messenger-worker`. It keeps disposable conversation state in the existing
Cloudflare KV namespace and sends every lead, availability lookup, and confirmed booking through
the signed CRM endpoints above. PostgreSQL remains the only system of record for leads and
consultations.

Deployment requires authenticated Cloudflare access plus the protected
`ROLANPRO_CRM_SHARED_SECRET` Worker binding. Its value must match the protected CRM server variable
`FACEBOOK_MESSENGER_SHARED_SECRET`; neither value belongs in Git.
