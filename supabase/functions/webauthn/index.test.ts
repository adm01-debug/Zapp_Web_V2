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
//   * o rate limit por IP nega (429) antes de tocar o banco; o rate limit por
//     E-MAIL nega (429) depois que a credencial/conta é conhecida;
//   * `authentication-options` devolve a MESMA resposta com ou sem e-mail e sem
//     `allowCredentials` (sem enumeração de quem tem passkey);
//   * credencial desconhecida -> recusa GENÉRICA (401) sem consultar conta;
//   * asserção inválida -> 401 no MESMO envelope do auth-login e registra tentativa;
//   * sem UV (flag 0x04) -> recusa genérica, mesmo com asserção válida;
//   * conta banida/desativada -> 403, sem emitir sessão;
//   * profiles.is_active=false -> MESMO 403 'Account disabled', sem sessão;
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
const CHAL = "chal-1";

function b64url(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/** clientDataJSON real (base64url) com o challenge que o autenticador assinou. */
function clientData(challenge = CHAL): string {
  return b64url(JSON.stringify({ type: "webauthn.get", challenge, origin: "https://example.supabase.co" }));
}

/** authenticatorData de 37 bytes; flags no byte 32 (UP=0x01, UV=0x04). */
function authDataFlags({ uv = true, up = true }: { uv?: boolean; up?: boolean } = {}): string {
  const bytes = new Uint8Array(37);
  let flags = 0;
  if (up) flags |= 0x01;
  if (uv) flags |= 0x04;
  bytes[32] = flags;
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return b64url(str);
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(URL, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function authBody(over: Record<string, unknown> = {}, opts: { uv?: boolean } = {}) {
  return {
    action: "verify-authentication",
    credential: {
      id: "cred-1",
      type: "public-key",
      response: {
        clientDataJSON: clientData(),
        authenticatorData: authDataFlags({ uv: opts.uv ?? true }),
        signature: "sig",
      },
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
      ? { data: { challenge: CHAL, expires_at: FUTURE }, error: null }
      : { data: null, error: null },
    profiles: () => ({ data: { is_active: true }, error: null }),
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

Deno.test("authentication-options: resposta idêntica com/sem e-mail e SEM allowCredentials", async () => {
  const db = fakeDb({ webauthn_challenges: () => ({ data: null, error: null }) });
  const admin = fakeAdmin({ policy: allowedPolicy(), db });
  const rl = fakeRateLimit();

  const withEmail = await handleWebAuthn(
    post({ action: "authentication-options", userEmail: "u@example.com" }, { "x-forwarded-for": IP }),
    { admin, enforceRateLimit: rl.enforceRateLimit },
  );
  const withoutEmail = await handleWebAuthn(
    post({ action: "authentication-options" }, { "x-forwarded-for": IP }),
    { admin, enforceRateLimit: rl.enforceRateLimit },
  );

  assertEquals(withEmail.status, 200);
  assertEquals(withoutEmail.status, 200);
  const a = await withEmail.json();
  const b = await withoutEmail.json();

  // Sem enumeração: o corpo não muda com o e-mail informado.
  assertEquals(Object.keys(a), Object.keys(b));
  assertEquals(Object.keys(a.options), ["challenge", "rpId", "timeout", "userVerification"]);
  assertEquals("allowCredentials" in a.options, false); // não revela quem tem passkey
  assertEquals(a.options.userVerification, "required"); // UV exigido no options

  // Desafio gravado sem usuário (fluxo descobrível) e limpeza executada — nunca listagem.
  assertEquals(db.tableCalls.some((t) => t.table === "webauthn_challenges" && t.op === "insert"), true);
  assertEquals(admin.rpcCalls.some((c) => c.fn === "cleanup_expired_challenges"), true);
  assertEquals(rl.calls.length, 2); // um teto por IP em cada chamada
});

Deno.test("rate limit por e-mail nega (429) mesmo com o IP liberado", async () => {
  const admin = fakeAdmin({ policy: allowedPolicy(), db: loginDb() });
  const keys: string[] = [];
  const enforceRateLimit = (key: string) => {
    keys.push(key);
    return Promise.resolve({ allowed: !key.startsWith("webauthn:email:") });
  };

  const res = await handleWebAuthn(post(authBody(), { "x-forwarded-for": IP }), {
    admin,
    enforceRateLimit,
    verifyAuthenticationAssertion: okVerify,
  });

  assertEquals(res.status, 429);
  assertEquals(keys, [`webauthn:${IP}`, "webauthn:email:u@example.com"]);
  assertEquals(admin.linkCalls.length, 0);
});

Deno.test("sem UV (flag 0x04) -> recusa genérica e registra tentativa", async () => {
  const admin = fakeAdmin({
    policy: allowedPolicy(),
    db: loginDb(),
    rpcs: {
      record_failed_login: { data: [{ is_locked: false, locked_until: null, attempts: 1 }], error: null },
    },
  });
  const rl = fakeRateLimit();

  const res = await handleWebAuthn(post(authBody({}, { uv: false }), { "x-forwarded-for": IP }), {
    admin,
    enforceRateLimit: rl.enforceRateLimit,
    verifyAuthenticationAssertion: okVerify, // seria válida, mas sem UV não entra
  });

  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, "Invalid login credentials");
  assertEquals(admin.rpcCalls.some((c) => c.fn === "record_failed_login"), true);
  assertEquals(admin.linkCalls.length, 0);
});

Deno.test("profiles.is_active=false -> 403 Account disabled, sem emitir sessão", async () => {
  const db = loginDb({ profiles: () => ({ data: { is_active: false }, error: null }) });
  const admin = fakeAdmin({ policy: allowedPolicy(), db });
  const rl = fakeRateLimit();

  const res = await handleWebAuthn(post(authBody(), { "x-forwarded-for": IP }), {
    admin,
    enforceRateLimit: rl.enforceRateLimit,
    verifyAuthenticationAssertion: okVerify,
  });

  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, "Account disabled"); // MESMO corpo do banido
  assertEquals(admin.linkCalls.length, 0);
  assertEquals(admin.rpcCalls.some((c) => c.fn === "is_account_locked"), false);

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleWebAuthn } from "./index.ts";

// ---------------------------------------------------------------------------
// webauthn · authentication-options (ação PÚBLICA, roda antes do login)
// 1) e-mail INEXISTENTE e conta SEM passkey devolvem o MESMO corpo (o `challenge`
//    é aleatório por chamada, então comparamos o resto): nada de oráculo de
//    enumeração de conta.
// 2) a conta pode estar em qualquer página — listUsers() sem argumentos só olhava
//    a 1ª página (≤50), então a paginação é provada com a conta na 2ª página.
// 3) rate limit por IP antes de qualquer consulta.
// Tudo por injeção: sem rede, sem banco, sem segredo real.
// ---------------------------------------------------------------------------

type Cred = { credential_id: string; transports: string[] | null };
type User = { id: string; email: string | null };

function adminMock(opts: {
  users: User[];
  credentials: Record<string, Cred[]>;
  inserted: unknown[];
}) {
  return {
    auth: {
      admin: {
        listUsers({ page, perPage }: { page: number; perPage: number }) {
          const start = (page - 1) * perPage;
          return Promise.resolve({
            data: { users: opts.users.slice(start, start + perPage) },
            error: null,
          });
        },
      },
    },
    from(table: string) {
      let eqValue = "";
      const builder = {
        select() {
          return builder;
        },
        eq(_col: string, value: string) {
          eqValue = value;
          return builder;
        },
        insert(row: unknown) {
          opts.inserted.push({ table, row });
          return builder;
        },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          const data = table === "passkey_credentials"
            ? (opts.credentials[eqValue] ?? [])
            : null;
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

// Limiter em memória com a MESMA semântica do guard (chave → contador/teto).
function makeLimiter(max: number) {
  const hits = new Map<string, number>();
  return (key: string) => {
    const n = (hits.get(key) ?? 0) + 1;
    hits.set(key, n);
    return Promise.resolve({ allowed: n <= max, remaining: Math.max(0, max - n), resetIn: 0 });
  };
}

function deps(mock: unknown, limiter: unknown) {
  return {
    supabaseAdmin: mock,
    supabaseUrl: "https://test.local",
    anonKey: "anon-key-test",
    enforceRateLimit: limiter,
  } as Parameters<typeof handleWebAuthn>[1];
}

function req(ip: string, body: unknown): Request {
  return new Request("https://test.local/webauthn", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

Deno.test("webauthn auth-options (defeito): e-mail inexistente e conta SEM passkey → corpo idêntico, sem allowCredentials", async () => {
  const mock = adminMock({
    users: [{ id: "u-sem-passkey", email: "sem.passkey@zapp.test" }],
    credentials: {},
    inserted: [],
  });
  const d = deps(mock, makeLimiter(100));

  const resMissing = await handleWebAuthn(
    req("10.0.0.1", { action: "authentication-options", userEmail: "nao.existe@zapp.test" }),
    d,
  );
  const resNoPass = await handleWebAuthn(
    // e-mail em CAIXA ALTA: a busca normaliza, então acha a conta
    req("10.0.0.2", { action: "authentication-options", userEmail: "SEM.PASSKEY@ZAPP.TEST" }),
    d,
  );

  assertEquals(resMissing.status, 200);
  assertEquals(resNoPass.status, 200);

  const a = await resMissing.json();
  const b = await resNoPass.json();
  delete a.options.challenge; // aleatório por chamada
  delete b.options.challenge;

  assertEquals(a, b, "corpo deve ser idêntico para e-mail inexistente e conta sem passkey");
  assert(!("allowCredentials" in a.options), "sem credencial, allowCredentials não deve aparecer");
});

Deno.test("webauthn auth-options: conta na 2ª página é encontrada (paginação) e devolve allowCredentials", async () => {
  const users: User[] = Array.from({ length: 200 }, (_, i) => ({
    id: `u${i}`,
    email: `u${i}@zapp.test`,
  }));
  users.push({ id: "u-page2", email: "pagina2@zapp.test" });

  const mock = adminMock({
    users,
    credentials: { "u-page2": [{ credential_id: "cred-abc", transports: ["internal"] }] },
    inserted: [],
  });

  const res = await handleWebAuthn(
    req("10.0.0.3", { action: "authentication-options", userEmail: "pagina2@zapp.test" }),
    deps(mock, makeLimiter(100)),
  );

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.options.allowCredentials, [
    { id: "cred-abc", type: "public-key", transports: ["internal"] },
  ]);
});

Deno.test("webauthn auth-options: rate limit POR IP — 4ª chamada do mesmo IP → 429, IP novo segue 200", async () => {
  const mock = adminMock({ users: [], credentials: {}, inserted: [] });
  const d = deps(mock, makeLimiter(3));

  for (let i = 0; i < 3; i++) {
    const ok = await handleWebAuthn(req("10.0.0.9", { action: "authentication-options" }), d);
    assertEquals(ok.status, 200, `chamada ${i + 1} dentro do teto deveria passar`);
  }

  const blocked = await handleWebAuthn(req("10.0.0.9", { action: "authentication-options" }), d);
  assertEquals(blocked.status, 429, "acima do teto o IP recebe 429");

  const outro = await handleWebAuthn(req("10.0.0.10", { action: "authentication-options" }), d);
  assertEquals(outro.status, 200, "o teto é por IP, não global");
});
