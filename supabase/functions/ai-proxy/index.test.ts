// R2-API-032 (P2) — o modo de teste do ai-proxy (`test: true`).
//
// O defeito: o booleano `test` vindo do CLIENTE pulava `enforceAiGuards` (cota
// e rate limit), `runProviderTest` fazia a chamada REAL ao provedor (paga) com
// conteúdo/modelo/orçamento do cliente e o handler saía sem gravar nada em
// `ai_usage_logs`. Qualquer usuário autenticado fazia chamada paga sem cota
// nem registro.
//
// O que estes testes travam (cada um é vermelho sem a correção):
//   1. usuário comum + `test: true` → 403, ZERO fetch ao provedor e ZERO insert.
//   2. RPC de papel devolvendo erro → 503 (falha FECHADA), ZERO fetch ao provedor.
//   3. admin/supervisor + `test: true` → 200, UMA chamada ao provedor e UMA
//      linha em ai_usage_logs com a identidade do chamador e purpose própria.
//   4. admin + `test: true` → mensagem/modelo do cliente ignorados: o corpo
//      vai com a mensagem fixa do servidor, o modelo resolvido no servidor e
//      `max_tokens` <= 32.
//   5. controlo: `test: false` com o MESMO usuário comum → NÃO é 403 (o caminho
//      normal não passou a exigir admin) e o provedor é chamado.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/ai-proxy/index.test.ts
import { handleAiProxy } from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ── stub de rede (nenhuma chamada sai de verdade) ───────────────────────────
type Route = { match: string; body: unknown; status?: number; headers?: Record<string, string> };
type Chamada = { metodo: string; url: string; corpo: unknown };

function withFetch(routes: Route[]) {
  const original = globalThis.fetch;
  const chamadas: Chamada[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request).url;
    const alvo = new URL(url);
    const hostComPath = `${alvo.hostname}${alvo.pathname}`;
    const route = routes.find((r) => r.match === hostComPath || r.match === alvo.pathname);
    const metodo = init?.method ?? (input instanceof Request ? input.method : "GET");
    let corpo: unknown = null;
    try {
      corpo = init?.body ? JSON.parse(String(init.body)) : null;
    } catch {
      corpo = init?.body ?? null;
    }
    if (!route) {
      chamadas.push({ metodo, url: `SEM_STUB ${url}`, corpo });
      return Promise.resolve(new Response("nao stubado", { status: 599 }));
    }
    chamadas.push({ metodo, url, corpo });
    return Promise.resolve(
      new Response(route.status === 204 ? null : JSON.stringify(route.body), {
        status: route.status ?? 200,
        headers: { "content-type": "application/json", ...(route.headers ?? {}) },
      }),
    );
  }) as typeof fetch;
  return { chamadas, restore: () => { globalThis.fetch = original; } };
}

const ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_TEST_KEY",
] as const;

function withEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>, fn: () => Promise<void>) {
  const saved = ENV_KEYS.map((k) => [k, Deno.env.get(k)] as const);
  for (const key of ENV_KEYS) {
    const value = values[key];
    if (value === undefined) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }
  return fn().finally(() => {
    for (const [key, value] of saved) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  });
}

const ENV_OK = {
  SUPABASE_URL: "https://stub.supabase.co",
  SUPABASE_ANON_KEY: "anon-key-de-teste",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-de-teste",
  OPENAI_TEST_KEY: "sk-teste-do-provedor",
};

const USER = "20000000-0000-0000-0000-00000000000a";
const PROVIDER_ID = "3f2b7f8e-aaaa-4000-8000-0000000000aa";
const REQUEST_ID = "4f2b7f8e-bbbb-4000-8000-0000000000bb";
const MODELO_DO_SERVIDOR = "gpt-modelo-do-servidor";
const TEXTO_DO_CLIENTE = "TEXTO_LIVRE_MANDADO_PELO_CLIENTE";
const MODELO_DO_CLIENTE = "modelo-pedido-pelo-cliente";

const PROVIDER_ROW = {
  id: PROVIDER_ID,
  name: "OpenAI (diagnostico)",
  provider_type: "openai_compatible",
  api_endpoint: "https://api.openai.com/v1/chat/completions",
  api_key_secret_name: "OPENAI_TEST_KEY",
  model: MODELO_DO_SERVIDOR,
  system_prompt: null,
  // O modelo do cliente está LIBERADO no config: sem a correção o proxy usava
  // o `model` do corpo — a asserção do caso 4 só é vermelha por causa disso.
  config: { allowed_models: [MODELO_DO_CLIENTE] },
  is_active: true,
  is_default: true,
  use_for: ["copilot"],
};

