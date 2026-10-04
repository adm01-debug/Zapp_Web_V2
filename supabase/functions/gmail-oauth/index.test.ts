// R2-COM-009 / item 17 — o retorno OAuth do Gmail NÃO pode prosseguir com
// `state` ausente, inválido, expirado ou já consumido. A proteção CSRF
// (RFC 6749 §10.12) tem de valer no SERVIDOR: a tentativa é registrada no
// `get-auth-url` (vinculada ao user autenticado) e consumida atomicamente
// (uso único) no `exchange-code` — antes de qualquer chamada ao Google.
//
// Estes testes são OFFLINE: o client service_role, a resolução do usuário e
// as chamadas ao Google são INJETADOS. O fake de `gmail_oauth_states` reproduz
// a semântica da RPC consume_gmail_oauth_state (existe + pertence ao usuário +
// não consumido + não expirado -> marca consumido, senão false).
//
// Run with:
//   deno test --config scripts/ci/deno.json supabase/functions/gmail-oauth/index.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleGmailOAuth, type GmailOAuthDeps } from "./index.ts";

const URL_ = "https://example.supabase.co/functions/v1/gmail-oauth";
const TOKENS = {
  access_token: "ya29.test",
  refresh_token: "rt.test",
  expires_in: 3600,
  token_type: "Bearer",
  scope: "scope",
};
const ACCOUNT = { id: "acc-1", email_address: "user@gmail.com", is_active: true };

function post(body: unknown, withAuth = true): Request {
  return new Request(URL_, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(withAuth ? { authorization: "Bearer tok" } : {}),
    },
    body: JSON.stringify(body),
  });
}

type Terminal = { data: unknown; error: unknown };

/** Builder PostgREST falso: registra os métodos e resolve nos terminais. */
function fakeChain(terminals: { default: Terminal; maybeSingle?: Terminal; single?: Terminal }, onMethod?: (m: string, args: unknown[]) => void) {
  const builder: Record<string, unknown> = {};
  const passthrough = ["select", "eq", "in", "is", "gt", "lt", "order", "limit", "range", "insert", "update", "upsert", "delete"];
  for (const m of passthrough) {
    builder[m] = (...args: unknown[]) => {
      onMethod?.(m, args);
      return builder;
    };
  }
  builder.maybeSingle = () => Promise.resolve(terminals.maybeSingle ?? terminals.default);
  builder.single = () => Promise.resolve(terminals.single ?? terminals.default);
  builder.then = (
    resolve: (v: Terminal) => unknown,
    reject: (e: unknown) => unknown,
  ) => Promise.resolve(terminals.default).then(resolve, reject);
  return builder;
}

interface StateRow { user_id: string; state: string; consumed: boolean }

/** Fake do client service_role: tabela gmail_oauth_states com a semântica do
 *  consume (uso único), gmail_accounts scriptável, RPCs registradas. */
function fakeAdmin(opts: { existingAccountUserId?: string | null; account?: typeof ACCOUNT | null } = {}) {
  const stateRows: StateRow[] = [];
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const account = opts.account === undefined ? ACCOUNT : opts.account;

  return {
    stateRows,
    rpcCalls,
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      if (fn === "consume_gmail_oauth_state") {
        const row = stateRows.find((r) =>
          r.user_id === args.p_user_id && r.state === args.p_state && !r.consumed
        );
        if (!row) return Promise.resolve({ data: false, error: null });
        row.consumed = true;
        return Promise.resolve({ data: true, error: null });
      }
      if (fn === "store_gmail_tokens" || fn === "get_gmail_tokens") {
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: { message: `unexpected rpc ${fn}` } });
    },
    from(table: string) {
      if (table === "gmail_oauth_states") {
        return fakeChain({ default: { data: null, error: null } }, (m, args) => {
          if (m === "insert") {
            const rows = Array.isArray(args[0]) ? args[0] : [args[0]];
            for (const r of rows) {
              const row = r as { user_id: string; state: string };
              stateRows.push({ user_id: row.user_id, state: row.state, consumed: false });
            }
          }
        });
      }
      if (table === "gmail_accounts") {
        return fakeChain({
          default: { data: null, error: null },
          maybeSingle: {
            data: opts.existingAccountUserId ? { user_id: opts.existingAccountUserId } : null,
            error: null,
          },
          single: { data: account, error: null },
        });
      }
      return fakeChain({ default: { data: null, error: null } });
    },
  };
}

function fakeGoogle(calls: { exchange: string[]; profile: string[]; refresh: string[] }) {
  return {
    clientId: "cid",
    redirectUri: "https://app.test/cb",
    exchangeCode: (code: string) => {
      calls.exchange.push(code);
      return Promise.resolve(TOKENS);
    },
    refreshToken: (refreshToken: string) => {
      calls.refresh.push(refreshToken);
      return Promise.resolve(TOKENS);
    },
    fetchProfile: (accessToken: string) => {
      calls.profile.push(accessToken);
      return Promise.resolve({ emailAddress: "user@gmail.com" });
    },
  };
}

