// Tests for the webhook auth SHADOW MODE helpers (feat/webhook-hmac-shadow-mode).
//
// These cover the exact logic each of the 4 webhook handlers
// (evolution-webhook, whatsapp-webhook, gmail-webhook, elevenlabs-webhook)
// calls at the top of their request processing. The core guarantee under
// test is: NONE of these helpers ever throw, and none of them produce a
// value that blocks processing — every scenario below (missing signature,
// invalid signature, missing secret, malformed OIDC token) must resolve
// cleanly, proving a request without a valid signature still gets
// processed by the handler (shadow mode never returns a 401).
//
// Run with: deno test supabase/functions/_shared/__tests__/webhook-auth-shadow.test.ts

import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  logWebhookAuthShadow,
  logElevenLabsAuthShadow,
  logGmailOidcAuthShadow,
  WebhookSecurityService,
  timingSafeEqual,
} from "../hmac-validation.ts";

// ---------------------------------------------------------------------------
// evolution-webhook / whatsapp-webhook (generic HMAC-over-body via
// logWebhookAuthShadow, used with x-evolution-signature / x-hub-signature-256)
// ---------------------------------------------------------------------------

Deno.test("logWebhookAuthShadow: no signature header -> never throws, reports missing, still resolves (proves shadow mode does not block)", async () => {
  const headers = new Headers();
  const result = await logWebhookAuthShadow("evolution-webhook", headers, '{"event":"test"}', "some-secret");
  assertEquals(result.signaturePresent, false);
  assertEquals(result.signatureValid, false);
  assertEquals(result.reason, "missing_signature");
});

Deno.test("logWebhookAuthShadow: signature present but no secret configured -> never throws, reports missing_secret", async () => {
  const headers = new Headers({ "x-evolution-signature": "sha256=deadbeef" });
  const result = await logWebhookAuthShadow("evolution-webhook", headers, '{"event":"test"}', undefined);
  assertEquals(result.signaturePresent, true);
  assertEquals(result.signatureValid, false);
  assertEquals(result.reason, "missing_secret");
});

Deno.test("logWebhookAuthShadow: invalid signature -> never throws, reports invalid (request would still be processed by caller)", async () => {
  const headers = new Headers({ "x-evolution-signature": "sha256=notarealsignature" });
  const result = await logWebhookAuthShadow("evolution-webhook", headers, '{"event":"test"}', "the-real-secret");
  assertEquals(result.signaturePresent, true);
  assertEquals(result.signatureValid, false);
  assertEquals(result.reason, "invalid_signature");
});

Deno.test("logWebhookAuthShadow: valid signature -> reports valid", async () => {
  const payload = '{"event":"messages.upsert"}';
  const secret = "shared-secret-abc";
  const security = new WebhookSecurityService(secret);
  const signature = await security.signPayload(payload);

  const headers = new Headers({ "x-evolution-signature": signature });
  const result = await logWebhookAuthShadow("evolution-webhook", headers, payload, secret);
  assertEquals(result.signaturePresent, true);
  assertEquals(result.signatureValid, true);
  assertEquals(result.reason, "valid");
});

Deno.test("logWebhookAuthShadow: whatsapp-style x-hub-signature-256, missing -> proves whatsapp-webhook is not blocked either", async () => {
  const headers = new Headers();
  const result = await logWebhookAuthShadow("whatsapp-webhook", headers, "{}", "app-secret");
  assertEquals(result.signaturePresent, false);
  assertEquals(result.reason, "missing_signature");
});

Deno.test("logWebhookAuthShadow: whatsapp-style x-hub-signature-256 valid", async () => {
  const payload = '{"object":"whatsapp_business_account"}';
  const secret = "meta-app-secret";
  const security = new WebhookSecurityService(secret);
  const signature = await security.signPayload(payload);

  const headers = new Headers({ "x-hub-signature-256": signature });
  const result = await logWebhookAuthShadow("whatsapp-webhook", headers, payload, secret);
  assertEquals(result.signatureValid, true);
});

// ---------------------------------------------------------------------------
// evolution-webhook legacy x-webhook-secret header (raw shared-secret, not
// an HMAC-of-body signature) — exercised via the exported timingSafeEqual
// used directly in evolution-webhook/index.ts for this secondary check.
// ---------------------------------------------------------------------------

