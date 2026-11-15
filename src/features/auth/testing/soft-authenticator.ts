import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";

import { isoCBOR } from "@simplewebauthn/server/helpers";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";

/**
 * TEST ONLY. A software stand-in for a Face ID / Touch ID authenticator
 * (ES256, "none" attestation, discoverable key, user verification) so the
 * WebAuthn ceremony can be exercised without a browser or a device.
 */

const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;
const FLAG_ATTESTED_DATA = 0x40;

function sha256(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest();
}

function uint32(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value);
  return buffer;
}

export class SoftAuthenticator {
  readonly credentialId = randomBytes(32);
  private readonly privateKey: KeyObject;
  private readonly cosePublicKey: Uint8Array;
  private userHandle = "";
  signCount = 0;

  constructor(
    private readonly origin: string,
    private readonly rpId: string,
  ) {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.privateKey = privateKey;
    const jwk = publicKey.export({ format: "jwk" });
    // COSE_Key for ES256: kty EC2 (2), alg -7, crv P-256 (1), x, y.
    this.cosePublicKey = isoCBOR.encode(
      new Map<number, number | Uint8Array>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, new Uint8Array(Buffer.from(jwk.x as string, "base64url"))],
        [-3, new Uint8Array(Buffer.from(jwk.y as string, "base64url"))],
      ]),
    );
  }

  get id() {
    return this.credentialId.toString("base64url");
  }

  private clientData(type: "webauthn.create" | "webauthn.get", challenge: string, origin = this.origin) {
    return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  }

  register(options: { challenge: string; user: { id: string } }, overrides: { origin?: string } = {}): RegistrationResponseJSON {
    this.userHandle = options.user.id;
    this.signCount += 1;
    const length = Buffer.alloc(2);
    length.writeUInt16BE(this.credentialId.length);
    const authData = Buffer.concat([
      sha256(this.rpId),
      Buffer.from([FLAG_USER_PRESENT | FLAG_USER_VERIFIED | FLAG_ATTESTED_DATA]),
      uint32(this.signCount),
      Buffer.alloc(16),
      length,
      this.credentialId,
      Buffer.from(this.cosePublicKey),
    ]);
    const attestationObject = isoCBOR.encode(
      new Map<string, string | Map<string, never> | Uint8Array>([
        ["fmt", "none"],
        ["attStmt", new Map<string, never>()],
        ["authData", new Uint8Array(authData)],
      ]),
    );

    return {
      id: this.id,
      rawId: this.id,
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      response: {
        clientDataJSON: this.clientData("webauthn.create", options.challenge, overrides.origin).toString("base64url"),
        attestationObject: Buffer.from(attestationObject).toString("base64url"),
        transports: ["internal"],
      },
    };
  }

  authenticate(
    options: { challenge: string },
    overrides: { origin?: string; signCount?: number; userVerified?: boolean } = {},
  ): AuthenticationResponseJSON {
    if (overrides.signCount === undefined) {
      this.signCount += 1;
    }
    const flags = FLAG_USER_PRESENT | (overrides.userVerified === false ? 0 : FLAG_USER_VERIFIED);
    const authData = Buffer.concat([sha256(this.rpId), Buffer.from([flags]), uint32(overrides.signCount ?? this.signCount)]);
    const clientDataJSON = this.clientData("webauthn.get", options.challenge, overrides.origin);
    const signature = sign("sha256", Buffer.concat([authData, sha256(clientDataJSON)]), this.privateKey);

    return {
      id: this.id,
      rawId: this.id,
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      response: {
        clientDataJSON: clientDataJSON.toString("base64url"),
        authenticatorData: authData.toString("base64url"),
        signature: signature.toString("base64url"),
        userHandle: this.userHandle,
      },
    };
  }
}
