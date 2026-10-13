import { handleRevokeAuthSessions, planRevocation, decodeJwtClaims } from "./index.ts";

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
