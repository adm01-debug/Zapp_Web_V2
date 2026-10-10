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
function fakeAdmin(policy: { data: unknown; error: unknown }, extra: Record<string, { data: unknown; error: unknown }> = {}) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      if (fn === "resolve_network_policy") return Promise.resolve(policy);
      if (fn in extra) return Promise.resolve(extra[fn]);
      return Promise.resolve({ data: null, error: { message: `unexpected rpc ${fn}` } });
    },
  };
}

/** Fake do client anônimo: registra cada tentativa de signIn e devolve o scriptado. */
function fakeAnon(result: { data: { session: typeof SESSION | null; user: { id: string } | null }; error: { status?: number } | null } = {
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
