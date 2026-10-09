// IA-CHATBOT-001 (P1) — o chatbot L1 precisa usar o `connectionId` DA MENSAGEM
// para escolher o flow e montar o histórico.
//
// Defeito medido: o handler recebia `connectionId` no corpo e o DESCARTAVA — a
// consulta de `chatbot_flows` não filtrava por conexão (`.limit(1)` pegava um flow
// ativo qualquer) e o histórico de `messages` era só por contato. Consequência
// real: um flow e um histórico de OUTRO número respondiam por esta conexão.
//
// Estes testes exercitam o handler de verdade (importado, sem abrir porta) contra
// um PostgREST e um provedor de IA falsos, servidos em 127.0.0.1. O que se mede:
//   1. requisição SEM `connectionId` (ausente, nulo ou inválido) é REJEITADA na
//      entrada, sem consultar flow, histórico nem chamar a IA;
//   2. flow de OUTRA conexão não atende esta conexão (e nada é respondido);
//   3. o histórico do prompt carrega só as mensagens da conexão da mensagem;
//   4. as consultas emitidas SEMPRE carregam o filtro `whatsapp_connection_id`.
//
// IA-106 (SL-086 — Bloco 11): a mensagem de entrada não pode ir DUAS vezes ao
// modelo. O webhook grava a fala do cliente em `messages` antes de acionar o
// bot, então ela já é a linha mais recente do histórico; o handler, porém,
// anexava a mesma fala outra vez. O que se mede aqui: com a mensagem JÁ
// persistida ela entra no prompt UMA vez (e o histórico anterior fica); sem
// persistência ela é anexada como sempre, uma vez; e a fala do ATENDENTE com o
// mesmo texto não é comida pelo dedupe.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1

import { handleChatbotL1Request } from "./index.ts";

// ── fixtures ────────────────────────────────────────────────────────────────

const CONEXAO_A = "11111111-1111-4111-8111-111111111111";
const CONEXAO_B = "22222222-2222-4222-8222-222222222222";
const CONTATO = "33333333-3333-4333-8333-333333333333";
const SEGREDO_WEBHOOK = "segredo-do-webhook-do-chatbot";

type Linha = Record<string, unknown>;

function flow(id: string, conexao: string): Linha {
  return { id, name: `Flow ${id}`, is_active: true, trigger_type: "ai_l1", whatsapp_connection_id: conexao };
}

function mensagem(conteudo: string, conexao: string, criadaEm: string): Linha {
  return {
    content: conteudo,
    sender: "contact",
    message_type: "text",
    contact_id: CONTATO,
    whatsapp_connection_id: conexao,
    created_at: criadaEm,
  };
}

/** Perde a corrida para a deadlock de `console.log`? Não: silencia o logger das edges. */
function silenciarLogs() {
  const original = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  console.info = () => {};
  return () => Object.assign(console, original);
}

// ── asserções locais (sem import remoto novo) ───────────────────────────────

function afirma(condicao: unknown, mensagem: string): asserts condicao {
  if (!condicao) throw new Error(mensagem);
}

function igual(recebido: unknown, esperado: unknown, mensagem: string) {
  if (recebido !== esperado) {
    throw new Error(`${mensagem} — recebi ${JSON.stringify(recebido)}, esperava ${JSON.stringify(esperado)}`);
  }
}

function afirmaErroConnectionId(status: number, corpo: Record<string, unknown>) {
  igual(status, 422, "falha de connectionId precisa usar HTTP 422");

  const erro = corpo.error as Record<string, unknown> | undefined;
  afirma(erro, "resposta precisa conter o objeto error");
  igual(erro.code, "VALIDATION_ERROR", "falha precisa usar o código canônico de validação");

  const campos = erro.fields as Array<Record<string, unknown>> | undefined;
  afirma(Array.isArray(campos), "erro de validação precisa listar os campos inválidos");
  afirma(
    campos.some((campo) => campo.path === "connectionId"),
    "erro de validação precisa identificar o campo connectionId",
  );
}

