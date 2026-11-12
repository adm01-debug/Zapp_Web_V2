/**
 * Contrato executável do `copilot-live` (tick do RADAR → sessão + sugestão ao vivo).
 *
 * O index sobe o servidor com `serve` do std@0.168.0 no nível do módulo e não exporta
 * o handler. Sem refatorar a função, o teste captura o handler REAL pela interface
 * pública do servidor: troca `Deno.listen` por um listener falso (uma conexão só) e
 * `Deno.serveHttp` por uma conexão HTTP falsa cuja `nextRequest()` entrega os
 * Requests do teste e cuja `respondWith()` devolve a Response ao teste. Nenhuma
 * porta é aberta.
 *
 * `globalThis.fetch` é o espião que faz o papel de GoTrue, PostgREST e do provedor
 * de IA. Sem rede, sem banco, env e segredos sintéticos.
 *
 * Run with:
 *   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/copilot-live/index.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ─── captura do handler pelo servidor do std (listener e conexão falsos) ─────

interface EventoFalso {
  request: Request;
  respondWith(r: Response | Promise<Response>): Promise<void>;
}

const fila: EventoFalso[] = [];
const aguardando: Array<(e: EventoFalso) => void> = [];

function proximoPedido(): Promise<EventoFalso> {
  const evento = fila.shift();
  if (evento) return Promise.resolve(evento);
  return new Promise((resolve) => aguardando.push(resolve));
}

let carregado = false;
async function carregarFuncao(): Promise<void> {
  if (carregado) return;
  const DenoMutavel = Deno as unknown as Record<string, unknown>;
  const listenOriginal = DenoMutavel.listen;
  const endereco = { transport: "tcp", hostname: "127.0.0.1", port: 0 };
  let conexaoEntregue = false;
  DenoMutavel.listen = () => ({
    addr: endereco,
    // Entrega UMA conexão; as próximas esperas ficam pendentes (servidor ocioso).
    accept: () => {
      if (conexaoEntregue) return new Promise(() => {});
      conexaoEntregue = true;
      return Promise.resolve({ localAddr: endereco, remoteAddr: endereco, close() {} });
    },
    close() {},
  });
  // `Deno.serveHttp` não existe mais no Deno 2; o dublê fica no worker deste teste
  // porque o std o chama de forma assíncrona, depois que o import já terminou.
  DenoMutavel.serveHttp = () => ({ nextRequest: proximoPedido, close() {} });
  try {
    await import("./index.ts");
  } finally {
    DenoMutavel.listen = listenOriginal;
  }
  carregado = true;
}

async function chamar(req: Request): Promise<Response> {
  await carregarFuncao();
  return await new Promise<Response>((resolve) => {
    const evento: EventoFalso = {
      request: req,
      respondWith: async (r) => {
        resolve(await r);
      },
    };
    const consumidor = aguardando.shift();
    if (consumidor) consumidor(evento);
    else fila.push(evento);
  });
}

// ─── cenário sintético ───────────────────────────────────────────────────────

const SUPABASE = "https://stub.supabase.co";
const USER_ID = "11111111-2222-4333-8444-555555555555";
const PERFIL_ID = "22222222-3333-4444-8555-666666666666";
const SESSAO_ID = "33333333-4444-4555-8666-777777777777";
const CONTATO_ID = "44444444-5555-4666-8777-888888888888";
const PROVEDOR = "https://provedor-ia.test/v1/chat/completions";
const SEGREDO_PROVEDOR = "CHAVE_PROVEDOR_COPILOTO_TESTE";

const PROVEDOR_PADRAO = {
  id: "00000000-0000-4000-8000-0000000000cc",
  name: "Provedor de Teste",
  provider_type: "openai_compatible",
  api_endpoint: PROVEDOR,
  api_key_secret_name: SEGREDO_PROVEDOR,
  model: "modelo-teste",
  system_prompt: null,
  config: {},
  is_active: true,
  is_default: true,
  use_for: ["copilot"],
};

interface Chamada {
  url: string;
  metodo: string;
  corpo: unknown;
}

interface Rotas {
  auth?: number;
  perfil?: boolean;
  /** Sessão já existe e é de OUTRO dono (insert 23505 + update sem linhas). */
  sessaoAlheia?: boolean;
  provedor?: () => Response;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

