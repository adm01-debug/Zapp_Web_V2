/**
 * E2E auth gate test for ai-auto-tag.
 * Verifies:
 *  - missing Authorization header -> 401
 *  - invalid bearer token -> 401
 *
 * Run: deno test --allow-net --allow-env supabase/functions/ai-auto-tag/auth_test.ts
 * Requires env: SUPABASE_FUNCTIONS_URL (e.g. https://<ref>.functions.supabase.co)
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const BASE = Deno.env.get("SUPABASE_FUNCTIONS_URL") ?? "";
const URL = `${BASE}/ai-auto-tag`;

Deno.test({
  name: "ai-auto-tag rejects request without Authorization",
  ignore: !BASE,
  async fn() {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });
    await res.text();
    assertEquals(res.status, 401);
  },
});

Deno.test({
  name: "ai-auto-tag rejects invalid bearer token",
  ignore: !BASE,
  async fn() {
    const res = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer invalid.token.here",
      },
      body: JSON.stringify({ messages: [] }),
    });
    await res.text();
    assertEquals(res.status, 401);
  },
});