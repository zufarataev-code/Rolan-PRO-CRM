// Prints a new pair of VAPID keys for phone pushes (docs/WEB_PUSH.md).
// Run on the server once: node scripts/generate-vapid-keys.mjs
// Put the two lines into the server's .env and restart the CRM. Never commit them.
import { createECDH } from "node:crypto";

const b64url = (buffer) => buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const ecdh = createECDH("prime256v1");
ecdh.generateKeys();
console.log(`VAPID_PUBLIC_KEY="${b64url(ecdh.getPublicKey())}"`);
console.log(`VAPID_PRIVATE_KEY="${b64url(ecdh.getPrivateKey())}"`);