async function cenario<T>(rotas: Rotas, fn: (calls: Chamada[]) => Promise<T>): Promise<T> {
  const valores: Record<string, string> = {
    SUPABASE_URL: SUPABASE,
    SUPABASE_ANON_KEY: "anon-key-sintetica",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-sintetica",
    [SEGREDO_PROVEDOR]: "segredo-de-provedor-sintetico",
  };
  const salvos = Object.keys(valores).map((k) => [k, Deno.env.get(k)] as const);
  for (const [k, v] of Object.entries(valores)) Deno.env.set(k, v);
  const original = globalThis.fetch;
  const calls: Chamada[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const metodo = String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    let corpo: unknown = null;
    if (typeof init?.body === "string") {
      try {
        corpo = JSON.parse(init.body);
      } catch {
        corpo = init.body;
      }
    }
    calls.push({ url, metodo, corpo });

    if (url.includes("/auth/v1/user")) {
      const status = rotas.auth ?? 200;
      return Promise.resolve(status === 200 ? json({ id: USER_ID, aud: "authenticated" }) : json({ message: "invalid JWT" }, status));
    }
    if (url.includes("/rest/v1/profiles")) return Promise.resolve(json(rotas.perfil === false ? [] : [{ id: PERFIL_ID }]));
    if (url.includes("/rest/v1/copilot_sessions")) {
      if (metodo === "POST") {
        return Promise.resolve(
          rotas.sessaoAlheia
            ? json({ code: "23505", message: "duplicate key value violates unique constraint" }, 409)
            : json({ id: SESSAO_ID }, 201),
        );
      }
      if (metodo === "PATCH") return Promise.resolve(json({ code: "PGRST116", message: "0 rows" }, 406));
      return Promise.resolve(json([{ contact_id: "contato-de-outro-dono" }]));
    }
    if (url.includes("/rest/v1/copilot_insights")) return Promise.resolve(new Response(null, { status: 201 }));
    if (url.includes("/rest/v1/rpc/")) return Promise.resolve(json({ code: "PGRST000", message: "rpc indisponivel no stub" }, 400));
    if (url.includes("/rest/v1/ai_usage_logs")) return Promise.resolve(json({}, 201));
    if (url.includes("/rest/v1/ai_providers")) return Promise.resolve(json([PROVEDOR_PADRAO]));
    if (url.startsWith(PROVEDOR)) {
      return Promise.resolve((rotas.provedor ?? (() => new Response("sem stub de provedor", { status: 599 })))());
    }
    return Promise.resolve(new Response("nao stubado", { status: 599 }));
  }) as typeof fetch;
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = original;
    for (const [k, v] of salvos) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

function pedido(body: unknown, authorization: string | null = "Bearer jwt-sintetico", method = "POST"): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (authorization) headers.authorization = authorization;
  return new Request("https://edge.invalid/functions/v1/copilot-live", {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(body) : null,
  });
}

const TICK = {
  conversation_id: "conv-1",
  contact_id: CONTATO_ID,
  last_client_message: "Quanto fica 200 canecas?",
  sale_stage: "negociacao",
};

const escritas = (calls: Chamada[], tabela: string) =>
  calls.filter((c) => c.metodo !== "GET" && c.url.includes(`/rest/v1/${tabela}`));
const chamadasAoProvedor = (calls: Chamada[]) => calls.filter((c) => c.url.startsWith(PROVEDOR));

