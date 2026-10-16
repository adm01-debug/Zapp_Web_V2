import { handleRevokeAuthSessions, planRevocation, decodeJwtClaims, buildRevocationAudit, recordRevocationAudit, decideThirdPartyRevocation, normalizeRole, resolveEffectiveRole } from "./index.ts";
import { resetRateLimitServiceClient } from "../_shared/validation.ts";

const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";

function fail(msg: string): never {
  throw new Error(msg);
}

// ─── Autorização (acceptance 2: usuário comum não revoga terceiro; admin pode) ───

Deno.test("global self: usuário comum pode revogar as próprias sessões sem ser admin", () => {
  const p = planRevocation("global", undefined, undefined, A, S1, false);
  if (!p.ok) fail("esperava plano ok para global self");
  if (p.target !== A) fail(`target deveria ser o próprio caller (${A}), veio ${p.target}`);
  if (p.actor !== null) fail("global não usa actor");
});

Deno.test("global de terceiro por usuário comum é recusado (403)", () => {
  const p = planRevocation("global", B, undefined, A, S1, false);
  if (p.ok) fail("usuário comum não pode revogar sessão de terceiro");
  if (p.status !== 403) fail(`status esperado 403, veio ${p.status}`);
});

Deno.test("global de terceiro por admin é permitido (revoga por user_id)", () => {
  const p = planRevocation("global", B, undefined, A, S1, true);
  if (!p.ok) fail("admin deveria poder revogar por user_id");
  if (p.target !== B) fail(`target deveria ser o terceiro (${B}), veio ${p.target}`);
});

// ─── Escopos (acceptance 1: local só a alvo; others preserva a indicada) ───

Deno.test("local exige target_session_id", () => {
  const p = planRevocation("local", undefined, undefined, A, S1, false);
  if (p.ok) fail("local sem target_session_id deveria ser recusado");
  if (p.status !== 400) fail(`status esperado 400, veio ${p.status}`);
});

Deno.test("local age na sessão alvo do próprio ator", () => {
  const p = planRevocation("local", undefined, S1, A, S1, false);
  if (!p.ok) fail("esperava plano ok para local");
  if (p.actor !== A) fail(`actor deveria ser o caller (${A})`);
  if (p.targetSession !== S1) fail(`targetSession deveria ser ${S1}`);
});

Deno.test("others exige a sessão atual (preservada)", () => {
  const p = planRevocation("others", undefined, undefined, A, null, false);
  if (p.ok) fail("others sem sessão atual deveria ser recusado");
  if (p.status !== 400) fail(`status esperado 400, veio ${p.status}`);
});

Deno.test("others preserva a sessão atual e age nas demais do ator", () => {
  const p = planRevocation("others", undefined, undefined, A, S1, false);
  if (!p.ok) fail("esperava plano ok para others");
  if (p.actor !== A) fail(`actor deveria ser o caller (${A})`);
  if (p.preserve !== S1) fail(`preserve deveria ser a sessão atual ${S1}`);
  if (p.targetSession !== null) fail("others não usa targetSession");
});

// ─── Decodificação do JWT (fail-closed, sem vazar tokens) ───

Deno.test("decodeJwtClaims extrai session_id de um JWT de acesso", () => {
  const header = btoa(JSON.stringify({ alg: "HS256" })).replace(/=+$/, "");
  const payload = btoa(JSON.stringify({ sub: A, session_id: S1, role: "authenticated" })).replace(/=+$/, "");
  const token = `${header}.${payload}.sig`;
  const claims = decodeJwtClaims(token);
  if (claims.session_id !== S1) fail(`session_id deveria ser ${S1}, veio ${claims.session_id}`);
});

Deno.test("decodeJwtClaims devolve {} para entrada malformada (não lança nem vaza)", () => {
  if (Object.keys(decodeJwtClaims("nao-e-jwt")).length !== 0) fail("token malformado deveria devolver {}");
  if (Object.keys(decodeJwtClaims("a.b")).length !== 0) fail("jwt com 2 partes deveria devolver {}");
  // payload base64 inválido
  if (Object.keys(decodeJwtClaims("a.!!!não-base64.c")).length !== 0) fail("payload inválido deveria devolver {}");
});

// ─── Auditoria das revogações (acceptance 3: quem revogou, qual escopo, alvo) ───

