/**
 * Busca de produtos por voz (ação `search_catalog_products`).
 *
 * A ação reusa a edge `promogifts-catalog` (mesma que o CmdK chama em
 * `useCatalogQuickSearch`): o teste prova (a) os parâmetros enviados à edge —
 * `{ action: 'list_products', search, limit: 8, compact: true }` — e o JWT do
 * chamador repassado; e (b) que o resultado traz os campos de produto que a
 * voz exibe (id, nome, sku, preço, imagem principal) e o total.
 *
 * O handler expõe `VoiceCopilotActionDeps` (index.ts) para injetar auth e
 * fetch; em produção `deps` é omitido e os caminhos reais valem.
 * Sem `std/assert`: o lock do CI é `--frozen` (mesmo padrão de
 * promogifts-catalog/index.actions.test.ts).
 */
import {
  searchCatalogProducts,
  voiceCopilotActionHandler,
  type VoiceCopilotActionDeps,
} from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown, message?: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message ?? "assertEquals falhou"}: esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`,
    );
  }
}

function assertEqualsJson(actual: unknown, expected: unknown, message: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message}: esperado ${b}, obtido ${a}`);
}

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;

/** Fixa as envs que requireEnv exige e restaura ao final de cada teste. */
async function comAmbiente<T>(fn: () => Promise<T>): Promise<T> {
  const anteriores = ENV_KEYS.map((k) => [k, Deno.env.get(k)] as const);
  Deno.env.set("SUPABASE_URL", "https://projeto-teste.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "chave-de-teste");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "chave-de-teste");
  try {
    return await fn();
  } finally {
    for (const [k, v] of anteriores) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

interface CapturedCall {
  url: string;
  init: RequestInit;
}

/** Fetch falso: registra a chamada e devolve a resposta dada. */
function fakeFetch(calls: CapturedCall[], response: Response): VoiceCopilotActionDeps["catalogFetch"] {
  return ((input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return Promise.resolve(response);
  }) as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const PRODUTOS = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Caneta personalizada", sku: "CAN-01", sale_price: 2.5, primary_image_url: "https://cdn/caneta.png" },
  { id: "22222222-2222-2222-2222-222222222222", name: "Caneca branca", sku: "CAN-02", sale_price: 18.9, primary_image_url: "https://cdn/caneca.png" },
];

function requestVoz(body: unknown): Request {
  return new Request("https://projeto-teste.supabase.co/functions/v1/voice-copilot-action", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer jwt-do-chamador",
    },
    body: JSON.stringify(body),
  });
}

type AuthedClientOpt = NonNullable<VoiceCopilotActionDeps["createAuthedClient"]>;

/** Client autenticado falso: a ação de catálogo não usa o authedClient. */
const authedClientFalso: AuthedClientOpt = () =>
  Promise.resolve({} as Awaited<ReturnType<AuthedClientOpt>>);

const depsBase = (fetchImpl: VoiceCopilotActionDeps["catalogFetch"]): VoiceCopilotActionDeps => ({
  requireAuth: () => Promise.resolve({ userId: "usuario-1" }),
  createAuthedClient: authedClientFalso,
  catalogFetch: fetchImpl,
});

Deno.test("search_catalog_products envia à edge do catálogo os mesmos parâmetros do CmdK", async () => {
  await comAmbiente(async () => {
    const calls: CapturedCall[] = [];
    const response = await voiceCopilotActionHandler(
      requestVoz({ action: "search_catalog_products", params: { query: "  caneta  " } }),
      depsBase(fakeFetch(calls, jsonResponse({ data: PRODUTOS, meta: { total: 2, duration_ms: 3 } }))),
    );

    assertEquals(calls.length, 1, "deve chamar a edge de catálogo uma vez");
    assertEquals(
      calls[0].url,
      "https://projeto-teste.supabase.co/functions/v1/promogifts-catalog",
      "url da edge de catálogo",
    );
    assertEquals(calls[0].init.method, "POST", "método");
    assertEqualsJson(
      JSON.parse(String(calls[0].init.body)),
      { action: "list_products", search: "caneta", limit: 8, compact: true },
      "corpo enviado ao catálogo",
    );

    const headers = calls[0].init.headers as Record<string, string>;
    assertEquals(headers.Authorization, "Bearer jwt-do-chamador", "JWT do chamador repassado");
    assertEquals(headers.apikey, "chave-de-teste", "service role só como apikey");

    assertEquals(response.status, 200, "status");
    const body = await response.json() as { result: { products: unknown[]; total: number } };
    assertEquals(body.result.total, 2, "total");
    assertEquals(body.result.products.length, 2, "produtos");
    const primeiro = body.result.products[0] as Record<string, unknown>;
    for (const campo of ["id", "name", "sku", "sale_price", "primary_image_url"]) {
      assert(primeiro[campo] !== undefined && primeiro[campo] !== null, `campo ausente: ${campo}`);
    }
    assertEquals(primeiro.name, "Caneta personalizada", "nome");
    assertEquals(primeiro.primary_image_url, "https://cdn/caneta.png", "imagem principal");
  });
});

Deno.test("search_catalog_products: busca vazia não chama o catálogo", async () => {
  await comAmbiente(async () => {
    const calls: CapturedCall[] = [];
    const response = await voiceCopilotActionHandler(
      requestVoz({ action: "search_catalog_products", params: { query: "   " } }),
      depsBase(fakeFetch(calls, jsonResponse({ data: PRODUTOS, meta: { total: 2 } }))),
    );

    assertEquals(calls.length, 0, "não deve chamar a edge com busca vazia");
    const body = await response.json() as { result: { products: unknown[]; total: number } };
    assertEqualsJson(body.result, { products: [], total: 0 }, "resultado vazio");
  });
});

Deno.test("search_catalog_products: catálogo indisponível vira failed, não 'sem resultados'", async () => {
  await comAmbiente(async () => {
    const calls: CapturedCall[] = [];
    const response = await voiceCopilotActionHandler(
      requestVoz({ action: "search_catalog_products", params: { query: "caneta" } }),
      depsBase(fakeFetch(calls, jsonResponse({ error: "Catalog database is temporarily unavailable" }, 503))),
    );

    assertEquals(response.status, 200, "a ação responde 200 com o erro sinalizado");
    const body = await response.json() as { result: { products: unknown[]; failed?: boolean } };
    assertEqualsJson(body.result, { products: [], total: 0, failed: true }, "degradação sinalizada");
  });
});

Deno.test("searchCatalogProducts limita o tamanho da busca", async () => {
  await comAmbiente(async () => {
    const calls: CapturedCall[] = [];
    await searchCatalogProducts("x".repeat(500), {
      supabaseUrl: "https://projeto-teste.supabase.co",
      apikey: "chave-de-teste",
      authHeader: "Bearer jwt-do-chamador",
      fetchImpl: fakeFetch(calls, jsonResponse({ data: [], meta: { total: 0 } })),
    });
    const enviado = JSON.parse(String(calls[0].init.body)) as { search: string };
    assertEquals(enviado.search.length, 200, "busca truncada em 200 chars");
  });
});
