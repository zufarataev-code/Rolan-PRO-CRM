# Plaud AI dictaphone → CRM

Owner, 2026-11-12: «диктофон с ИИ слушает разговор с клиентом и заполняет проект».

## Flow

1. The measurer records the conversation on the Plaud device/app. **California is an all-party-consent state** — say at the start «Я включу запись, чтобы ничего не упустить — вы не против?» and record only after a yes.
2. Plaud transcribes and summarises. Delivery to the CRM — **free, no Zapier subscription** (Owner, 2026-11-12):
   - **E-mail (default):** in the Plaud app, Share → e-mail to `info+plaud@rolan-pro.com` (the `+plaud` alias of the Gmail box connected to the CRM). Put the project number in the subject when you can. The CRM pulls these e-mails from Gmail at most once a minute when someone opens a measurement window. A free Zapier zap «Plaud → Gmail Send Email» to the same address makes it automatic (a two-step zap is on Zapier's free plan).
   - **Webhook (optional, needs a paid Zapier plan for «Webhooks by Zapier»):** POST JSON to `https://<crm>/api/webhooks/plaud` with `Authorization: Bearer <PLAUD_WEBHOOK_SECRET>` and fields `recording_id`, `title`, `recorded_at`, `duration`, `summary`, `transcript`.
4. The CRM stores the recording once (idempotent by `recording_id`, or a content hash) as an `activity_log` row `integration.plaud.recording` and links it to a project only when the match is unambiguous:
   1. project number in the Plaud title (`R-261112-005 …`);
   2. a client phone in the title/summary with exactly one open project;
   3. exactly one project whose measurer pressed «Начал» around the recording time.
5. In the measurement window («Замер объекта») the block **🎙 Диктофон Plaud** shows the summary and the full text. «✨ Заполнить проект из разговора» asks AI to extract only what was said: wishes/budget/timing → project note and timeline; dictated sizes → windows in the named rooms, marked «Из диктофона Plaud — сверить размер» (verification stays `UNVERIFIED`). The manager confirms before anything is written.
6. Unmatched recordings show under «Непривязанные записи» in any measurement window with «Привязать сюда».

## Server setup

- `PLAUD_WEBHOOK_SECRET` — random string, at least 24 characters (e.g. `openssl rand -hex 24`). Same value goes into the Zapier header. Without it the webhook answers 503.
- Control center shows «Диктофон Plaud» with the time of the last recording.

## API

- `POST /api/webhooks/plaud` — Zapier only (bearer token), body ≤ 1 MB.
- `GET /api/v1/plaud/recordings?orderId=…` / `?unassigned=1` — staff with CRM access.
- `PATCH /api/v1/plaud/recordings` `{ id, orderId }` links, `{ id, applied: true }` marks as used.
