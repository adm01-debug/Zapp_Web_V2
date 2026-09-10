/**
 * Authenticated client for the pinned-IP preview egress proxy.
 *
 * A DNS preflight followed by a normal `fetch(hostname)` is vulnerable to DNS
 * rebinding because the runtime resolves the hostname again. The proxy owns
 * resolution and the socket connection; this client never fetches user URLs.
 */

const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_BASE64_BYTES = Math.ceil(MAX_RESPONSE_BYTES / 3) * 4;

export interface SecureEgressConfig {
  endpoint: string;
  sharedSecret: string;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

interface EgressPayload {
  url: string;
  status: number;
  content_type: string;
  body_base64: string;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function nonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sign(
  secret: string,
  timestamp: string,
  requestNonce: string,
  body: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}\n${requestNonce}\n${body}`),
  );
  return toHex(new Uint8Array(signed));
}

function decodeBody(value: string): Uint8Array | null {
  if (value.length > MAX_BASE64_BYTES) return null;
  try {
    const decoded = atob(value);
    if (decoded.length > MAX_RESPONSE_BYTES) return null;
    return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function validProxyEndpoint(value: string): string | null {
  try {
    const endpoint = new URL(value);
    if (
      endpoint.protocol !== "https:" || endpoint.username !== "" ||
      endpoint.password !== "" || endpoint.port !== ""
    ) {
      return null;
    }
    return endpoint.toString();
  } catch {
    return null;
  }
}

export function getSecureEgressConfig(): SecureEgressConfig | null {
  const endpoint = validProxyEndpoint(
    Deno.env.get("PREVIEW_EGRESS_PROXY_URL") ?? "",
  );
  const sharedSecret = Deno.env.get("PREVIEW_EGRESS_SHARED_SECRET") ?? "";
  return endpoint && sharedSecret.length >= 32 ? { endpoint, sharedSecret } : null;
}

/**
 * Requests a bounded HTML document through the proxy. Any configuration,
 * authentication, protocol, JSON or payload failure is intentionally a miss.
 */
export async function fetchPreviewViaSecureEgress(
  rawUrl: string,
  config: SecureEgressConfig | null = getSecureEgressConfig(),
  options: {
    fetcher?: FetchLike;
    signal?: AbortSignal;
    now?: () => number;
    nonce?: () => string;
  } = {},
): Promise<{ url: URL; response: Response } | null> {
  if (!config || rawUrl.length === 0 || rawUrl.length > 2048) return null;
  const endpoint = validProxyEndpoint(config.endpoint);
  if (!endpoint || config.sharedSecret.length < 32) return null;

  const body = JSON.stringify({ url: rawUrl });
  const timestamp = Math.floor((options.now?.() ?? Date.now()) / 1000).toString();
  const requestNonce = options.nonce?.() ?? nonce();
  if (requestNonce.length < 16 || requestNonce.length > 128) return null;
  const signature = await sign(config.sharedSecret, timestamp, requestNonce, body);
  const fetcher = options.fetcher ?? ((input, init) => fetch(input, init));

  let proxyResponse: Response;
  try {
    proxyResponse = await fetcher(endpoint, {
      method: "POST",
      signal: options.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Zapp-Egress-Timestamp": timestamp,
        "X-Zapp-Egress-Nonce": requestNonce,
        "X-Zapp-Egress-Signature": signature,
      },
      body,
    });
  } catch {
    return null;
  }
  if (!proxyResponse.ok) return null;

  let payload: EgressPayload;
  try {
    payload = await proxyResponse.json() as EgressPayload;
  } catch {
    return null;
  }
  if (
    typeof payload.url !== "string" || typeof payload.status !== "number" ||
    !Number.isInteger(payload.status) || payload.status < 200 ||
    payload.status > 599 || typeof payload.content_type !== "string" ||
    typeof payload.body_base64 !== "string"
  ) {
    return null;
  }
  let finalUrl: URL;
  try {
    finalUrl = new URL(payload.url);
    if (finalUrl.protocol !== "http:" && finalUrl.protocol !== "https:") {
      return null;
    }
  } catch {
    return null;
  }
  const binaryBody = decodeBody(payload.body_base64);
  if (!binaryBody) return null;
	// A fresh typed array owns an ArrayBuffer (rather than the generic
	// ArrayBufferLike returned by some Deno lib definitions).
	const responseBody = Uint8Array.from(binaryBody).buffer;
  return {
    url: finalUrl,
    response: new Response(responseBody, {
      status: payload.status,
      headers: { "content-type": payload.content_type },
    }),
  };
}