Deno.test("timingSafeEqual: legacy x-webhook-secret comparison — equal secrets", () => {
  assert(timingSafeEqual("my-legacy-secret", "my-legacy-secret"));
});

Deno.test("timingSafeEqual: legacy x-webhook-secret comparison — different secrets, never throws", () => {
  assertEquals(timingSafeEqual("my-legacy-secret", "wrong-secret"), false);
});

Deno.test("timingSafeEqual: legacy x-webhook-secret comparison — different lengths, never throws", () => {
  assertEquals(timingSafeEqual("short", "a-much-longer-secret-value"), false);
});

// ---------------------------------------------------------------------------
// elevenlabs-webhook (t=<ts>,v0=<hex> format)
// ---------------------------------------------------------------------------

Deno.test("logElevenLabsAuthShadow: no signature header -> never throws, reports missing (proves elevenlabs-webhook is not blocked)", async () => {
  const headers = new Headers();
  const result = await logElevenLabsAuthShadow(headers, '{"type":"tts.completed"}', "el-secret");
  assertEquals(result.signaturePresent, false);
  assertEquals(result.reason, "missing_signature");
});

Deno.test("logElevenLabsAuthShadow: malformed signature header (no t=/v0=) -> never throws, reports invalid", async () => {
  const headers = new Headers({ "elevenlabs-signature": "garbage-value" });
  const result = await logElevenLabsAuthShadow(headers, "{}", "el-secret");
  assertEquals(result.signaturePresent, true);
  assertEquals(result.signatureValid, false);
  assertEquals(result.reason, "invalid_signature");
});

Deno.test("logElevenLabsAuthShadow: valid t=/v0= signature -> reports valid", async () => {
  const payload = '{"type":"tts.completed","request_id":"abc"}';
  const secret = "elevenlabs-shared-secret";
  const timestamp = "1712950800";

  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(`${timestamp}.${payload}`));
  const hex = Array.from(new Uint8Array(sigBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");

  const headers = new Headers({ "elevenlabs-signature": `t=${timestamp},v0=${hex}` });
  const result = await logElevenLabsAuthShadow(headers, payload, secret);
  assertEquals(result.signaturePresent, true);
  assertEquals(result.signatureValid, true);
  assertEquals(result.reason, "valid");
});

Deno.test("logElevenLabsAuthShadow: legacy xi-signature header name also accepted", async () => {
  const headers = new Headers({ "xi-signature": "t=123,v0=deadbeef" });
  const result = await logElevenLabsAuthShadow(headers, "{}", "el-secret");
  // Signature is present (header found) even though it won't validate —
  // proves the fallback header name is read without throwing.
  assertEquals(result.signaturePresent, true);
});

// ---------------------------------------------------------------------------
// gmail-webhook (OIDC bearer token, log-only, no verification)
// ---------------------------------------------------------------------------

function base64UrlEncode(json: unknown): string {
  const str = JSON.stringify(json);
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

Deno.test("logGmailOidcAuthShadow: no Authorization header -> never throws (proves gmail-webhook is not blocked)", () => {
  const headers = new Headers();
  // Must not throw; there is nothing to assert on the return value since
  // this helper is void (log-only), which itself proves the call site
  // cannot use it to gate the response.
  logGmailOidcAuthShadow(headers);
});

Deno.test("logGmailOidcAuthShadow: Authorization present but not a JWT -> never throws", () => {
  const headers = new Headers({ authorization: "Bearer not-a-jwt" });
  logGmailOidcAuthShadow(headers);
});

Deno.test("logGmailOidcAuthShadow: well-formed JWT -> decodes aud/iss without throwing and without verifying signature", () => {
  const header = base64UrlEncode({ alg: "RS256", typ: "JWT" });
  const payload = base64UrlEncode({ aud: "https://example.supabase.co/functions/v1/gmail-webhook", iss: "https://accounts.google.com" });
  const fakeToken = `${header}.${payload}.fake-signature-not-verified`;

  const headers = new Headers({ authorization: `Bearer ${fakeToken}` });
  // Should not throw even though the signature segment is fake — this
  // helper intentionally does NOT verify the signature (documented
  // limitation), it only decodes claims for observability.
  logGmailOidcAuthShadow(headers);
});
