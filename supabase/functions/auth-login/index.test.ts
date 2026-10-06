// R2-AUTH-022 / item 27.4 — política de rede aplicada ao auth-login.
// t_9d4452e2 — gate consolidado: depois da política, UMA única RPC
// consume_login_gate decide bloqueio de conta + rate limit de IP e de e-mail.
//
// Estes testes são OFFLINE: o client service_role (admin) e o client anônimo são
// INJETADOS, então nenhuma chamada toca o banco nem o GoTrue. O que se prova é a
// ORDEM e o curto-circuito do handler:
//
//   * a negação da política (403/503) acontece DEPOIS de CORS/método e ANTES de
//     ler body, consultar usuário, registrar tentativa ou autenticar;
//   * depois da política há UMA única chamada a consume_login_gate — nunca as
//     três chamadas antigas (consume_rate_limit ×2 + is_account_locked);
//   * is_locked responde 423 e allowed=false responde 429, ambos sem chamar
//     signInWithPassword;
//   * corpo inválido (JSON/e-mail/senha) chama o gate com p_email=null — só o
//     contador de IP é consumido — e responde 400 se o IP estiver dentro do
//     teto (429 se estourou, como antes);
//   * erro da RPC responde 500 genérico, sem detalhe interno;
//   * o caminho permitido autentica e devolve a sessão;
//   * o limite configurável de `auth-login` prevalece sobre os hardcoded.
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

const POLICY_DENY_IP = { data: [{ allowed: false, reason: "ip_blocked", rate_limit_max_requests: 10, rate_limit_window_seconds: 60 }], error: null };
const POLICY_DENY_COUNTRY = { data: [{ allowed: false, reason: "country_blocked", rate_limit_max_requests: 10, rate_limit_window_seconds: 60 }], error: null };
const POLICY_ERROR = { data: null, error: { message: "connection reset" } };
const POLICY_ALLOW = { data: [{ allowed: true, reason: null, rate_limit_max_requests: 10, rate_limit_window_seconds: 60 }], error: null };

const GATE_OK = { data: [{ allowed: true, is_locked: false, locked_until: null, attempts: 0, remaining: 9 }], error: null };
const GATE_LOCKED = { data: [{ allowed: false, is_locked: true, locked_until: "2030-01-01T00:00:00.000Z", attempts: 5, remaining: 0 }], error: null };
const GATE_DENIED = { data: [{ allowed: false, is_locked: false, locked_until: null, attempts: 0, remaining: 0 }], error: null };
const GATE_ERROR = { data: null, error: { message: "permission denied for function consume_login_gate" } };

/** Quantas chamadas a uma RPC específica o admin recebeu. */
function callsTo(admin: ReturnType<typeof fakeAdmin>, fn: string) {
  return admin.calls.filter((c) => c.fn === fn);
}

// ─────────────────────────────────────────────────────────────────────────────

Deno.test("negação por IP (403) responde ANTES de body/credenciais/efeitos", async () => {
  const admin = fakeAdmin(POLICY_DENY_IP);
  const anon = fakeAnon();

  // Corpo inválido de propósito: se o handler lesse o body antes da política,
  // devolveria 400 (Invalid JSON). Aqui a política nega antes de qualquer leitura.
  const res = await handleLogin(post({ "x-forwarded-for": IP, "cf-ipcountry": "br" }, "{invalid"), {
    admin,
    anon,
  });

  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.error, "Access denied"); // genérico: não revela IP/país/regra

  // Só a RPC de política foi chamada — nada de gate, consultar usuário ou gravar tentativa.
  assertEquals(admin.calls.map((c) => c.fn), ["resolve_network_policy"]);
  assertEquals(anon.calls.length, 0);
});

Deno.test("negação por país (403) não chama autenticação nem grava tentativa", async () => {
  const admin = fakeAdmin(POLICY_DENY_COUNTRY);
  const anon = fakeAnon();

  const res = await handleLogin(post({ "x-forwarded-for": IP, "cf-ipcountry": "ru" }, JSON.stringify({ email: "a@b.com", password: "x" })), {
    admin,
    anon,
  });

  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, "Access denied");

  // consume_login_gate, record_failed_login e signInWithPassword NUNCA foram chamados.
  assertEquals(admin.calls.map((c) => c.fn), ["resolve_network_policy"]);
  assertEquals(anon.calls.length, 0);
});

