// Paridade V3 -> V2 (auditoria do frontend da V3, 2ª passada, 2026-10-12).
// Prova o handler REAL (não só a parte pura): lista as sessões de um usuário e
// encerra UMA sessão específica, ambas SÓ para admin, com auditoria — e o
// caminho NEGADO (não-admin, sem token, corpo inválido, sessão inexistente).
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/admin-user-sessions/index.test.ts

import {
  handleAdminUserSessionsRequest,
  summarizeUserAgent,
  buildSessionsUrl,
  sanitizeSession,
  type AdminUserSessionsAdminClient,
  type AdminUserSessionsCallerClient,
  type AdminUserSessionsDeps,
  type RawAuthSession,
  type SessionsResult,
} from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const CALLER_ID = "10000000-0000-0000-0000-00000000000a";
const TARGET_ID = "20000000-0000-0000-0000-00000000000b";
const SESSION_ID = "30000000-0000-0000-0000-00000000000c";

const ENV = (name: string) => {
  if (name === "SUPABASE_URL") return "https://stub.supabase.co";
  if (name === "SUPABASE_ANON_KEY") return "anon-de-teste";
  if (name === "SUPABASE_SERVICE_ROLE_KEY") return "service-de-teste";
  throw new Error(`env inesperado: ${name}`);
};

function callerOk(): AdminUserSessionsCallerClient {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: CALLER_ID } }, error: null }),
    },
  };
}

function callerSemSessao(): AdminUserSessionsCallerClient {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: { message: "invalid jwt" } }),
    },
  };
}

function fakeAdmin(role: string | null) {
  const calls: string[] = [];
  const admin: AdminUserSessionsAdminClient = {
    from(table: string) {
      let op = "";
      // deno-lint-ignore no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: () => { op = "select"; return builder; },
        insert: () => { op = "insert"; return builder; },
        eq: () => builder,
        single: () => {
          calls.push(`${table}:select`);
          return Promise.resolve({ data: role ? { role } : null, error: null });
        },
        then: (
          onOk: (v: { data: unknown; error: unknown }) => unknown,
          onErr?: (e: unknown) => unknown,
        ) => {
          calls.push(`${table}:${op}`);
          return Promise.resolve({ data: null, error: null }).then(onOk, onErr);
        },
      };
      return builder;
    },
  };
  return { admin, calls };
}

function fakeSessions(
  listResult: SessionsResult<RawAuthSession[]>,
  revokeResult: SessionsResult<null> = { ok: true, data: null },
) {
  const calls: Array<{ op: string; userId: string; sessionId?: string }> = [];
  return {
    calls,
    gateway: {
      list: (userId: string) => { calls.push({ op: "list", userId }); return Promise.resolve(listResult); },
      revoke: (userId: string, sessionId: string) => {
        calls.push({ op: "revoke", userId, sessionId });
        return Promise.resolve(revokeResult);
      },
    },
  };
}

function makeRequest(body: unknown, opts: { method?: string; auth?: string | null } = {}): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json", Origin: "http://localhost:5173" };
  if (opts.auth !== null) headers.Authorization = opts.auth ?? "Bearer token-de-teste";
  return new Request("https://stub.supabase.co/functions/v1/admin-user-sessions", {
    method: opts.method ?? "POST",
    headers,
    body: opts.method === "GET" || opts.method === "OPTIONS" ? undefined : JSON.stringify(body),
  });
}

function baseDeps(over: Partial<AdminUserSessionsDeps> = {}): AdminUserSessionsDeps {
  return {
    env: ENV,
    checkRateLimit: () => ({ allowed: true }),
    caller: callerOk(),
    ...over,
  };
}

// ─── Caminho feliz: listar ───────────────────────────────────

Deno.test("admin lista sessões com último uso, user agent resumido e IP (sem vazar o UA cru)", async () => {
  const { admin, calls: adminCalls } = fakeAdmin("admin");
  const { gateway, calls } = fakeSessions({
    ok: true,
    data: [{
      id: SESSION_ID,
      created_at: "2026-10-12T10:00:00Z",
      refreshed_at: "2026-10-12T11:30:00Z",
      updated_at: "2026-10-12T11:30:00Z",
      user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Safari/537.36",
      ip: "203.0.113.7",
    }],
  });

  const res = await handleAdminUserSessionsRequest(
    makeRequest({ action: "list", user_id: TARGET_ID }),
    baseDeps({ admin, sessions: gateway }),
  );

  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  const body = await res.json() as { action: string; sessions: Array<Record<string, unknown>> };
  assert(body.action === "list", `action inesperada: ${JSON.stringify(body)}`);
  assert(body.sessions.length === 1, `esperava 1 sessão, veio ${JSON.stringify(body.sessions)}`);
  const s = body.sessions[0];
  assert(s.id === SESSION_ID, `id errado: ${JSON.stringify(s)}`);
  assert(s.last_used_at === "2026-10-12T11:30:00Z", `último uso errado: ${JSON.stringify(s)}`);
  assert(s.user_agent === "Chrome · Windows", `UA resumido errado: ${JSON.stringify(s)}`);
  assert(s.ip === "203.0.113.7", `IP errado: ${JSON.stringify(s)}`);
  assert(
    !JSON.stringify(body).includes("AppleWebKit"),
    `a resposta não pode carregar o UA cru: ${JSON.stringify(body)}`,
  );
  assert(calls.length === 1 && calls[0].op === "list" && calls[0].userId === TARGET_ID,
    `gateway.list deveria ser chamado só com o alvo: ${JSON.stringify(calls)}`);
  assert(adminCalls.includes("user_roles:select"), `deveria conferir o papel: ${JSON.stringify(adminCalls)}`);
});

