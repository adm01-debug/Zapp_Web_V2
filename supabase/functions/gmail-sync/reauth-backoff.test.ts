// Focused integration simulations for manual Gmail sync state transitions.
// Every Supabase/Google request is intercepted; no network or real credentials.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleGmailSync } from "./index.ts";

const SUPABASE_URL = "https://gmail-sync-fixture.invalid";
const USER_ID = "00000000-0000-4000-8000-000000000001";
const ACCOUNT_ID = "00000000-0000-4000-8000-0000000000aa";
const INITIAL_UPDATED_AT = "2026-10-20T10:00:00.000Z";
const EXPIRED = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const VALID = new Date(Date.now() + 60 * 60 * 1000).toISOString();

type Row = Record<string, unknown>;
type Captured = { method: string; url: string; body: unknown };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function setup(mode: "reauth" | "partial") {
  const account: Row = {
    id: ACCOUNT_ID,
    user_id: USER_ID,
    email_address: "mailbox@example.invalid",
    is_active: true,
    sync_status: "synced",
    error_count: 2,
    next_attempt_at: null,
    token_expires_at: mode === "reauth" ? EXPIRED : VALID,
    history_id: "100",
    updated_at: INITIAL_UPDATED_AT,
  };
  const calls: Captured[] = [];
  const originalFetch = globalThis.fetch;
  const originalEnv = new Map(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]
    .map((key) => [key, Deno.env.get(key)]));
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const url = new URL(req.url);
    let body: unknown;
    try { body = await req.clone().json(); } catch { body = undefined; }
    calls.push({ method: req.method, url: req.url, body });

    if (url.pathname === "/auth/v1/user") return json({ id: USER_ID, email: "user@example.invalid" });
    if (url.pathname === "/rest/v1/gmail_accounts" && req.method === "GET") return json(account);
    if (url.pathname === "/rest/v1/gmail_accounts" && req.method === "PATCH") {
      const updatedAtFilter = url.searchParams.get("updated_at");
      const expectedUpdatedAt = updatedAtFilter?.startsWith("eq.") ? updatedAtFilter.slice(3) : null;
      if (expectedUpdatedAt && account.updated_at !== expectedUpdatedAt) return json([]);
      if (!body || typeof body !== "object") return json([]);
      Object.assign(account, body, { updated_at: new Date(Date.now() + calls.length).toISOString() });
      return json([{ id: ACCOUNT_ID, updated_at: account.updated_at }]);
    }
    if (url.pathname === "/rest/v1/rpc/get_gmail_tokens") {
      return json([{ access_token: "old-access-token", refresh_token: "revoked-refresh-token" }]);
    }
    if (url.hostname === "oauth2.googleapis.com") {
      return json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400);
    }
    if (url.hostname === "gmail.googleapis.com" && url.pathname.endsWith("/history")) {
      return json({ historyId: "101", history: [{ messagesAdded: [{ message: { id: "message-fails" } }] }] });
    }
    if (url.hostname === "gmail.googleapis.com" && url.pathname.endsWith("/messages/message-fails")) {
      return json({ error: { message: "temporary failure" } }, 503);
    }
    throw new Error(`unexpected fixture request: ${req.method} ${req.url}`);
  }) as typeof fetch;

  Deno.env.set("SUPABASE_URL", SUPABASE_URL);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-fixture");
  Deno.env.set("SUPABASE_ANON_KEY", "anon-fixture");
  Deno.env.set("GOOGLE_CLIENT_ID", "client-fixture");
  Deno.env.set("GOOGLE_CLIENT_SECRET", "secret-fixture");

  return {
    account,
    calls,
    restore() {
      globalThis.fetch = originalFetch;
      for (const [key, value] of originalEnv) {
        if (value === undefined) Deno.env.delete(key);
        else Deno.env.set(key, value);
      }
    },
  };
}

function request(action: "sync-inbox" | "sync-incremental"): Request {
  return new Request(`${SUPABASE_URL}/functions/v1/gmail-sync`, {
    method: "POST",
    headers: { Authorization: "Bearer user-fixture", "Content-Type": "application/json" },
    body: JSON.stringify({ action, account_id: ACCOUNT_ID }),
  });
}

Deno.test("gmail-sync: refresh invalid_grant devolve 409 e marca reauth_required", async () => {
  const fixture = setup("reauth");
  try {
    const response = await handleGmailSync(request("sync-inbox"));
    assertEquals(response.status, 409);
    assertEquals(await response.json(), {
      code: "reauth_required",
      error: "Sessão do Gmail expirada — reconecte a conta",
    });
    assertEquals(fixture.account.sync_status, "reauth_required");
    assertEquals(fixture.account.next_attempt_at, null);
    assertEquals(fixture.account.error_count, 2, "revogação não entra no backoff transitório");
    assertEquals(fixture.calls.filter((call) => new URL(call.url).hostname === "gmail.googleapis.com").length, 0);
  } finally {
    fixture.restore();
  }
});

Deno.test("gmail-sync: falha parcial incremental mantém cursor e agenda backoff", async () => {
  const fixture = setup("partial");
  try {
    const response = await handleGmailSync(request("sync-incremental"));
    assertEquals(response.status, 207);
    const result = await response.json();
    assertEquals(result.cursor_advanced, false);
    assertEquals(fixture.account.sync_status, "error");
    assertEquals(fixture.account.history_id, "100", "cursor não avança com mensagem falha");
    assertEquals(fixture.account.error_count, 3);
    assert(new Date(String(fixture.account.next_attempt_at)).getTime() > Date.now());
    assert(String(fixture.account.last_error).includes("3 tentativa(s)"));
  } finally {
    fixture.restore();
  }
});
