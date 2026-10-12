// R2-AUTH-022 / item 27.4 — política de rede aplicada ao auth-login.
//
// Estes testes são OFFLINE: o client service_role (admin), o client anônimo e o
// rate limit são INJETADOS, então nenhuma chamada toca o banco nem o GoTrue. O
// que se prova é a ORDEM e o curto-circuito do handler:
//
//   * a negação da política (403/503) acontece DEPOIS de CORS/método e ANTES de
//     ler body, consultar usuário, registrar tentativa, autenticar ou consumir
//     rate limit;
//   * o erro de decisão responde 503 sem revelar regras/listas;
//   * o caminho permitido autentica e devolve a sessão;
//   * o limite configurável de `auth-login` prevalece sobre os hardcoded;
//   * a negação NÃO chama signInWithPassword nem record_failed_login.
//
// Run with:
//   deno test --config scripts/ci/deno.json supabase/functions/auth-login/index.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleLogin } from "./index.ts";

const URL = "https://example.supabase.co/functions/v1/auth-login";
const IP = "9.9.9.9";
const SESSION = {
  access_token: "tok",
  refresh_token: "ref",
  expires_in: 3600,
  expires_at: null as number | null,
  token_type: "bearer",
};

function post(headers: Record<string, string> = {}, body?: string): Request {
  return new Request(URL, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body,
  });
}

function get(): Request {
  return new Request(URL, { method: "GET" });
}

/** Fake do client service_role: registra cada RPC e devolve o resultado scriptado. */
function fakeAdmin(
  policy: { data: unknown; error: unknown },
  extra: Record<string, { data: unknown; error: unknown }> = {},
  profiles: { data: { is_active: boolean | null } | null; error: unknown } = { data: { is_active: true }, error: null },
) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const fromCalls: Array<{ table: string; columns: string; column: string; value: string }> = [];
  return {
    calls,
    fromCalls,
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      if (fn === "resolve_network_policy") return Promise.resolve(policy);
      if (fn in extra) return Promise.resolve(extra[fn]);
      return Promise.resolve({ data: null, error: { message: `unexpected rpc ${fn}` } });
    },
    // Seam de leitura do perfil: registra o caminho exato (tabela/coluna/valor)
    // para provar que o lookup é por `profiles.user_id`, não por e-mail/ilike.
    from(table: string) {
      let columns = "";
      let column = "";
      let value = "";
      const filter = {
        eq(col: string, v: string) {
          column = col;
          value = v;
          return {
            maybeSingle() {
              fromCalls.push({ table, columns, column, value });
              return Promise.resolve(profiles);
            },
          };
        },
      };
      return { select: (c: string) => { columns = c; return filter; } };
    },
  };
}

/** Fake do client anônimo: registra cada tentativa de signIn e devolve o scriptado. */
function fakeAnon(result: { data: { session: typeof SESSION | null; user: { id: string } | null }; error: { status?: number; name?: string } | null } = {
  data: { session: SESSION, user: { id: "u1" } },
  error: null,
}) {
  const calls: Array<{ email: string; password: string }> = [];
  return {
    calls,
    auth: {
      signInWithPassword(creds: { email: string; password: string }) {
        calls.push(creds);
        return Promise.resolve(result);
      },
    },
  };
}

/** Fake do client anônimo cuja chamada REJEITA (falha de transporte que lança). */
function fakeAnonReject(err: Error) {
  const calls: Array<{ email: string; password: string }> = [];
  return {
    calls,
    auth: {
      signInWithPassword(creds: { email: string; password: string }) {
        calls.push(creds);
        return Promise.reject(err);
      },
    },
  };
}

/** Fake do rate limit: registra (key, max, window) e devolve allowed configurável. */
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

const POLICY_DENY_IP = { data: [{ allowed: false, reason: "ip_blocked", rate_limit_max_requests: 10, rate_limit_window_seconds: 60 }], error: null };
const POLICY_DENY_COUNTRY = { data: [{ allowed: false, reason: "country_blocked", rate_limit_max_requests: 10, rate_limit_window_seconds: 60 }], error: null };
const POLICY_ERROR = { data: null, error: { message: "connection reset" } };

// ─────────────────────────────────────────────────────────────────────────────

