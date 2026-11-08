# Photo and video storage (DigitalOcean Spaces)

Bucket `rolanpro-media`, region `sfo3`, private file listing, CDN enabled, created 2026-11-07.
CORS: origin `https://rolanpro-crm.143-110-136-211.sslip.io`, methods GET/PUT/HEAD, any header, max age 3600.

## How it works
- The browser asks `POST /api/v1/files/upload-url` (signed-in staff only) for a 15-minute presigned PUT and uploads the **original file directly** to Spaces — no recompression, nothing passes through the CRM server. Photos, videos (up to 5 GB) and PDF are allowed.
- The order stores only a small preview (`dataUrl`, ~480 px JPEG) plus `key`, `url`, `size`, `mime`, `kind`. Existing screens, proposal covers and old photos keep working unchanged.
- `GET /api/v1/files/view?key=…[&download=name]` checks the staff session and redirects to a one-hour presigned GET. The bucket is never public.
- Keys: `crm/order-<id>/<yyyy-mm>/<uuid>-<name>` — originals stay grouped by project and month for the content team.
- Until the keys below are configured, `/api/v1/files/config` reports `enabled: false` and the CRM keeps the old in-order upload (images up to 2 MB).

## Protected server configuration (never commit)
- `SPACES_ACCESS_KEY`, `SPACES_SECRET_KEY` — a bucket-scoped Read/Write key from Spaces → `rolanpro-media` → Settings → Access Keys.
- Optional: `SPACES_BUCKET` (default `rolanpro-media`), `SPACES_REGION` (default `sfo3`), `SPACES_ENDPOINT` (default `https://sfo3.digitaloceanspaces.com`).

Add them to the server environment file and restart the app. The owner control center (`/legacy-crm/control-center`) turns the storage card green once the keys work.