Deno.test("copilot-live: preflight OPTIONS responde CORS sem rede", async () => {
  await cenario({}, async (calls) => {
    const res = await chamar(pedido(null, null, "OPTIONS"));
    await res.body?.cancel();
    assertEquals(res.status, 200);
    assertEquals((res.headers.get("access-control-allow-headers") ?? "").includes("authorization"), true);
    assertEquals(calls.length, 0);
  });
});

Deno.test("copilot-live: sem Authorization devolve 401 sem rede", async () => {
  await cenario({}, async (calls) => {
    const res = await chamar(pedido(TICK, null));
    await res.body?.cancel();
    assertEquals(res.status, 401);
    assertEquals(calls.length, 0);
  });
});

Deno.test("copilot-live: JWT recusado pelo GoTrue devolve 401 sem gravar nada", async () => {
  await cenario({ auth: 401 }, async (calls) => {
    const res = await chamar(pedido(TICK));
    await res.body?.cancel();
    assertEquals(res.status, 401);
    assertEquals(escritas(calls, "copilot_sessions").length, 0);
  });
});

Deno.test("copilot-live: usuário sem perfil devolve 403 sem gravar nada", async () => {
  await cenario({ perfil: false }, async (calls) => {
    const res = await chamar(pedido(TICK));
    await res.body?.cancel();
    assertEquals(res.status, 403);
    assertEquals(escritas(calls, "copilot_sessions").length, 0);
  });
});

Deno.test("copilot-live: tick sem conversation_id devolve 400 sem gravar sessão", async () => {
  await cenario({}, async (calls) => {
    const res = await chamar(pedido({ contact_id: CONTATO_ID }));
    await res.body?.cancel();
    assertEquals(res.status, 400);
    assertEquals(escritas(calls, "copilot_sessions").length, 0);
    assertEquals(chamadasAoProvedor(calls).length, 0);
  });
});

Deno.test("copilot-live: caminho feliz cria a sessão, gera a sugestão e grava o insight", async () => {
  await cenario({
    provedor: () =>
      json({
        model: "modelo-teste",
        choices: [{ message: { content: "  Mostre o custo por uso da caneca.  " } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
  }, async (calls) => {
    const res = await chamar(pedido(TICK));
    assertEquals(res.status, 200);
    assertEquals(await res.json(), {
      ok: true,
      session_id: SESSAO_ID,
      insight: { content: "Mostre o custo por uso da caneca.", modelVersion: "modelo-teste" },
    });
    const sessao = escritas(calls, "copilot_sessions")[0]?.corpo as Record<string, unknown>;
    assertEquals([sessao.conversation_id, sessao.profile_id, sessao.contact_id, sessao.sale_stage], [
      "conv-1",
      USER_ID,
      CONTATO_ID,
      "negociacao",
    ]);
    assertEquals(chamadasAoProvedor(calls).length, 1);
    const insight = escritas(calls, "copilot_insights")[0]?.corpo as Record<string, unknown>;
    assertEquals([insight.session_id, insight.profile_id, insight.content], [
      SESSAO_ID,
      USER_ID,
      "Mostre o custo por uso da caneca.",
    ]);
  });
});

Deno.test("copilot-live: provedor indisponível cai na sugestão de fallback do estágio", async () => {
  await cenario({ provedor: () => json({ error: "indisponivel" }, 503) }, async (calls) => {
    const res = await chamar(pedido(TICK));
    assertEquals(res.status, 200);
    const corpo = await res.json();
    assertEquals(corpo.insight, { content: "Destaque o custo por uso — não o custo total.", modelVersion: "fallback-v1" });
    assertEquals(escritas(calls, "copilot_insights").length, 1);
  });
});

Deno.test("copilot-live: sessão de outro dono com contato diferente devolve 403 sem gerar insight", async () => {
  await cenario({ sessaoAlheia: true }, async (calls) => {
    const res = await chamar(pedido(TICK));
    await res.body?.cancel();
    assertEquals(res.status, 403);
    assertEquals(chamadasAoProvedor(calls).length, 0);
    assertEquals(escritas(calls, "copilot_insights").length, 0);
  });
});
