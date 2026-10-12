// R2-AUTH-004 (item 6) — `requireAuth` barra perfil inativo/ausente.
//
// Estes testes são OFFLINE: `getUser` (bearer), a RPC da política de rede e o
// lookup de `profiles.is_active` são INJETADOS, então nada toca esm.sh, env ou
// banco. O que se prova é a trava herdada por TODA Edge protegida:
//
//   * perfil inativo/ausente/`is_active` nulo -> 403 neutro ("Access denied",
//     o mesmo corpo da negação da política — não revela estado do perfil);
//   * perfil ativo -> segue e devolve `{ userId }`;
//   * consulta de perfil que falha/rejeita -> 503 (fail-closed, nunca libera);
//   * a checagem roda DEPOIS da política: negação de rede nem consulta o perfil;
//   * o lookup default (produção) usa `profiles.user_id` com `.eq` exato —
//     nunca e-mail/`ilike`.
//
// Run with:
//   deno test --config scripts/ci/deno.json supabase/functions/_shared/__tests__/require-auth-profile-active.test.ts

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  requireAuth,
  profileActiveFrom,
  type AuthUserResult,
  type ProfileActiveResult,
} from "../validation.ts";

const URL = "https://example.supabase.co/functions/v1/alguma-edge";

function req(auth = "Bearer tok"): Request {
  return new Request(URL, { method: "POST", headers: { Authorization: auth } });
}

/** `getUser` injetado: devolve o usuário scriptado e registra a chamada. */
function fakeGetUser(result: AuthUserResult = { data: { user: { id: "u1" } }, error: null }) {
  const calls: string[] = [];
  return {
    calls,
    getUser: (authHeader: string) => {
      calls.push(authHeader);
      return Promise.resolve(result);
    },
  };
}

/** RPC da política de rede: `allowed` scriptado (o resto de `resolveNetworkPolicy`
 * é coberto por request-policy.test.ts). */
function fakePolicyRpc(allowed = true) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      return Promise.resolve({
        data: [{ allowed, reason: allowed ? null : "ip_blocked", rate_limit_max_requests: 10, rate_limit_window_seconds: 60 }],
        error: null,
      });
    },
  };
}

/** Lookup de perfil injetado: registra cada `userId` consultado. */
function fakeProfile(result: ProfileActiveResult) {
  const calls: string[] = [];
  return {
    calls,
    getProfileActive: (userId: string) => {
      calls.push(userId);
      return Promise.resolve(result);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

Deno.test("perfil inativo (is_active false): 403 neutro, sem operar", async () => {
  const gu = fakeGetUser();
  const policy = fakePolicyRpc();
  const profile = fakeProfile({ data: { is_active: false }, error: null });

  const res = await requireAuth(req(), {
    getUser: gu.getUser,
    policyRpc: policy,
    getProfileActive: profile.getProfileActive,
  });

  assert(res instanceof Response);
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, "Access denied");
  // Autenticou e resolveu o perfil do PRÓPRIO usuário autenticado (id exato).
  assertEquals(gu.calls, ["Bearer tok"]);
  assertEquals(profile.calls, ["u1"]);
});

Deno.test("perfil ausente (sem linha): 403 neutro, mesmo corpo do inativo", async () => {
  const profile = fakeProfile({ data: null, error: null });

  const res = await requireAuth(req(), {
    getUser: fakeGetUser().getUser,
    policyRpc: fakePolicyRpc(),
    getProfileActive: profile.getProfileActive,
  });

  assert(res instanceof Response);
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, "Access denied");
});

Deno.test("is_active nulo conta como inativo: 403", async () => {
  const res = await requireAuth(req(), {
    getUser: fakeGetUser().getUser,
    policyRpc: fakePolicyRpc(),
    getProfileActive: fakeProfile({ data: { is_active: null }, error: null }).getProfileActive,
  });

  assert(res instanceof Response);
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, "Access denied");
});

Deno.test("perfil ativo (is_active true): segue e devolve o userId", async () => {
  const profile = fakeProfile({ data: { is_active: true }, error: null });

  const result = await requireAuth(req(), {
    getUser: fakeGetUser().getUser,
    policyRpc: fakePolicyRpc(),
    getProfileActive: profile.getProfileActive,
  });

  assert(!(result instanceof Response));
  assertEquals(result.userId, "u1");
  assertEquals(profile.calls, ["u1"]);
});

Deno.test("consulta de perfil que retorna erro: 503 fail-closed (não libera)", async () => {
  const res = await requireAuth(req(), {
    getUser: fakeGetUser().getUser,
    policyRpc: fakePolicyRpc(),
    getProfileActive: fakeProfile({
      data: null,
      error: { code: "57014", message: "statement timeout" },
    }).getProfileActive,
  });

  assert(res instanceof Response);
  assertEquals(res.status, 503);
  // errorResponse reescreve 5xx para mensagem genérica (sem vazar detalhe interno).
  assertEquals((await res.json()).error, "Internal server error");
});

Deno.test("consulta de perfil que REJEITA a promise: 503 fail-closed", async () => {
  const res = await requireAuth(req(), {
    getUser: fakeGetUser().getUser,
    policyRpc: fakePolicyRpc(),
    getProfileActive: () => Promise.reject(new Error("fetch failed")),
  });

  assert(res instanceof Response);
  assertEquals(res.status, 503);
});

Deno.test("negação da política de rede: 403 ANTES de consultar o perfil", async () => {
  const profile = fakeProfile({ data: { is_active: true }, error: null });

  const res = await requireAuth(req(), {
    getUser: fakeGetUser().getUser,
    policyRpc: fakePolicyRpc(false),
    getProfileActive: profile.getProfileActive,
  });

  assert(res instanceof Response);
  assertEquals(res.status, 403);
  // O lookup de perfil NÃO rodou: a política corta primeiro.
  assertEquals(profile.calls.length, 0);
});

Deno.test("lookup default usa profiles.user_id com `.eq` exato — nunca e-mail/ilike", async () => {
  const fromCalls: Array<{ table: string; columns: string; column: string; value: string }> = [];
  const client = {
    rpc: () => Promise.resolve({ data: null, error: null }),
    from(table: string) {
      let columns = "";
      let column = "";
      let value = "";
      return {
        select(c: string) {
          columns = c;
          return {
            eq(col: string, v: string) {
              column = col;
              value = v;
              return {
                maybeSingle() {
                  fromCalls.push({ table, columns, column, value });
                  return Promise.resolve({ data: { is_active: true }, error: null });
                },
              };
            },
          };
        },
      };
    },
  };

  const lookup = profileActiveFrom(client);
  const out = await lookup("u7");

  assertEquals(out, { data: { is_active: true }, error: null });
  assertEquals(fromCalls, [
    { table: "profiles", columns: "is_active", column: "user_id", value: "u7" },
  ]);
});
