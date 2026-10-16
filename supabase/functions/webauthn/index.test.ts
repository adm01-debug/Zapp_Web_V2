// R2-AUTH-021/022 — login por passkey emite SESSÃO de verdade, com as MESMAS
// travas do auth-login (política de rede, rate limit por IP, bloqueio por
// tentativas, conta ativa) e auditoria obrigatória.
//
// Estes testes são OFFLINE: o client service_role (`admin`), o rate limit e a
// verificação criptográfica da asserção são INJETADOS — nenhuma chamada toca o
// banco nem o GoTrue. O que se prova é a ORDEM, o curto-circuito e o corpo de
// cada resposta:
//
//   * a política de rede (403/503) nega ANTES de ler o body, consultar
//     credencial/usuário, registrar tentativa, consumir rate limit ou emitir sessão;
//   * o rate limit por IP nega (429) antes de tocar o banco;
//   * credencial desconhecida -> recusa GENÉRICA (401) sem consultar conta;
//   * asserção inválida -> 401 no MESMO envelope do auth-login e registra tentativa;
//   * conta banida/desativada -> 403, sem emitir sessão;
//   * conta travada por tentativas -> 423;
//   * sucesso -> 200 com `token_hash` (sessão por magiclink, SEM e-mail) e SEM
//     `userEmail`; credencial consumida, tentativas limpas e login auditado.
//
// Run with:
//   deno test --config scripts/ci/deno.json supabase/functions/webauthn/index.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleWebAuthn, type WebAuthnAccount } from "./index.ts";

const URL = "https://example.supabase.co/functions/v1/webauthn";
const IP = "9.9.9.9";
const FUTURE = new Date(Date.now() + 60_000).toISOString();
const PAST = new Date(Date.now() - 60_000).toISOString();

