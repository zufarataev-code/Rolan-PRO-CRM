"use client";

import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";

/** Browser side of Face ID / Touch ID sign-in, shared by the login card and the device list. */

const OFFER_KEY = "rolanpro:passkey-offer";

export type PasskeyUser = {
  must_change_password?: boolean;
  roles?: string[];
};

type ApiPayload<T> = {
  data?: T | null;
  errors?: Array<{ code?: string; message?: string }>;
};

export class PasskeyClientError extends Error {
  constructor(
    message: string,
    public readonly cancelled = false,
  ) {
    super(message);
  }
}

async function post<T>(path: string, body?: unknown) {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new PasskeyClientError("Сервер недоступен. Попробуйте ещё раз.");
  }
  const payload = (await response.json().catch(() => ({}))) as ApiPayload<T>;
  if (!response.ok || !payload.data) {
    throw new PasskeyClientError(payload.errors?.[0]?.message || "Не удалось выполнить запрос.");
  }
  return payload.data;
}

function isCancellation(error: unknown) {
  const name = (error as { name?: string } | null)?.name;
  return name === "NotAllowedError" || name === "AbortError";
}

export function passkeysSupported() {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
}

/** True when this device itself can confirm with face, finger or its screen lock. */
export async function devicePasskeyAvailable() {
  if (!passkeysSupported()) {
    return false;
  }
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function readPasskeyOffer(): "enabled" | "never" | null {
  try {
    const value = window.localStorage.getItem(OFFER_KEY);
    return value === "enabled" || value === "never" ? value : null;
  } catch {
    return null;
  }
}

export function writePasskeyOffer(value: "enabled" | "never" | null) {
  try {
    if (value) {
      window.localStorage.setItem(OFFER_KEY, value);
    } else {
      window.localStorage.removeItem(OFFER_KEY);
    }
  } catch {
    // The offer flag is a convenience only.
  }
}

export async function signInWithPasskey() {
  const { options } = await post<{ options: Parameters<typeof startAuthentication>[0]["optionsJSON"] }>(
    "/api/v1/auth/passkey-login/options",
  );

  let assertion: Awaited<ReturnType<typeof startAuthentication>>;
  try {
    assertion = await startAuthentication({ optionsJSON: options });
  } catch (error) {
    if (isCancellation(error)) {
      throw new PasskeyClientError(
        "Вход по Face ID не выполнен. Если на этом устройстве он ещё не включён, войдите по паролю — предложим включить.",
        true,
      );
    }
    throw new PasskeyClientError("Не удалось войти по Face ID на этом устройстве. Войдите по паролю.");
  }

  const { user } = await post<{ user: PasskeyUser }>("/api/v1/auth/passkey-login/verify", { response: assertion });
  writePasskeyOffer("enabled");
  return user;
}

export async function enablePasskeyOnThisDevice() {
  const { options } = await post<{ options: Parameters<typeof startRegistration>[0]["optionsJSON"] }>(
    "/api/v1/auth/passkeys/register-options",
  );

  let attestation: Awaited<ReturnType<typeof startRegistration>>;
  try {
    attestation = await startRegistration({ optionsJSON: options });
  } catch (error) {
    if ((error as { name?: string } | null)?.name === "InvalidStateError") {
      writePasskeyOffer("enabled");
      throw new PasskeyClientError("На этом устройстве Face ID уже включён.");
    }
    if (isCancellation(error)) {
      throw new PasskeyClientError("Включение отменено.", true);
    }
    throw new PasskeyClientError("Не удалось включить Face ID на этом устройстве.");
  }

  const { passkey } = await post<{ passkey: { passkey_id: string; device_name: string } }>(
    "/api/v1/auth/passkeys/register-verify",
    { response: attestation },
  );
  writePasskeyOffer("enabled");
  return passkey;
}
