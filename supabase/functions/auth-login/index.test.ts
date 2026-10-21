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
//   * indisponibilidade do GoTrue responde 503 sem registrar tentativa;
//   * o caminho permitido autentica e devolve a sessão;
//   * o limite configurável de `auth-login` prevalece sobre os hardcoded;
//   * a negação NÃO chama signInWithPassword nem record_failed_login;
//   * se o contador PERSISTENTE do limite por e-mail estiver indisponível, o
//     login falha FECHADO (503) sem autenticar — a guarda por conta não pode
//     cair para o contador em memória, que zera a cada isolate.
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
  profiles: { data: { is_active: boolean | null } | null; error: unknown } | null = { data: { is_active: true }, error: null },
  signOutError: { message?: string } | null = null,
) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const fromCalls: Array<{ table: string; columns: string; column: string; value: string }> = [];
  const signOuts: Array<{ jwt: string; scope: string }> = [];
  return {
    calls,
    fromCalls,
    signOuts,
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
    auth: {
      admin: {
        signOut(jwt: string, scope: "global" | "local" | "others") {
          signOuts.push({ jwt, scope });
          return Promise.resolve({ error: signOutError });
        },
      },
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

/** Limiter injetável: por padrão permite. Os testes de indisponibilidade passam o próprio. */
function fakeRateLimit(result: { allowed: boolean; unavailable?: boolean } = { allowed: true }) {
  return {
    enforceRateLimit(_key: string, _max: number, _windowMs: number) {
      return Promise.resolve(result);
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

  // Só as RPCs de política e de registro do bloqueio foram chamadas — nada de
  // consultar usuário, gravar tentativa de senha ou consumir rate limit.
  assertEquals(admin.calls.map((c) => c.fn), ["resolve_network_policy", "log_login_block"]);
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

  // record_failed_login e signInWithPassword NUNCA foram chamados; o bloqueio é
  // registrado (log_login_block) para o painel de auditoria.
  assertEquals(admin.calls.map((c) => c.fn), ["resolve_network_policy", "log_login_block"]);
  assertEquals(admin.calls.some((c) => c.fn === "record_failed_login"), false);
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

Deno.test("bloqueio por país registra log_login_block com IP, país, motivo e user-agent", async () => {
  const admin = fakeAdmin(POLICY_DENY_COUNTRY, { log_login_block: { data: null, error: null } });
  const anon = fakeAnon();
  const rl = fakeRateLimit();

  const res = await handleLogin(
    post(
      { "x-forwarded-for": IP, "cf-ipcountry": "ru", "user-agent": "Mozilla/5.0 teste" },
      JSON.stringify({ email: "a@b.com", password: "x" }),
    ),
    { admin, anon, enforceRateLimit: rl.enforceRateLimit },
  );

  assertEquals(res.status, 403);
  const call = admin.calls.find((c) => c.fn === "log_login_block");
  // E-mail é null por design: o bloqueio acontece antes de ler o body.
  assertEquals(call?.args, {
    p_email: null,
    p_ip: IP,
    p_country_code: "RU",
    p_reason: "country_blocked",
    p_user_agent: "Mozilla/5.0 teste",
  });
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

// ── R2-AUTH-021: indisponibilidade do Auth NÃO é tentativa de senha incorreta ──
// Só a recusa de credenciais (4xx != 429) conta tentativa. 5xx, 429, falha de
// transporte (resolvida ou rejeitada) e resposta sem sessão nem erro são
// indisponibilidade: 503 genérico e login_attempts intocado.

function allowedAdmin() {
  return fakeAdmin(POLICY_ALLOW, { consume_login_gate: GATE_OK });
}

Deno.test("GoTrue indisponível (503) responde 503 e NÃO registra tentativa", async () => {
  const admin = allowedAdmin();
  const anon = fakeAnon({ data: { session: null, user: null }, error: { status: 503 } });

  const res = await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "secret" })),
    { admin, anon },
  );

  assertEquals(res.status, 503);
  assertEquals((await res.json()).error, "Internal server error");
  assertEquals(anon.calls.length, 1);
  assertEquals(callsTo(admin, "consume_login_gate").length, 1);
  assertEquals(admin.calls.some((c) => c.fn === "record_failed_login"), false);
});

Deno.test("rate limit do GoTrue (429) responde 503 e NÃO registra tentativa", async () => {
  const admin = allowedAdmin();
  const anon = fakeAnon({ data: { session: null, user: null }, error: { status: 429 } });

  const res = await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "secret" })),
    { admin, anon },
  );

  assertEquals(res.status, 503);
  assertEquals(anon.calls.length, 1);
  assertEquals(callsTo(admin, "consume_login_gate").length, 1);
  assertEquals(admin.calls.some((c) => c.fn === "record_failed_login"), false);
});

