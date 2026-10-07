// t_883f4fbd — a prova de orçamento/rate limit (scripts/qa/prova-orcamento-rate-limit.sh)
// correlaciona o consumo ao run mandando `x-ai-request-id: <uuid>` em cada chamada e
// lendo `ai_usage_logs` com `request_id=eq.<uuid>`. O defeito: este handler chamava
// `generateWithRouting` SEM `requestId` (e os `logAiUsage` próprios da degradação
// também não levavam o id), então TODA linha saía com request_id NULL e a leitura
// correlacionada devolvia 0 linhas ("consumo nao registrado").
//
// Estes testes chamam o handler REAL (`handleClassifyStickerRequest`) com um Request real.
// A rede é substituída na fronteira (`globalThis.fetch`), então autenticação
// (`/auth/v1/user`), guardas (`ai_rate_limit_hit` + count de ai_usage_logs), roteador
// (`ai_providers`), circuito (ledger), reserva/liquidação de orçamento (RPCs),
// provedor e o insert em `ai_usage_logs` rodam pelo código de produção — o que se
// observa é a linha exata que o PostgREST receberia, não um mock do registrador.
// A figurinha entra como `data:` URL: `toInlineImage` a devolve sem rede (caminho real).
//
// Run: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read \
//   --allow-net=127.0.0.1 supabase/functions/classify-sticker/request-id.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";

type Handler = (req: Request) => Promise<Response>;

/**
 * Importa o módulo sem subir servidor: `index.ts` chama `Deno.serve(handler)` no
 * nível do módulo (o contrato vitest de visão captura o handler assim), então o
 * `Deno.serve` é trocado por um no-op durante a importação.
 */
let handlerPromise: Promise<Handler> | null = null;
function handleClassifyStickerRequest(req: Request): Promise<Response> {
  handlerPromise ??= (async () => {
    const original = Deno.serve;
    (Deno as unknown as { serve: unknown }).serve = () => {};
    try {
      const modulo = await import("./index.ts");
      return modulo.handleClassifyStickerRequest as Handler;
    } finally {
      (Deno as unknown as { serve: unknown }).serve = original;
    }
  })();
  return handlerPromise.then((handler) => handler(req));
}

const FUNCTION_NAME = "classify-sticker";
const RUN_ID = "9f4c1e2a-1b3d-4c5e-8a7b-0d1e2f3a4b5c";
const USER_ID = "11111111-2222-4333-8444-555555555555";
const PROVIDER_ID = "926d3eec-3324-47a8-872f-fd369bd187ac";
const SECRET_NAME = "TEST_AI_PROVIDER_API_KEY";
const PROVIDER_ENDPOINT = "https://provedor-falso.test/v1/chat/completions";

/** PNG 1x1 — `data:` URL passa pelo caminho real de `toInlineImage` sem fetch. */
const IMAGEM_INLINE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/**
 * Linha de `ai_providers` que resolve a modalidade 'vision' pelo caminho de
 * capacidade declarada (`resolveProviderByModalities` + `assertCapabilities`).
 */
const PROVIDER_ROW = {
  id: PROVIDER_ID,
  name: "Provedor de Visão de Teste",
  provider_type: "openai_compatible",
  api_endpoint: PROVIDER_ENDPOINT,
  api_key_secret_name: SECRET_NAME,
  model: "modelo-visao-teste",
  system_prompt: null,
  config: { capabilities: { modalities: ["vision"] } },
  is_active: true,
  is_default: true,
  use_for: ["tagging"],
};

const RESPOSTA_PROVEDOR = {
  choices: [{ message: { content: "riso" } }],
  usage: { prompt_tokens: 12, completion_tokens: 3 },
  model: "modelo-visao-teste",
};

type Captura = { metodo: string; url: string; corpo: unknown };

