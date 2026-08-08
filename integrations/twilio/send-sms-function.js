/**
 * RolanPRO CRM -> Twilio SMS endpoint
 *
 * Deploy this file as a Twilio Function.
 *
 * Required Twilio Function environment variable:
 *   TWILIO_FROM_NUMBER = +1XXXXXXXXXX
 *
 * CRM sends JSON:
 *   { "to": "+1XXXXXXXXXX", "body": "Message text" }
 */
exports.handler = async function(context, event, callback) {
  const response = new Twilio.Response();

  response.appendHeader("Access-Control-Allow-Origin", "*");
  response.appendHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.appendHeader("Access-Control-Allow-Headers", "Content-Type");
  response.appendHeader("Content-Type", "application/json");

  const method = event.httpMethod || event.request?.method || "";
  if (method === "OPTIONS") {
    response.setBody({ ok: true });
    return callback(null, response);
  }

  try {
    const to = String(event.to || "").trim();
    const body = String(event.body || event.message || "").trim();
    const from = String(event.from || context.TWILIO_FROM_NUMBER || "").trim();

    if (!from) throw new Error("Missing TWILIO_FROM_NUMBER");
    if (!to || !/^\+\d{10,15}$/.test(to)) throw new Error("Invalid phone number");
    if (!body) throw new Error("Missing SMS body");
    if (body.length > 1500) throw new Error("SMS body is too long");

    const message = await context.getTwilioClient().messages.create({
      to,
      from,
      body,
    });

    response.setBody({
      ok: true,
      sid: message.sid,
      status: message.status,
    });
    return callback(null, response);
  } catch (err) {
    response.setStatusCode(400);
    response.setBody({
      ok: false,
      error: err.message || String(err),
    });
    return callback(null, response);
  }
};