Deno.test("negação por IP (403) responde ANTES de body/credenciais/efeitos", async () => {
  const admin = fakeAdmin(POLICY_DENY_IP);
  const anon = fakeAnon();
  const rl = fakeRateLimit();

  // Corpo inválido de propósito: se o handler lesse o body antes da política,
  // devolveria 400 (Invalid JSON). Aqui a política nega antes de qualquer leitura.
  const res = await handleLogin(post({ "x-forwarded-for": IP, "cf-ipcountry": "br" }, "{invalid"), {
    admin,
    anon,
    enforceRateLimit: rl.enforceRateLimit,
  });

  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.error, "Access denied"); // genérico: não revela IP/país/regra

  // Só a RPC de política foi chamada — nada de consultar usuário, gravar tentativa
  // ou consumir rate limit.
  assertEquals(admin.calls.map((c) => c.fn), ["resolve_network_policy"]);
  assertEquals(anon.calls.length, 0);
  assertEquals(rl.calls.length, 0);
});

Deno.test("negação por país (403) não chama autenticação nem grava tentativa", async () => {
  const admin = fakeAdmin(POLICY_DENY_COUNTRY);
  const anon = fakeAnon();
  const rl = fakeRateLimit();

  const res = await handleLogin(post({ "x-forwarded-for": IP, "cf-ipcountry": "ru" }, JSON.stringify({ email: "a@b.com", password: "x" })), {
    admin,
    anon,
    enforceRateLimit: rl.enforceRateLimit,
  });

  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, "Access denied");

  // record_failed_login e signInWithPassword NUNCA foram chamados.
  assertEquals(admin.calls.map((c) => c.fn), ["resolve_network_policy"]);
  assertEquals(admin.calls.some((c) => c.fn === "record_failed_login"), false);
  assertEquals(anon.calls.length, 0);
  assertEquals(rl.calls.length, 0);
});

Deno.test("erro de decisão responde 503 (indecidível, sem vazar regras)", async () => {
  const admin = fakeAdmin(POLICY_ERROR);
  const anon = fakeAnon();
  const rl = fakeRateLimit();

  const res = await handleLogin(post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "x" })), {
    admin,
    anon,
    enforceRateLimit: rl.enforceRateLimit,
  });

  assertEquals(res.status, 503);
  // errorResponse reescreve corpos 5xx para uma mensagem genérica: não vaza
  // listas, regras nem existência de conta.
  assertEquals((await res.json()).error, "Internal server error");
  assertEquals(admin.calls.map((c) => c.fn), ["resolve_network_policy"]);
  assertEquals(anon.calls.length, 0);
  assertEquals(rl.calls.length, 0);
});

Deno.test("método não-POST responde 405 antes da política", async () => {
  const admin = fakeAdmin(POLICY_DENY_IP);
  const anon = fakeAnon();
  const rl = fakeRateLimit();

  const res = await handleLogin(get(), { admin, anon, enforceRateLimit: rl.enforceRateLimit });

  assertEquals(res.status, 405);
  assertEquals(admin.calls.length, 0);
  assertEquals(anon.calls.length, 0);
  assertEquals(rl.calls.length, 0);
});

Deno.test("caminho permitido autentica e devolve a sessão (200)", async () => {
  const admin = fakeAdmin(
    { data: [{ allowed: true, reason: null, rate_limit_max_requests: 10, rate_limit_window_seconds: 60 }], error: null },
    {
      is_account_locked: { data: [{ is_locked: false, locked_until: null, attempts: 0 }], error: null },
      clear_login_attempts: { data: null, error: null },
    },
  );
  const anon = fakeAnon();
  const rl = fakeRateLimit();

  const res = await handleLogin(
    post({ "x-forwarded-for": IP, "cf-ipcountry": "br" }, JSON.stringify({ email: "a@b.com", password: "secret" })),
    { admin, anon, enforceRateLimit: rl.enforceRateLimit },
  );

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.access_token, "tok");
  assertEquals(body.refresh_token, "ref");

  // Ordem: política -> rate limit por IP -> rate limit por e-mail -> lock -> signIn.
  assertEquals(admin.calls.map((c) => c.fn), ["resolve_network_policy", "is_account_locked", "clear_login_attempts"]);
  assertEquals(anon.calls.length, 1);
  assertEquals(anon.calls[0].email, "a@b.com");
  assertEquals(rl.calls.length, 2);
});