// ── infraestrutura falsa ────────────────────────────────────────────────────

interface Chamada {
  metodo: string;
  caminho: string;
  params: URLSearchParams;
  corpo: string;
  /** true quando o filtro `whatsapp_connection_id=eq.<valor>` está na query. */
  filtraConexao: boolean;
  conexao: string | null;
}

interface Cenario {
  fluxos: Linha[];
  mensagens: Linha[];
  artigos?: Linha[];
}

interface CenarioVivo {
  chamadas: Chamada[];
  prompts: string[];
  encerrar: () => Promise<void>;
  restauraEnv: () => void;
}

const IGNORADOS = new Set(["select", "limit", "order", "columns", "on_conflict"]);

function casaFiltros(linha: Linha, params: URLSearchParams): boolean {
  for (const [chave, valor] of params) {
    if (IGNORADOS.has(chave)) continue;
    if (!valor.startsWith("eq.")) continue;
    if (String(linha[chave] ?? "") !== valor.slice(3)) return false;
  }
  return true;
}

function aplicaOrdem(linhas: Linha[], params: URLSearchParams): Linha[] {
  const ordem = params.get("order");
  if (!ordem) return linhas;
  const [coluna, direcao] = ordem.split(".");
  return [...linhas].sort((a, b) => {
    const va = String(a[coluna] ?? "");
    const vb = String(b[coluna] ?? "");
    return va < vb ? (direcao === "desc" ? 1 : -1) : va > vb ? (direcao === "desc" ? -1 : 1) : 0;
  });
}

