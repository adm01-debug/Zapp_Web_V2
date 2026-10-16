// Cartão t_0b69c58a — o rate-limit do webhook da Evolution passou a viver FORA do
// isolate (RPC service_role `consume_rate_limit`), não mais no `Map` em memória de
// `checkRateLimit`. Antes, cada isolate novo recomeçava o contador; agora o limite
// é compartilhado e sobrevive ao reinício do isolate.
//
// O que este teste trava: o handler consulta o decisor persistente e, quando ele
// nega, responde 429 com `Retry-After` ANTES de ler o corpo/HMAC — sem tocar
// nenhum outro endereço.
//
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/evolution-webhook/index.test.ts

import { handleEvolutionWebhook } from "./index.ts";
import { resetRateLimitServiceClient } from "../_shared/validation.ts";

function fail(msg: string): never {
  throw new Error(msg);
}

Deno.test("rate limit persistente: o webhook consulta o RPC e responde 429 com Retry-After", async () => {
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
    const req = new Request("https://stub.supabase.co/functions/v1/evolution-webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "messages.upsert" }),
    });
    const res = await handleEvolutionWebhook(req);
    if (res.status !== 429) fail(`esperado 429, veio ${res.status}`);
    if (res.headers.get("Retry-After") === null) fail("o 429 deve trazer Retry-After");
    if (!seen.some((u) => u.includes("/rest/v1/rpc/consume_rate_limit"))) {
      fail(`deveria consultar o limiter persistente: ${seen.join(",")}`);
    }
    const foraDoLimiter = seen.filter((u) => !u.includes("/rest/v1/rpc/consume_rate_limit"));
    if (foraDoLimiter.length !== 0) {
      fail(`rate limit não pode tocar outro endereço: ${foraDoLimiter.join(",")}`);
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
