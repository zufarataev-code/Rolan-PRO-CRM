import { createHash } from "node:crypto";

export function normalizeEmail(value: string | null | undefined) {
  if (!value) return null;

  const compact = value.toLowerCase().replace(/\s+/g, "");
  const at = compact.lastIndexOf("@");
  if (at <= 0 || at === compact.length - 1) return null;

  let local = compact.slice(0, at);
  const domain = compact.slice(at + 1);
  if (!domain.includes(".")) return null;

  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.split("+", 1)[0].replace(/\./g, "");
  }

  if (!local) return null;
  return `${local}@${domain}`;
}

export function normalizePhoneE164(value: string | null | undefined, defaultCountryCode = "1") {
  if (!value) return null;

  const trimmed = value.trim();
  const rawDigits = trimmed.replace(/\D/g, "");
  if (!rawDigits) return null;

  let digits = rawDigits;
  if (trimmed.startsWith("00") && digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (!trimmed.startsWith("+")) {
    const defaultCode = defaultCountryCode.replace(/\D/g, "");
    if (digits.length === 10 && defaultCode) {
      digits = `${defaultCode}${digits}`;
    }
  }

  if (digits.length < 7 || digits.length > 15) return null;
  return `+${digits}`;
}

export function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function buildHashedUserIdentifiers(
  email: string | null | undefined,
  phone: string | null | undefined,
  defaultCountryCode = "1",
) {
  const identifiers: Array<{ emailAddress?: string; phoneNumber?: string }> = [];
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhoneE164(phone, defaultCountryCode);

  if (normalizedEmail) identifiers.push({ emailAddress: sha256Hex(normalizedEmail) });
  if (normalizedPhone) identifiers.push({ phoneNumber: sha256Hex(normalizedPhone) });
  return identifiers;
}

export function identifierVersion(
  email: string | null | undefined,
  phone: string | null | undefined,
  defaultCountryCode = "1",
) {
  const normalizedEmail = normalizeEmail(email) ?? "";
  const normalizedPhone = normalizePhoneE164(phone, defaultCountryCode) ?? "";
  return sha256Hex(`${normalizedEmail}|${normalizedPhone}`);
}
