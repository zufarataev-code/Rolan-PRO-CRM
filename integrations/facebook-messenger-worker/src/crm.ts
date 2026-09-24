export type CrmEnv = {
  ROLANPRO_CRM_URL: string;
  ROLANPRO_CRM_SHARED_SECRET: string;
};

export class CrmRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CrmRequestError";
  }
}

function toHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function signCrmBody(rawBody: string, timestamp: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${rawBody}`),
  );
  return `sha256=${toHex(signature)}`;
}

export async function postToCrm<T>(env: CrmEnv, path: string, payload: unknown): Promise<T> {
  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await signCrmBody(
    rawBody,
    timestamp,
    env.ROLANPRO_CRM_SHARED_SECRET,
  );
  const baseUrl = env.ROLANPRO_CRM_URL.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-rolanpro-timestamp": timestamp,
      "x-rolanpro-signature": signature,
    },
    body: rawBody,
  });

  let result: {
    data?: T;
    errors?: Array<{ code?: string; message?: string }>;
  } = {};
  try {
    result = await response.json();
  } catch {
    throw new CrmRequestError(response.status, "invalid_crm_response", "CRM returned invalid JSON.");
  }

  if (!response.ok || result.data === undefined || result.data === null) {
    const error = result.errors?.[0];
    throw new CrmRequestError(
      response.status,
      error?.code || `crm_http_${response.status}`,
      error?.message || `CRM request failed with HTTP ${response.status}.`,
    );
  }
  return result.data;
}