const ROTA_AUTH = { match: "/auth/v1/user", body: { id: USER, aud: "authenticated" } };
const ROTA_PAPEL_OK = { match: "/rest/v1/rpc/is_admin_or_supervisor", body: true };
const ROTA_PAPEL_NEGADO = { match: "/rest/v1/rpc/is_admin_or_supervisor", body: false };
const ROTA_PAPEL_ERRO = {
  match: "/rest/v1/rpc/is_admin_or_supervisor",
  status: 500,
  body: { message: "falha na RPC de papel" },
};
const ROTA_RATE = { match: "/rest/v1/rpc/ai_rate_limit_hit", body: 1 };
const ROTA_PROVIDERS = { match: "/rest/v1/ai_providers", body: [PROVIDER_ROW] };
const ROTA_PROFILES = { match: "/rest/v1/profiles", body: [] };
// O select de cota (HEAD) lê `content-range`; o insert (POST) grava a linha.
const ROTA_USAGE = {
  match: "/rest/v1/ai_usage_logs",
  body: {},
  status: 201,
  headers: { "content-range": "*/0" },
};
const ROTA_OPENAI = {
  match: "api.openai.com/v1/chat/completions",
  body: {
    id: "chatcmpl-teste",
    choices: [{ message: { role: "assistant", content: "pong" } }],
    usage: { prompt_tokens: 3, completion_tokens: 2 },
    model: MODELO_DO_SERVIDOR,
  },
};

const ROTAS_BASE = [ROTA_AUTH, ROTA_RATE, ROTA_PROVIDERS, ROTA_PROFILES, ROTA_USAGE, ROTA_OPENAI];

function makeRequest(body: unknown): Request {
  return new Request("https://stub.supabase.co/functions/v1/ai-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer token-de-teste" },
    body: JSON.stringify(body),
  });
}

function corpoTeste(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    messages: [{ role: "user", content: TEXTO_DO_CLIENTE }],
    test: true,
    provider_id: PROVIDER_ID,
    ...extra,
  };
}

const paraOpenAI = (chamadas: Chamada[]) =>
  chamadas.filter((c) => new URL(c.url.replace(/^SEM_STUB /, "")).hostname === "api.openai.com");
const insertsDeUso = (chamadas: Chamada[]) =>
  chamadas.filter((c) => c.metodo === "POST" && new URL(c.url).pathname === "/rest/v1/ai_usage_logs");
const chamadasDePapel = (chamadas: Chamada[]) =>
  chamadas.filter((c) => new URL(c.url).pathname === "/rest/v1/rpc/is_admin_or_supervisor");

/** A linha recebida pelo PostgREST (supabase-js manda objeto ou [objeto]). */
function linhaDeUso(chamadas: Chamada[]): Record<string, unknown> {
  const inserts = insertsDeUso(chamadas);
  assert(inserts.length === 1, `esperava exatamente 1 insert em ai_usage_logs, vieram ${inserts.length}`);
  const corpo = inserts[0].corpo as Record<string, unknown> | Record<string, unknown>[];
  const linha = Array.isArray(corpo) ? corpo[0] : corpo;
  assert(linha && typeof linha === "object", "o insert não levou uma linha de consumo");
  return linha as Record<string, unknown>;
}

