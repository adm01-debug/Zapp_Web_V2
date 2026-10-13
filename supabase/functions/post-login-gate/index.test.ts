// ADR-007 — porteiro pós-login (Edge `post-login-gate`).
//
// Testes OFFLINE: getUser (GoTrue), o client service_role (política + revogação) e
// a leitura de `profiles.is_active` são INJETADOS; nenhuma chamada toca rede/env.
// O que se prova é o comportamento do porteiro para o usuário já autenticado:
//
//   * política de rede NEGADA (403) -> encerra a sessão (revoke_auth_sessions,
//     scope `local` da própria sessão) e devolve a MESMA recusa genérica do login;
//   * conta inativa -> encerra a sessão e devolve a mesma recusa genérica;
//   * permitido -> {allowed:true} e NENHUMA revogação;
//   * decisão INDECIDÍVEL (503) -> 503 genérico e NÃO revoga (sem prova de negação);
//   * sem bearer/JWT inválido -> 401 sem tocar política/revogação/perfil;
//   * sem o claim session_id, a revogação cai no scope `global` do PRÓPRIO usuário.
//
// Run with:
//   deno test --config scripts/ci/deno.json supabase/functions/post-login-gate/index.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  handlePostLoginGate,
  type PostLoginGateDeps,
  type ProfileActiveReader,
} from "./index.ts";

const URL = "https://example.supabase.co/functions/v1/post-login-gate";
const IP = "9.9.9.9";
const USER = "11111111-1111-1111-1111-111111111111";
const SESSION = "22222222-2222-2222-2222-222222222222";

/** JWT de mentira com o claim `session_id` — a assinatura não é validada aqui. */
function jwt(sessionId: string | null): string {
  const payload = sessionId ? { session_id: sessionId } : {};
  const b64 = btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `header.${b64}.sig`;
}

function post(headers: Record<string, string> = {}, sessionId: string | null = SESSION): Request {
  return new Request(URL, {
    method: "POST",
    headers: { "x-forwarded-for": IP, authorization: `Bearer ${jwt(sessionId)}`, ...headers },
  });
}

function get(): Request {
  return new Request(URL, { method: "GET" });
}

type RpcResult = { data: unknown; error: unknown };

/** Fake do client service_role: registra cada RPC e devolve o scriptado. */
function fakeAdmin(policy: RpcResult, revoke: RpcResult = { data: 1, error: null }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      if (fn === "resolve_network_policy") return Promise.resolve(policy);
      if (fn === "revoke_auth_sessions") return Promise.resolve(revoke);
      return Promise.resolve({ data: null, error: { message: `unexpected rpc ${fn}` } });
    },
  };
}

/** Fake do leitor de profiles: devolve a linha/erro scriptados. */
function fakeProfiles(row: { is_active?: boolean | null } | null, error: unknown = null) {
  const calls: Array<{ table: string; column: string; value: string }> = [];
  const reader = {
    from(table: string) {
      return {
        select(_columns: string) {
          return {
            eq(column: string, value: string) {
              calls.push({ table, column, value });
              return { maybeSingle: () => Promise.resolve({ data: row, error }) };
            },
          };
        },
      };
    },
  };
  return { calls, reader: reader as unknown as ProfileActiveReader };
}

function fakeGetUser(
  result: { data: { user: { id: string } | null }; error: unknown } = {
    data: { user: { id: USER } },
    error: null,
  },
) {
  const calls: string[] = [];
  return {
    calls,
    getUser(authHeader: string) {
      calls.push(authHeader);
      return Promise.resolve(result);
    },
  };
}

function deps(overrides: {
  policy: RpcResult;
  profiles?: ReturnType<typeof fakeProfiles>;
  user?: ReturnType<typeof fakeGetUser>;
  revoke?: RpcResult;
}): { deps: PostLoginGateDeps; admin: ReturnType<typeof fakeAdmin>; profiles: ReturnType<typeof fakeProfiles>; user: ReturnType<typeof fakeGetUser> } {
  const admin = fakeAdmin(overrides.policy, overrides.revoke);
  const profiles = overrides.profiles ?? fakeProfiles({ is_active: true });
  const user = overrides.user ?? fakeGetUser();
  return {
    deps: { getUser: user.getUser, admin, profiles: profiles.reader },
    admin,
    profiles,
    user,
  };
}

const POLICY_ALLOW = { data: [{ allowed: true, reason: null, rate_limit_max_requests: 30, rate_limit_window_seconds: 60 }], error: null };
const POLICY_DENY_IP = { data: [{ allowed: false, reason: "ip_blocked", rate_limit_max_requests: 30, rate_limit_window_seconds: 60 }], error: null };
const POLICY_DENY_COUNTRY = { data: [{ allowed: false, reason: "country_blocked", rate_limit_max_requests: 30, rate_limit_window_seconds: 60 }], error: null };
const POLICY_ERROR = { data: null, error: { message: "connection reset" } };

