import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const sourcePath = process.argv[2] || "/Users/zufarataev/Downloads/rolanpro-backup-2026-07-31.json";
const outputPath = process.argv[3] || path.resolve("data/legacy-crm-empty.json");
const source = JSON.parse(await readFile(sourcePath, "utf8"));

const emptyCollections = [
  "calls",
  "clients",
  "companies",
  "contacts",
  "geocache",
  "inventory",
  "manualReview",
  "messages",
  "notifications",
  "opex",
  "orders",
  "properties",
  "proposals",
  "reviews",
  "sales",
  "smsLog",
  "tasks",
];

for (const key of emptyCollections) {
  source[key] = Array.isArray(source[key]) ? [] : {};
}

const baseUser = {
  active: true,
  commissionPct: 0,
  hourlyRate: 0,
  lang: "ru",
  payConfig: {},
  phone: "",
  pin: "",
  telegramChatId: "",
  title: "",
};

source.users = [
  { ...baseUser, id: "u_o1", name: "Zufar", role: "owner", title: "Owner" },
  { ...baseUser, id: "u_m1", name: "Danil", role: "manager", title: "Manager" },
  { ...baseUser, id: "u_z1", name: "Zufar Ataev", role: "measurer", title: "Measurer" },
  { ...baseUser, id: "u_i1", name: "Zufar Ataev", role: "installer", title: "Installer" },
];

const settings = source.settings || {};
const integrations = settings.integrations || {};
const sms = settings.sms || {};

settings.telegramBotToken = "";
settings.googleMapsApiKey = "";
if (integrations.ai) integrations.ai.apiKey = "";
integrations.googleMapsApiKey = "";
integrations.leadBackendKey = "";
if (settings.ai) settings.ai.apiKey = "";
if (settings.stripe) settings.stripe.secretKey = "";
if (sms.twilio) {
  sms.twilio.authToken = "";
  sms.twilio.apiKeySecret = "";
}
if (sms.textbelt) sms.textbelt.apiKey = "";

source._wizBootstrappedAt ||= new Date(0).toISOString();
source._historicalFollowUpsBlocked = true;

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(source, null, 2)}\n`, { mode: 0o600 });
console.log(`Wrote ${outputPath}`);