Deno.test("limite configurável de `auth-login` prevalece sobre os hardcoded", async () => {
  const admin = fakeAdmin(
    { data: [{ allowed: true, reason: null, rate_limit_max_requests: 25, rate_limit_window_seconds: 120 }], error: null },
    {
      is_account_locked: { data: [{ is_locked: false, locked_until: null, attempts: 0 }], error: null },
      clear_login_attempts: { data: null, error: null },
    },
  );
  const anon = fakeAnon();
  const rl = fakeRateLimit();

  await handleLogin(
    post({ "x-forwarded-for": "1.2.3.4, 9.9.9.9" }, JSON.stringify({ email: "a@b.com", password: "secret" })),
    { admin, anon, enforceRateLimit: rl.enforceRateLimit },
  );

  // O limite por IP usa o valor configurável (25 req / 120s), não o hardcoded 10/60.
  assertEquals(rl.calls[0], { key: "auth-login:9.9.9.9", max: 25, windowMs: 120_000 });
});

Deno.test("sem regra ativa, o limite por IP cai no hardcoded (10/60s)", async () => {
  // A RPC devolve allowed com limites ausentes/inválidos -> o módulo usa os defaults.
  const admin = fakeAdmin(
    { data: [{ allowed: true, reason: null, rate_limit_max_requests: null, rate_limit_window_seconds: null }], error: null },
    {
      is_account_locked: { data: [{ is_locked: false, locked_until: null, attempts: 0 }], error: null },
      clear_login_attempts: { data: null, error: null },
    },
  );
  const anon = fakeAnon();
  const rl = fakeRateLimit();

  await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "secret" })),
    { admin, anon, enforceRateLimit: rl.enforceRateLimit },
  );

  assertEquals(rl.calls[0], { key: "auth-login:9.9.9.9", max: 10, windowMs: 60_000 });
});

Deno.test("falha no signIn registra tentativa e devolve 401", async () => {
  const admin = fakeAdmin(
    { data: [{ allowed: true, reason: null, rate_limit_max_requests: 10, rate_limit_window_seconds: 60 }], error: null },
    {
      is_account_locked: { data: [{ is_locked: false, locked_until: null, attempts: 0 }], error: null },
      record_failed_login: { data: [{ is_locked: false, locked_until: null, attempts: 1 }], error: null },
    },
  );
  const anon = fakeAnon({ data: { session: null, user: null }, error: { status: 400 } });
  const rl = fakeRateLimit();

  const res = await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "wrong" })),
    { admin, anon, enforceRateLimit: rl.enforceRateLimit },
  );

  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, "Invalid login credentials");
  assertEquals(anon.calls.length, 1);
  assertEquals(admin.calls.some((c) => c.fn === "record_failed_login"), true);
});

// ── R2-AUTH-021: indisponibilidade do Auth NÃO é tentativa de senha incorreta ──
// Só a recusa de credenciais (4xx != 429) conta tentativa. 5xx, 429, falha de
// transporte (resolvida ou rejeitada) e resposta sem sessão nem erro são
// indisponibilidade: 503 genérico e login_attempts intocado.

function allowedAdmin() {
  return fakeAdmin(
    { data: [{ allowed: true, reason: null, rate_limit_max_requests: 10, rate_limit_window_seconds: 60 }], error: null },
    { is_account_locked: { data: [{ is_locked: false, locked_until: null, attempts: 0 }], error: null } },
  );
}

Deno.test("GoTrue indisponível (503) responde 503 e NÃO registra tentativa", async () => {
  const admin = allowedAdmin();
  const anon = fakeAnon({ data: { session: null, user: null }, error: { status: 503 } });
  const rl = fakeRateLimit();

  const res = await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "secret" })),
    { admin, anon, enforceRateLimit: rl.enforceRateLimit },
  );

  assertEquals(res.status, 503);
  assertEquals((await res.json()).error, "Internal server error");
  assertEquals(anon.calls.length, 1);
  assertEquals(admin.calls.some((c) => c.fn === "record_failed_login"), false);
});