const STORED_CRED = { id: "row-1", user_id: "u1", credential_id: "cred-1", public_key: "pk-cose", counter: 3 };

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(URL, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function authBody(over: Record<string, unknown> = {}) {
  return {
    action: "verify-authentication",
    credential: {
      id: "cred-1",
      type: "public-key",
      response: { clientDataJSON: "cdj", authenticatorData: "ad", signature: "sig" },
    },
    ...over,
  };
}

type DBResult = { data: unknown; error: unknown };

/** Chain PostgREST mínimo e thenable: `.select().eq().single()` e `.insert()` etc. */
function fakeDb(script: Record<string, (op: string) => DBResult> = {}) {
  const tableCalls: Array<{ table: string; op: string }> = [];

  function resolve(table: string, op: string): DBResult {
    const fn = script[table];
    return fn ? fn(op) : { data: null, error: { message: `unexpected table ${table}` } };
  }

  function chain(table: string): unknown {
    let op = "";
    const obj = {
      select: () => { if (!op) { op = "select"; tableCalls.push({ table, op }); } return obj; },
      insert: () => { op = "insert"; tableCalls.push({ table, op }); return obj; },
      update: () => { op = "update"; tableCalls.push({ table, op }); return obj; },
      delete: () => { op = "delete"; tableCalls.push({ table, op }); return obj; },
      eq: () => obj,
      order: () => obj,
      limit: () => obj,
      single: () => Promise.resolve(resolve(table, op || "select")),
      then: (onFulfilled: (v: DBResult) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve(resolve(table, op || "select")).then(onFulfilled, onRejected),
    };
    return obj;
  }

  return { tableCalls, from: (table: string) => chain(table) };
}

interface AdminOptions {
  policy?: DBResult;
  rpcs?: Record<string, DBResult>;
  db?: ReturnType<typeof fakeDb>;
  account?: WebAuthnAccount | null;
  accountError?: unknown;
  link?: { data: { properties?: { hashed_token?: string } } | null; error: unknown };
}

function allowedPolicy() {
  return { data: [{ allowed: true, reason: null, rate_limit_max_requests: 10, rate_limit_window_seconds: 60 }], error: null };
}

function fakeAdmin(opts: AdminOptions = {}) {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const linkCalls: Array<{ type: string; email: string }> = [];
  const db = opts.db ?? fakeDb();
  const account: WebAuthnAccount | null = opts.account === undefined
    ? { id: "u1", email: "u@example.com", banned_until: null }
    : opts.account;

  return {
    rpcCalls,
    linkCalls,
    db,
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      if (fn === "resolve_network_policy") return Promise.resolve(opts.policy ?? allowedPolicy());
      if (opts.rpcs && fn in opts.rpcs) return Promise.resolve(opts.rpcs[fn]);
      return Promise.resolve({ data: null, error: { message: `unexpected rpc ${fn}` } });
    },
    from: (table: string) => db.from(table),
    auth: {
      admin: {
        listUsers: () => Promise.resolve({ data: { users: [] } }),
        getUserById: (id: string) =>
          Promise.resolve({ data: { user: account ? { ...account, id } : null }, error: opts.accountError ?? null }),
        generateLink(params: { type: string; email: string }) {
          linkCalls.push(params);
          return Promise.resolve(opts.link ?? { data: { properties: { hashed_token: "hash-123" } }, error: null });
        },
      },
    },
  };
}

function loginDb(over: Record<string, (op: string) => DBResult> = {}) {
  return fakeDb({
    passkey_credentials: (op) => op === "select"
      ? { data: STORED_CRED, error: null }
      : { data: null, error: null },
    webauthn_challenges: (op) => op === "select"
      ? { data: { challenge: "chal-1", expires_at: FUTURE }, error: null }
      : { data: null, error: null },
    audit_logs: () => ({ data: null, error: null }),
    ...over,
  });
}

function fakeRateLimit(allowed = true) {
  const calls: Array<{ key: string; max: number; windowMs: number }> = [];
  return {
    calls,
    enforceRateLimit(key: string, max: number, windowMs: number) {
      calls.push({ key, max, windowMs });
      return Promise.resolve({ allowed });
    },
  };
}

const okVerify = () => Promise.resolve({ ok: true as const, newCounter: 4 });
const failVerify = () => Promise.resolve({ ok: false as const, reason: "invalid signature" });

// ─────────────────────────────────────────────────────────────────────────────

Deno.test("negação por IP (403) responde ANTES de body/credencial/efeitos", async () => {
  const admin = fakeAdmin({
    policy: { data: [{ allowed: false, reason: "ip_blocked" }], error: null },
  });
  const rl = fakeRateLimit();

  // Body inválido de propósito: se a política não antecedesse a leitura, isto
  // viraria 500 (JSON inválido). A negação curto-circuita antes de ler.
  const res = await handleWebAuthn(post("{invalid", { "x-forwarded-for": IP, "cf-ipcountry": "br" }), {
    admin,
    enforceRateLimit: rl.enforceRateLimit,
  });

  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, "Access denied"); // genérico: não revela IP/país/regra

  assertEquals(admin.rpcCalls.map((c) => c.fn), ["resolve_network_policy"]);
  assertEquals(admin.db.tableCalls.length, 0);
  assertEquals(admin.linkCalls.length, 0);
  assertEquals(rl.calls.length, 0);
});

Deno.test("erro de decisão da política responde 503 sem vazar regras", async () => {
  const admin = fakeAdmin({ policy: { data: null, error: { message: "connection reset" } } });
  const rl = fakeRateLimit();

  const res = await handleWebAuthn(post(authBody(), { "x-forwarded-for": IP }), {
    admin,
    enforceRateLimit: rl.enforceRateLimit,
  });

  assertEquals(res.status, 503);
  assertEquals((await res.json()).error, "Internal server error");
  assertEquals(admin.rpcCalls.map((c) => c.fn), ["resolve_network_policy"]);
  assertEquals(admin.db.tableCalls.length, 0);
  assertEquals(rl.calls.length, 0);
});

