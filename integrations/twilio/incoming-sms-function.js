/**
 * Twilio inbound SMS -> RolanPRO owner notification
 *
 * Deploy this file as a Twilio Function and set it as the Messaging webhook
 * for your Twilio phone number.
 *
 * Required Twilio Function environment variable:
 *   ROLANPRO_OWNER_PHONE = +1XXXXXXXXXX
 *
 * Optional:
 *   TWILIO_FROM_NUMBER = +1XXXXXXXXXX
 */
exports.handler = async function(context, event, callback) {
  const response = new Twilio.Response();
  response.appendHeader("Content-Type", "text/xml");

  try {
    const ownerPhone = String(context.ROLANPRO_OWNER_PHONE || "").trim();
    const fallbackFrom = String(context.TWILIO_FROM_NUMBER || "").trim();
    const clientPhone = String(event.From || "").trim();
    const twilioNumber = String(event.To || fallbackFrom).trim();
    const text = String(event.Body || "").trim();

    if (!ownerPhone) throw new Error("Missing ROLANPRO_OWNER_PHONE");
    if (!/^\+\d{10,15}$/.test(ownerPhone)) throw new Error("Invalid owner phone");
    if (!/^\+\d{10,15}$/.test(clientPhone)) throw new Error("Invalid client phone");
    if (!/^\+\d{10,15}$/.test(twilioNumber)) throw new Error("Invalid Twilio phone");

    if (ownerPhone !== clientPhone && text) {
      const body = [
        "RolanPRO: входящее SMS от клиента",
        `От: ${clientPhone}`,
        "",
        text.slice(0, 1200),
      ].join("\n");

      await context.getTwilioClient().messages.create({
        to: ownerPhone,
        from: twilioNumber,
        body,
      });
    }
  } catch (err) {
    console.error("RolanPRO incoming SMS error:", err.message || err);
  }

  response.setBody("<Response></Response>");
  return callback(null, response);
};