function makeDeps(userId: string, admin: ReturnType<typeof fakeAdmin>, calls: { exchange: string[]; profile: string[]; refresh: string[] }): GmailOAuthDeps {
  return {
    supabase: admin,
    getUser: () => Promise.resolve({ user: { id: userId }, error: null }),
    google: fakeGoogle(calls),
  };
}

const STATE = JSON.stringify({ view: "integrations", integrationView: "gmail", nonce: "nonce-1" });

// ─────────────────────────────────────────────────────────────────────────────

Deno.test("get-auth-url sem state responde 400 e não registra tentativa", async () => {
  const admin = fakeAdmin();
  const calls = { exchange: [], profile: [], refresh: [] };

  const res = await handleGmailOAuth(post({ action: "get-auth-url" }), makeDeps("user-1", admin, calls));

  assertEquals(res.status, 400);
  assertEquals(admin.stateRows.length, 0);
});

Deno.test("get-auth-url com state registra a tentativa vinculada ao usuário e devolve a URL", async () => {
  const admin = fakeAdmin();
  const calls = { exchange: [], profile: [], refresh: [] };

  const res = await handleGmailOAuth(post({ action: "get-auth-url", state: STATE }), makeDeps("user-1", admin, calls));

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(typeof body.url, "string");
  assertEquals(admin.stateRows, [{ user_id: "user-1", state: STATE, consumed: false }]);
});

Deno.test("exchange-code sem state responde 400 sem tocar no Google", async () => {
  const admin = fakeAdmin();
  const calls = { exchange: [], profile: [], refresh: [] };

  const res = await handleGmailOAuth(post({ action: "exchange-code", code: "code-1" }), makeDeps("user-1", admin, calls));

  assertEquals(res.status, 400);
  assertEquals(calls.exchange, []);
  assertEquals(admin.rpcCalls.some((c) => c.fn === "consume_gmail_oauth_state"), false);
});

Deno.test("exchange-code com state divergente/não registrado responde 403 sem tocar no Google", async () => {
  const admin = fakeAdmin();
  const calls = { exchange: [], profile: [], refresh: [] };
  const deps = makeDeps("user-1", admin, calls);

  await handleGmailOAuth(post({ action: "get-auth-url", state: STATE }), deps);
  const forged = JSON.stringify({ view: "integrations", nonce: "forjado" });
  const res = await handleGmailOAuth(post({ action: "exchange-code", code: "code-1", state: forged }), deps);

  assertEquals(res.status, 403);
  assertEquals(calls.exchange, []);
  assertEquals(calls.profile, []);
});

Deno.test("retorno legítimo consome o state e conclui a troca (200)", async () => {
  const admin = fakeAdmin();
  const calls = { exchange: [], profile: [], refresh: [] };
  const deps = makeDeps("user-1", admin, calls);

  await handleGmailOAuth(post({ action: "get-auth-url", state: STATE }), deps);
  const res = await handleGmailOAuth(post({ action: "exchange-code", code: "code-1", state: STATE }), deps);

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.account.email_address, "user@gmail.com");
  assertEquals(calls.exchange, ["code-1"]);
  assertEquals(admin.stateRows[0].consumed, true);
  assertEquals(admin.rpcCalls.some((c) => c.fn === "store_gmail_tokens"), true);
});

Deno.test("replay: o mesmo state não troca o code uma segunda vez", async () => {
  const admin = fakeAdmin();
  const calls = { exchange: [], profile: [], refresh: [] };
  const deps = makeDeps("user-1", admin, calls);

  await handleGmailOAuth(post({ action: "get-auth-url", state: STATE }), deps);
  const first = await handleGmailOAuth(post({ action: "exchange-code", code: "code-1", state: STATE }), deps);
  assertEquals(first.status, 200);

  const replay = await handleGmailOAuth(post({ action: "exchange-code", code: "code-1", state: STATE }), deps);
  assertEquals(replay.status, 403);
  assertEquals(calls.exchange, ["code-1"]); // Google só foi chamado uma vez
});

Deno.test("mudança de sessão: state de outro usuário é recusado (403)", async () => {
  const admin = fakeAdmin();
  const calls = { exchange: [], profile: [], refresh: [] };

  // A tentativa foi registrada pelo user-1...
  await handleGmailOAuth(post({ action: "get-auth-url", state: STATE }), makeDeps("user-1", admin, calls));

  // ...mas o retorno chega autenticado como user-2: a RPC casa user_id + state.
  const res = await handleGmailOAuth(post({ action: "exchange-code", code: "code-1", state: STATE }), makeDeps("user-2", admin, calls));

  assertEquals(res.status, 403);
  assertEquals(calls.exchange, []);
});

Deno.test("guarda de proprietário preservada: Gmail já vinculado a outro usuário responde 409", async () => {
  const admin = fakeAdmin({ existingAccountUserId: "user-outro" });
  const calls = { exchange: [], profile: [], refresh: [] };
  const deps = makeDeps("user-1", admin, calls);

  await handleGmailOAuth(post({ action: "get-auth-url", state: STATE }), deps);
  const res = await handleGmailOAuth(post({ action: "exchange-code", code: "code-1", state: STATE }), deps);

  assertEquals(res.status, 409);
  assertEquals(calls.exchange, ["code-1"]); // state válido consumido, troca aconteceu
});