/** Fixa as credenciais do ambiente (sem rede real) e devolve o restaurador. */
function stubEnv(): () => void {
  const valores: Record<string, string> = {
    SUPABASE_URL: "https://projeto-teste.supabase.co",
    SUPABASE_ANON_KEY: "anon-key-de-teste",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key-de-teste",
    [SECRET_NAME]: "segredo-do-provedor-de-teste",
  };
  const anteriores = new Map<string, string | undefined>();
  for (const [chave, valor] of Object.entries(valores)) {
    anteriores.set(chave, Deno.env.get(chave));
    Deno.env.set(chave, valor);
  }
  return () => {
    for (const [chave, valor] of anteriores) {
      if (valor === undefined) Deno.env.delete(chave);
      else Deno.env.set(chave, valor);
    }
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Substitui `globalThis.fetch` por um roteador que responde como o Supabase e o
 * provedor responderiam. Cada chamada é capturada — a asserção é sobre o corpo do
 * POST em `/rest/v1/ai_usage_logs`. Rota não mapeada responde 500 para o teste
 * denunciar caminho novo (em vez de mascarar como sucesso).
 */
function stubFetch(): { capturas: Captura[]; restaurar: () => void } {
  const capturas: Captura[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const metodo = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    let corpo: unknown = null;
    try {
      corpo = init?.body ? JSON.parse(String(init.body)) : null;
    } catch {
      corpo = init?.body ?? null;
    }
    capturas.push({ metodo, url, corpo });

    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(json({ id: USER_ID }));
    }
    // R2-AUTH-022: `requireAuth` consulta a política de rede (RPC service_role)
    // antes de liberar o handler; o stub responde "allow" no caminho feliz.
    if (url.includes("/rest/v1/rpc/resolve_network_policy")) {
      return Promise.resolve(json([
        { allowed: true, reason: null, rate_limit_max_requests: 30, rate_limit_window_seconds: 60 },
      ]));
    }
    if (url.includes("/rest/v1/rpc/ai_rate_limit_hit")) {
      return Promise.resolve(json(1));
    }
    if (url.includes("/rest/v1/rpc/ai_budget_reserve")) {
      return Promise.resolve(json([{ id: "reserva-teste", allowed: true, used_tokens: 0, limit_tokens: 200000 }]));
    }
    if (url.includes("/rest/v1/rpc/ai_budget_settle") || url.includes("/rest/v1/rpc/ai_budget_release")) {
      return Promise.resolve(json(null));
    }
    if (url.includes("/rest/v1/ai_providers")) {
      return Promise.resolve(json([PROVIDER_ROW]));
    }
    if (url.includes("/rest/v1/profiles")) {
      return Promise.resolve(json({ id: "66666666-7777-4888-8999-000000000000" }));
    }
    if (url.includes("/rest/v1/ai_usage_logs")) {
      if (metodo === "HEAD") {
        // Cota diária (count exato): nenhuma linha hoje → admitido.
        return Promise.resolve(new Response(null, { status: 200, headers: { "content-range": "*/0" } }));
      }
      if (metodo === "GET") {
        // Ledger do circuito: sem falhas → circuito fechado, chamada admitida.
        return Promise.resolve(json([]));
      }
      // POST: o insert do registrador — o alvo da asserção.
      return Promise.resolve(json(null, 201));
    }
    if (url === PROVIDER_ENDPOINT) {
      return Promise.resolve(json(RESPOSTA_PROVEDOR));
    }
    return Promise.resolve(json({ error: `rota nao mapeada no teste: ${metodo} ${url}` }, 500));
  }) as typeof fetch;
  return { capturas, restaurar: () => { globalThis.fetch = original; } };
}

