// Campaign e-mails. No prices inside — the only goal is a price-list request.
// Placeholders are filled by render().

export type Contact = {
  id: number;
  token: string;
  company: string;
  email: string;
  first_name: string | null;
  city: string | null;
  segment: string | null;
};

export type Env = {
  PUBLIC_URL: string;
  FROM_EMAIL: string;
  REPLY_TO: string;
  OWNER_EMAIL: string;
  COMPANY_PHONE: string;
  ZELLE_TO: string;
};

type Tpl = { kind: string; subject: (c: Contact) => string; html: (c: Contact, env: Env) => string; text: (c: Contact, env: Env) => string };

const greet = (c: Contact) => (c.first_name ? `Hi ${c.first_name},` : "Hi there,");
const priceLink = (c: Contact, env: Env) => `${env.PUBLIC_URL}/price-list?c=${c.token}`;
const unsubLink = (c: Contact, env: Env) => `${env.PUBLIC_URL}/unsubscribe?c=${c.token}`;

function shell(body: string, env: Env, c: Contact, banner = false) {
  return `<!DOCTYPE html><html><body style="margin:0;background:#f1f4f9;font-family:Inter,Arial,sans-serif;color:#1B2A3B">
<div style="max-width:620px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden">
${banner ? `<img src="${env.PUBLIC_URL}/banner.png" alt="RolanPRO — window film by the roll, in LA" style="width:100%;display:block">` : ""}
<div style="padding:26px 30px;font-size:16px;line-height:1.55">${body}</div>
<div style="padding:14px 30px;background:#f7f9fc;font-size:12px;color:#6b7a92">RolanPRO Inc. · Los Angeles, CA · ${env.COMPANY_PHONE}<br>
You're receiving this because ${c.company} is a window tinting business in LA County. <a href="${unsubLink(c, env)}" style="color:#6b7a92">Unsubscribe</a></div>
</div></body></html>`;
}
const btn = (href: string, label: string) =>
  `<p><a href="${href}" style="display:inline-block;background:#3A62AF;color:#fff;text-decoration:none;padding:13px 24px;border-radius:8px;font-weight:700">${label}</a></p>`;
const sig = (env: Env) => `<p>— Zak<br>RolanPRO · Engineered Window Technology<br>${env.COMPANY_PHONE} · rolan-pro.com</p>`;
const sigText = (env: Env) => `— Zak\nRolanPRO · Engineered Window Technology\n${env.COMPANY_PHONE} · rolan-pro.com`;

