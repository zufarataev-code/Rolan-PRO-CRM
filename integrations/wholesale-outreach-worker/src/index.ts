// rolanpro-wholesale — Cloudflare Worker
// 1) scheduled(): sends the 3-step outreach sequence through Resend with a daily cap + warm-up
// 2) fetch():     /price-list, /unsubscribe, static assets (catalog.pdf, banner.png), /admin/* API
// 3) email():     Cloudflare Email Routing hands inbound replies here → Claude answers as Zak → Resend sends the reply
import PostalMime from "postal-mime";
import { CAMPAIGN, PRICE_LIST, STEP_DELAY_DAYS, thankYouPage, unsubscribedPage, type Contact } from "./templates";
import { systemPrompt, quote, type OrderItem } from "./sales";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  PUBLIC_URL: string;
  FROM_EMAIL: string;
  REPLY_TO: string;
  OWNER_EMAIL: string;
  COMPANY_PHONE: string;
  ZELLE_TO: string;
  DAILY_LIMIT: string;
  WARMUP_DAYS: string;
  WARMUP_START_LIMIT: string;
  ANTHROPIC_MODEL: string;
  RESEND_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  ADMIN_TOKEN: string;
  STRIPE_SECRET_KEY?: string;
}

type Row = Contact & { phone: string | null; status: string; step: number; next_send_at: string | null; website: string | null };

// ---------- helpers ----------
const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);
const addDays = (d: number) => new Date(Date.now() + d * 86400000).toISOString();
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const html = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
const token = () => crypto.randomUUID().replace(/-/g, "").slice(0, 20);
const msgId = (env: Env) => `<${crypto.randomUUID()}@${env.REPLY_TO.split("@")[1]}>`;
const normEmail = (e: string) => e.trim().toLowerCase();
function parseAddress(raw: string) {
  const m = raw.match(/<([^>]+)>/);
  return normEmail(m ? m[1] : raw);
}

// ---------- Resend ----------
type SendOpts = {
  to: string; subject: string; html?: string; text: string;
  inReplyTo?: string | null; references?: string | null;
  attachCatalog?: boolean; messageId?: string;
};
async function resendSend(env: Env, o: SendOpts) {
  const headers: Record<string, string> = {};
  if (o.messageId) headers["Message-ID"] = o.messageId;
  if (o.inReplyTo) { headers["In-Reply-To"] = o.inReplyTo; headers["References"] = o.references || o.inReplyTo; }
  const body: Record<string, unknown> = {
    from: env.FROM_EMAIL, to: [o.to], reply_to: env.REPLY_TO, subject: o.subject, text: o.text, headers,
  };
  if (o.html) body.html = o.html;
  if (o.attachCatalog) body.attachments = [{ path: `${env.PUBLIC_URL}/catalog.pdf`, filename: "RolanPRO_Dealer_Price_List.pdf" }];
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
  return (await r.json()) as { id: string };
}

async function logMessage(env: Env, contactId: number, direction: "in" | "out", kind: string, subject: string, body: string, messageId?: string | null, providerId?: string | null) {
  await env.DB.prepare(
    "INSERT INTO messages (contact_id, direction, kind, subject, body, message_id, provider_id) VALUES (?,?,?,?,?,?,?)",
  ).bind(contactId, direction, kind, subject, body, messageId || null, providerId || null).run();
}

async function notifyOwner(env: Env, subject: string, text: string) {
  try { await resendSend(env, { to: env.OWNER_EMAIL, subject: `[Wholesale bot] ${subject}`, text }); }
  catch (e) { console.error("notifyOwner", e); }
}

