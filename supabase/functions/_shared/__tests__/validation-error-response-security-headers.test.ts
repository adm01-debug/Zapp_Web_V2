/**
 * QA LOW — validationErrorResponse (422) não trazia os security headers que as
 * demais respostas (errorResponse/getCorsHeaders em validation.ts) recebem.
 * Ver schemas.ts:682 (validationErrorResponse) vs validation.ts:109
 * (SECURITY_HEADERS).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validationErrorResponse } from "../schemas.ts";

const EXPECTED_SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Cache-Control": "no-store",
  "Content-Security-Policy-Report-Only":
    "default-src 'none'; script-src 'none'; object-src 'none'; report-uri /csp-report",
};

Deno.test("validationErrorResponse (422) inclui os mesmos security headers das demais respostas", () => {
  const res = validationErrorResponse({ error: "campo inválido" });

  assertEquals(res.status, 422);
  for (const [header, value] of Object.entries(EXPECTED_SECURITY_HEADERS)) {
    assertEquals(res.headers.get(header), value, `header ausente/divergente: ${header}`);
  }
});
