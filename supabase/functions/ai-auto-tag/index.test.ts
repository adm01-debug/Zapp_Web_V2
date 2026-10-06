// R2-API-033 / item 207 — "Auto-tag conserva etiquetas antigas quando a nova
// classificação válida não tem tags".
//
// O defeito: o handler só chamava `replace_ai_conversation_tags` quando a
// classificação trazia AO MENOS uma tag (`tagPayload.length > 0`). Quando o
// modelo devolvia uma classificação VÁLIDA sem tags (`{ "tags": [] }`), a RPC —
// que tem semântica explícita de "array vazio LIMPA as etiquetas de IA" —
// simplesmente não era chamada, e as etiquetas de IA da análise anterior
// ficavam no contato mentindo sobre a nova classificação.
//
// Prova: o teste chama o handler REAL (`supabase/functions/ai-auto-tag/index.ts`)
// com o provedor e o banco FALSOS (stub de `globalThis.fetch`, sem rede externa)
// e confere que a RPC de substituição é chamada com `p_tags: []` — e que a
// classificação COM tags continua substituindo normalmente.
//
// Vermelho no código defeituoso (a RPC não é chamada com a lista vazia), verde
// com a correção.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read \
//   --allow-net=127.0.0.1 supabase/functions/ai-auto-tag/index.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";

const SUPABASE_URL = "https://projeto-teste.supabase.co";
const PROVEDOR_HOST = "provedor-teste.invalid";
const PROVEDOR_ENDPOINT = `https://${PROVEDOR_HOST}/v1/chat/completions`;
const PROVEDOR_ID = "a1111111-b222-4333-8444-55555555555f";
const PROVEDOR_SECRET_NAME = "TESTE_AI_AUTOTAG_KEY";
const PROVEDOR_SEGREDO = "segredo-de-teste";

const CONTATO_ID = "c0000000-0000-4000-8000-000000000001";
const USUARIO_ID = "u0000000-0000-4000-8000-000000000001";

type Handler = (req: Request) => Response | Promise<Response>;

/** Env falsa: nada aqui é credencial real. */
function stubEnv(): () => void {
  const anterior: Record<string, string | undefined> = {};
  const valores: Record<string, string> = {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: "service-role-de-teste",
    SUPABASE_ANON_KEY: "anon-key-de-teste",
    [PROVEDOR_SECRET_NAME]: PROVEDOR_SEGREDO,
  };
  for (const [nome, valor] of Object.entries(valores)) {
    anterior[nome] = Deno.env.get(nome);
    Deno.env.set(nome, valor);
  }
  return () => {
    for (const [nome, valor] of Object.entries(anterior)) {
      if (valor === undefined) Deno.env.delete(nome);
      else Deno.env.set(nome, valor);
    }
  };
}

/**
 * Captura o handler registrado por `Deno.serve` no módulo da função SEM tocar no
 * código de produção: `Deno.serve` é substituído por um espião só durante o
 * import dinâmico, e o handler exportado implicitamente é devolvido.
 */
let handlerCache: Promise<Handler> | null = null;
function carregarHandler(): Promise<Handler> {
  if (handlerCache) return handlerCache;
  handlerCache = (async () => {
    let capturado: Handler | null = null;
    const original = Deno.serve;
    const espião = ((h: Handler) => {
      capturado = h;
      return {
        finished: Promise.resolve(),
        shutdown: () => Promise.resolve(),
        ref() {},
        unref() {},
        addr: { transport: "tcp", hostname: "127.0.0.1", port: 0 },
      };
    }) as unknown as typeof Deno.serve;
    Deno.serve = espião;
    try {
      await import("./index.ts");
    } finally {
      Deno.serve = original;
    }
    if (!capturado) throw new Error("index.ts não registrou handler em Deno.serve");
    return capturado;
  })();
  return handlerCache;
}

interface EstadoStub {
  /** Quantas vezes o ENDPOINT DO PROVEDOR foi chamado. */
  chamadasProvedor: number;
  /** Um registro por chamada à RPC `replace_ai_conversation_tags`. */
  rpcReplaceTags: Array<Record<string, unknown>>;
  /** URLs que o stub não cobriu (deve terminar vazio). */
  naoTratadas: string[];
  /** Resposta do provedor (envelope OpenAI-compatible). */
  provedorResposta: () => Response;
}

