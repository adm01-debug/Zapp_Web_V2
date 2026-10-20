/**
 * SEC-EDGE-FUNCTIONS-03 (P1) — `fetch-link-preview` era a única função
 * `verify_jwt = true` sem autenticação interna e sem rate limit.
 *
 * `verify_jwt = true` NÃO é autenticação de usuário: a anon key pública (que vai
 * no bundle do frontend) é um JWT válido do projeto. Sem guarda própria qualquer
 * visitante usava a função como fetcher de URL arbitrária e enchia
 * `link_preview_cache` (gravado com service_role).
 *
 * Aceite do cartão:
 *   1. sem usuário autenticado -> 401 e NENHUM egress (o proxy de preview não é
 *      chamado);
 *   2. acima do limite -> 429 (com `Retry-After`) e nenhum egress;
 *   3. com usuário dentro do limite -> o preview funciona como antes (200);
 *   4. chamador interno (webhook, service role key) -> segue funcionando (200) sem
 *      passar pelo `/auth/v1/user`; bearer que não é usuário nem serviço -> 401.
 *
 * O handler REAL roda com o `fetch` global stubado por trecho de URL:
 *   `/auth/v1/user`                     (requireAuth)
 *   `/rest/v1/rpc/consume_rate_limit`   (enforceRateLimit)
 *   o endpoint do proxy de egresso      (PREVIEW_EGRESS_PROXY_URL)
 *
 * Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1
 */
import { handleFetchLinkPreview } from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const EGRESS_URL = "https://egress.proxy.test/preview";
// Uma URL por caso: o cache em memoria (Map) do modulo persiste entre testes no
// mesmo isolate — com URL compartilhada, um caso que erre o egress contamina o
// seguinte (o `cached:true` mascarava a prova).
const PAGINA_1 = "https://exemplo.test/pagina-um";
const PAGINA_2 = "https://exemplo.test/pagina-dois";
const PAGINA_3 = "https://exemplo.test/pagina";
const PAGINA_4 = "https://exemplo.test/pagina-quatro";

const TOKEN_USUARIO = "token-de-teste";
// A service role key do ambiente: identifica o chamador interno (webhook).
const SERVICE_KEY = "service-role-de-teste";
const TOKEN_INVALIDO = "token-que-nao-e-de-usuario-nem-de-servico";

type Route = { match: string; make: (init?: RequestInit) => Response };
type Call = { url: string; init?: RequestInit };

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Stuba o `fetch` global e devolve todas as chamadas (URL + init) capturadas. */
function withFetch(routes: Route[]) {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request).url;
    calls.push({ url, init });
    const route = routes.find((r) => url.includes(r.match));
    if (!route) return Promise.resolve(new Response("nao stubado", { status: 599 }));
    return Promise.resolve(route.make(init));
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PREVIEW_EGRESS_PROXY_URL",
  "PREVIEW_EGRESS_SHARED_SECRET",
] as const;

function withEnv(fn: () => Promise<void>) {
  const values: Record<string, string> = {
    SUPABASE_URL: "https://stub.supabase.co",
    SUPABASE_ANON_KEY: "anon-key-de-teste",
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    PREVIEW_EGRESS_PROXY_URL: EGRESS_URL,
    // >= 32 caracteres: abaixo disso getSecureEgressConfig() devolve null.
    PREVIEW_EGRESS_SHARED_SECRET: "segredo-de-teste-com-mais-de-32-caracteres",
  };
  const saved = ENV_KEYS.map((k) => [k, Deno.env.get(k)] as const);
  for (const key of ENV_KEYS) Deno.env.set(key, values[key]);
  return fn().finally(() => {
    for (const [key, value] of saved) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  });
}

const ROTA_EGRESS: Route = {
  match: "egress.proxy.test",
  // Devolve a URL pedida (o handler usa a URL FINAL do egress como `preview.url`).
  make: (init) => {
    const pedida = JSON.parse(String(init?.body ?? "{}")).url as string;
    return jsonResp({
      url: pedida,
      status: 200,
      content_type: "text/html",
      body_base64: btoa(
        "<html><head><title>Exemplo</title></head><body>oi</body></html>",
      ),
    });
  },
};

function rotaAuth(userId: string): Route {
  return { match: "/auth/v1/user", make: () => jsonResp({ id: userId, aud: "authenticated" }) };
}
function rotaRate(allowed: boolean): Route {
  return {
    match: "/rest/v1/rpc/consume_rate_limit",
    make: () => jsonResp([{ allowed, remaining: allowed ? 19 : 0 }]),
  };
}

