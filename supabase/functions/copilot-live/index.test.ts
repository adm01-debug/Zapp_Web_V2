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
const SEGREDO_PROVEDOR = "OPENAI_API_KEY";

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
  /** contact_id gravado na sessão alheia (padrão: um contato que não é o do tick). */
  contatoDaSessao?: string;
  /** contacts.assigned_to do contato do tick (padrão: o perfil do chamador). */
  responsavelDoContato?: string;
  provedor?: () => Response;
  /** ai.capability.copilot_live desligada explicitamente (kill switch do IA-009). */
  capacidadeDesligada?: boolean;
  /** Contagem de ai_usage_logs nas últimas 24h já no limite da cota diária (500). */
  cotaDiariaExcedida?: boolean;
  /** assistant_profiles do usuário (Fase 1). Ausente = sem perfil (usa defaults). */
  assistant?: Record<string, unknown> | null;
  /** Compromissos futuros do contato (Fase 2). Ausente = nenhum. */
  agenda?: Array<{ title: string; remind_at: string | null }>;
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
      if (metodo === "PATCH") {
        // Só o update filtrado pelo dono (profile_id=eq.) não acha linha; a transferência
        // (sem esse filtro) teria sucesso, então o 403 tem de vir das guardas.
        return Promise.resolve(
          url.includes("profile_id=eq.")
            ? json({ code: "PGRST116", message: "0 rows" }, 406)
            : json({ id: SESSAO_ID }),
        );
      }
      return Promise.resolve(json([{ contact_id: rotas.contatoDaSessao ?? "contato-de-outro-dono" }]));
    }
    if (url.includes("/rest/v1/contacts")) {
      return Promise.resolve(json([{ assigned_to: rotas.responsavelDoContato ?? PERFIL_ID }]));
    }
    if (url.includes("/rest/v1/copilot_insights")) return Promise.resolve(new Response(null, { status: 201 }));
    if (url.includes("/rest/v1/rpc/")) return Promise.resolve(json({ code: "PGRST000", message: "rpc indisponivel no stub" }, 400));
    if (url.includes("/rest/v1/feature_flags")) {
      // enforceAiGuards (ai-feature-flags.ts): .maybeSingle() — ausência da
      // linha (padrão, LIGADA) vira PGRST116/406; capacidadeDesligada devolve a
      // linha com enabled=false explícito.
      return Promise.resolve(
        rotas.capacidadeDesligada
          ? json({ enabled: false })
          : json({
            code: "PGRST116",
            details: "Results contain 0 rows, application/vnd.pgrst.object+json requires 1 row",
            hint: null,
            message: "JSON object requested, multiple (or no) rows returned",
          }, 406),
      );
    }
    if (url.includes("/rest/v1/ai_usage_logs")) {
      // enforceAiGuards (ai-guards.ts): select(..., { count: "exact", head: true })
      // lê a contagem via header Content-Range, não do corpo (HEAD sem corpo).
      return Promise.resolve(
        rotas.cotaDiariaExcedida
          ? new Response(null, { status: 200, headers: { "content-range": "0-0/500" } })
          : json({}, 201),
      );
    }
    if (url.includes("/rest/v1/ai_providers")) return Promise.resolve(json([PROVEDOR_PADRAO]));
    if (url.includes("/rest/v1/assistant_profiles")) {
      // Fase 1: sem linha (padrão) retorna PGRST116/406 — .maybeSingle() vira
      // data=null e o motor usa os defaults; com linha, entrega o perfil.
      return Promise.resolve(
        rotas.assistant
          ? json(rotas.assistant)
          : json({
            code: "PGRST116",
            details: "Results contain 0 rows, application/vnd.pgrst.object+json requires 1 row",
            hint: null,
            message: "JSON object requested, multiple (or no) rows returned",
          }, 406),
      );
    }
    if (url.includes("/rest/v1/conversation_tasks")) return Promise.resolve(json(rotas.agenda ?? []));
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
const houveTransferencia = (calls: Chamada[]) =>
  calls.some((c) => c.metodo === "PATCH" && (c.corpo as Record<string, unknown> | null)?.profile_id === USER_ID);
const consultouContato = (calls: Chamada[]) => calls.some((c) => c.url.includes("/rest/v1/contacts"));
const corpoParaOProvedor = (calls: Chamada[]) =>
  (chamadasAoProvedor(calls)[0]?.corpo as { messages?: Array<{ role: string; content: unknown }> } | undefined)?.messages;

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
    assertEquals(consultouContato(calls), false);
    assertEquals(houveTransferencia(calls), false);
    assertEquals(chamadasAoProvedor(calls).length, 0);
    assertEquals(escritas(calls, "copilot_insights").length, 0);
  });
});

Deno.test("copilot-live: sessão de outro dono com o mesmo contato, mas contato de outro responsável, devolve 403", async () => {
  await cenario({ sessaoAlheia: true, contatoDaSessao: CONTATO_ID, responsavelDoContato: "perfil-de-outro-vendedor" }, async (calls) => {
    const res = await chamar(pedido(TICK));
    await res.body?.cancel();
    assertEquals(res.status, 403);
    assertEquals(consultouContato(calls), true);
    assertEquals(houveTransferencia(calls), false);
    assertEquals(chamadasAoProvedor(calls).length, 0);
    assertEquals(escritas(calls, "copilot_insights").length, 0);
  });
});

// CV-141 (achado de QA): copilot-live chamava generateWithRouting sem passar
// por enforceAiGuards (rate limit por usuário + cota diária de ai_usage_logs +
// kill switch de capacidade) — a mesma guarda que ai-enhance-message, ai-suggest-reply
// etc. já respeitam. Sem ela, nenhum desligamento de capacidade nem cota de uso
// continham as chamadas ao provedor de IA deste tick em tempo real.

