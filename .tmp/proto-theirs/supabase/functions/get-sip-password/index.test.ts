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
import { provisionamentoSip, handleGetSipPassword, type GetSipCallerClient } from "./index.ts";

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

// ── Rate limit do handler: persistente, chave por IP antes e por USUARIO depois ──

const SIP_URL = "https://example.supabase.co/functions/v1/get-sip-password";
const USER = "00000000-0000-4000-8000-000000000001";

function postSip(headers: Record<string, string> = {}): Request {
  return new Request(SIP_URL, { method: "POST", headers: { ...headers, "content-type": "application/json" } });
}

/** Client do chamador injetado: claims válidos + profile ativo, sem tocar rede. */
interface FakeChain {
  select: (columns: string) => FakeChain;
  eq: (column: string, value: string) => FakeChain;
  maybeSingle: () => Promise<{ data: { id: string; is_active: boolean } | null; error: null }>;
}

function fakeClient(sub: string, profile: { id: string; is_active: boolean } | null): GetSipCallerClient {
  const chain: FakeChain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: profile, error: null }),
  };
  return {
    auth: { getClaims: () => Promise.resolve({ data: { claims: { sub } }, error: null }) },
    from: () => chain,
  } as unknown as GetSipCallerClient;
}

Deno.test("rate limit (IP) nega antes de autenticar -> 429 sem entregar a senha", async () => {
  const keys: string[] = [];
  const res = await handleGetSipPassword(postSip({ "x-forwarded-for": "9.9.9.9" }), {
    enforceRateLimit: (key) => {
      keys.push(key);
      return Promise.resolve({ allowed: false });
    },
  });

  assertEquals(res.status, 429);
  assertEquals(keys, ["sip-pwd:9.9.9.9"]);
  assertEquals((await res.text()).includes("SIP_PASSWORD"), false);
});

Deno.test("rate limit por USUARIO pos-auth: conta comprometida trocando de IP -> 429", async () => {
  const keys: string[] = [];
  const res = await handleGetSipPassword(postSip({ "x-forwarded-for": "9.9.9.9", Authorization: "Bearer x.y.z" }), {
    client: fakeClient(USER, { id: "p1", is_active: true }),
    enforceRateLimit: (key) => {
      keys.push(key);
      return Promise.resolve({ allowed: !key.includes(":user:") });
    },
  });

  assertEquals(res.status, 429);
  assertEquals(keys, ["sip-pwd:9.9.9.9", `sip-pwd:user:${USER}`]);
});