Deno.test("auditoria global self: ator é o próprio chamador e alvo é ele mesmo", () => {
  const p = planRevocation("global", undefined, undefined, A, S1, false);
  if (!p.ok) fail("esperava plano ok");
  const row = buildRevocationAudit(p, A, 3, "203.0.113.9");
  if (row.user_id !== A) fail(`ator da auditoria deveria ser ${A}, veio ${row.user_id}`);
  if (row.details.target_user_id !== A) fail(`alvo deveria ser ${A}, veio ${row.details.target_user_id}`);
  if (row.details.scope !== "global") fail(`escopo deveria ser global, veio ${row.details.scope}`);
  if (row.details.revoked !== 3) fail(`revoked deveria preservar 3, veio ${row.details.revoked}`);
  if (row.ip_address !== "203.0.113.9") fail(`ip deveria ser preservado, veio ${row.ip_address}`);
  if (row.entity_id !== null) fail("global não tem sessão alvo (entity_id deveria ser null)");
  if (row.action !== "auth_sessions_revoke" || row.entity_type !== "auth_session") fail("action/entity_type errados");
});

Deno.test("auditoria global de terceiro por admin: ator é o admin, alvo é o terceiro", () => {
  const p = planRevocation("global", B, undefined, A, S1, true);
  if (!p.ok) fail("esperava plano ok");
  const row = buildRevocationAudit(p, A, 2, "203.0.113.9");
  // O ator NUNCA é o alvo: quem agiu foi A (admin), e B só consta como alvo.
  if (row.user_id !== A) fail(`ator deveria ser o admin ${A}, veio ${row.user_id}`);
  if (row.details.target_user_id !== B) fail(`alvo deveria ser o terceiro ${B}, veio ${row.details.target_user_id}`);
  if (String(row.user_id) === String(row.details.target_user_id)) fail("ator e alvo não podem coincidir numa revogação de terceiro");
});

Deno.test("auditoria local: entity_id é a sessão alvo e o alvo é o próprio ator", () => {
  const p = planRevocation("local", undefined, S1, A, S1, false);
  if (!p.ok) fail("esperava plano ok");
  const row = buildRevocationAudit(p, A, 1, "198.51.100.4");
  if (row.user_id !== A) fail(`ator deveria ser ${A}`);
  if (row.details.target_user_id !== A) fail("local age nas sessões do próprio ator");
  if (row.entity_id !== S1) fail(`entity_id deveria ser a sessão alvo ${S1}, veio ${row.entity_id}`);
  if (row.details.scope !== "local") fail("escopo deveria ser local");
});

Deno.test("auditoria 'others': preserva a sessão atual (não a registra como alvo) e não vaza sessão", () => {
  const p = planRevocation("others", undefined, undefined, A, S1, false);
  if (!p.ok) fail("esperava plano ok");
  const row = buildRevocationAudit(p, A, 5, "198.51.100.4");
  if (row.user_id !== A) fail(`ator deveria ser ${A}`);
  if (row.details.target_user_id !== A) fail("others age nas sessões do próprio ator");
  if (row.entity_id !== null) fail("others não tem uma sessão alvo única (entity_id deveria ser null)");
  const serialized = JSON.stringify(row);
  if (serialized.includes(S1)) fail("a sessão preservada não pode aparecer na auditoria");
});