function makeRequest(body: unknown, token: string | null): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request("https://stub.supabase.co/functions/v1/fetch-link-preview", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const egressCalls = (calls: Call[]) =>
  calls.filter((c) => c.url.includes("egress.proxy.test")).length;

Deno.test("SEC-EDGE-FUNCTIONS-03: sem bearer -> 401 e nao toca o egress", async () => {
  await withEnv(async () => {
    const stub = withFetch([
      rotaAuth("10000000-0000-0000-0000-000000000001"),
      rotaRate(true),
      ROTA_EGRESS,
    ]);
    try {
      const res = await handleFetchLinkPreview(makeRequest({ url: PAGINA_1 }, null));
      assert(res.status === 401, `esperado 401 sem autenticacao, veio ${res.status}`);
      assert(
        egressCalls(stub.calls) === 0,
        "sem autenticacao a funcao NAO pode fazer egress (fetcher de URL arbitraria)",
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("SEC-EDGE-FUNCTIONS-03: acima do limite -> 429 (Retry-After) e nao toca o egress", async () => {
  await withEnv(async () => {
    const stub = withFetch([
      rotaAuth("10000000-0000-0000-0000-000000000002"),
      rotaRate(false),
      ROTA_EGRESS,
    ]);
    try {
      const res = await handleFetchLinkPreview(makeRequest({ url: PAGINA_2 }, TOKEN_USUARIO));
      assert(res.status === 429, `esperado 429 acima do limite, veio ${res.status}`);
      assert(
        res.headers.get("Retry-After") !== null,
        "o 429 deve trazer Retry-After (convencao das edges do projeto)",
      );
      assert(
        egressCalls(stub.calls) === 0,
        "acima do limite o cache/egress nao pode ser tocado",
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("SEC-EDGE-FUNCTIONS-03: usuario dentro do limite -> preview como antes (200)", async () => {
  await withEnv(async () => {
    const stub = withFetch([
      rotaAuth("10000000-0000-0000-0000-000000000003"),
      rotaRate(true),
      ROTA_EGRESS,
    ]);
    try {
      const res = await handleFetchLinkPreview(makeRequest({ url: PAGINA_3 }, TOKEN_USUARIO));
      assert(res.status === 200, `esperado 200 com usuario valido, veio ${res.status}`);
      const body = await res.json() as {
        preview?: { url?: string; title?: string };
        cached?: boolean;
      };
      assert(body.preview?.title === "Exemplo", `preview.title inesperado: ${JSON.stringify(body)}`);
      assert(body.preview?.url === PAGINA_3, `preview.url inesperado: ${JSON.stringify(body)}`);
      assert(body.cached === false, "primeira busca nao vem do cache");
      assert(egressCalls(stub.calls) === 1, "dentro do limite o egress acontece uma vez");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("SEC-EDGE-FUNCTIONS-03: chamador interno (service role) continua funcionando (200)", async () => {
  await withEnv(async () => {
    // O webhook de mensagem RECEBIDA (_shared/evolution-webhook-messages.ts) chama
    // esta edge com a service role key. `requireAuth` puro quebraria esse chamador —
    // por isso a guarda aceita a identidade de servico, com cota propria por IP.
    const stub = withFetch([rotaRate(true), ROTA_EGRESS]);
    try {
      const res = await handleFetchLinkPreview(makeRequest({ url: PAGINA_4 }, SERVICE_KEY));
      assert(res.status === 200, `esperado 200 para o chamador de servico, veio ${res.status}`);
      const body = await res.json() as { preview?: { url?: string } };
      assert(
        body.preview?.url === PAGINA_4,
        `preview do servico inesperado: ${JSON.stringify(body)}`,
      );
      assert(egressCalls(stub.calls) === 1, "o chamador interno faz o egress uma vez");
      assert(
        stub.calls.every((c) => !c.url.includes("/auth/v1/user")),
        "identidade de servico nao deve consultar /auth/v1/user",
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("SEC-EDGE-FUNCTIONS-03: bearer que nao e usuario nem servico -> 401", async () => {
  await withEnv(async () => {
    // /auth/v1/user NAO esta stubado: `getUser` falha -> 401.
    const stub = withFetch([rotaRate(true), ROTA_EGRESS]);
    try {
      const res = await handleFetchLinkPreview(makeRequest({ url: PAGINA_1 }, TOKEN_INVALIDO));
      assert(res.status === 401, `esperado 401 para bearer invalido, veio ${res.status}`);
      assert(egressCalls(stub.calls) === 0, "bearer invalido nao pode tocar o egress");
    } finally {
      stub.restore();
    }
  });
});
