import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Encryption for bank secrets (the owner's Plaid secret and the per-bank
 * access tokens). AES-256-GCM, same envelope as the Gmail tokens.
 *
 * Key: BANK_TOKEN_ENCRYPTION_KEY (base64, 32 bytes) when set; otherwise a key
 * derived from AUTH_SECRET with HKDF under a bank-only label, so no server
 * configuration is needed. Rotating AUTH_SECRET without the dedicated key means
 * re-entering the Plaid keys and reconnecting the banks.
 */
function bankKey() {
  const dedicated = process.env.BANK_TOKEN_ENCRYPTION_KEY?.trim();
  if (dedicated) {
    const key = Buffer.from(dedicated, "base64");
    if (key.length !== 32) throw new Error("BANK_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
    return key;
  }
  const authSecret = process.env.AUTH_SECRET?.trim();
  if (!authSecret || authSecret.length < 32) {
    throw new Error("Bank secrets need AUTH_SECRET (32+ characters) or BANK_TOKEN_ENCRYPTION_KEY.");
  }
  return Buffer.from(hkdfSync("sha256", authSecret, "rolanpro-bank-feeds", "bank-secrets-v1", 32));
}

export function encryptBankSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", bankKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptBankSecret(value: string) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Invalid encrypted bank secret.");
  const decipher = createDecipheriv("aes-256-gcm", bankKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