Deno.test("copilot-live: cota diária de IA excedida devolve 429 sem chamar o provedor nem gravar sessão", async () => {
  await cenario({ cotaDiariaExcedida: true }, async (calls) => {
    const res = await chamar(pedido(TICK));
    const corpo = await res.json();
    assertEquals(res.status, 429);
    assertEquals(typeof corpo.error, "string");
    assertEquals(chamadasAoProvedor(calls).length, 0);
    assertEquals(escritas(calls, "copilot_sessions").length, 0);
    assertEquals(escritas(calls, "copilot_insights").length, 0);
  });
});

Deno.test("copilot-live: capacidade ai.capability.copilot_live desligada devolve erro sem chamar o provedor", async () => {
  await cenario({ capacidadeDesligada: true }, async (calls) => {
    const res = await chamar(pedido(TICK));
    await res.body?.cancel();
    assertEquals(res.status >= 400, true);
    assertEquals(chamadasAoProvedor(calls).length, 0);
    assertEquals(escritas(calls, "copilot_sessions").length, 0);
    assertEquals(escritas(calls, "copilot_insights").length, 0);
  });
});

// Fase 1 — Identidade (entrega verificável): usuários com atuações e focos
// diferentes recebem system prompts diferentes. Sem linha em assistant_profiles
// o motor usa os defaults declarados na migration.

Deno.test("copilot-live: Fase 1 — sem perfil usa os defaults de identidade no system prompt", async () => {
  await cenario({
    provedor: () =>
      json({ model: "modelo-teste", choices: [{ message: { content: "Sugestão default." } }], usage: {} }),
  }, async (calls) => {
    const res = await chamar(pedido(TICK));
    assertEquals(res.status, 200);
    const system = corpoParaOProvedor(calls)?.find((m) => m.role === "system")?.content as string;
    assertEquals(typeof system, "string");
    assertEquals(system.includes("Atuação do vendedor que você assiste: atendimento."), true);
    assertEquals(system.includes("Foco principal dele: avançar a conversa em direção ao pedido."), true);
    assertEquals(system.includes("Tom preferido de comunicação: consultivo.\n"), true);
  });
});

Deno.test("copilot-live: Fase 2 — compromisso já marcado com o contato entra no prompt", async () => {
  await cenario({
    agenda: [{ title: "Ligar para Ana", remind_at: "2030-01-03T12:00:00.000Z" }],
    provedor: () =>
      json({ model: "modelo-teste", choices: [{ message: { content: "Retome o combinado de quinta." } }], usage: {} }),
  }, async (calls) => {
    const res = await chamar(pedido(TICK));
    await res.body?.cancel();
    assertEquals(res.status, 200);
    assertEquals(calls.some((c) => c.url.includes("/rest/v1/conversation_tasks")), true);
    const system = corpoParaOProvedor(calls)?.find((m) => m.role === "system")?.content as string;
    assertEquals(system.includes("Ligar para Ana"), true);
    assertEquals(system.includes("Mencione o compromisso existente"), true);
  });
});

Deno.test("copilot-live: Fase 1 — perfil de atuação/foco/tom próprios muda o system prompt", async () => {
  await cenario({
    assistant: { atividade: "venda", foco: "fechar pedidos de brindes até sexta", ajuda: "sempre", tom: "direto" },
    provedor: () =>
      json({ model: "modelo-teste", choices: [{ message: { content: "Sugestão para vendas." } }], usage: {} }),
  }, async (calls) => {
    const res = await chamar(pedido(TICK));
    assertEquals(res.status, 200);
    const system = corpoParaOProvedor(calls)?.find((m) => m.role === "system")?.content as string;
    assertEquals(typeof system, "string");
    assertEquals(system.includes("Atuação do vendedor que você assiste: venda."), true);
    assertEquals(system.includes("Foco principal dele: fechar pedidos de brindes até sexta."), true);
    assertEquals(system.includes("Tom preferido de comunicação: direto.\n"), true);
  });
});

Deno.test("copilot-live: Fase 4 — treino do perfil entra no system prompt", async () => {
  await cenario({
    assistant: { atividade: "venda", foco: "fechar pedidos grandes", ajuda: "sempre", tom: "direto" },
    provedor: () =>
      json({ model: "modelo-teste", choices: [{ message: { content: "Sugestão de venda." } }], usage: {} }),
  }, async (calls) => {
    const res = await chamar(pedido(TICK));
    assertEquals(res.status, 200);
    const system = corpoParaOProvedor(calls)?.find((m) => m.role === "system")?.content as string;
    assertEquals(system.includes("Treino do perfil (venda)"), true);
    assertEquals(system.includes("Objeções conhecidas"), true);
  });
});

Deno.test("copilot-live: Fase 4 — atuações diferentes recebem treinos diferentes", async () => {
  const sistemPara = async (atividade: string) => {
    let system = "";
    await cenario({
      assistant: { atividade, foco: "", ajuda: "relevante", tom: "consultivo" },
      provedor: () =>
        json({ model: "modelo-teste", choices: [{ message: { content: "ok" } }], usage: {} }),
    }, async (calls) => {
      const res = await chamar(pedido(TICK));
      await res.body?.cancel();
      system = corpoParaOProvedor(calls)?.find((m) => m.role === "system")?.content as string;
    });
    return system;
  };

  const venda = await sistemPara("venda");
  const supervisao = await sistemPara("supervisao");
  assertEquals(venda === supervisao, false);
  assertEquals(venda.includes("Treino do perfil (venda)"), true);
  assertEquals(supervisao.includes("Treino do perfil (supervisao)"), true);
});