// ---------- campaign sending (cron) ----------
async function dailyBudget(env: Env) {
  const first = await env.DB.prepare("SELECT MIN(day) AS d FROM send_log").first<{ d: string | null }>();
  const warmDays = Number(env.WARMUP_DAYS || 7);
  const startLimit = Number(env.WARMUP_START_LIMIT || 15);
  const fullLimit = Number(env.DAILY_LIMIT || 40);
  let limit = fullLimit;
  if (first?.d) {
    const age = Math.floor((Date.now() - Date.parse(first.d)) / 86400000);
    if (age < warmDays) limit = Math.min(fullLimit, Math.round(startLimit + (fullLimit - startLimit) * (age / warmDays)));
  } else limit = startLimit;
  const used = await env.DB.prepare("SELECT sent FROM send_log WHERE day = ?").bind(today()).first<{ sent: number }>();
  return Math.max(0, limit - (used?.sent || 0));
}

async function runCampaign(env: Env) {
  let budget = await dailyBudget(env);
  if (budget <= 0) return { sent: 0, reason: "daily limit reached" };
  const due = await env.DB.prepare(
    `SELECT * FROM contacts WHERE status IN ('new','sequence') AND step < 3 AND (next_send_at IS NULL OR next_send_at <= ?) ORDER BY step DESC, id ASC LIMIT ?`,
  ).bind(now(), budget).all<Row>();
  let sent = 0;
  for (const c of due.results) {
    const tpl = CAMPAIGN[c.step];
    try {
      const mid = msgId(env);
      const r = await resendSend(env, { to: c.email, subject: tpl.subject(c), html: tpl.html(c, env), text: tpl.text(c, env), messageId: mid });
      const nextStep = c.step + 1;
      const next = nextStep < 3 ? addDays(STEP_DELAY_DAYS[nextStep]) : null;
      await env.DB.prepare("UPDATE contacts SET status='sequence', step=?, next_send_at=?, last_event_at=? WHERE id=?")
        .bind(nextStep, next, now(), c.id).run();
      await logMessage(env, c.id, "out", tpl.kind, tpl.subject(c), tpl.text(c, env), mid, r.id);
      sent++;
    } catch (e) {
      console.error("campaign send failed", c.email, e);
      await env.DB.prepare("UPDATE contacts SET status='bounced', notes=COALESCE(notes,'')||? WHERE id=?").bind(` send error: ${String(e).slice(0, 200)};`, c.id).run();
    }
  }
  await env.DB.prepare("INSERT INTO send_log (day, sent) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET sent = sent + excluded.sent").bind(today(), sent).run();
  return { sent, budget };
}

// ---------- price list ----------
async function sendPriceList(env: Env, c: Row, inReplyTo?: string | null) {
  const mid = msgId(env);
  const r = await resendSend(env, {
    to: c.email, subject: PRICE_LIST.subject(c), html: PRICE_LIST.html(c, env), text: PRICE_LIST.text(c, env),
    attachCatalog: true, messageId: mid, inReplyTo,
  });
  await env.DB.prepare("UPDATE contacts SET status=CASE WHEN status IN ('new','sequence') THEN 'requested' ELSE status END, next_send_at=NULL, last_event_at=? WHERE id=?").bind(now(), c.id).run();
  await logMessage(env, c.id, "out", "pricelist", PRICE_LIST.subject(c), PRICE_LIST.text(c, env), mid, r.id);
  await notifyOwner(env, `Прайс запросил: ${c.company}`, `${c.company} (${c.city || ""})\n${c.email} ${c.phone || ""}\nПрайс отправлен автоматически.`);
}

// ---------- Stripe ----------
async function stripeLink(env: Env, c: Row, q: ReturnType<typeof quote>, orderId: number) {
  if (!env.STRIPE_SECRET_KEY) return null;
  const p = new URLSearchParams();
  p.set("mode", "payment");
  p.set("success_url", `${env.PUBLIC_URL}/paid?o=${orderId}`);
  p.set("cancel_url", `${env.PUBLIC_URL}/catalog.pdf`);
  p.set("customer_email", c.email);
  p.set("client_reference_id", String(orderId));
  p.set("metadata[company]", c.company);
  p.set("metadata[tier]", q.tier);
  q.lines.forEach((l, i) => {
    p.set(`line_items[${i}][quantity]`, String(l.qty));
    p.set(`line_items[${i}][price_data][currency]`, "usd");
    p.set(`line_items[${i}][price_data][unit_amount]`, String(Math.round(l.unit_price * 100)));
    p.set(`line_items[${i}][price_data][product_data][name]`, `${l.name} (${l.sku}) — ${q.tier} tier`);
  });
  p.set("automatic_tax[enabled]", "true");
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST", headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" }, body: p,
  });
  if (!r.ok) { console.error("stripe", await r.text()); return null; }
  const s = (await r.json()) as { id: string; url: string };
  await env.DB.prepare("UPDATE orders SET stripe_url=?, stripe_session=?, status='link_sent' WHERE id=?").bind(s.url, s.id, orderId).run();
  return s.url;
}