Deno.test("admin encerra uma sessão específica e grava a auditoria", async () => {
  const { admin, calls: adminCalls } = fakeAdmin("admin");
  const { gateway, calls } = fakeSessions({ ok: true, data: [] });

  const res = await handleAdminUserSessionsRequest(
    makeRequest({ action: "revoke", user_id: TARGET_ID, session_id: SESSION_ID }),
    baseDeps({ admin, sessions: gateway }),
  );

  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  const body = await res.json() as Record<string, unknown>;
  assert(body.revoked === true && body.session_id === SESSION_ID, `resposta inesperada: ${JSON.stringify(body)}`);
  assert(calls.some((c) => c.op === "revoke" && c.userId === TARGET_ID && c.sessionId === SESSION_ID),
    `gateway.revoke deveria receber (user_id, session_id): ${JSON.stringify(calls)}`);
  assert(adminCalls.includes("audit_logs:insert"), `revogação deveria ser auditada: ${JSON.stringify(adminCalls)}`);
});

// ─── Caminhos NEGADOS ────────────────────────────────────────

Deno.test("não-admin recebe 403 e o esquema auth NÃO é tocado", async () => {
  const { admin } = fakeAdmin("member");
  const { gateway, calls } = fakeSessions({ ok: true, data: [] });

  const res = await handleAdminUserSessionsRequest(
    makeRequest({ action: "list", user_id: TARGET_ID }),
    baseDeps({ admin, sessions: gateway }),
  );

  assert(res.status === 403, `esperava 403, veio ${res.status}`);
  assert(calls.length === 0, `não pode chamar o gateway: ${JSON.stringify(calls)}`);
});

Deno.test("sem linha em user_roles (papel desconhecido) também é 403", async () => {
  const { admin } = fakeAdmin(null);
  const { gateway, calls } = fakeSessions({ ok: true, data: [] });

  const res = await handleAdminUserSessionsRequest(
    makeRequest({ action: "list", user_id: TARGET_ID }),
    baseDeps({ admin, sessions: gateway }),
  );

  assert(res.status === 403, `esperava 403, veio ${res.status}`);
  assert(calls.length === 0, `não pode chamar o gateway: ${JSON.stringify(calls)}`);
});

Deno.test("sem header Authorization é 401", async () => {
  const { admin } = fakeAdmin("admin");
  const { gateway, calls } = fakeSessions({ ok: true, data: [] });

  const res = await handleAdminUserSessionsRequest(
    makeRequest({ action: "list", user_id: TARGET_ID }, { auth: null }),
    baseDeps({ admin, sessions: gateway }),
  );

  assert(res.status === 401, `esperava 401, veio ${res.status}`);
  assert(calls.length === 0, `não pode chamar o gateway: ${JSON.stringify(calls)}`);
});

Deno.test("token inválido (sem usuário) é 401", async () => {
  const { admin } = fakeAdmin("admin");
  const { gateway, calls } = fakeSessions({ ok: true, data: [] });

  const res = await handleAdminUserSessionsRequest(
    makeRequest({ action: "list", user_id: TARGET_ID }),
    baseDeps({ admin, sessions: gateway, caller: callerSemSessao() }),
  );

  assert(res.status === 401, `esperava 401, veio ${res.status}`);
  assert(calls.length === 0, `não pode chamar o gateway: ${JSON.stringify(calls)}`);
});

Deno.test("revoke sem session_id (uuid) é 422 e não revoga nem audita", async () => {
  const { admin, calls: adminCalls } = fakeAdmin("admin");
  const { gateway, calls } = fakeSessions({ ok: true, data: [] });

  const res = await handleAdminUserSessionsRequest(
    makeRequest({ action: "revoke", user_id: TARGET_ID, session_id: "nao-e-uuid" }),
    baseDeps({ admin, sessions: gateway }),
  );

  assert(res.status === 422, `esperava 422, veio ${res.status}`);
  const body = await res.json() as { error?: { code?: string } };
  assert(body.error?.code === "VALIDATION_ERROR", `corpo inesperado: ${JSON.stringify(body)}`);
  assert(calls.length === 0, `não pode chamar o gateway: ${JSON.stringify(calls)}`);
  assert(!adminCalls.includes("audit_logs:insert"), `não pode auditar sem revogar: ${JSON.stringify(adminCalls)}`);
});

