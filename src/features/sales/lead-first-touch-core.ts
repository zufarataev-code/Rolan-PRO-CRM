export const LEAD_WELCOME_SMS_ACTION = "lead.welcome_sms";
export const LEAD_SMS_REPLY_ACTION = "lead.sms_reply";
export const COMPANY_PHONE_DISPLAY = "(424) 325-0512";
const TIME_ZONE = "America/Los_Angeles";

export type LeadFirstTouchChannel = "meta_lead_ads" | "facebook_messenger" | "website";

/** Office hours in Los Angeles: Monday–Saturday, 08:00–18:00. */
export function isLeadBusinessHours(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      weekday: "short",
      hour: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return parts.weekday !== "Sun" && Number(parts.hour) >= 8 && Number(parts.hour) < 18;
}

function nextBusinessDayLabel(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short", hour: "numeric", hourCycle: "h23" })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour);
  if (parts.weekday === "Sat" && hour >= 18) return "Monday";
  if (parts.weekday === "Sun") return "Monday";
  return hour < 8 ? "today" : "tomorrow";
}

export function buildLeadWelcomeSms(input: {
  name: string;
  channel: LeadFirstTouchChannel;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const first = input.name.trim().split(/\s+/)[0] || "there";
  const greeting = `Hi ${first}, thank you for your interest in Rolan PRO window film!`;
  const optOut = "Reply STOP to opt out.";

  if (input.channel === "facebook_messenger") {
    return `${greeting} We received your request and will text your visit details from this number. Questions? Call ${COMPANY_PHONE_DISPLAY}. ${optOut}`;
  }
  if (isLeadBusinessHours(now)) {
    return `${greeting} Our manager will call you shortly from ${COMPANY_PHONE_DISPLAY}. Prefer a specific time? Just reply here. ${optOut}`;
  }
  const day = nextBusinessDayLabel(now);
  return `${greeting} Our office is closed right now, but your request is saved. What time ${day} is best for our manager to give you a quick call? Just reply with a time. ${optOut}`;
}