// ---------- inbound e-mail → bot ----------
type BotOut = { reply: string; action: "reply" | "send_pricelist" | "unsubscribe" | "escalate"; order: { items: OrderItem[]; fulfillment: string | null } | null; owner_note: string; hot: boolean };

async function askClaude(env: Env, system: string, userText: string): Promise<BotOut> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: env.ANTHROPIC_MODEL || "claude-sonnet-4-5", max_tokens: 1200, system, messages: [{ role: "user", content: userText }] }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
  const data = (await r.json()) as { content: Array<{ type: string; text?: string }> };
  const text = data.content.filter((x) => x.type === "text").map((x) => x.text || "").join("").trim();
  const m = text.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : text) as BotOut;
}

function stripQuoted(text: string) {
  const lines = text.split(/\r?\n/);
  const cut = lines.findIndex((l) => /^On .+wrote:$/.test(l.trim()) || /^-----Original Message-----/.test(l) || /^From: .+/.test(l) && lines.indexOf(l) > 3);
  const body = (cut > 0 ? lines.slice(0, cut) : lines).filter((l) => !l.startsWith(">")).join("\n").trim();
  return body.slice(0, 4000);
}

async function handleInbound(env: Env, raw: ReadableStream | ArrayBuffer, fromHeader: string) {
  const parsed = await new PostalMime().parse(raw as ArrayBuffer);
  const from = parseAddress(parsed.from?.address || fromHeader);
  const subject = parsed.subject || "(no subject)";
  const text = stripQuoted(parsed.text || (parsed.html ? parsed.html.replace(/<[^>]+>/g, " ") : "")) || "(empty message)";
  const inMsgId = parsed.messageId || null;

  // auto-replies / bounces: ignore
  const autoHdr = parsed.headers.find((h) => /^(auto-submitted|x-autoreply|x-autorespond)$/i.test(h.key));
  if (autoHdr || /^(mailer-daemon|postmaster|no-?reply)@/i.test(from)) { console.log("skip auto", from); return; }

  let c = await env.DB.prepare("SELECT * FROM contacts WHERE email = ?").bind(from).first<Row>();
  if (!c) {
    // Unknown sender wrote to the wholesale address — create a contact so the bot can still sell
    const name = parsed.from?.name || from.split("@")[0];
    await env.DB.prepare("INSERT INTO contacts (token, company, email, first_name, status, step) VALUES (?,?,?,?,'replied',3)")
      .bind(token(), name, from, null).run();
    c = (await env.DB.prepare("SELECT * FROM contacts WHERE email = ?").bind(from).first<Row>())!;
  }
  await logMessage(env, c.id, "in", "reply", subject, text, inMsgId);
  if (c.status === "unsubscribed") return;

  // Simple intents without the model
  if (/^\s*(stop|unsubscribe|remove me|no thanks|not interested|no)\s*[.!]*\s*$/i.test(text)) {
    await env.DB.prepare("UPDATE contacts SET status='unsubscribed', next_send_at=NULL, last_event_at=? WHERE id=?").bind(now(), c.id).run();
    return;
  }

  const hist = await env.DB.prepare("SELECT direction, kind, subject, body, created_at FROM messages WHERE contact_id=? ORDER BY id ASC LIMIT 30").bind(c.id).all<{ direction: string; kind: string; subject: string; body: string; created_at: string }>();
  const history = hist.results.map((m) => `[${m.created_at}] ${m.direction.toUpperCase()} (${m.kind}) ${m.subject}\n${(m.body || "").slice(0, 1500)}`).join("\n\n");

  let out: BotOut;
  try {
    out = await askClaude(env, systemPrompt({ phone: env.COMPANY_PHONE, publicUrl: env.PUBLIC_URL, zelleTo: env.ZELLE_TO, company: c.company, city: c.city, segment: c.segment, history }),
      `New e-mail from the shop (subject: ${subject}):\n\n${text}\n\nReturn the JSON object.`);
  } catch (e) {
    console.error("claude", e);
    await notifyOwner(env, `Нужен ручной ответ: ${c.company}`, `Бот не смог ответить.\nОт: ${from}\nТема: ${subject}\n\n${text}`);
    return;
  }

  if (out.action === "unsubscribe") {
    await env.DB.prepare("UPDATE contacts SET status='unsubscribed', next_send_at=NULL, last_event_at=? WHERE id=?").bind(now(), c.id).run();
    if (out.reply) await resendSend(env, { to: from, subject: `Re: ${subject}`, text: out.reply, inReplyTo: inMsgId });
    return;
  }

  let replyText = out.reply || "";
  let orderNote = "";
  if (out.order?.items?.length) {
    try {
      const q = quote(out.order.items);
      const ins = await env.DB.prepare("INSERT INTO orders (contact_id, items_json, rolls, tier, subtotal, fulfillment) VALUES (?,?,?,?,?,?) RETURNING id")
        .bind(c.id, JSON.stringify(q.lines), q.rolls, q.tier, q.subtotal, out.order.fulfillment || null).first<{ id: number }>();
      const link = ins ? await stripeLink(env, c, q, ins.id) : null;
      const summary = q.lines.map((l) => `${l.qty} x ${l.name} (${l.sku}) @ $${l.unit_price} = $${l.total}`).join("\n");
      replyText += `\n\nOrder summary (${q.rolls} rolls, ${q.tier} tier):\n${summary}\nSubtotal: $${q.subtotal} + CA sales tax (waived with resale certificate on file)\n` +
        (link ? `Pay by card: ${link}\n` : "") + `Zelle: ${env.ZELLE_TO} (memo: ${c.company})`;
      orderNote = `ЗАКАЗ #${ins?.id}: ${q.rolls} рул., ${q.tier}, $${q.subtotal}${link ? " — Stripe-ссылка отправлена" : " — Stripe не настроен, дали Zelle"}`;
      await env.DB.prepare("UPDATE contacts SET status='customer' WHERE id=?").bind(c.id).run();
    } catch (e) {
      console.error("order", e);
      orderNote = `Бот распознал заказ, но не смог посчитать: ${String(e)}`;
    }
  }

  const mid = msgId(env);
  const r = await resendSend(env, {
    to: from, subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`, text: replyText, inReplyTo: inMsgId, messageId: mid,
    attachCatalog: out.action === "send_pricelist",
  });
  await logMessage(env, c.id, "out", "bot", `Re: ${subject}`, replyText, mid, r.id);
  await env.DB.prepare("UPDATE contacts SET status=CASE WHEN status IN ('new','sequence','requested') THEN 'replied' ELSE status END, next_send_at=NULL, last_event_at=? WHERE id=?").bind(now(), c.id).run();

  if (out.action === "escalate" || out.hot || orderNote) {
    await notifyOwner(env, `${out.hot ? "🔥 " : ""}${c.company}: ${out.action}`,
      `${c.company} (${c.city || ""}) — ${from} ${c.phone || ""}\n\n${orderNote ? orderNote + "\n\n" : ""}Заметка бота: ${out.owner_note || "-"}\n\n--- письмо клиента ---\n${text}\n\n--- ответ бота ---\n${replyText}`);
  }
}

// ---------- admin ----------
function authed(req: Request, env: Env) {
  const h = req.headers.get("authorization") || "";
  return h === `Bearer ${env.ADMIN_TOKEN}`;
}

type ImportRow = { company: string; email: string; first_name?: string; phone?: string; city?: string; segment?: string; website?: string };
async function importContacts(env: Env, rows: ImportRow[]) {
  let added = 0, skipped = 0;
  for (const r of rows) {
    if (!r.email || !r.company || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) { skipped++; continue; }
    const res = await env.DB.prepare(
      "INSERT OR IGNORE INTO contacts (token, company, email, first_name, phone, city, segment, website) VALUES (?,?,?,?,?,?,?,?)",
    ).bind(token(), r.company.trim(), normEmail(r.email), r.first_name || null, r.phone || null, r.city || null, r.segment || null, r.website || null).run();
    if (res.meta.changes) added++; else skipped++;
  }
  return { added, skipped };
}

// ---------- worker ----------
export default {
  async scheduled(_ev: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runCampaign(env).then((r) => console.log("campaign", r)));
  },

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
    const buf = await new Response(message.raw).arrayBuffer();
    ctx.waitUntil(handleInbound(env, buf, message.from).catch((e) => console.error("inbound", e)));
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname;

    if (p === "/price-list" && req.method === "GET") {
      const t = url.searchParams.get("c") || "";
      const c = await env.DB.prepare("SELECT * FROM contacts WHERE token = ?").bind(t).first<Row>();
      if (!c) return html("<p>Link expired. Email " + env.REPLY_TO + " for the price list.</p>", 404);
      await sendPriceList(env, c).catch((e) => console.error("pricelist", e));
      return html(thankYouPage(env));
    }
    if (p === "/unsubscribe") {
      const t = url.searchParams.get("c") || "";
      await env.DB.prepare("UPDATE contacts SET status='unsubscribed', next_send_at=NULL, last_event_at=? WHERE token=?").bind(now(), t).run();
      return html(unsubscribedPage());
    }
    if (p === "/paid") return html("<p style='font-family:sans-serif;padding:40px'>Payment received — thank you. Zak will confirm pick-up/delivery by email.</p>");
    if (p === "/health") return json({ ok: true, time: now() });

    if (p.startsWith("/admin/")) {
      if (!authed(req, env)) return json({ error: "unauthorized" }, 401);
      if (p === "/admin/contacts" && req.method === "POST") return json(await importContacts(env, (await req.json()) as ImportRow[]));
      if (p === "/admin/contacts" && req.method === "GET") {
        const rows = await env.DB.prepare("SELECT id, company, email, city, status, step, next_send_at, last_event_at FROM contacts ORDER BY id").all();
        return json(rows.results);
      }
      if (p === "/admin/stats") {
        const s = await env.DB.prepare("SELECT status, COUNT(*) n FROM contacts GROUP BY status").all();
        const o = await env.DB.prepare("SELECT status, COUNT(*) n, SUM(subtotal) total FROM orders GROUP BY status").all();
        const l = await env.DB.prepare("SELECT * FROM send_log ORDER BY day DESC LIMIT 14").all();
        return json({ contacts: s.results, orders: o.results, send_log: l.results, budget_left_today: await dailyBudget(env) });
      }
      if (p === "/admin/send-now" && req.method === "POST") return json(await runCampaign(env));
      if (p === "/admin/test-email" && req.method === "POST") {
        const { to } = (await req.json()) as { to: string };
        const c: Row = { id: 0, token: "test", company: "Test Tint Shop", email: to, first_name: "Zak", city: "Los Angeles", segment: "Auto", phone: null, status: "new", step: 0, next_send_at: null, website: null };
        const r = await resendSend(env, { to, subject: CAMPAIGN[0].subject(c), html: CAMPAIGN[0].html(c, env), text: CAMPAIGN[0].text(c, env) });
        return json(r);
      }
      if (p === "/admin/messages" && req.method === "GET") {
        const id = url.searchParams.get("contact_id");
        const rows = await env.DB.prepare("SELECT * FROM messages WHERE contact_id=? ORDER BY id").bind(id).all();
        return json(rows.results);
      }
      return json({ error: "not found" }, 404);
    }

    // static assets: /catalog.pdf, /banner.png, /hero-mp35.png
    return env.ASSETS.fetch(req);
  },
};
