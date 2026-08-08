# ROLANPRO email channels

ROLANPRO uses two deliberately separate delivery channels.

## 1. Google Workspace — one-to-one client work

- Sender: `info@rolan-pro.com`.
- Used for personal replies, order discussions, proposals, and operational notices.
- Opened from the client passport inside the order card.
- Messages are linked to the client/order and retained in CRM history.
- Gmail routes reject marketing/broadcast purposes.

## 2. Resend Broadcasts — congratulations, reviews, and campaigns

- Sender: a verified subdomain such as `hello@updates.rolan-pro.com`.
- Used for birthday/holiday greetings, review campaigns, newsletters, promotions, and reactivation.
- Requires a Resend API key, verified sending subdomain, Segment, and Topic.
- Every broadcast includes Resend's unsubscribe token and uses Resend suppression handling.
- Production variables: `MARKETING_EMAIL_PROVIDER`, `MARKETING_EMAIL_API_KEY`, `MARKETING_EMAIL_FROM`, and `MARKETING_EMAIL_REPLY_TO`.

Do not use the root Workspace mailbox as `MARKETING_EMAIL_FROM`. The server rejects that configuration.