async function hmacHex(payload: string, segredo: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SAIDA_DO_MODELO = JSON.stringify({
  handled: true,
  response: "Resposta do bot",
  transfer_to_human: false,
  confidence: 0.9,
  detected_sentiment: "neutro",
});

/**
 * Sobe o PostgREST falso + o provedor de IA falso, aponta as envs para eles e
 * devolve os registros. O cenário é isolado por teste (portas efêmeras).
 */
async function abrirCenario(cenario: Cenario): Promise<CenarioVivo> {
  const prompts: string[] = [];

  // 1) provedor de IA falso (recebe o prompt montado pelo handler)
  const ia = Deno.serve({ port: 0, hostname: "127.0.0.1" }, async (req) => {
    prompts.push(await req.text());
    return new Response(JSON.stringify({
      choices: [{ message: { content: SAIDA_DO_MODELO } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }), { headers: { "content-type": "application/json" } });
  });
  const urlIA = `http://127.0.0.1:${(ia.addr as Deno.NetAddr).port}/v1/chat`;

  const tabelas: Record<string, Linha[]> = {
    chatbot_flows: cenario.fluxos,
    messages: cenario.mensagens,
    contacts: [{
      id: CONTATO,
      name: "Cliente Teste",
      company: "ACME",
      tags: ["vip"],
      ai_priority: null,
      ai_sentiment: null,
    }],
    ai_providers: [{
      id: "prov-1",
      name: "Provedor Falso",
      provider_type: "openai_compatible",
      api_endpoint: urlIA,
      api_key_secret_name: "FAKE_AI_KEY",
      model: "modelo-falso",
      is_active: true,
      is_default: true,
      use_for: ["auto_reply"],
      config: {},
    }],
    knowledge_base_articles: cenario.artigos ?? [],
    ai_usage_logs: [],
  };

  const chamadas: Chamada[] = [];
  const db = Deno.serve({ port: 0, hostname: "127.0.0.1" }, async (req) => {
    const url = new URL(req.url);
    const corpo = req.method === "GET" || req.method === "HEAD" ? "" : await req.text();
    const caminho = url.pathname.replace(/^\/rest\/v1\//, "");
    const responde = (valor: unknown, status = 200) =>
      new Response(JSON.stringify(valor), { status, headers: { "content-type": "application/json" } });

    if (!url.pathname.startsWith("/rest/v1/")) {
      return responde({ erro: `nao stubado: ${req.method} ${url.pathname}` }, 404);
    }

    chamadas.push({
      metodo: req.method,
      caminho,
      params: url.searchParams,
      corpo,
      filtraConexao: url.searchParams.has("whatsapp_connection_id"),
      conexao: url.searchParams.get("whatsapp_connection_id")?.replace(/^eq\./, "") ?? null,
    });

    if (caminho.startsWith("rpc/")) {
      const fn = caminho.slice(4);
      if (fn === "search_knowledge_base") return responde([]);
      if (fn === "ai_budget_reserve") {
        return responde([{ id: "res-1", allowed: true, used_tokens: 0, limit_tokens: 200000 }]);
      }
      return responde(null);
    }

    if (req.method === "POST" || req.method === "PATCH") {
      // inserts/updates: corpo vazio de representação basta para o handler
      return responde([], req.method === "POST" ? 201 : 200);
    }

    const linhas = tabelas[caminho] ?? [];
    const filtradas = aplicaOrdem(linhas.filter((l) => casaFiltros(l, url.searchParams)), url.searchParams);
    const limite = url.searchParams.get("limit");
    return responde(limite ? filtradas.slice(0, Number(limite)) : filtradas);
  });
  const urlDB = `http://127.0.0.1:${(db.addr as Deno.NetAddr).port}`;

  const anteriores = new Map<string, string | undefined>();
  const novas: Record<string, string> = {
    SUPABASE_URL: urlDB,
    SUPABASE_SERVICE_ROLE_KEY: "service-role-falso",
    CHATBOT_L1_WEBHOOK_SECRET: SEGREDO_WEBHOOK,
    FAKE_AI_KEY: "chave-falsa",
  };
  for (const [chave, valor] of Object.entries(novas)) {
    anteriores.set(chave, Deno.env.get(chave));
    Deno.env.set(chave, valor);
  }

  return {
    chamadas,
    prompts,
    encerrar: async () => {
      for (const [chave, valor] of anteriores) {
        if (valor === undefined) Deno.env.delete(chave); else Deno.env.set(chave, valor);
      }
      await db.shutdown();
      await ia.shutdown();
    },
    restauraEnv: () => {
      for (const [chave, valor] of anteriores) {
        if (valor === undefined) Deno.env.delete(chave); else Deno.env.set(chave, valor);
      }
    },
  };
}

/** Envia um corpo CRU (assinado como o webhook real) e devolve status + JSON. */
async function enviarCorpo(corpo: string) {
  const requisicao = new Request("http://localhost/functions/v1/chatbot-l1", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-signature": `sha256=${await hmacHex(corpo, SEGREDO_WEBHOOK)}`,
    },
    body: corpo,
  });
  const resposta = await handleChatbotL1Request(requisicao);
  return { status: resposta.status, corpo: await resposta.json() as Record<string, unknown> };
}

/** Chama o handler como o webhook real. `null` OMITE o campo `connectionId`. */
async function chamarChatbot(conexao: string | null, mensagemTexto = "Qual e o prazo de entrega?") {
  return enviarCorpo(JSON.stringify({
    contactId: CONTATO,
    message: mensagemTexto,
    ...(conexao === null ? {} : { connectionId: conexao }),
  }));
}

/** Roda um cenário com o logger silenciado e o ambiente restaurado ao final. */
async function comCenario(cenario: Cenario, fn: (vivo: CenarioVivo) => Promise<void>) {
  const devolverLogs = silenciarLogs();
  const vivo = await abrirCenario(cenario);
  try {
    await fn(vivo);
  } finally {
    await vivo.encerrar();
    devolverLogs();
  }
}

const consulta = (vivo: CenarioVivo, caminho: string) => vivo.chamadas.filter((c) => c.caminho === caminho);

// ── testes ──────────────────────────────────────────────────────────────────

Deno.test("IA-CHATBOT-001: flow de OUTRA conexão não atende esta conexão (nada é respondido)", async () => {
  // A conexão da mensagem (A) NÃO tem flow; existe só o flow da conexão B.
  await comCenario(
    { fluxos: [flow("flow-b", CONEXAO_B)], mensagens: [] },
    async (vivo) => {
      const { status, corpo } = await chamarChatbot(CONEXAO_A);

      igual(status, 200, "resposta do handler");
      igual(corpo.reason, "no_active_flow", "flow de outra conexão não pode ser usado");
      igual(corpo.handled, false, "não pode atender com flow alheio");
      igual(vivo.prompts.length, 0, "nenhuma chamada de IA pode acontecer sem flow da conexão");
      igual(consulta(vivo, "rpc/search_knowledge_base").length, 0, "nem consultar a base de conhecimento");

      const queryFlow = consulta(vivo, "chatbot_flows")[0];
      afirma(queryFlow, "o handler precisa consultar chatbot_flows");
      igual(queryFlow.conexao, CONEXAO_A, "a consulta de flow precisa filtrar a conexão da mensagem");
    },
  );
});

Deno.test("IA-CHATBOT-001: histórico do prompt traz só as mensagens da conexão da mensagem", async () => {
  await comCenario(
    {
      fluxos: [flow("flow-b", CONEXAO_B), flow("flow-a", CONEXAO_A)],
      mensagens: [
        mensagem("HISTORICO-DA-CONEXAO-B", CONEXAO_B, "2026-01-01T00:00:10Z"),
        mensagem("HISTORICO-DA-CONEXAO-A", CONEXAO_A, "2026-01-01T00:00:20Z"),
      ],
    },
    async (vivo) => {
      const { status, corpo } = await chamarChatbot(CONEXAO_A);

      igual(status, 200, "resposta do handler");
      igual(corpo.handled, true, "com flow da conexão, o bot atende");
      igual(vivo.prompts.length, 1, "uma chamada de IA");

      const prompt = vivo.prompts[0];
      afirma(prompt.includes("HISTORICO-DA-CONEXAO-A"), "o histórico da conexão precisa entrar no prompt");
      afirma(
        !prompt.includes("HISTORICO-DA-CONEXAO-B"),
        "mensagem de OUTRA conexão não pode vazar para o prompt",
      );

      const queryHistorico = consulta(vivo, "messages")[0];
      afirma(queryHistorico, "o handler precisa consultar messages");
      igual(queryHistorico.conexao, CONEXAO_A, "a consulta de histórico precisa filtrar a conexão da mensagem");
      igual(queryHistorico.filtraConexao, true, "sem o filtro de conexão o histórico de outro canal vazaria para o prompt");
    },
  );
});

Deno.test("IA-CHATBOT-001: com dois flows ativos, o escolhido é o da conexão da mensagem", async () => {
  // flow-B vem PRIMEIRO de propósito: sem filtro, `.limit(1)` pegaria o de B.
  await comCenario(
    {
      fluxos: [flow("flow-b", CONEXAO_B), flow("flow-a", CONEXAO_A)],
      mensagens: [mensagem("HISTORICO-A", CONEXAO_A, "2026-01-01T00:00:20Z")],
    },
    async (vivo) => {
      const { status, corpo } = await chamarChatbot(CONEXAO_B);

      igual(status, 200, "resposta do handler");
      igual(corpo.handled, true, "a conexão B tem flow ativo");
      const queryFlow = consulta(vivo, "chatbot_flows")[0];
      igual(queryFlow.conexao, CONEXAO_B, "filtro de flow pela conexão que recebeu a mensagem");
      igual(queryFlow.filtraConexao, true, "sem o filtro de conexão o flow de outro número seria usado");
    },
  );
});

Deno.test("IA-CHATBOT-001: requisição SEM connectionId é rejeitada sem tocar flow, histórico nem IA", async () => {
  await comCenario(
    {
      fluxos: [flow("flow-b", CONEXAO_B), flow("flow-a", CONEXAO_A)],
      mensagens: [mensagem("HISTORICO-A", CONEXAO_A, "2026-01-01T00:00:20Z")],
    },
    async (vivo) => {
      // Corpo do chamador legado: sem o campo `connectionId`.
      const { status, corpo } = await enviarCorpo(JSON.stringify({
        contactId: CONTATO,
        message: "Qual e o prazo de entrega?",
      }));

      afirmaErroConnectionId(status, corpo);
      igual(corpo.handled, undefined, "não pode atender sem a conexão da mensagem");
      igual(vivo.chamadas.length, 0, "nenhuma consulta ao banco pode acontecer sem a conexão");
      igual(vivo.prompts.length, 0, "nenhuma chamada à IA pode acontecer sem a conexão");
    },
  );
});

Deno.test("IA-CHATBOT-001: connectionId NULO é rejeitado como ausente", async () => {
  await comCenario(
    { fluxos: [flow("flow-a", CONEXAO_A)], mensagens: [] },
    async (vivo) => {
      const { status, corpo } = await enviarCorpo(JSON.stringify({
        contactId: CONTATO,
        message: "qualquer",
        connectionId: null,
      }));

      afirmaErroConnectionId(status, corpo);
      igual(corpo.handled, undefined, "não pode atender sem a conexão da mensagem");
      igual(vivo.chamadas.length, 0, "nenhuma consulta ao banco pode acontecer sem a conexão");
      igual(vivo.prompts.length, 0, "nenhuma chamada à IA pode acontecer sem a conexão");
    },
  );
});

Deno.test("IA-CHATBOT-001: connectionId INVÁLIDO (não-UUID) é rejeitado na entrada", async () => {
  await comCenario(
    { fluxos: [flow("flow-a", CONEXAO_A)], mensagens: [] },
    async (vivo) => {
      const { status, corpo } = await enviarCorpo(JSON.stringify({
        contactId: CONTATO,
        message: "qualquer",
        connectionId: "nao-e-um-uuid",
      }));

      afirmaErroConnectionId(status, corpo);
      igual(vivo.chamadas.length, 0, "nenhuma consulta ao banco pode acontecer com conexão inválida");
      igual(vivo.prompts.length, 0, "nenhuma chamada à IA pode acontecer com conexão inválida");
    },
  );
});

Deno.test("IA-CHATBOT-001: connectionId de TIPO ERRADO (não-string) é rejeitado na entrada", async () => {
  // Número, booleano e objeto NÃO são string: se o campo passasse sem
  // validação de tipo, qualquer um deles poderia virar filtro solto ou
  // derrubar a consulta — a proteção é rejeitar na ENTRADA, como os demais
  // caminhos do defeito (ausente, nulo, não-UUID).
  await comCenario(
    { fluxos: [flow("flow-a", CONEXAO_A)], mensagens: [] },
    async (vivo) => {
      for (const conexaoErrada of [12345, true, { id: CONEXAO_A }, [CONEXAO_A]]) {
        const { status, corpo } = await enviarCorpo(JSON.stringify({
          contactId: CONTATO,
          message: "qualquer",
          connectionId: conexaoErrada,
        }));

        afirmaErroConnectionId(status, corpo);
      }
      igual(vivo.chamadas.length, 0, "nenhuma consulta ao banco pode acontecer com conexão de tipo errado");
      igual(vivo.prompts.length, 0, "nenhuma chamada à IA pode acontecer com conexão de tipo errado");
    },
  );
});

// ── IA-106: a fala do cliente não pode ir duas vezes ao modelo ───────────────

/** Conta quantas vezes `alvo` aparece no corpo enviado ao provedor. */
function ocorrencias(texto: string, alvo: string): number {
  return texto.split(alvo).length - 1;
}

Deno.test("IA-106: mensagem de entrada JÁ persistida entra no prompt uma única vez", async () => {
  // O webhook grava a mensagem do cliente em `messages` ANTES de acionar o bot:
  // ela é a linha mais recente do histórico e o handler a anexava de novo.
  const ENTRADA = "PRAZO-DE-ENTREGA-DO-PEDIDO-123";
  await comCenario(
    {
      fluxos: [flow("flow-a", CONEXAO_A)],
      mensagens: [
        mensagem("FALA-ANTERIOR-DO-CLIENTE", CONEXAO_A, "2026-01-01T00:00:10Z"),
        mensagem(ENTRADA, CONEXAO_A, "2026-01-01T00:00:20Z"),
      ],
    },
    async (vivo) => {
      const { status, corpo } = await chamarChatbot(CONEXAO_A, ENTRADA);

      igual(status, 200, "resposta do handler");
      igual(corpo.handled, true, "com flow da conexão, o bot atende");
      igual(vivo.prompts.length, 1, "uma chamada de IA");

      const prompt = vivo.prompts[0];
      igual(
        ocorrencias(prompt, ENTRADA),
        1,
        "a fala do cliente já persistida não pode ser enviada duas vezes ao modelo",
      );
      afirma(prompt.includes("FALA-ANTERIOR-DO-CLIENTE"), "a fala anterior do histórico continua no prompt");
      igual(consulta(vivo, "messages").length, 1, "o histórico continua sendo consultado uma vez");
    },
  );
});

Deno.test("IA-106: mensagem de entrada AINDA NÃO persistida é anexada uma única vez", async () => {
  // Se o chamador não persistiu a mensagem, o histórico não a contém: nada é
  // descartado e a fala entra como sempre — o dedupe não pode engolir a entrada.
  const ENTRADA = "PEDIDO-DE-ORCAMENTO-456";
  await comCenario(
    {
      fluxos: [flow("flow-a", CONEXAO_A)],
      mensagens: [mensagem("FALA-ANTERIOR-DO-CLIENTE", CONEXAO_A, "2026-01-01T00:00:10Z")],
    },
    async (vivo) => {
      const { status, corpo } = await chamarChatbot(CONEXAO_A, ENTRADA);

      igual(status, 200, "resposta do handler");
      igual(corpo.handled, true, "com flow da conexão, o bot atende");
      const prompt = vivo.prompts[0];
      igual(ocorrencias(prompt, ENTRADA), 1, "sem persistência a entrada é anexada (uma vez)");
      afirma(prompt.includes("FALA-ANTERIOR-DO-CLIENTE"), "a fala anterior do histórico continua no prompt");
    },
  );
});

Deno.test("IA-106: fala do ATENDENTE com o mesmo texto não é comida pelo dedupe", async () => {
  // A linha mais recente é do atendente com o MESMO texto da entrada: o dedupe
  // só pode remover fala do CLIENTE — o histórico do atendente é preservado.
  const ENTRADA = "OBRIGADO-PELO-RETORNO-789";
  await comCenario(
    {
      fluxos: [flow("flow-a", CONEXAO_A)],
      mensagens: [{ ...mensagem(ENTRADA, CONEXAO_A, "2026-01-01T00:00:20Z"), sender: "agent" }],
    },
    async (vivo) => {
      const { status, corpo } = await chamarChatbot(CONEXAO_A, ENTRADA);

      igual(status, 200, "resposta do handler");
      igual(corpo.handled, true, "com flow da conexão, o bot atende");
      igual(
        ocorrencias(vivo.prompts[0], ENTRADA),
        2,
        "a fala do atendente fica no histórico e a do cliente é anexada: duas falas distintas",
      );
    },
  );
});