Deno.test("AuthRetryableFetchError responde 503 e NÃO registra tentativa", async () => {
  const admin = allowedAdmin();
  const anon = fakeAnon({
    data: { session: null, user: null },
    error: { name: "AuthRetryableFetchError" },
  });

  const res = await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "secret" })),
    { admin, anon },
  );

  assertEquals(res.status, 503);
  assertEquals(anon.calls.length, 1);
  assertEquals(callsTo(admin, "consume_login_gate").length, 1);
  assertEquals(admin.calls.some((c) => c.fn === "record_failed_login"), false);
});

Deno.test("falha de transporte que REJEITA a promise responde 503 e NÃO registra tentativa", async () => {
  const admin = allowedAdmin();
  const anon = fakeAnonReject(new Error("fetch failed"));

  const res = await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "secret" })),
    { admin, anon },
  );

  assertEquals(res.status, 503);
  assertEquals(anon.calls.length, 1);
  assertEquals(callsTo(admin, "consume_login_gate").length, 1);
  assertEquals(admin.calls.some((c) => c.fn === "record_failed_login"), false);
});

Deno.test("limiter persistente indisponível: login por e-mail falha FECHADO (503) sem autenticar", async () => {
  const admin = allowedAdmin();
  const anon = fakeAnon();
  const keys: string[] = [];

  const res = await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "secret" })),
    {
      admin,
      anon,
      enforceRateLimit: (key: string) => {
        keys.push(key);
        // O limite por IP respondeu normal; o por e-mail sinaliza indisponibilidade.
        return Promise.resolve(key.includes("email") ? { allowed: true, unavailable: true } : { allowed: true });
      },
    },
  );

  assertEquals(res.status, 503);
  // errorResponse reescreve 5xx: mensagem genérica de indisponibilidade.
  assertEquals((await res.json()).error, "Internal server error");
  // Fail-closed ANTES de lock/signIn: nenhuma credencial foi conferida.
  assertEquals(anon.calls.length, 0);
  assertEquals(admin.calls.map((c) => c.fn), ["resolve_network_policy"]);
  assertEquals(keys, [`auth-login:${IP}`, "auth-login-email:a@b.com"]);
});

Deno.test("resposta sem sessão e sem erro responde 503 e NÃO registra tentativa", async () => {
  const admin = allowedAdmin();
  const anon = fakeAnon({ data: { session: null, user: null }, error: null });

  const res = await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "secret" })),
    { admin, anon },
  );

  assertEquals(res.status, 503);
  assertEquals(anon.calls.length, 1);
  assertEquals(callsTo(admin, "consume_login_gate").length, 1);
  assertEquals(admin.calls.some((c) => c.fn === "record_failed_login"), false);
});

// ── modo `verify` (reautenticação sem trocar a sessão) ────────────────────────
// `{email,password,mode:'verify'}` valida a senha e devolve `{ok:true}` SEM
// tokens, revogando a sessão temporária criada pelo GoTrue (escopo `local`).
// As recusas (rede, rate limit, lockout, senha) são IDÊNTICAS ao login, e o
// login normal (sem `mode` ou `mode:'login'`) não passa por signOut.

function verifyBody(email = "a@b.com", password = "secret") {
  return JSON.stringify({ email, password, mode: "verify" });
}

/** Admin permitido com gate e clear scriptados; `extra`/`signOutError` por teste. */
function allowedVerifyAdmin(
  extra: Record<string, { data: unknown; error: unknown }> = {},
  signOutError: { message?: string } | null = null,
) {
  return fakeAdmin(
    POLICY_ALLOW,
    {
      consume_login_gate: GATE_OK,
      clear_login_attempts: { data: null, error: null },
      ...extra,
    },
    { data: { is_active: true }, error: null },
    signOutError,
  );
}

