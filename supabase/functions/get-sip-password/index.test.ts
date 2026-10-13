// T15 — provisionamento da linha pelo servidor (host/porta vêm do servidor; o
// front não conhece a linha; porta não-numérica não vira NaN).
//
// Cartão t_b4a368f1 — a senha deixou de ser o `SIP_PASSWORD` GLOBAL + ramal
// `phone1` (mesma linha para todo mundo) e passou a ser a credencial do
// atendente logado, lida do Vault pela RPC `get_voip_profile_credentials`.
// O que estes testes travam: (1) o perfil e o ramal vêm SEMPRE do token — o
// atendente A nunca recebe a credencial de B; (2) sem credencial a resposta é
// 409 `VOIP_NOT_PROVISIONED`, não um segredo compartilhado de fallback; (3) a
// leitura fica na auditoria SEM a senha; (4) auditoria que falha NÃO entrega o
// segredo (falha fechada); (5) o `SIP_PASSWORD` global não pode voltar ao código.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read supabase/functions/get-sip-password/index.test.ts

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  provisionamentoSip,
  credencialSipPorAtendente,
  handleGetSipPassword,
  type SipAdminClient,
  type SipAuthClient,
} from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const semEnv = () => undefined;
const comEnv = (vars: Record<string, string>) => (key: string) => vars[key];

// ---------------------------------------------------------------------------
// T15 — provisionamento da linha (server + porta)
// ---------------------------------------------------------------------------

Deno.test("T15: sem variáveis de ambiente usa os defaults (o hardcode que saiu do front)", () => {
  assertEquals(provisionamentoSip(semEnv), {
    server: "ip.b24-9441-1552764901.bitrixphone.com",
    wsPort: 8089,
  });
});

Deno.test("T15: com variáveis de ambiente usa o que o servidor diz", () => {
  assertEquals(provisionamentoSip(comEnv({ SIP_SERVER: "sip.outro.com", SIP_WS_PORT: "5066" })), {
    server: "sip.outro.com",
    wsPort: 5066,
  });
});

Deno.test("T15: porta vazia ou não-numérica cai no default (nunca NaN)", () => {
  assertEquals(provisionamentoSip(comEnv({ SIP_WS_PORT: "" })).wsPort, 8089);
  assertEquals(provisionamentoSip(comEnv({ SIP_WS_PORT: "abc" })).wsPort, 8089);
});

Deno.test("T15: wsPort sai como número (o front tipa number)", () => {
  assertEquals(typeof provisionamentoSip(comEnv({ SIP_WS_PORT: "5066" })).wsPort, "number");
});

// ---------------------------------------------------------------------------
// Dublês
// ---------------------------------------------------------------------------

const A = { token: "token-a", userId: "user-a", profileId: "perfil-a", ramal: "phoneA", senha: "senha-a" };
const B = { token: "token-b", userId: "user-b", profileId: "perfil-b", ramal: "phoneB", senha: "senha-b" };

interface Conta {
  userId: string;
  profile: { id: string; is_active: boolean } | null;
}

function fakeAuth(contas: Record<string, Conta>) {
  let atual: Conta | undefined;
  const client = {
    auth: {
      getClaims: (token: string) => {
        atual = contas[token];
        return Promise.resolve({ data: { claims: atual ? { sub: atual.userId } : null }, error: null });
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: atual?.profile ?? null, error: null }),
        }),
      }),
    }),
  };
  return client as unknown as SipAuthClient;
}

function fakeAdmin(
  opts: { rows?: Array<Record<string, unknown>>; rpcError?: { message: string }; auditError?: { message: string } } = {},
) {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const inserts: Array<Record<string, unknown>> = [];
  const client = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: opts.rows ?? [], error: opts.rpcError ?? null });
    },
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        inserts.push({ table, ...row });
        return Promise.resolve({ error: opts.auditError ?? null });
      },
    }),
  };
  return { admin: client as unknown as SipAdminClient, rpcCalls, inserts };
}

const deps = (
  authClient: SipAuthClient,
  admin: SipAdminClient,
  overrides: Record<string, unknown> = {},
) => ({ getEnv: semEnv, checkRateLimit: () => ({ allowed: true }), authClient, admin, ...overrides });

function requisicao(token?: string): Request {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.Authorization = token === "" ? "" : `Bearer ${token}`;
  return new Request("https://stub.supabase.co/functions/v1/get-sip-password", {
    method: "POST",
    headers,
  });
}

// ---------------------------------------------------------------------------
// Credencial do atendente (helper)
// ---------------------------------------------------------------------------