function makeRequest(body: unknown, requestId?: string): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: "Bearer jwt-do-usuario-de-teste",
  };
  if (requestId !== undefined) headers["x-ai-request-id"] = requestId;
  return new Request(`https://edge.test/${FUNCTION_NAME}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/** A linha que o insert mandou a `ai_usage_logs` para ESTA função (falha se nenhuma). */
function linhaDeConsumo(capturas: Captura[]): Record<string, unknown> {
  const linhas = capturas
    .filter((c) => c.metodo === "POST" && c.url.includes("/rest/v1/ai_usage_logs"))
    .map((c) => c.corpo as Record<string, unknown> | Record<string, unknown>[])
    .map((corpo) => (Array.isArray(corpo) ? corpo[0] : corpo))
    .filter((linha): linha is Record<string, unknown> => typeof linha === "object" && linha !== null);
  const linha = linhas.find((l) => l.function_name === FUNCTION_NAME);
  assert(
    linha !== undefined,
    `nenhuma linha de ${FUNCTION_NAME} foi inserida em ai_usage_logs — a chamada ficou sem trilha`,
  );
  return linha;
}

const ENTRADA_VALIDA = { image_url: IMAGEM_INLINE };

Deno.test("t_883f4fbd: header x-ai-request-id válido chega a ai_usage_logs.request_id", async () => {
  const restaurarEnv = stubEnv();
  const { capturas, restaurar } = stubFetch();
  try {
    const res = await handleClassifyStickerRequest(makeRequest(ENTRADA_VALIDA, RUN_ID));
    assertEquals(res.status, 200, `esperava 200, veio ${res.status}`);
    const corpo = await res.json();
    assertEquals(corpo.category, "riso");

    const linha = linhaDeConsumo(capturas);
    assertEquals(
      linha.request_id,
      RUN_ID,
      "o id do run não atravessou o handler → roteador → registrador: a prova lê 0 linhas para este run",
    );
  } finally {
    restaurar();
    restaurarEnv();
  }
});

Deno.test("t_883f4fbd: sem o header, request_id grava NULL — nunca um id inventado", async () => {
  const restaurarEnv = stubEnv();
  const { capturas, restaurar } = stubFetch();
  try {
    const res = await handleClassifyStickerRequest(makeRequest(ENTRADA_VALIDA));
    assertEquals(res.status, 200);

    const linha = linhaDeConsumo(capturas);
    assert(
      "request_id" in linha,
      "a linha de consumo não traz a coluna request_id — o registrador deveria gravar NULL declarado",
    );
    assertEquals(linha.request_id, null, "sem header não há correlação — nada pode ser inventado");
  } finally {
    restaurar();
    restaurarEnv();
  }
});

Deno.test("t_883f4fbd: header que não é uuid grava NULL — PII/valor livre não atravessa", async () => {
  const restaurarEnv = stubEnv();
  const { capturas, restaurar } = stubFetch();
  try {
    const res = await handleClassifyStickerRequest(makeRequest(ENTRADA_VALIDA, "nao-e-uuid"));
    assertEquals(res.status, 200);

    const linha = linhaDeConsumo(capturas);
    assertEquals(
      linha.request_id,
      null,
      "valor livre virou request_id: o campo é uuid opaco ou NULL",
    );
  } finally {
    restaurar();
    restaurarEnv();
  }
});

Deno.test("t_883f4fbd: a degradação por image_url ausente também sai correlacionada ao run", async () => {
  const restaurarEnv = stubEnv();
  const { capturas, restaurar } = stubFetch();
  try {
    // Sem image_url o handler grava a linha de erro DIRETO (não passa pelo
    // roteador): se esse caminho não levar requestId, a prova lê 0 linhas para
    // o run mesmo com o consumo auditado.
    const res = await handleClassifyStickerRequest(makeRequest({}, RUN_ID));
    assertEquals(res.status, 200);
    const corpo = await res.json();
    assertEquals(corpo.category, "outros");

    const linha = linhaDeConsumo(capturas);
    assertEquals(linha.status, "error", "a degradação deveria sair como linha de erro");
    assertEquals(
      linha.request_id,
      RUN_ID,
      "a linha de degradação saiu sem o id do run — caminho não correlacionado",
    );
  } finally {
    restaurar();
    restaurarEnv();
  }
});
