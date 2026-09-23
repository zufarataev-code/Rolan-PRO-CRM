# Rolan PRO Messenger Worker

This is the source of the production Cloudflare Worker named `rolanpro-bot`.

The Worker keeps only disposable conversation state in the existing `CHAT` KV namespace. Leads, appointment availability, and confirmed consultations are read from or written to the ROLANPRO CRM PostgreSQL database through the signed endpoints documented in `docs/FACEBOOK_MESSENGER_BOOKING.md`.

## Protected bindings

These values must be configured in Cloudflare and must never be committed:

- `ANTHROPIC_API_KEY`
- `PAGE_TOKEN`
- `VERIFY_TOKEN`
- `ROLANPRO_CRM_SHARED_SECRET`

The same CRM shared secret must be stored on the production CRM server as `FACEBOOK_MESSENGER_SHARED_SECRET`.

## Deployment

From this directory, authenticate with Cloudflare and verify the account before deploying:

```sh
npx wrangler whoami
npx wrangler deploy --dry-run
npx wrangler deploy
```

The config uses `keep_vars` so the existing remote Messenger, Anthropic, and calendar variables remain attached. The existing `CHAT` KV binding is declared explicitly.