Deno.test("verify: senha correta devolve {ok:true} SEM tokens e revoga a sessão temporária", async () => {
  const admin = allowedVerifyAdmin();
  const anon = fakeAnon();

  const res = await handleLogin(post({ "x-forwarded-for": IP }, verifyBody()), { admin, anon });

  assertEquals(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  // Nenhum token: o corpo é exatamente {ok:true}.
  assertEquals(body, { ok: true });
  assertEquals("access_token" in body, false);
  assertEquals("refresh_token" in body, false);

  // A senha foi conferida pelo GoTrue e a sessão temporária foi revogada
  // (escopo `local` = só ela, sem derrubar a sessão real do usuário).
  assertEquals(anon.calls.length, 1);
  assertEquals(admin.signOuts, [{ jwt: "tok", scope: "local" }]);

  // Ordem igual ao login: política -> gate único -> tentativas zeradas.
  assertEquals(admin.calls.map((c) => c.fn), [
    "resolve_network_policy",
    "consume_login_gate",
    "clear_login_attempts",
  ]);
});

Deno.test("verify: senha errada tem recusa idêntica ao login (401) e não cria sessão", async () => {
  const admin = allowedVerifyAdmin({
    record_failed_login: { data: [{ is_locked: false, locked_until: null, attempts: 1 }], error: null },
  });
  const anon = fakeAnon({ data: { session: null, user: null }, error: { status: 400 } });

  const res = await handleLogin(post({ "x-forwarded-for": IP }, verifyBody("a@b.com", "wrong")), {
    admin,
    anon,
  });

  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, "Invalid login credentials");
  assertEquals(admin.calls.some((c) => c.fn === "record_failed_login"), true);
  // Sem sessão temporária: nada a revogar.
  assertEquals(admin.signOuts.length, 0);
});

Deno.test("verify: conta inativa/recusada pelo GoTrue (4xx) recusa como o login (401)", async () => {
  const admin = allowedVerifyAdmin({
    record_failed_login: { data: [{ is_locked: false, locked_until: null, attempts: 1 }], error: null },
  });
  // GoTrue recusa usuário inativo/banido com 4xx (não 429): mesma trilha de recusa.
  const anon = fakeAnon({ data: { session: null, user: null }, error: { status: 403 } });

  const res = await handleLogin(post({ "x-forwarded-for": IP }, verifyBody()), { admin, anon });

  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, "Invalid login credentials");
  assertEquals(admin.signOuts.length, 0);
});

Deno.test("verify: conta bloqueada responde 423 sem tocar no GoTrue nem na sessão", async () => {
  const admin = fakeAdmin(POLICY_ALLOW, { consume_login_gate: GATE_LOCKED });
  const anon = fakeAnon();

  const res = await handleLogin(post({ "x-forwarded-for": IP }, verifyBody()), { admin, anon });

  assertEquals(res.status, 423);
  assertEquals((await res.json()).error, "Account locked");
  assertEquals(anon.calls.length, 0);
  assertEquals(admin.signOuts.length, 0);
});

Deno.test("verify: rede negada responde 403 antes de qualquer efeito", async () => {
  const admin = fakeAdmin(POLICY_DENY_IP);
  const anon = fakeAnon();

  const res = await handleLogin(post({ "x-forwarded-for": IP, "cf-ipcountry": "br" }, verifyBody()), {
    admin,
    anon,
  });

  assertEquals(res.status, 403);
  assertEquals(admin.calls.map((c) => c.fn), ["resolve_network_policy", "log_login_block"]);
  assertEquals(anon.calls.length, 0);
  assertEquals(admin.signOuts.length, 0);
});

Deno.test("verify: falha ao revogar a sessão temporária responde 503 (falha fechada)", async () => {
  const admin = allowedVerifyAdmin({}, { message: "logout failed" });
  const anon = fakeAnon();

  const res = await handleLogin(post({ "x-forwarded-for": IP }, verifyBody()), { admin, anon });

  assertEquals(res.status, 503);
  assertEquals((await res.json()).error, "Internal server error");
  // A senha não pode voltar como aceita enquanto a sessão temporária não é revogada.
  assertEquals(admin.signOuts, [{ jwt: "tok", scope: "local" }]);
});

Deno.test("mode desconhecido responde 400 antes de qualquer efeito", async () => {
  const admin = fakeAdmin(POLICY_ALLOW);
  const anon = fakeAnon();

  const res = await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "secret", mode: "banana" })),
    { admin, anon },
  );

  assertEquals(res.status, 400);
  // A recusa fecha ANTES do gate e do GoTrue: nenhum contador consumido.
  assertEquals(admin.calls.map((c) => c.fn), ["resolve_network_policy"]);
  assertEquals(anon.calls.length, 0);
  assertEquals(admin.signOuts.length, 0);
});

Deno.test("login com `mode:'login'` explícito devolve tokens e NÃO revoga sessão", async () => {
  const admin = allowedVerifyAdmin();
  const anon = fakeAnon();

  const res = await handleLogin(
    post({ "x-forwarded-for": IP }, JSON.stringify({ email: "a@b.com", password: "secret", mode: "login" })),
    { admin, anon, enforceRateLimit: () => Promise.resolve({ allowed: true }) },
  );
  assertEquals(res.status, 200);
  assertEquals(admin.calls.some((c) => c.fn === "revoke_auth_sessions"), false);
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
  consume_login_gate: GATE_OK,
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
      consume_login_gate: GATE_OK,
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