Deno.test("credencial: usa a RPC get_voip_profile_credentials com o id do perfil pedido", async () => {
  const { admin, rpcCalls } = fakeAdmin({ rows: [{ ramal: "phoneA", sip_password: "senha-a" }] });
  const cred = await credencialSipPorAtendente(admin, "perfil-a");

  assertEquals(cred, { ok: true, ramal: "phoneA", password: "senha-a" });
  assertEquals(rpcCalls, [{ fn: "get_voip_profile_credentials", args: { p_profile_id: "perfil-a" } }]);
});

Deno.test("credencial: resposta vazia é 'sem ramal' (não um ramal em branco)", async () => {
  const { admin } = fakeAdmin({ rows: [] });
  assertEquals(await credencialSipPorAtendente(admin, "perfil-a"), { ok: false, motivo: "sem_ramal" });
});

Deno.test("credencial: linha com senha em branco NÃO vira credencial válida", async () => {
  const { admin } = fakeAdmin({ rows: [{ ramal: "phoneA", sip_password: "" }] });
  assertEquals(await credencialSipPorAtendente(admin, "perfil-a"), { ok: false, motivo: "sem_ramal" });
});

Deno.test("credencial: erro da RPC é 'falha_leitura' — não há fallback para segredo global", async () => {
  const { admin } = fakeAdmin({ rpcError: { message: "permission denied" } });
  assertEquals(await credencialSipPorAtendente(admin, "perfil-a"), { ok: false, motivo: "falha_leitura" });
});

// ---------------------------------------------------------------------------
// Endpoint — dono da credencial e trilha
// ---------------------------------------------------------------------------

Deno.test("endpoint: cada atendente recebe SÓ a própria credencial (A não lê B)", async () => {
  const auth = fakeAuth({
    [A.token]: { userId: A.userId, profile: { id: A.profileId, is_active: true } },
    [B.token]: { userId: B.userId, profile: { id: B.profileId, is_active: true } },
  });

  // O banco responde ao ramal pedido: a prova de que o id do token é o usado.
  const porPerfil: Record<string, { ramal: string; sip_password: string }> = {
    [A.profileId]: { ramal: A.ramal, sip_password: A.senha },
    [B.profileId]: { ramal: B.ramal, sip_password: B.senha },
  };
  const rpcCalls: Array<{ fn: string; args: { p_profile_id?: string } }> = [];
  const inserts: Array<Record<string, unknown>> = [];
  const admin = {
    rpc: (fn: string, args: { p_profile_id?: string }) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: [porPerfil[args.p_profile_id ?? ""]], error: null });
    },
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        inserts.push({ table, ...row });
        return Promise.resolve({ error: null });
      },
    }),
  } as unknown as SipAdminClient;

  const resA = await handleGetSipPassword(requisicao(A.token), deps(auth, admin));
  const resB = await handleGetSipPassword(requisicao(B.token), deps(auth, admin));

  assertEquals(resA.status, 200);
  assertEquals(resB.status, 200);
  const bodyA = await resA.json() as Record<string, unknown>;
  const bodyB = await resB.json() as Record<string, unknown>;

  assertEquals(bodyA.user, A.ramal);
  assertEquals(bodyA.password, A.senha);
  assertEquals(bodyA.profileId, A.profileId);
  assertEquals(bodyB.user, B.ramal);
  assertEquals(bodyB.password, B.senha);

  // Nenhuma resposta pôde vazar a credencial do outro.
  assert(!JSON.stringify(bodyA).includes(B.ramal) && !JSON.stringify(bodyA).includes(B.senha), `A vazou B: ${JSON.stringify(bodyA)}`);
  assert(!JSON.stringify(bodyB).includes(A.ramal) && !JSON.stringify(bodyB).includes(A.senha), `B vazou A: ${JSON.stringify(bodyB)}`);

  // A RPC foi chamada com o perfil do TOKEN — nunca com um id do corpo.
  assertEquals(rpcCalls, [
    { fn: "get_voip_profile_credentials", args: { p_profile_id: A.profileId } },
    { fn: "get_voip_profile_credentials", args: { p_profile_id: B.profileId } },
  ]);
});

Deno.test("endpoint: sem credencial responde 409 VOIP_NOT_PROVISIONED e sem senha no corpo", async () => {
  const auth = fakeAuth({ [A.token]: { userId: A.userId, profile: { id: A.profileId, is_active: true } } });
  const { admin, inserts } = fakeAdmin({ rows: [] });

  const res = await handleGetSipPassword(requisicao(A.token), deps(auth, admin));

  assertEquals(res.status, 409);
  const body = await res.json() as Record<string, unknown>;
  assertEquals(body.code, "VOIP_NOT_PROVISIONED");
  assert(!("password" in body), `409 não pode trazer senha: ${JSON.stringify(body)}`);
  assertEquals(inserts.length, 0, "sem credencial não há leitura a auditar");
});