Deno.test("rate limit por IP nega (429) antes de tocar o banco", async () => {
  const admin = fakeAdmin({ policy: allowedPolicy() });
  const rl = fakeRateLimit(false);

  const res = await handleWebAuthn(post(authBody(), { "x-forwarded-for": IP }), {
    admin,
    enforceRateLimit: rl.enforceRateLimit,
  });

  assertEquals(res.status, 429);
  assertEquals(admin.db.tableCalls.length, 0);
  assertEquals(admin.linkCalls.length, 0);
  assertEquals(rl.calls.length, 1);
  assertEquals(rl.calls[0].key, `webauthn:${IP}`);
});

Deno.test("credencial desconhecida -> recusa genérica, sem consultar conta", async () => {
  const db = fakeDb({ passkey_credentials: () => ({ data: null, error: { message: "no rows" } }) });
  const admin = fakeAdmin({ policy: allowedPolicy(), db });
  const rl = fakeRateLimit();

  const res = await handleWebAuthn(post(authBody(), { "x-forwarded-for": IP }), {
    admin,
    enforceRateLimit: rl.enforceRateLimit,
  });

  assertEquals(res.status, 401);
  assertEquals(await res.json(), {
    error: "Invalid login credentials",
    isLocked: false,
    lockedUntil: null,
    attempts: 0,
    remainingTime: 0,
  });
  assertEquals(admin.rpcCalls.some((c) => c.fn === "record_failed_login"), false);
  assertEquals(admin.linkCalls.length, 0);
});

Deno.test("asserção inválida -> 401 no mesmo envelope e registra tentativa", async () => {
  const admin = fakeAdmin({
    policy: allowedPolicy(),
    db: loginDb(),
    rpcs: {
      record_failed_login: { data: [{ is_locked: false, locked_until: null, attempts: 2 }], error: null },
    },
  });
  const rl = fakeRateLimit();

  const res = await handleWebAuthn(post(authBody(), { "x-forwarded-for": IP }), {
    admin,
    enforceRateLimit: rl.enforceRateLimit,
    verifyAuthenticationAssertion: failVerify,
  });

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Invalid login credentials");
  assertEquals(body.attempts, 2); // mesma trava de lockout do auth-login
  assertEquals(admin.rpcCalls.some((c) => c.fn === "record_failed_login"), true);
  assertEquals(admin.linkCalls.length, 0);
  assertEquals(admin.db.tableCalls.some((t) => t.table === "audit_logs"), false);
});

Deno.test("conta inativa (banida) -> 403, sem emitir sessão", async () => {
  const admin = fakeAdmin({
    policy: allowedPolicy(),
    db: loginDb(),
    account: { id: "u1", email: "u@example.com", banned_until: FUTURE },
  });
  const rl = fakeRateLimit();

  const res = await handleWebAuthn(post(authBody(), { "x-forwarded-for": IP }), {
    admin,
    enforceRateLimit: rl.enforceRateLimit,
    verifyAuthenticationAssertion: okVerify,
  });

  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, "Account disabled");
  assertEquals(admin.linkCalls.length, 0);
  assertEquals(admin.rpcCalls.some((c) => c.fn === "is_account_locked"), false);
});

Deno.test("conta banida com banimento JÁ expirado segue o fluxo normal", async () => {
  const admin = fakeAdmin({
    policy: allowedPolicy(),
    db: loginDb(),
    account: { id: "u1", email: "u@example.com", banned_until: PAST },
    rpcs: {
      is_account_locked: { data: [{ is_locked: false, locked_until: null, attempts: 0 }], error: null },
      clear_login_attempts: { data: null, error: null },
    },
  });
  const rl = fakeRateLimit();

  const res = await handleWebAuthn(post(authBody(), { "x-forwarded-for": IP }), {
    admin,
    enforceRateLimit: rl.enforceRateLimit,
    verifyAuthenticationAssertion: okVerify,
  });

  assertEquals(res.status, 200);
  assertEquals(admin.linkCalls.length, 1);
});

