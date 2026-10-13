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
import { handleGetSipPassword, provisionamentoSip } from "./index.ts";
import { resetRateLimitServiceClient } from "../_shared/validation.ts";

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

// O limite vive FORA do isolate (RPC service_role `consume_rate_limit`). Prova:
// com o decisor persistente negando, a função responde 429 + Retry-After ANTES de
// ler o Bearer — e o RPC foi de fato consultado.
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
      : input instanceof URL
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
    const req = new Request("https://stub.supabase.co/functions/v1/get-sip-password", {
      headers: { Authorization: "Bearer token-de-teste" },
    });
    const res = await handleGetSipPassword(req);
    assertEquals(res.status, 429);
    assertEquals(res.headers.get("Retry-After"), "60");
    if (!seen.some((u) => u.includes("/rest/v1/rpc/consume_rate_limit"))) {
      throw new Error(`deveria consultar o limiter persistente: ${seen.join(",")}`);
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
