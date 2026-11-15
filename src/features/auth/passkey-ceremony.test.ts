import assert from "node:assert/strict";
import test from "node:test";

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";

import { SoftAuthenticator } from "./testing/soft-authenticator";

/**
 * Runs the same library calls as passkeys.ts against a software
 * authenticator, with the same strictness (user verification required,
 * exact origin and relying party). No database involved.
 */

const ORIGIN = "https://crm.example.com";
const RP_ID = "crm.example.com";
const USER_ID = "3f1e6f0c-0d7e-4d1b-9c1e-2a7c9b6f4e11";

async function enroll() {
  const device = new SoftAuthenticator(ORIGIN, RP_ID);
  const options = await generateRegistrationOptions({
    rpName: "ROLANPRO CRM",
    rpID: RP_ID,
    userName: "owner@example.com",
    userID: new TextEncoder().encode(USER_ID),
    attestationType: "none",
    authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "required", userVerification: "required" },
  });
  const verification = await verifyRegistrationResponse({
    response: device.register(options),
    expectedChallenge: options.challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    requireUserVerification: true,
  });
  assert.equal(verification.verified, true);
  assert.ok(verification.registrationInfo);
  return { device, credential: verification.registrationInfo.credential };
}

test("a device enrolls and then signs in; the user handle carries the user id", async () => {
  const { device, credential } = await enroll();
  assert.equal(credential.id, device.id);

  const options = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: "required", allowCredentials: [] });
  const assertion = device.authenticate(options);
  assert.equal(Buffer.from(assertion.response.userHandle ?? "", "base64url").toString("utf8"), USER_ID);

  const verification = await verifyAuthenticationResponse({
    response: assertion,
    expectedChallenge: options.challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    requireUserVerification: true,
    credential,
  });
  assert.equal(verification.verified, true);
  assert.equal(verification.authenticationInfo.newCounter, device.signCount);
});

test("sign-in is refused for another origin, a stale challenge, no user verification, a replayed counter or another key", async () => {
  const { device, credential } = await enroll();
  const options = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: "required", allowCredentials: [] });
  const verify = (response: ReturnType<SoftAuthenticator["authenticate"]>, overrides: Record<string, unknown> = {}) =>
    verifyAuthenticationResponse({
      response,
      expectedChallenge: options.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
      credential,
      ...overrides,
    });

  await assert.rejects(verify(device.authenticate(options, { origin: "https://evil.example.com" })));
  await assert.rejects(verify(device.authenticate({ challenge: "c29tZS1vdGhlci1jaGFsbGVuZ2U" })));
  await assert.rejects(verify(device.authenticate(options, { userVerified: false })));
  await assert.rejects(verify(device.authenticate(options), { expectedRPID: "other.example.com" }));

  // The stored counter is ahead of what the device reports: a cloned key.
  await assert.rejects(verify(device.authenticate(options), { credential: { ...credential, counter: 50 } }));

  // A different device cannot sign for this credential.
  const stranger = (await enroll()).device;
  const forged = { ...stranger.authenticate(options), id: device.id, rawId: device.id };
  const forgedResult = await verify(forged).catch(() => ({ verified: false }));
  assert.equal(forgedResult.verified, false);
});

test("enrolling is refused for another origin or a stale challenge", async () => {
  const device = new SoftAuthenticator(ORIGIN, RP_ID);
  const options = await generateRegistrationOptions({
    rpName: "ROLANPRO CRM",
    rpID: RP_ID,
    userName: "owner@example.com",
    userID: new TextEncoder().encode(USER_ID),
    attestationType: "none",
  });
  const base = { expectedOrigin: ORIGIN, expectedRPID: RP_ID, requireUserVerification: true };

  await assert.rejects(
    verifyRegistrationResponse({ ...base, response: device.register(options, { origin: "https://evil.example.com" }), expectedChallenge: options.challenge }),
  );
  await assert.rejects(
    verifyRegistrationResponse({ ...base, response: device.register(options), expectedChallenge: "c29tZS1vdGhlci1jaGFsbGVuZ2U" }),
  );
});