Deno.test("rate limit do GoTrue (429) responde 503 e NÃO registra tentativa", async () => {
  const admin = allowedAdmin();
  const anon = fakeAnon({ data: { session: null, user: null }, error: { status: 429 } });
  const rl = fakeRateLimit();

  const res = await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "secret" })),
    { admin, anon, enforceRateLimit: rl.enforceRateLimit },
  );

  assertEquals(res.status, 503);
  assertEquals(anon.calls.length, 1);
  assertEquals(admin.calls.some((c) => c.fn === "record_failed_login"), false);
});

Deno.test("AuthRetryableFetchError responde 503 e NÃO registra tentativa", async () => {
  const admin = allowedAdmin();
  const anon = fakeAnon({
    data: { session: null, user: null },
    error: { name: "AuthRetryableFetchError" },
  });
  const rl = fakeRateLimit();

  const res = await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "secret" })),
    { admin, anon, enforceRateLimit: rl.enforceRateLimit },
  );

  assertEquals(res.status, 503);
  assertEquals(anon.calls.length, 1);
  assertEquals(admin.calls.some((c) => c.fn === "record_failed_login"), false);
});

Deno.test("falha de transporte que REJEITA a promise responde 503 e NÃO registra tentativa", async () => {
  const admin = allowedAdmin();
  const anon = fakeAnonReject(new Error("fetch failed"));
  const rl = fakeRateLimit();

  const res = await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "secret" })),
    { admin, anon, enforceRateLimit: rl.enforceRateLimit },
  );

  assertEquals(res.status, 503);
  assertEquals(anon.calls.length, 1);
  assertEquals(admin.calls.some((c) => c.fn === "record_failed_login"), false);
});

Deno.test("resposta sem sessão e sem erro responde 503 e NÃO registra tentativa", async () => {
  const admin = allowedAdmin();
  const anon = fakeAnon({ data: { session: null, user: null }, error: null });
  const rl = fakeRateLimit();

  const res = await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "secret" })),
    { admin, anon, enforceRateLimit: rl.enforceRateLimit },
  );

  assertEquals(res.status, 503);
  assertEquals(anon.calls.length, 1);
  assertEquals(admin.calls.some((c) => c.fn === "record_failed_login"), false);
});

// ── R2-AUTH-004 (item 6): credencial válida com perfil inativo NÃO entra ──────
// O perfil é resolvido DEPOIS do GoTrue (bcrypt já rodou — sem oráculo de tempo)
// por `profiles.user_id = signIn.user.id`: igualdade exata no índice UNIQUE, o
// MESMO id de auth.users. Ausente/inativo/`is_active` nulo revoga a sessão
// recém-emitida e devolve o MESMO 401/corpo da senha errada (sem oráculo de
// enumeração). Erro na consulta é fail-closed: revoga e responde 500.

const ALLOWED_POLICY = {
  data: [{ allowed: true, reason: null, rate_limit_max_requests: 10, rate_limit_window_seconds: 60 }],
  error: null,
};
const INACTIVE_EXTRA = {
  is_account_locked: { data: [{ is_locked: false, locked_until: null, attempts: 0 }], error: null },
  record_failed_login: { data: [{ is_locked: false, locked_until: null, attempts: 3 }], error: null },
  revoke_auth_sessions: { data: null, error: null },
};

Deno.test("perfil inativo: revoga a sessão, registra tentativa e devolve 401 sem token", async () => {
  const admin = fakeAdmin(ALLOWED_POLICY, INACTIVE_EXTRA, { data: { is_active: false }, error: null });
  const anon = fakeAnon();
  const rl = fakeRateLimit();

  const res = await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "secret" })),
    { admin, anon, enforceRateLimit: rl.enforceRateLimit },
  );

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Invalid login credentials");
  assertEquals(body.access_token, undefined);
  assertEquals(body.attempts, 3);

  // GoTrue rodou ANTES do lookup; a sessão recém-emitida foi revogada; a
  // tentativa foi registrada; as tentativas NÃO foram zeradas.
  assertEquals(anon.calls.length, 1);
  const revoke = admin.calls.find((c) => c.fn === "revoke_auth_sessions");
  assertEquals(revoke?.args.p_scope, "global");
  assertEquals(revoke?.args.p_target_user_id, "u1");
  assertEquals(admin.calls.some((c) => c.fn === "record_failed_login"), true);
  assertEquals(admin.calls.some((c) => c.fn === "clear_login_attempts"), false);

  // O lookup foi por `profiles.user_id` = id do usuário autenticado — nunca por e-mail/ilike.
  assertEquals(admin.fromCalls, [{ table: "profiles", columns: "is_active", column: "user_id", value: "u1" }]);
});

