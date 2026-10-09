// T15 — provisionamento da linha pelo servidor.
//
// O que estes testes travam: (1) host/usuário/porta vêm do servidor e o front
// não pode voltar a conhecer a linha; (2) sem as variáveis de ambiente os
// defaults são exatamente os valores que estavam hardcoded no front (é o que
// permite publicar a função antes de configurar qualquer segredo novo); (3)
// porta vazia ou não-numérica não vira NaN — um `wss://host:NaN/ws` derruba a
// conexão inteira.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env supabase/functions/get-sip-password/index.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { provisionamentoSip, handleGetSipPassword, autorizarTelefonia } from "./index.ts";

const semEnv = () => undefined;
const comEnv = (vars: Record<string, string>) => (key: string) => vars[key];

Deno.test("T15: sem variáveis de ambiente usa os defaults (o hardcode que saiu do front)", () => {
  assertEquals(provisionamentoSip(semEnv), {
    server: "ip.b24-9441-1552764901.bitrixphone.com",
    user: "phone1",
    wsPort: 8089,
  });
});

Deno.test("T15: com variáveis de ambiente usa o que o servidor diz", () => {
  assertEquals(
    provisionamentoSip(comEnv({ SIP_SERVER: "sip.outro.com", SIP_USER: "phone9", SIP_WS_PORT: "5066" })),
    { server: "sip.outro.com", user: "phone9", wsPort: 5066 },
  );
});

Deno.test("T15: porta vazia ou não-numérica cai no default (nunca NaN)", () => {
  assertEquals(provisionamentoSip(comEnv({ SIP_WS_PORT: "" })).wsPort, 8089);
  assertEquals(provisionamentoSip(comEnv({ SIP_WS_PORT: "abc" })).wsPort, 8089);
});

Deno.test("T15: wsPort sai como número (o front tipa number)", () => {
  assertEquals(typeof provisionamentoSip(comEnv({ SIP_WS_PORT: "5066" })).wsPort, "number");
});

// ── autorizarTelefonia: mesma regra que NavigationService.canAccess('voip') ──
// A view voip nao tem permission nem roles no NavigationService, logo o acesso
// e aberto a usuarios ativos. A funcao verifica que o perfil existe e esta ativo.

function mockSupabase(overrides: {
  profile?: { id: string; is_active: boolean } | null;
  profileError?: Error | null;
}) {
  return {
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: overrides.profile ?? null, error: overrides.profileError ?? null }),
        }),
      }),
    }),
  };
}

const ACTIVE_USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const INACTIVE_USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const MISSING_USER_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

Deno.test("autorizarTelefonia: usuario ativo → true", async () => {
  const mock = mockSupabase({ profile: { id: "profile-1", is_active: true } });
  assertEquals(await autorizarTelefonia(mock, ACTIVE_USER_ID), true);
});

Deno.test("autorizarTelefonia: usuario inativo → false", async () => {
  const mock = mockSupabase({ profile: { id: "profile-1", is_active: false } });
  assertEquals(await autorizarTelefonia(mock, INACTIVE_USER_ID), false);
});

Deno.test("autorizarTelefonia: usuario inexistente → false", async () => {
  const mock = mockSupabase({ profile: null });
  assertEquals(await autorizarTelefonia(mock, MISSING_USER_ID), false);
});

// ── handleGetSipPassword: regra de acesso voip ──────────────────

function mockSupabaseAuthed(overrides: {
  claims?: { sub: string } | null;
  claimsError?: Error | null;
  profile?: { id: string; is_active: boolean } | null;
  profileError?: Error | null;
}) {
  return {
    auth: {
      getClaims: () => Promise.resolve({ data: { claims: overrides.claims ?? null }, error: overrides.claimsError ?? null }),
    },
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: overrides.profile ?? null, error: overrides.profileError ?? null }),
        }),
      }),
    }),
  };
}

Deno.test("handleGetSipPassword: usuario ativo → 200", async () => {
  Deno.env.set('SIP_PASSWORD', 'test-password');
  const mock = mockSupabaseAuthed({
    claims: { sub: ACTIVE_USER_ID },
    profile: { id: "profile-1", is_active: true },
  });
  const res = await handleGetSipPassword(
    new Request("https://edge.invalid/get-sip-password", {
      headers: { Authorization: "Bearer token-de-teste" },
    }),
    { supabase: mock },
  );
  assertEquals(res.status, 200);
});

Deno.test("handleGetSipPassword: usuario inativo → 403", async () => {
  const mock = mockSupabaseAuthed({
    claims: { sub: INACTIVE_USER_ID },
    profile: { id: "profile-1", is_active: false },
  });
  const res = await handleGetSipPassword(
    new Request("https://edge.invalid/get-sip-password", {
      headers: { Authorization: "Bearer token-de-teste" },
    }),
    { supabase: mock },
  );
  assertEquals(res.status, 403);
});