function json(corpo: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** Provedor FALSO: devolve o envelope que o adaptador OpenAI-compatible espera. */
function provedorFalso(saidaDoModelo: Record<string, unknown>): () => Response {
  return () =>
    json({
      choices: [{ message: { content: JSON.stringify(saidaDoModelo) } }],
      usage: { prompt_tokens: 20, completion_tokens: 8 },
      model: "modelo-teste",
    });
}

const PROVEDOR_LINHA = {
  id: PROVEDOR_ID,
  name: "Provedor Teste",
  provider_type: "openai_compatible",
  api_endpoint: PROVEDOR_ENDPOINT,
  api_key_secret_name: PROVEDOR_SECRET_NAME,
  model: "modelo-teste",
  system_prompt: null,
  config: null,
  is_active: true,
  is_default: true,
  use_for: ["copilot", "analysis", "summary", "tagging", "auto_reply"],
};

function instalarFetchFalso(provedorResposta: () => Response): { estado: EstadoStub; restaurar: () => void } {
  const estado: EstadoStub = {
    chamadasProvedor: 0,
    rpcReplaceTags: [],
    naoTratadas: [],
    provedorResposta,
  };
  const original = globalThis.fetch;

  globalThis.fetch = ((entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entrada === "string"
      ? entrada
      : entrada instanceof URL
      ? entrada.href
      : entrada.url;
    const metodo = (init?.method ?? "GET").toUpperCase();
    const u = new URL(url);
    const caminho = u.pathname;

    if (u.hostname === PROVEDOR_HOST) {
      estado.chamadasProvedor += 1;
      return provedorResposta();
    }

    if (caminho === "/auth/v1/user") {
      return json({ id: USUARIO_ID, aud: "authenticated" });
    }

    if (caminho.startsWith("/rest/v1/rpc/")) {
      const rpc = caminho.slice("/rest/v1/rpc/".length);
      if (rpc === "ai_rate_limit_hit") return json(1);
      if (rpc === "ai_budget_reserve") {
        return json([{ id: "reserva-teste", allowed: true, used_tokens: 0, limit_tokens: 200000 }]);
      }
      if (rpc === "ai_budget_settle" || rpc === "ai_budget_release") {
        return new Response(null, { status: 204 });
      }
      if (rpc === "replace_ai_conversation_tags") {
        const corpo = typeof init?.body === "string" ? JSON.parse(init.body) : {};
        estado.rpcReplaceTags.push(corpo as Record<string, unknown>);
        return json({ contact_id: CONTATO_ID, replaced: true, count: 0 });
      }
      if (rpc === "is_admin_or_supervisor") return json(false);
      return json(null);
    }

    if (caminho === "/rest/v1/ai_usage_logs") {
      if (metodo === "HEAD") {
        return new Response(null, { status: 200, headers: { "Content-Range": "*/0" } });
      }
      if (metodo === "POST") return json({}, 201);
      return json([]);
    }

    if (caminho === "/rest/v1/ai_providers") return json([PROVEDOR_LINHA]);
    if (caminho === "/rest/v1/messages") return json([]);
    if (caminho === "/rest/v1/queues") return json([]);
    if (caminho === "/rest/v1/contacts") {
      if (metodo === "PATCH") return new Response(null, { status: 204 });
      return json({ id: CONTATO_ID });
    }
    if (caminho === "/rest/v1/profiles") return json({ id: "perfil-teste" });
    if (caminho === "/rest/v1/notifications") return json({}, 201);

    estado.naoTratadas.push(`${metodo} ${caminho}`);
    return json({ message: `stub não cobre ${metodo} ${caminho}` }, 404);
  }) as unknown as typeof fetch;

  return { estado, restaurar: () => { globalThis.fetch = original; } };
}

/** Request sintética com um bearer que `requireAuth` aceita (auth/v1/user é stub). */
function requisicaoDeAutoTag(): Request {
  const payload = btoa(JSON.stringify({ sub: USUARIO_ID }));
  const token = `cabecalho.${payload.replace(/=+$/, "")}.assinatura`;
  return new Request("https://funcao-teste.invalid/ai-auto-tag", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      contactId: CONTATO_ID,
      messages: [
        { sender: "cliente", content: "Bom dia, qual é o prazo de entrega?", message_type: "text" },
        { sender: "atendente", content: "Vou verificar e já te retorno.", message_type: "text" },
      ],
    }),
  });
}

