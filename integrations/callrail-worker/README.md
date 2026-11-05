# CallRail ingress relay

The dedicated Cloudflare Worker `rolanpro-callrail-ingress` handles only
`https://callrail.rolan-pro.com/integrations/callrail` and forwards POST bytes and the
CallRail Signature to the existing CRM receiver. CRM still verifies HMAC and
company scope; no caller data, cookies, credentials or payload logs are stored
by this Worker. The fixed destination cannot be supplied by a request.

The direct provider webhook showed a failure and no matching CRM ingress. This
relay offers a branded HTTPS endpoint; it does not establish the original
network failure cause or guarantee CallRail delivery.

Deploy from reviewed, merged CRM main. Use the existing TypeScript compiler to
transpile `worker.ts` to an ES2022 module (no dependencies), then upload that
module through Cloudflare with `main_module: worker.js`, compatibility date
`2026-11-04` (already accepted by the deployed service), observability disabled
and no bindings. The RolanPro account is
`9cadf1ac8359ba55913a64258f50e923`, zone
`34a7aa17a8f41522edbff0a3a696c64c`. Use
`rolan-pro.com/integrations/callrail*` only as a compatibility route. The Worker
rejects all other paths and HTTP; query strings never cross to CRM. Bind the
Worker's **Custom Domain** `callrail.rolan-pro.com` directly to this service and
use that hostname in CallRail. First verify no existing record uses this exact
DNS name; leave unrelated/wildcard DNS records unchanged. It must not fall
through to WordPress. Preserve
the Messenger Worker, unrelated site routes and account permissions.

Non-browser POSTs can be blocked by Browser Integrity Check (1010). Keep the
configuration exception limited to `POST /integrations/callrail` on these two
hostnames, with `action: set_config`, `action_parameters: { bic: false }`. CRM
HMAC/company authentication remains required; do not disable zone security.
Use the `http_config_settings` phase with this literal expression:

```text
http.request.method eq "POST" and http.request.uri.path eq "/integrations/callrail" and http.host in {"rolan-pro.com" "callrail.rolan-pro.com"}
```

Before changing the provider URL, verify unsigned POST is 401 and a correctly
signed incomplete payload containing the configured `company_id` and
`direction: "inbound"` is CRM 400 `invalid_call`, with no created record. A signed
`{}` instead returns 403 `wrong_company`, because company scope is checked first. Then
configure only JSON Post-Call and verify a genuine call appears in CRM.
Use the exact path without a trailing slash. A failed
upstream request returns 502; CRM errors retain their status for provider retry.

Rollback: restore the prior direct Post-Call URL
`https://rolanpro-crm.143-110-136-211.sslip.io/api/webhooks/callrail` (this may
reproduce the original delivery failure), unbind only the
dedicated Worker custom domain, and remove only this compatibility route and
its scoped BIC exception. No CRM data/schema/key change is required. Do not replay a
constructed caller payload; use a provider-supported resend of a genuine call.


Verified rollout observations (2026-11-04): signed probes reached the apex
Worker, but genuine CallRail POSTs received WordPress 404s without CRM ingress.
A query-string routing gap and a BIC block were reproduced separately and fixed;
neither alone proved genuine delivery. The dedicated hostname removes the
WordPress fallback. Confirm a genuine call before claiming delivery.

If a genuine delivery fails, check the actual POST in Cloudflare Security Events
and the CRM's safe ingress-status diagnostic before changing configuration.
Signed probes and an Active badge alone do not establish provider delivery.