Deno.test("perfil inativo: corpo e status IDÊNTICOS à senha errada (sem oráculo)", async () => {
  const inactive = fakeAdmin(ALLOWED_POLICY, INACTIVE_EXTRA, { data: { is_active: false }, error: null });
  const resInactive = await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "secret" })),
    { admin: inactive, anon: fakeAnon(), enforceRateLimit: fakeRateLimit().enforceRateLimit },
  );
  const bodyInactive = await resInactive.json();

  const wrongPass = fakeAdmin(ALLOWED_POLICY, INACTIVE_EXTRA);
  const resWrong = await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "wrong" })),
    {
      admin: wrongPass,
      anon: fakeAnon({ data: { session: null, user: null }, error: { status: 400 } }),
      enforceRateLimit: fakeRateLimit().enforceRateLimit,
    },
  );
  const bodyWrong = await resWrong.json();

  assertEquals(resInactive.status, resWrong.status);
  assertEquals(bodyInactive, bodyWrong);
});

Deno.test("perfil ausente (sem linha): revoga a sessão e devolve o mesmo 401", async () => {
  const admin = fakeAdmin(ALLOWED_POLICY, INACTIVE_EXTRA, { data: null, error: null });
  const anon = fakeAnon();

  const res = await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "secret" })),
    { admin, anon, enforceRateLimit: fakeRateLimit().enforceRateLimit },
  );

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Invalid login credentials");
  assertEquals(body.access_token, undefined);
  assertEquals(admin.calls.some((c) => c.fn === "revoke_auth_sessions"), true);
  assertEquals(admin.calls.some((c) => c.fn === "record_failed_login"), true);
});

Deno.test("is_active nulo conta como inativo (não entra)", async () => {
  const admin = fakeAdmin(ALLOWED_POLICY, INACTIVE_EXTRA, { data: { is_active: null }, error: null });

  const res = await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "secret" })),
    { admin, anon: fakeAnon(), enforceRateLimit: fakeRateLimit().enforceRateLimit },
  );

  assertEquals(res.status, 401);
  assertEquals((await res.json()).access_token, undefined);
  assertEquals(admin.calls.some((c) => c.fn === "revoke_auth_sessions"), true);
});

Deno.test("erro na consulta do perfil: revoga a sessão e responde 500 (fail-closed)", async () => {
  const admin = fakeAdmin(ALLOWED_POLICY, INACTIVE_EXTRA, {
    data: null,
    error: { code: "57014", message: "canceling statement due to statement timeout" },
  });

  const res = await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "secret" })),
    { admin, anon: fakeAnon(), enforceRateLimit: fakeRateLimit().enforceRateLimit },
  );

  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "Internal server error");
  // Nem token nem tentativa: consulta que falhou não libera a sessão nem conta lockout.
  assertEquals(admin.calls.some((c) => c.fn === "revoke_auth_sessions"), true);
  assertEquals(admin.calls.some((c) => c.fn === "record_failed_login"), false);
  assertEquals(admin.calls.some((c) => c.fn === "clear_login_attempts"), false);
});

Deno.test("perfil ativo (is_active true) entra: 200 com sessão e sem revogação", async () => {
  const admin = fakeAdmin(
    ALLOWED_POLICY,
    {
      is_account_locked: { data: [{ is_locked: false, locked_until: null, attempts: 0 }], error: null },
      clear_login_attempts: { data: null, error: null },
    },
    { data: { is_active: true }, error: null },
  );

  const res = await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "secret" })),
    { admin, anon: fakeAnon(), enforceRateLimit: fakeRateLimit().enforceRateLimit },
  );

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.access_token, "tok");
  assertEquals(admin.calls.some((c) => c.fn === "revoke_auth_sessions"), false);
  assertEquals(admin.calls.some((c) => c.fn === "clear_login_attempts"), true);
  assertEquals(admin.fromCalls, [{ table: "profiles", columns: "is_active", column: "user_id", value: "u1" }]);
});