Deno.test("conta travada por tentativas -> 423, sem emitir sessão", async () => {
  const admin = fakeAdmin({
    policy: allowedPolicy(),
    db: loginDb(),
    rpcs: {
      is_account_locked: { data: [{ is_locked: true, locked_until: FUTURE, attempts: 5 }], error: null },
    },
  });
  const rl = fakeRateLimit();

  const res = await handleWebAuthn(post(authBody(), { "x-forwarded-for": IP }), {
    admin,
    enforceRateLimit: rl.enforceRateLimit,
    verifyAuthenticationAssertion: okVerify,
  });

  assertEquals(res.status, 423);
  const body = await res.json();
  assertEquals(body.error, "Account locked");
  assertEquals(body.isLocked, true);
  assertEquals(body.attempts, 5);
  assertEquals(admin.linkCalls.length, 0);
});

Deno.test("sucesso -> 200 com token_hash (sessão sem e-mail) e login auditado", async () => {
  const db = loginDb();
  const admin = fakeAdmin({
    policy: allowedPolicy(),
    db,
    rpcs: {
      is_account_locked: { data: [{ is_locked: false, locked_until: null, attempts: 0 }], error: null },
      clear_login_attempts: { data: null, error: null },
    },
  });
  const rl = fakeRateLimit();

  const res = await handleWebAuthn(post(authBody(), { "x-forwarded-for": IP }), {
    admin,
    enforceRateLimit: rl.enforceRateLimit,
    verifyAuthenticationAssertion: okVerify,
  });

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, { success: true, token_hash: "hash-123", type: "magiclink" });
  assertEquals("userEmail" in body, false); // nunca devolve o e-mail ao cliente

  // A sessão é emitida por generateLink type=magiclink (NÃO envia e-mail).
  assertEquals(admin.linkCalls, [{ type: "magiclink", email: "u@example.com" }]);

  // Ordem das RPCs: política -> lockout -> limpa tentativas.
  assertEquals(admin.rpcCalls.map((c) => c.fn), [
    "resolve_network_policy",
    "is_account_locked",
    "clear_login_attempts",
  ]);

  // Efeitos: contador/último uso atualizados, desafio consumido, login auditado.
  assertEquals(db.tableCalls.some((t) => t.table === "passkey_credentials" && t.op === "update"), true);
  assertEquals(db.tableCalls.some((t) => t.table === "webauthn_challenges" && t.op === "delete"), true);
  assertEquals(db.tableCalls.some((t) => t.table === "audit_logs" && t.op === "insert"), true);
});

Deno.test("falha ao emitir sessão -> 503 e NÃO audita", async () => {
  const db = loginDb();
  const admin = fakeAdmin({
    policy: allowedPolicy(),
    db,
    rpcs: {
      is_account_locked: { data: [{ is_locked: false, locked_until: null, attempts: 0 }], error: null },
      clear_login_attempts: { data: null, error: null },
    },
    link: { data: null, error: { message: "GoTrue down" } },
  });
  const rl = fakeRateLimit();

  const res = await handleWebAuthn(post(authBody(), { "x-forwarded-for": IP }), {
    admin,
    enforceRateLimit: rl.enforceRateLimit,
    verifyAuthenticationAssertion: okVerify,
  });

  assertEquals(res.status, 503);
  assertEquals((await res.json()).error, "Internal server error");
  assertEquals(db.tableCalls.some((t) => t.table === "audit_logs"), false);
});

Deno.test("auditoria falha -> 500 e a sessão NÃO é devolvida (falha fechada)", async () => {
  const db = loginDb({ audit_logs: () => ({ data: null, error: { message: "audit down" } }) });
  const admin = fakeAdmin({
    policy: allowedPolicy(),
    db,
    rpcs: {
      is_account_locked: { data: [{ is_locked: false, locked_until: null, attempts: 0 }], error: null },
      clear_login_attempts: { data: null, error: null },
    },
  });
  const rl = fakeRateLimit();

  const res = await handleWebAuthn(post(authBody(), { "x-forwarded-for": IP }), {
    admin,
    enforceRateLimit: rl.enforceRateLimit,
    verifyAuthenticationAssertion: okVerify,
  });

  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "Internal server error");
  assertEquals(admin.linkCalls.length, 1); // gerada, mas não devolvida
});