Deno.test("R2-API-033: classificação válida SEM tags LIMPA as etiquetas de IA do contato", async () => {
  const restaurarEnv = stubEnv();
  const handler = await carregarHandler();
  const { estado, restaurar } = instalarFetchFalso(
    provedorFalso({
      tags: [],
      sentiment: "neutro",
      priority: "normal",
      priority_reason: "sem urgencia",
      summary: "Cliente pergunta o prazo de entrega",
      suggested_queue_id: null,
      suggested_queue_reason: null,
      customer_intent: "saber o prazo",
      requires_immediate_attention: false,
      escalation_reason: null,
    }),
  );

  try {
    const resposta = await handler(requisicaoDeAutoTag());
    const corpo = await resposta.json();

    assertEquals(resposta.status, 200);
    assertEquals(estado.chamadasProvedor, 1, "o provedor falso deveria ter sido chamado uma vez");
    assertEquals(estado.naoTratadas, []);

    // O coração do defeito: com uma classificação válida sem tags a RPC de
    // substituição TEM de rodar com lista vazia — é o que limpa as etiquetas de IA
    // da análise anterior. No código defeituoso ela não era chamada.
    assertEquals(
      estado.rpcReplaceTags.length,
      1,
      "a RPC replace_ai_conversation_tags não foi chamada: as etiquetas de IA antigas ficaram no contato",
    );
    assertEquals(estado.rpcReplaceTags[0].p_contact_id, CONTATO_ID);
    assertEquals(
      estado.rpcReplaceTags[0].p_tags,
      [],
      "a RPC tinha de receber a lista vazia (limpar as etiquetas de IA), não ser omitida",
    );

    assertEquals(corpo.tags, []);
    assertEquals(corpo.evidence.tagsReplaced, true);
  } finally {
    restaurar();
    restaurarEnv();
  }
});

Deno.test("R2-API-033: classificação COM tags continua substituindo as etiquetas de IA", async () => {
  const restaurarEnv = stubEnv();
  const handler = await carregarHandler();
  const { estado, restaurar } = instalarFetchFalso(
    provedorFalso({
      tags: [{ name: "financeiro", confidence: 0.9 }],
      sentiment: "neutro",
      priority: "normal",
      summary: "Cliente fala de boleto",
      suggested_queue_id: null,
      requires_immediate_attention: false,
    }),
  );

  try {
    const resposta = await handler(requisicaoDeAutoTag());
    const corpo = await resposta.json();

    assertEquals(resposta.status, 200);
    assertEquals(estado.naoTratadas, []);
    assertEquals(estado.rpcReplaceTags.length, 1);
    assertEquals(estado.rpcReplaceTags[0].p_contact_id, CONTATO_ID);
    assertEquals(estado.rpcReplaceTags[0].p_tags, [{ name: "financeiro", confidence: 0.9 }]);
    assertEquals(corpo.tags, [{ name: "financeiro", confidence: 0.9 }]);
    assertEquals(corpo.evidence.tagsReplaced, true);
  } finally {
    restaurar();
    restaurarEnv();
  }
});

Deno.test("R2-API-033: o provedor falhando (503) não grava etiqueta nenhuma", async () => {
  const restaurarEnv = stubEnv();
  const handler = await carregarHandler();
  const { estado, restaurar } = instalarFetchFalso(() => json({ error: "indisponivel" }, 503));

  try {
    const resposta = await handler(requisicaoDeAutoTag());
    await resposta.text();

    assertEquals(resposta.status, 500);
    assertEquals(estado.rpcReplaceTags.length, 0, "sem classificação válida nada pode ser gravado");
    assert(estado.chamadasProvedor >= 1);
  } finally {
    restaurar();
    restaurarEnv();
  }
});
