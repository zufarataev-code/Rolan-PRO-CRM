# CallRail ingress relay

The dedicated Cloudflare Worker `rolanpro-callrail-ingress` handles only
`https://rolan-pro.com/integrations/callrail` and forwards POST bytes and the
CallRail Signature to the existing CRM receiver. CRM still verifies HMAC and
company scope; no caller data, cookies, credentials or payload logs are stored
by this Worker. The fixed destination cannot be supplied by a request.

The direct provider webhook showed a failure and no matching CRM ingress. This
relay offers a branded HTTPS endpoint; it does not establish the original
network failure cause or guarantee CallRail delivery.

Deploy from reviewed, merged CRM main. Use the existing TypeScript compiler to
transpile `worker.ts` to an ES2022 module (no dependencies), then upload that
module through Cloudflare with `main_module: worker.js`, compatibility date
`2026-11-04`, observability disabled and no bindings. The RolanPro account is
`9cadf1ac8359ba55913a64258f50e923`, zone
`34a7aa17a8f41522edbff0a3a696c64c`. Add only the exact route
`https://rolan-pro.com/integrations/callrail`; do not modify the Messenger Worker,
site routes, WAF, DNS or account permissions.

Before changing the provider URL, verify unsigned POST is 401 and a correctly
signed incomplete payload containing the configured `company_id` and
`direction: "inbound"` is CRM 400 `invalid_call`, with no created record. A signed
`{}` instead returns 403 `wrong_company`, because company scope is checked first. Then
configure only Post-Call and verify a genuine call appears in CRM. A failed
upstream request returns 502; CRM errors retain their status for provider retry.

Rollback: restore CallRail's prior direct Post-Call URL and remove this exact
Worker route. No CRM data/schema/key change is required. Do not replay a
constructed caller payload; use a provider-supported resend of a genuine call.