Deno.test("erro de decisão responde 503 (indecidível, sem vazar regras)", async () => {
  const admin = fakeAdmin(POLICY_ERROR);
  const anon = fakeAnon();

  const res = await handleLogin(post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "x" })), {
    admin,
    anon,
  });

  assertEquals(res.status, 503);
  // errorResponse reescreve corpos 5xx para uma mensagem genérica: não vaza
  // listas, regras nem existência de conta.
  assertEquals((await res.json()).error, "Internal server error");
  assertEquals(admin.calls.map((c) => c.fn), ["resolve_network_policy"]);
  assertEquals(anon.calls.length, 0);
});

Deno.test("método não-POST responde 405 antes da política", async () => {
  const admin = fakeAdmin(POLICY_DENY_IP);
  const anon = fakeAnon();

  const res = await handleLogin(get(), { admin, anon });

  assertEquals(res.status, 405);
  assertEquals(admin.calls.length, 0);
  assertEquals(anon.calls.length, 0);
});

Deno.test("caminho permitido autentica e devolve a sessão (200)", async () => {
  const admin = fakeAdmin(POLICY_ALLOW, {
    consume_login_gate: GATE_OK,
    clear_login_attempts: { data: null, error: null },
  });
  const anon = fakeAnon();

  const res = await handleLogin(
    post({ "x-forwarded-for": IP, "cf-ipcountry": "br" }, JSON.stringify({ email: "a@b.com", password: "secret" })),
    { admin, anon },
  );

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.access_token, "tok");
  assertEquals(body.refresh_token, "ref");

  // Ordem: política -> gate único -> signIn -> clear. UMA chamada ao gate.
  assertEquals(admin.calls.map((c) => c.fn), ["resolve_network_policy", "consume_login_gate", "clear_login_attempts"]);
  assertEquals(callsTo(admin, "consume_login_gate").length, 1);
  // O gate recebe IP da requisição, o e-mail sanitizado e os limites decididos.
  assertEquals(callsTo(admin, "consume_login_gate")[0].args, {
    p_email: "a@b.com",
    p_ip: IP,
    p_ip_max: 10,
    p_ip_window_seconds: 60,
    p_email_max: 20,
    p_email_window_seconds: 60,
  });
  // As três chamadas antigas não existem mais.
  assertEquals(callsTo(admin, "consume_rate_limit").length, 0);
  assertEquals(callsTo(admin, "is_account_locked").length, 0);
  assertEquals(anon.calls.length, 1);
  assertEquals(anon.calls[0].email, "a@b.com");
});

Deno.test("limite configurável de `auth-login` prevalece sobre os hardcoded", async () => {
  const admin = fakeAdmin(
    { data: [{ allowed: true, reason: null, rate_limit_max_requests: 25, rate_limit_window_seconds: 120 }], error: null },
    {
      consume_login_gate: GATE_OK,
      clear_login_attempts: { data: null, error: null },
    },
  );
  const anon = fakeAnon();

  await handleLogin(
    post({ "x-forwarded-for": "1.2.3.4, 9.9.9.9" }, JSON.stringify({ email: "a@b.com", password: "secret" })),
    { admin, anon },
  );

  // O limite por IP usa o valor configurável (25 req / 120s), não o hardcoded 10/60.
  const gate = callsTo(admin, "consume_login_gate")[0];
  assertEquals(gate.args.p_ip, "9.9.9.9");
  assertEquals(gate.args.p_ip_max, 25);
  assertEquals(gate.args.p_ip_window_seconds, 120);
});

Deno.test("sem regra ativa, o limite por IP cai no hardcoded (10/60s)", async () => {
  // A RPC de política devolve allowed com limites ausentes -> o módulo usa os defaults.
  const admin = fakeAdmin(
    { data: [{ allowed: true, reason: null, rate_limit_max_requests: null, rate_limit_window_seconds: null }], error: null },
    {
      consume_login_gate: GATE_OK,
      clear_login_attempts: { data: null, error: null },
    },
  );
  const anon = fakeAnon();

  await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "secret" })),
    { admin, anon },
  );

  const gate = callsTo(admin, "consume_login_gate")[0];
  assertEquals(gate.args.p_ip_max, 10);
  assertEquals(gate.args.p_ip_window_seconds, 60);
});