// ── casos ───────────────────────────────────────────────────────────────────
Deno.test("R2-API-032 caso 1: usuário comum + test:true → 403 sem NENHUMA chamada paga nem insert", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([...ROTAS_BASE, ROTA_PAPEL_NEGADO]);
    try {
      const res = await handleAiProxy(makeRequest(corpoTeste()));
      assert(res.status === 403, `esperado 403 para usuário sem papel, veio ${res.status}`);
      assert(
        paraOpenAI(stub.chamadas).length === 0,
        `o provedor foi chamado por usuário sem papel: ${paraOpenAI(stub.chamadas).map((c) => c.url).join(",")}`,
      );
      assert(
        insertsDeUso(stub.chamadas).length === 0,
        "usuário negado não pode gerar linha de consumo",
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("R2-API-032 caso 2: RPC de papel com erro → 503 (falha fechada) sem chamar o provedor", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([...ROTAS_BASE, ROTA_PAPEL_ERRO]);
    try {
      const res = await handleAiProxy(makeRequest(corpoTeste()));
      assert(res.status === 503, `RPC de papel falhando tem de dar 503, veio ${res.status}`);
      assert(
        paraOpenAI(stub.chamadas).length === 0,
        "falha na confirmação de papel NÃO pode liberar a chamada paga",
      );
      assert(insertsDeUso(stub.chamadas).length === 0, "diagnóstico negado não gera consumo");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("R2-API-032 caso 3: admin + test:true → 200, UMA chamada paga e UMA linha de consumo com a identidade", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([...ROTAS_BASE, ROTA_PAPEL_OK]);
    try {
      const res = await handleAiProxy(makeRequest(corpoTeste({ requestId: REQUEST_ID })));
      assert(res.status === 200, `esperado 200 no diagnóstico autorizado, veio ${res.status}`);
      const corpo = await res.json() as { ok: boolean; provider_id: string };
      assert(corpo.ok === true && corpo.provider_id === PROVIDER_ID, `resposta inesperada: ${JSON.stringify(corpo)}`);
      assert(
        paraOpenAI(stub.chamadas).length === 1,
        `o diagnóstico mede UMA tentativa ao provedor: ${paraOpenAI(stub.chamadas).length}`,
      );

      const linha = linhaDeUso(stub.chamadas);
      assert(linha.user_id === USER, `o consumo tem de levar a identidade do chamador, veio ${linha.user_id}`);
      assert(linha.function_name === "ai-proxy", `function_name inesperada: ${linha.function_name}`);
      assert(linha.request_id === REQUEST_ID, `request_id do diagnóstico tem de ser o requestId do fluxo normal, veio ${JSON.stringify(linha.request_id)}`);
      const metadata = (linha.metadata ?? {}) as Record<string, unknown>;
      assert(
        metadata.purpose === "provider_test",
        `o diagnóstico precisa de finalidade própria (provider_test), veio ${JSON.stringify(metadata.purpose)}`,
      );
      assert(
        metadata.provider_id === PROVIDER_ID,
        `o destino fixo testado tem de estar no log, veio ${JSON.stringify(metadata.provider_id)}`,
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("R2-API-032 caso 4: conteúdo/modelo do cliente NÃO atravessam o diagnóstico", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([...ROTAS_BASE, ROTA_PAPEL_OK]);
    try {
      const res = await handleAiProxy(makeRequest(corpoTeste({
        model: MODELO_DO_CLIENTE,
        tools: [{ type: "function", function: { name: "ferramenta_do_cliente" } }],
        tool_choice: "auto",
        response_format: { type: "json_object" },
      })));
      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      const enviadas = paraOpenAI(stub.chamadas);
      assert(enviadas.length === 1, `esperava 1 chamada ao provedor, vieram ${enviadas.length}`);
      const enviado = enviadas[0].corpo as Record<string, unknown>;

      const mensagens = enviado.messages as Array<{ role: string; content: unknown }>;
      assert(
        JSON.stringify(mensagens).includes(TEXTO_DO_CLIENTE) === false,
        `o texto do cliente atravessou para o provedor: ${JSON.stringify(mensagens)}`,
      );
      assert(
        Array.isArray(mensagens) && mensagens.length === 1 && mensagens[0].content === "ping",
        `o diagnóstico tem de usar a mensagem fixa do servidor: ${JSON.stringify(mensagens)}`,
      );
      assert(
        enviado.model === MODELO_DO_SERVIDOR,
        `o modelo tem de ser o resolvido no servidor, veio ${String(enviado.model)}`,
      );
      assert(
        typeof enviado.max_tokens === "number" && (enviado.max_tokens as number) <= 32,
        `o orçamento do diagnóstico tem de ser limitado no servidor (max_tokens <= 32), veio ${String(enviado.max_tokens)}`,
      );
      assert(!("tools" in enviado) && !("tool_choice" in enviado), "tools do cliente não podem ir ao diagnóstico");
      assert(!("response_format" in enviado), "response_format do cliente não pode ir ao diagnóstico");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("R2-API-032 caso 5 (controlo): test:false do MESMO usuário comum segue o fluxo normal, sem exigir admin", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([...ROTAS_BASE, ROTA_PAPEL_NEGADO]);
    try {
      const res = await handleAiProxy(makeRequest({
        messages: [{ role: "user", content: "ola" }],
        test: false,
      }));
      assert(res.status !== 403, `o fluxo comum não pode exigir papel de admin, veio ${res.status}`);
      assert(res.status === 200, `esperado 200 no fluxo normal, veio ${res.status}`);
      assert(
        paraOpenAI(stub.chamadas).length === 1,
        `o provedor tinha de ser chamado pelo fluxo comum: ${paraOpenAI(stub.chamadas).length}`,
      );
      assert(
        chamadasDePapel(stub.chamadas).length === 0,
        "a RPC de papel só pode rodar no caminho de diagnóstico",
      );
    } finally {
      stub.restore();
    }
  });
});
