# ROLANPRO Gmail integration

The CRM uses a server-side Google OAuth connection for the shared mailbox `info@rolan-pro.com`. Passwords and OAuth tokens are never stored in the legacy HTML or browser storage.

## Google Cloud setup

1. Open Google Cloud Console under the ROLANPRO Google Workspace organization.
2. Enable **Gmail API**.
3. Configure the OAuth consent screen as **Internal** when the Workspace organization permits it.
4. Create an OAuth 2.0 Client ID of type **Web application**.
5. Add this authorized redirect URI:

   `https://YOUR_CRM_DOMAIN/api/v1/integrations/gmail/callback`

6. Add the values to the server environment:

   - `GMAIL_CLIENT_ID`
   - `GMAIL_CLIENT_SECRET`
   - `GMAIL_TOKEN_ENCRYPTION_KEY` — generate with `openssl rand -base64 32`
   - `GMAIL_ALLOWED_ADDRESS=info@rolan-pro.com`
   - `APP_URL=https://YOUR_CRM_DOMAIN`

7. Apply the database migration and restart the application.
8. Sign in as Owner, open **Settings → Email**, choose **Google Workspace / Gmail API**, and click **Connect Gmail**.
9. In Google, select only `info@rolan-pro.com` and approve access.

## Behavior

- Owner and Manager can read, search, reply, send, synchronize, mark read, and download attachments.
- Only Owner can connect or disconnect the company mailbox.
- The CRM initially synchronizes the latest 100 messages from the last 30 days.
- Messages are matched to a legacy client by email and then to that client's latest order.
- Emails sent from an order are explicitly stamped with its client and order IDs.
- Disconnecting destroys stored OAuth tokens but retains already synchronized message history for audit purposes.

## Production commands

Run only after a database backup and owner approval:

```bash
pnpm db:deploy
pnpm build
```

The implementation follows Google's server-side OAuth flow and Gmail Messages API. Do not paste a Gmail password or app password into the CRM.