Deno.test("ação desconhecida é 422 e não toca o Auth", async () => {
  const { admin } = fakeAdmin("admin");
  const { gateway, calls } = fakeSessions({ ok: true, data: [] });

  const res = await handleAdminUserSessionsRequest(
    makeRequest({ action: "wipe", user_id: TARGET_ID }),
    baseDeps({ admin, sessions: gateway }),
  );

  assert(res.status === 422, `esperava 422, veio ${res.status}`);
  assert(calls.length === 0, `não pode chamar o gateway: ${JSON.stringify(calls)}`);
});

Deno.test("sessão inexistente (gateway 404) é 404 e não grava auditoria", async () => {
  const { admin, calls: adminCalls } = fakeAdmin("admin");
  const { gateway } = fakeSessions({ ok: true, data: [] }, { ok: false, status: 404 });

  const res = await handleAdminUserSessionsRequest(
    makeRequest({ action: "revoke", user_id: TARGET_ID, session_id: SESSION_ID }),
    baseDeps({ admin, sessions: gateway }),
  );

  assert(res.status === 404, `esperava 404, veio ${res.status}`);
  assert(!adminCalls.includes("audit_logs:insert"), `não pode auditar revogação que não ocorreu: ${JSON.stringify(adminCalls)}`);
});

Deno.test("falha do gateway (500) vira 502 e não grava auditoria", async () => {
  const { admin, calls: adminCalls } = fakeAdmin("admin");
  const { gateway } = fakeSessions({ ok: true, data: [] }, { ok: false, status: 500 });

  const res = await handleAdminUserSessionsRequest(
    makeRequest({ action: "revoke", user_id: TARGET_ID, session_id: SESSION_ID }),
    baseDeps({ admin, sessions: gateway }),
  );

  assert(res.status === 502, `esperava 502, veio ${res.status}`);
  assert(!adminCalls.includes("audit_logs:insert"), `não pode auditar revogação que falhou: ${JSON.stringify(adminCalls)}`);
});

Deno.test("método não-POST é 405", async () => {
  const { admin } = fakeAdmin("admin");
  const { gateway } = fakeSessions({ ok: true, data: [] });

  const res = await handleAdminUserSessionsRequest(
    makeRequest(null, { method: "GET" }),
    baseDeps({ admin, sessions: gateway }),
  );

  assert(res.status === 405, `esperava 405, veio ${res.status}`);
});

Deno.test("OPTIONS responde o preflight sem corpo", async () => {
  const res = await handleAdminUserSessionsRequest(makeRequest(null, { method: "OPTIONS" }), baseDeps());
  assert(res.status === 200 && res.body === null, `preflight inesperado: ${res.status}`);
});

Deno.test("rate limit excedido é 429 e não toca o esquema auth", async () => {
  const { gateway, calls } = fakeSessions({ ok: true, data: [] });
  const res = await handleAdminUserSessionsRequest(
    makeRequest({ action: "list", user_id: TARGET_ID }),
    baseDeps({ sessions: gateway, checkRateLimit: () => ({ allowed: false }) }),
  );

  assert(res.status === 429, `esperava 429, veio ${res.status}`);
  assert(calls.length === 0, `não pode chamar o gateway: ${JSON.stringify(calls)}`);
});

// ─── Funções puras ───────────────────────────────────────────

Deno.test("summarizeUserAgent resume navegador e SO sem vazar o UA", () => {
  assert(summarizeUserAgent("Mozilla/5.0 (Windows NT 10.0) ... Chrome/142.0 Safari/537.36") === "Chrome · Windows",
    "Chrome/Windows");
  assert(summarizeUserAgent("Mozilla/5.0 (Windows NT 10.0) ... Edg/142.0 Chrome/142.0 Safari/537.36") === "Edge · Windows",
    "Edge não pode cair em Chrome");
  assert(summarizeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ... Version/17.0 Mobile Safari/604.1") === "Safari · iPhone",
    "iPhone não pode cair em macOS");
  assert(summarizeUserAgent("Mozilla/5.0 (Linux; Android 14) ... Chrome/142.0 Mobile Safari/537.36") === "Chrome · Android",
    "Android não pode cair em Linux");
  assert(summarizeUserAgent("curl/8.4.0") === "Navegador desconhecido · SO desconhecido", "UA exótico");
  assert(summarizeUserAgent(undefined) === "Dispositivo desconhecido", "UA ausente");
  assert(summarizeUserAgent("   ") === "Dispositivo desconhecido", "UA vazio");
});

Deno.test("buildSessionsUrl monta o endpoint admin do GoTrue sem barra dupla", () => {
  assert(
    buildSessionsUrl("https://x.supabase.co/", "u-1") === "https://x.supabase.co/auth/v1/admin/users/u-1/sessions",
    "list",
  );
  assert(
    buildSessionsUrl("https://x.supabase.co", "u-1", "s-2") === "https://x.supabase.co/auth/v1/admin/users/u-1/sessions/s-2",
    "revoke",
  );
});

Deno.test("sanitizeSession cai para updated_at quando não há refreshed_at", () => {
  const s = sanitizeSession({ id: "a", updated_at: "2026-01-01T00:00:00Z", ip: "" });
  assert(s.last_used_at === "2026-01-01T00:00:00Z", "último uso deve cair para updated_at");
  assert(s.ip === null, "IP vazio vira null");
});