Deno.test("recordRevocationAudit grava na tabela audit_logs pela service role", async () => {
  const captured: { table: string; row: unknown }[] = [];
  const sink = {
    from(table: string) {
      return {
        insert(row: unknown) {
          captured.push({ table, row });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  const p = planRevocation("global", B, undefined, A, S1, true);
  if (!p.ok) fail("esperava plano ok");
  const row = buildRevocationAudit(p, A, 1, "203.0.113.9");
  const result = await recordRevocationAudit(sink, row);
  if (!result.ok) fail("insert sem erro deveria devolver ok=true");
  if (result.error !== null) fail("ok=true deve ter error=null");
  if (captured.length !== 1) fail(`esperava 1 insert, veio ${captured.length}`);
  if (captured[0].table !== "audit_logs") fail(`tabela deveria ser audit_logs, veio ${captured[0].table}`);
  if (captured[0].row !== row) fail("a linha gravada deveria ser exatamente a montada");
});

Deno.test("recordRevocationAudit devolve a falha em vez de lançar (não engole)", async () => {
  const sink = {
    from() {
      return { insert() { return Promise.resolve({ error: { message: "rls denied" } }); } };
    },
  };
  const p = planRevocation("global", undefined, undefined, A, S1, false);
  if (!p.ok) fail("esperava plano ok");
  const result = await recordRevocationAudit(sink, buildRevocationAudit(p, A, 1, "203.0.113.9"));
  if (result.ok) fail("insert com erro deveria devolver ok=false");
  if (result.error !== "rls denied") fail(`erro deveria ser propagado, veio ${result.error}`);
});

// ─── Matriz de papéis da revogação de terceiro (critério 1) ───────────────────
// A regra pura é o que o handler usa para decidir; provo cada célula da matriz.

function decision(callerRole: string | null, targetRole: string | null, isSelf = false) {
  return decideThirdPartyRevocation({
    isSelf,
    callerRole: normalizeRole(callerRole),
    targetRole: normalizeRole(targetRole),
  });
}

Deno.test("matriz: supervisor → admin é 403", () => {
  const d = decision("supervisor", "admin");
  if (d.allowed) fail("supervisor não pode derrubar admin");
  if (d.status !== 403) fail(`esperava 403, veio ${d.status}`);
});

Deno.test("matriz: supervisor → supervisor é 403", () => {
  const d = decision("supervisor", "supervisor");
  if (d.allowed) fail("supervisor não pode derrubar outro supervisor");
});

Deno.test("matriz: supervisor → agente é permitido", () => {
  const d = decision("supervisor", "agent");
  if (!d.allowed) fail("supervisor deve poder revogar a sessão de um agente");
});

Deno.test("matriz: supervisor → special_agent é permitido", () => {
  const d = decision("supervisor", "special_agent");
  if (!d.allowed) fail("special_agent é tier de agente: supervisor pode revogar");
});

Deno.test("matriz: admin → qualquer é permitido (admin/supervisor/agent)", () => {
  for (const alvo of ["admin", "supervisor", "special_agent", "agent"]) {
    const d = decision("admin", alvo);
    if (!d.allowed) fail(`admin deve poder revogar a sessão de ${alvo}`);
  }
});

Deno.test("matriz: agente → outro agente é 403 (só a própria)", () => {
  const d = decision("agent", "agent");
  if (d.allowed) fail("agente não pode derrubar a sessão de outro");
  if (d.status !== 403) fail(`esperava 403, veio ${d.status}`);
});

Deno.test("matriz: a própria sessão nunca é barrada, de qualquer papel", () => {
  for (const caller of ["admin", "supervisor", "special_agent", "agent", null]) {
    if (!decision(caller, "admin", true).allowed) fail(`self de ${caller} deveria ser permitido`);
  }
});

Deno.test("matriz: papel desconhecido nega (fail-closed) nos dois lados", () => {
  if (decision(null, "agent").allowed) fail("chamador sem papel não pode revogar terceiro");
  if (decision("supervisor", null).allowed) fail("alvo sem papel não pode ser alvo de supervisor");
  if (decision("supervisor", "papel-novo").allowed) fail("papel não reconhecido não pode ser alvo de supervisor");
});

Deno.test("normalizeRole aceita só os papéis canônicos", () => {
  if (normalizeRole("admin") !== "admin") fail("admin deveria normalizar");
  if (normalizeRole("special_agent") !== "special_agent") fail("special_agent deveria normalizar");
  if (normalizeRole("superuser") !== null) fail("papel desconhecido deveria virar null");
  if (normalizeRole(undefined) !== null) fail("undefined deveria virar null");
});

Deno.test("resolveEffectiveRole lê effective_role e nega em erro", async () => {
  const okClient = {
    rpc(fn: string, args: Record<string, unknown>) {
      if (fn !== "effective_role" || args._user_id !== A) fail("deve chamar effective_role com o _user_id do alvo");
      return Promise.resolve({ data: "supervisor", error: null });
    },
  };
  if (await resolveEffectiveRole(okClient, A) !== "supervisor") fail("deveria resolver supervisor");

  const errClient = {
    rpc() { return Promise.resolve({ data: null, error: { message: "boom" } }); },
  };
  if (await resolveEffectiveRole(errClient, A) !== null) fail("erro no RPC deveria negar (null)");
});

// O limite vive FORA do isolate (RPC service_role `consume_rate_limit`). Prova:
// com o decisor persistente negando, a função responde 429 + Retry-After ANTES de
// qualquer auth — e o RPC foi de fato consultado.
Deno.test("rate limit persistente: a função consulta o RPC e responde 429 com Retry-After", async () => {
  const savedUrl = Deno.env.get("SUPABASE_URL");
  const savedSrv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  Deno.env.set("SUPABASE_URL", "https://stub.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-service-key");
  resetRateLimitServiceClient();

  const originalFetch = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = typeof input === "string"
      ? input
      : input instanceof globalThis.URL
      ? input.toString()
      : (input as Request).url;
    seen.push(url);
    if (url.includes("/rest/v1/rpc/consume_rate_limit")) {
      return Promise.resolve(new Response(JSON.stringify([{ allowed: false, remaining: 0 }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    }
    return Promise.resolve(new Response("nao stubado", { status: 599 }));
  }) as typeof fetch;

  try {
    const req = new Request("https://stub.supabase.co/functions/v1/revoke-auth-sessions", {
      method: "POST",
      headers: { Authorization: "Bearer token-de-teste" },
      body: JSON.stringify({ scope: "self" }),
    });
    const res = await handleRevokeAuthSessions(req);
    if (res.status !== 429) fail(`esperado 429, veio ${res.status}`);
    if (res.headers.get("Retry-After") === null) fail("o 429 deve trazer Retry-After");
    if (!seen.some((u) => u.includes("/rest/v1/rpc/consume_rate_limit"))) {
      fail(`deveria consultar o limiter persistente: ${seen.join(",")}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
    resetRateLimitServiceClient();
    if (savedUrl === undefined) Deno.env.delete("SUPABASE_URL");
    else Deno.env.set("SUPABASE_URL", savedUrl);
    if (savedSrv === undefined) Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
    else Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", savedSrv);
  }
});

// ─── Rate limit do handler: persistente, chave por IP antes e por USUARIO depois ───

const URL = "https://example.supabase.co/functions/v1/revoke-auth-sessions";

function post(headers: Record<string, string> = {}): Request {
  return new Request(URL, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ scope: "global" }),
  });
}

const env = (name: string): string => {
  if (name === "SUPABASE_URL") return "https://stub.supabase.co";
  if (name === "SUPABASE_ANON_KEY") return "anon-key";
  if (name === "SUPABASE_SERVICE_ROLE_KEY") return "service-key";
  fail(`env inesperado: ${name}`);
};

function fakeCaller(id: string) {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: { id } }, error: null }) },
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
}

Deno.test("rate limit (IP) nega antes de ler o corpo e antes de autenticar", async () => {
  const keys: string[] = [];
  const res = await handleRevokeAuthSessions(post({ "x-forwarded-for": "9.9.9.9" }), {
    env,
    enforceRateLimit: (key) => {
      keys.push(key);
      return Promise.resolve({ allowed: false });
    },
  });
  if (res.status !== 429) fail(`esperado 429, veio ${res.status}`);
  if (keys.length !== 1 || keys[0] !== "revoke-auth-sessions:9.9.9.9") fail(`chaves: ${JSON.stringify(keys)}`);
});

Deno.test("rate limit por USUARIO pos-auth: conta comprometida trocando de IP -> 429", async () => {
  const keys: string[] = [];
  const res = await handleRevokeAuthSessions(post({ "x-forwarded-for": "9.9.9.9", Authorization: "Bearer x.y.z" }), {
    env,
    caller: fakeCaller(A),
    enforceRateLimit: (key) => {
      keys.push(key);
      return Promise.resolve({ allowed: !key.includes(":user:") });
    },
  });
  if (res.status !== 429) fail(`esperado 429, veio ${res.status}`);
  const esperado = [`revoke-auth-sessions:9.9.9.9`, `revoke-auth-sessions:user:${A}`];
  if (JSON.stringify(keys) !== JSON.stringify(esperado)) fail(`chaves: ${JSON.stringify(keys)}`);
});

Deno.test("sem Authorization responde 401 depois do gate por IP", async () => {
  const res = await handleRevokeAuthSessions(post({ "x-forwarded-for": "9.9.9.9" }), {
    env,
    enforceRateLimit: () => Promise.resolve({ allowed: true }),
  });
  if (res.status !== 401) fail(`esperado 401, veio ${res.status}`);
});