export const CAMPAIGN: Tpl[] = [
  {
    kind: "campaign1",
    subject: () => "Window film by the roll — now stocked in LA",
    html: (c, env) => shell(`
<p>${greet(c)}</p>
<p>I'm Zak, owner of RolanPRO — we install film across LA every day, and we just opened our warehouse to other shops.</p>
<p>What that means for ${c.company}:</p>
<ul>
<li><b>Rolls in stock in Los Angeles</b> — pick up today, no container waits, no minimums.</li>
<li><b>Full line:</b> nano-ceramic (C80 / C90 / C99), carbon, sputter, dyed, safety 2–12 mil, anti-graffiti, decorative.</li>
<li><b>Dealer pricing</b> that drops with volume — 1 roll, 3 rolls, 10 rolls, three clear tiers.</li>
<li><b>Lifetime warranty</b> on our ceramic line, warranty card with every roll.</li>
</ul>
<p>The price list goes out to shops only, not published. Want it?</p>
${btn(priceLink(c, env), "Send me the dealer price list →")}
<p>Or just reply "PRICES" to this email and I'll send it over today.</p>
${sig(env)}`, env, c, true),
    text: (c, env) => `${greet(c)}

I'm Zak, owner of RolanPRO — we install film across LA every day, and we just opened our warehouse to other shops.

What that means for ${c.company}:
- Rolls in stock in Los Angeles — pick up today, no container waits, no minimums.
- Full line: nano-ceramic (C80 / C90 / C99), carbon, sputter, dyed, safety 2–12 mil, anti-graffiti, decorative.
- Dealer pricing that drops with volume — 1 roll, 3 rolls, 10 rolls, three clear tiers.
- Lifetime warranty on our ceramic line, warranty card with every roll.

The price list goes out to shops only, not published. Want it?
Get it here: ${priceLink(c, env)}
Or just reply "PRICES" and I'll send it over today.

${sigText(env)}
Unsubscribe: ${unsubLink(c, env)}`,
  },
  {
    kind: "campaign2",
    subject: () => "Re: Window film by the roll — one question",
    html: (c, env) => shell(`
<p>${greet(c)}</p>
<p>Quick one — which film do you burn through most: ceramic, carbon or basic dyed?</p>
<p>Asking because our 10-roll dealer tier is built for exactly that roll you reorder every month. Tell me which one and I'll send the price list with that line highlighted.</p>
${btn(priceLink(c, env), "Get the price list →")}
<p>— Zak, RolanPRO</p>`, env, c),
    text: (c, env) => `${greet(c)}

Quick one — which film do you burn through most: ceramic, carbon or basic dyed?

Asking because our 10-roll dealer tier is built for exactly that roll you reorder every month. Tell me which one and I'll send the price list with that line highlighted.

Price list: ${priceLink(c, env)}

— Zak, RolanPRO
Unsubscribe: ${unsubLink(c, env)}`,
  },
  {
    kind: "campaign3",
    subject: (c) => `Free sample roll cut for ${c.company}`,
    html: (c, env) => shell(`
<p>${greet(c)}</p>
<p>Last note from me. If you want to test before you buy — request the price list this week and I'll include a free 5 ft sample of our Ceramic C90 so your installer can judge it on real glass.</p>
${btn(priceLink(c, env), "Send the price list + sample →")}
<p>If film supply isn't your problem right now, no worries — reply "no" and I won't follow up.</p>
<p>— Zak, RolanPRO · ${env.COMPANY_PHONE}</p>`, env, c),
    text: (c, env) => `${greet(c)}

Last note from me. If you want to test before you buy — request the price list this week and I'll include a free 5 ft sample of our Ceramic C90 so your installer can judge it on real glass.

Price list + sample: ${priceLink(c, env)}

If film supply isn't your problem right now, no worries — reply "no" and I won't follow up.

— Zak, RolanPRO · ${env.COMPANY_PHONE}
Unsubscribe: ${unsubLink(c, env)}`,
  },
];

// Days between steps: campaign1 → +3 days → campaign2 → +4 days → campaign3
export const STEP_DELAY_DAYS = [0, 3, 4];

export const PRICE_LIST: Tpl = {
  kind: "pricelist",
  subject: () => "Your RolanPRO dealer price list",
  html: (c, env) => shell(`
<p>${greet(c)}</p>
<p>Here's the dealer price list (PDF attached, also <a href="${env.PUBLIC_URL}/catalog.pdf">online here</a>).</p>
<p>Two things to know: the tier is set by total rolls on one order, any films mixed; and dealer accounts get a reorder portal with invoices and warranty docs in one place.</p>
<p>Want a dealer account opened? Reply with your shop name and the film you reorder most — takes two minutes.</p>
${sig(env)}`, env, c),
  text: (c, env) => `${greet(c)}

Here's the dealer price list (PDF attached, also online: ${env.PUBLIC_URL}/catalog.pdf).

Two things to know: the tier is set by total rolls on one order, any films mixed; and dealer accounts get a reorder portal with invoices and warranty docs in one place.

Want a dealer account opened? Reply with your shop name and the film you reorder most — takes two minutes.

${sigText(env)}`,
};

export function thankYouPage(env: Env) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RolanPRO — price list sent</title></head>
<body style="margin:0;background:#f1f4f9;font-family:Inter,Arial,sans-serif;color:#1B2A3B">
<div style="max-width:620px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden">
<img src="${env.PUBLIC_URL}/banner.png" style="width:100%;display:block" alt="">
<div style="padding:28px 32px;font-size:17px;line-height:1.6">
<h2 style="margin:0 0 10px">Price list is on its way</h2>
<p>Check your inbox in a minute — the dealer price list (PDF) is coming from ${env.REPLY_TO}. If it doesn't show up, look in Promotions/Spam or <a href="${env.PUBLIC_URL}/catalog.pdf">open it here</a>.</p>
<p>Questions or an order? Just reply to that email — I answer fast.</p>
<p>— Zak, RolanPRO · ${env.COMPANY_PHONE}</p>
</div></div></body></html>`;
}

export function unsubscribedPage() {
  return `<!DOCTYPE html><html><body style="font-family:Inter,Arial,sans-serif;color:#1B2A3B;padding:40px;text-align:center">
<h2>You're unsubscribed</h2><p>No more emails from RolanPRO wholesale. Sorry for the noise.</p></body></html>`;
}