Deno.test("endpoint: falha da RPC responde 500 sem senha (falha fechada, sem fallback)", async () => {
  const auth = fakeAuth({ [A.token]: { userId: A.userId, profile: { id: A.profileId, is_active: true } } });
  const { admin, inserts } = fakeAdmin({ rpcError: { message: "vault fora do ar" } });

  const res = await handleGetSipPassword(requisicao(A.token), deps(auth, admin));

  assertEquals(res.status, 500);
  const body = await res.json() as Record<string, unknown>;
  assert(!("password" in body), `500 não pode trazer senha: ${JSON.stringify(body)}`);
  assert(!JSON.stringify(body).includes(A.senha), "erro não pode ecoar o segredo");
  assertEquals(inserts.length, 0, "leitura que falhou não gera registro de entrega");
});

Deno.test("endpoint: a leitura vai para audit_logs SEM a senha", async () => {
  const auth = fakeAuth({ [A.token]: { userId: A.userId, profile: { id: A.profileId, is_active: true } } });
  const { admin, inserts } = fakeAdmin({ rows: [{ ramal: A.ramal, sip_password: A.senha }] });

  const res = await handleGetSipPassword(requisicao(A.token), deps(auth, admin));
  assertEquals(res.status, 200);

  assertEquals(inserts.length, 1);
  const trilha = inserts[0];
  assertEquals(trilha.table, "audit_logs");
  assertEquals(trilha.user_id, A.userId);
  assertEquals(trilha.action, "sip_credentials_read");
  assertEquals(trilha.entity_id, A.profileId);
  assertEquals((trilha.details as { ramal?: string }).ramal, A.ramal);
  assert(!JSON.stringify(trilha).includes(A.senha), `a auditoria não pode conter a senha: ${JSON.stringify(trilha)}`);
});

Deno.test("endpoint: auditoria que falha NÃO entrega o segredo (500, falha fechada)", async () => {
  const auth = fakeAuth({ [A.token]: { userId: A.userId, profile: { id: A.profileId, is_active: true } } });
  const { admin } = fakeAdmin({ rows: [{ ramal: A.ramal, sip_password: A.senha }], auditError: { message: "insert negado" } });

  const res = await handleGetSipPassword(requisicao(A.token), deps(auth, admin));

  assertEquals(res.status, 500);
  const body = await res.json() as Record<string, unknown>;
  assert(!("password" in body) && !JSON.stringify(body).includes(A.senha), `sem trilha não sai segredo: ${JSON.stringify(body)}`);
});

Deno.test("endpoint: perfil inativo e token inválido param antes de tocar o Vault", async () => {
  const authInativo = fakeAuth({ [A.token]: { userId: A.userId, profile: { id: A.profileId, is_active: false } } });
  const semConta = fakeAuth({});
  const { admin, rpcCalls } = fakeAdmin({ rows: [{ ramal: A.ramal, sip_password: A.senha }] });

  const inativo = await handleGetSipPassword(requisicao(A.token), deps(authInativo, admin));
  const semToken = await handleGetSipPassword(requisicao(), deps(semConta, admin));
  const tokenRuim = await handleGetSipPassword(requisicao(B.token), deps(semConta, admin));

  assertEquals(inativo.status, 403);
  assertEquals(semToken.status, 401);
  assertEquals(tokenRuim.status, 401);
  assertEquals(rpcCalls.length, 0, "guarda de auth/perfil precisa vir antes da leitura do Vault");
});

Deno.test("endpoint: rate limit responde 429 sem tocar o Vault", async () => {
  const auth = fakeAuth({ [A.token]: { userId: A.userId, profile: { id: A.profileId, is_active: true } } });
  const { admin, rpcCalls } = fakeAdmin({ rows: [{ ramal: A.ramal, sip_password: A.senha }] });

  const res = await handleGetSipPassword(requisicao(A.token), deps(auth, admin, { checkRateLimit: () => ({ allowed: false }) }));

  assertEquals(res.status, 429);
  assertEquals(rpcCalls.length, 0);
});

// ---------------------------------------------------------------------------
// Guarda de regressão: o segredo global não pode voltar
// ---------------------------------------------------------------------------

Deno.test("o código não lê mais SIP_PASSWORD (não há segredo global de fallback)", () => {
  const fonte = Deno.readTextFileSync(new URL("./index.ts", import.meta.url));
  assert(!fonte.includes("SIP_PASSWORD"), "SIP_PASSWORD (segredo global) voltou ao código da Edge");
  assertStringIncludes(fonte, "get_voip_profile_credentials");
});