Deno.test("conta travada responde 423 sem chamar signInWithPassword", async () => {
  const admin = fakeAdmin(POLICY_ALLOW, { consume_login_gate: GATE_LOCKED });
  const anon = fakeAnon();

  const res = await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "secret" })),
    { admin, anon },
  );

  assertEquals(res.status, 423);
  const body = await res.json();
  assertEquals(body.error, "Account locked");
  assertEquals(body.isLocked, true);
  assertEquals(body.attempts, 5);
  assertEquals(body.lockedUntil, "2030-01-01T00:00:00.000Z");

  // UMA chamada ao gate; GoTrue nunca é tocado.
  assertEquals(admin.calls.map((c) => c.fn), ["resolve_network_policy", "consume_login_gate"]);
  assertEquals(anon.calls.length, 0);
});

Deno.test("rate limit excedido responde 429 sem chamar signInWithPassword", async () => {
  const admin = fakeAdmin(POLICY_ALLOW, { consume_login_gate: GATE_DENIED });
  const anon = fakeAnon();

  const res = await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "secret" })),
    { admin, anon },
  );

  assertEquals(res.status, 429);
  assertEquals((await res.json()).error, "Rate limit exceeded");
  assertEquals(admin.calls.map((c) => c.fn), ["resolve_network_policy", "consume_login_gate"]);
  assertEquals(anon.calls.length, 0);
});

Deno.test("corpo inválido (JSON) consome apenas IP: gate com p_email=null, responde 400", async () => {
  const admin = fakeAdmin(POLICY_ALLOW, { consume_login_gate: GATE_OK });
  const anon = fakeAnon();

  const res = await handleLogin(post({ "x-forwarded-for": IP }, "{invalid"), { admin, anon });

  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "Invalid JSON");

  const gate = callsTo(admin, "consume_login_gate");
  assertEquals(gate.length, 1);
  assertEquals(gate[0].args.p_email, null); // sem e-mail válido: só o IP conta
  assertEquals(gate[0].args.p_ip, IP);
  assertEquals(anon.calls.length, 0);
});

Deno.test("e-mail inválido chama o gate com p_email=null e responde 400", async () => {
  const admin = fakeAdmin(POLICY_ALLOW, { consume_login_gate: GATE_OK });
  const anon = fakeAnon();

  const res = await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "nao-e-email", password: "x" })),
    { admin, anon },
  );

  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "invalid email");
  assertEquals(callsTo(admin, "consume_login_gate")[0].args.p_email, null);
  assertEquals(anon.calls.length, 0);
});

Deno.test("senha inválida chama o gate com p_email=null e responde 400", async () => {
  const admin = fakeAdmin(POLICY_ALLOW, { consume_login_gate: GATE_OK });
  const anon = fakeAnon();

  const res = await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com" })),
    { admin, anon },
  );

  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "invalid password");
  assertEquals(callsTo(admin, "consume_login_gate")[0].args.p_email, null);
  assertEquals(anon.calls.length, 0);
});

Deno.test("corpo inválido com IP no teto responde 429 (precedência preservada)", async () => {
  const admin = fakeAdmin(POLICY_ALLOW, { consume_login_gate: GATE_DENIED });
  const anon = fakeAnon();

  const res = await handleLogin(post({ "x-forwarded-for": IP }, "{invalid"), { admin, anon });

  assertEquals(res.status, 429);
  assertEquals((await res.json()).error, "Rate limit exceeded");
  assertEquals(callsTo(admin, "consume_login_gate")[0].args.p_email, null);
  assertEquals(anon.calls.length, 0);
});

Deno.test("erro da RPC do gate responde 500 sem detalhe interno", async () => {
  const admin = fakeAdmin(POLICY_ALLOW, { consume_login_gate: GATE_ERROR });
  const anon = fakeAnon();

  const res = await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "secret" })),
    { admin, anon },
  );

  assertEquals(res.status, 500);
  // errorResponse reescreve 5xx para mensagem genérica: nada de "permission
  // denied for function..." no corpo.
  assertEquals((await res.json()).error, "Internal server error");
  assertEquals(anon.calls.length, 0);
});

Deno.test("falha no signIn registra tentativa e devolve 401", async () => {
  const admin = fakeAdmin(POLICY_ALLOW, {
    consume_login_gate: GATE_OK,
    record_failed_login: { data: [{ is_locked: false, locked_until: null, attempts: 1 }], error: null },
  });
  const anon = fakeAnon({ data: { session: null, user: null }, error: { status: 400 } });

  const res = await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "wrong" })),
    { admin, anon },
  );

  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, "Invalid login credentials");
  assertEquals(anon.calls.length, 1);
  assertEquals(admin.calls.map((c) => c.fn), ["resolve_network_policy", "consume_login_gate", "record_failed_login"]);
});