function revokeCalls(admin: ReturnType<typeof fakeAdmin>) {
  return admin.calls.filter((c) => c.fn === "revoke_auth_sessions");
}

// ─────────────────────────────────────────────────────────────────────────────

Deno.test("rede negada (403) encerra a sessão atual e devolve a recusa genérica do login", async () => {
  const { deps: d, admin, user } = deps({ policy: POLICY_DENY_IP });

  const res = await handlePostLoginGate(post(), d);

  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.error, "Access denied"); // mesma recusa do login, sem vazar a regra
  assertEquals(body.allowed, undefined);

  // Revogou SÓ a sessão atual (scope local, self-only) do usuário autenticado.
  const revokes = revokeCalls(admin);
  assertEquals(revokes.length, 1);
  assertEquals(revokes[0].args, {
    p_scope: "local",
    p_actor_user_id: USER,
    p_target_user_id: null,
    p_target_session_id: SESSION,
    p_preserve_session_id: null,
  });
  assertEquals(user.calls.length, 1);
});

Deno.test("rede negada por país (403) também encerra a sessão", async () => {
  const { deps: d, admin } = deps({ policy: POLICY_DENY_COUNTRY });

  const res = await handlePostLoginGate(post(), d);

  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, "Access denied");
  assertEquals(revokeCalls(admin).length, 1);
});

Deno.test("conta inativa encerra a sessão e devolve a mesma recusa genérica", async () => {
  const profiles = fakeProfiles({ is_active: false });
  const { deps: d, admin } = deps({ policy: POLICY_ALLOW, profiles });

  const res = await handlePostLoginGate(post(), d);

  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, "Access denied");
  assertEquals(revokeCalls(admin).length, 1);
  // A leitura do perfil é do PRÓPRIO usuário autenticado.
  assertEquals(profiles.calls, [{ table: "profiles", column: "user_id", value: USER }]);
});

Deno.test("perfil ausente é tratado como inativo (falha fechada)", async () => {
  const profiles = fakeProfiles(null);
  const { deps: d, admin } = deps({ policy: POLICY_ALLOW, profiles });

  const res = await handlePostLoginGate(post(), d);

  assertEquals(res.status, 403);
  assertEquals(revokeCalls(admin).length, 1);
});

Deno.test("permitido devolve {allowed:true} e NÃO revoga", async () => {
  const { deps: d, admin } = deps({ policy: POLICY_ALLOW });

  const res = await handlePostLoginGate(post(), d);

  assertEquals(res.status, 200);
  assertEquals(await res.json(), { allowed: true });
  assertEquals(revokeCalls(admin).length, 0);
  // Só a RPC de política foi chamada.
  assertEquals(admin.calls.map((c) => c.fn), ["resolve_network_policy"]);
});

Deno.test("decisão indecidível (503) responde 503 e NÃO revoga a sessão", async () => {
  const { deps: d, admin } = deps({ policy: POLICY_ERROR });

  const res = await handlePostLoginGate(post(), d);

  assertEquals(res.status, 503);
  assertEquals((await res.json()).error, "Internal server error"); // genérico, não vaza regra
  assertEquals(revokeCalls(admin).length, 0);
});

Deno.test("sem o claim session_id, a revogação cai no scope global do próprio usuário", async () => {
  const { deps: d, admin } = deps({ policy: POLICY_DENY_IP });

  const res = await handlePostLoginGate(post({}, null), d);

  assertEquals(res.status, 403);
  const revokes = revokeCalls(admin);
  assertEquals(revokes.length, 1);
  assertEquals(revokes[0].args, {
    p_scope: "global",
    p_actor_user_id: null,
    p_target_user_id: USER,
    p_target_session_id: null,
    p_preserve_session_id: null,
  });
});

Deno.test("JWT inválido responde 401 sem tocar política, perfil nem revogação", async () => {
  const user = fakeGetUser({ data: { user: null }, error: { message: "invalid" } });
  const { deps: d, admin, profiles } = deps({ policy: POLICY_ALLOW, user });

  const res = await handlePostLoginGate(post(), d);

  assertEquals(res.status, 401);
  assertEquals(admin.calls.length, 0);
  assertEquals(profiles.calls.length, 0);
});

Deno.test("sem bearer responde 401 antes de qualquer efeito", async () => {
  const { deps: d, admin, user } = deps({ policy: POLICY_ALLOW });

  const res = await handlePostLoginGate(
    new Request(URL, { method: "POST", headers: { "x-forwarded-for": IP } }),
    d,
  );

  assertEquals(res.status, 401);
  assertEquals(admin.calls.length, 0);
  assertEquals(user.calls.length, 0);
});

Deno.test("método não-POST responde 405 antes de autenticar", async () => {
  const { deps: d, admin, user } = deps({ policy: POLICY_ALLOW });

  const res = await handlePostLoginGate(get(), d);

  assertEquals(res.status, 405);
  assertEquals(admin.calls.length, 0);
  assertEquals(user.calls.length, 0);
});
