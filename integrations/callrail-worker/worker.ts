const RECEIVER = "https://rolanpro-crm.143-110-136-211.sslip.io/api/webhooks/callrail";
const MAX_BODY = 128 * 1024;

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.protocol !== "https:" || !["rolan-pro.com", "callrail.rolan-pro.com"].includes(url.hostname) || url.pathname !== "/integrations/callrail") return new Response(null, { status: 404 });
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
    const signature = request.headers.get("signature") || "";
    if (!/^[A-Za-z0-9+/]{27}=$/.test(signature)) return new Response(null, { status: 401 });
    if (Number(request.headers.get("content-length")) > MAX_BODY) return new Response(null, { status: 413 });
    const reader = request.body?.getReader();
    if (!reader) return new Response(null, { status: 400 });
    const body = new Uint8Array(MAX_BODY);
    let bytes = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (bytes + value.length > MAX_BODY) { await reader.cancel(); return new Response(null, { status: 413 }); }
        body.set(value, bytes);
        bytes += value.length;
      }
    } catch { return new Response(null, { status: 400 }); }
    try {
      // CRM authenticates the original bytes; no cookies, query values or other headers cross this relay.
      const response = await fetch(RECEIVER, {
        method: "POST", body: body.slice(0, bytes), redirect: "manual", signal: AbortSignal.timeout(15_000),
        headers: { "Content-Type": "application/json", Signature: signature },
      });
      return new Response(response.body, { status: response.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    } catch { return new Response(null, { status: 502 }); }
  },
};
