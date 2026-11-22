/**
 * Contrato executável da PORTA ÚNICA (`assistant-gateway`).
 *
 * O handler é exportado e todas as dependências externas (auth, guardas de IA,
 * leitura de contexto, chamada das edges, chave de capacidade) são injetáveis —
 * então aqui não sobe servidor, não abre porta e não toca rede nem banco.
 *
 * O que estes testes provam, e é a entrega da Fase 3:
 *  - um pedido em linguagem natural devolve resposta com ≥3 fontes distintas,
 *    cada uma com a origem declarada;
 *  - a mesma frase escolhe sempre as mesmas capacidades (determinístico);
 *  - fonte que falha e capacidade que falha aparecem como erro, sem derrubar o resto;
 *  - capacidade desligada ou fora do contrato (histórico curto) é recusada ANTES
 *    de gastar modelo, com motivo legível.
 *
 * Run with:
 *   deno test --no-lock --allow-all supabase/functions/assistant-gateway/index.test.ts
 */
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  capabilityBlockedReason,
  composeAnswer,
  contextBlock,
  handleAssistantGateway,
  loadSharedContext,
  type GatewayDeps,
  type SharedContext,
} from "./index.ts";

const USER_ID = "u-1";
const CONTACT_ID = "c-1";

/** Contexto padrão: perfil + 6 mensagens + agenda + negócio aberto = 4 fontes. */
function contextoCompleto(overrides: Partial<SharedContext> = {}): SharedContext {
  return {
    contactId: CONTACT_ID,
    contactName: "João Silva",
    profile: { atividade: "brindes corporativos", foco: "fechar pedidos grandes", ajuda: "objeção de preço", tom: "direto" },
    agenda: [{ title: "Ligar para João", remind_at: "2026-11-23T12:00:00.000Z" }],
    messages: [
      { sender: "agent", content: "Oi João, tudo bem?", created_at: "2026-11-20T10:00:00.000Z" },
      { sender: "contact", content: "Tudo! Quero 500 canecas", created_at: "2026-11-20T10:01:00.000Z" },
      { sender: "agent", content: "Para quando você precisa?", created_at: "2026-11-20T10:02:00.000Z" },
      { sender: "contact", content: "Até dia 10 de dezembro", created_at: "2026-11-20T10:03:00.000Z" },
      { sender: "agent", content: "Consigo sim", created_at: "2026-11-20T10:04:00.000Z" },
      { sender: "contact", content: "Mas está caro", created_at: "2026-11-20T10:05:00.000Z" },
    ],
    deal: { id: "d-1", status: "open", value: 12000 },
    sources: [
      { kind: "perfil", origin: "assistant_profiles", rows: 1 },
      { kind: "contato", origin: "contacts", rows: 1 },
      { kind: "agenda", origin: "conversation_tasks", rows: 1 },
      { kind: "conversa", origin: "messages", rows: 6 },
      { kind: "negocio", origin: "sales_deals", rows: 1 },
    ],
    ...overrides,
  };
}

function pedido(query: string, contactId: string | null = CONTACT_ID, extra: Record<string, unknown> = {}): Request {
  return new Request("https://edge.local/assistant-gateway", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer jwt-do-usuario" },
    body: JSON.stringify({ query, contactId, ...extra }),
  });
}

/** Dependências de teste: nada toca rede; tudo é observável. */
function deps(overrides: Partial<GatewayDeps> = {}) {
  const chamadas: Array<{ fn: string; body: Record<string, unknown> }> = [];
  const base: GatewayDeps = {
    authorize: async () => ({ userId: USER_ID }),
    enforceGuards: async () => null,
    readContext: async () => contextoCompleto(),
    capabilityEnabled: async () => true,
    callCapability: async (fn, body) => {
      chamadas.push({ fn, body });
      const corpo: Record<string, unknown> = {
        "ai-conversation-summary": { summary: "Cliente quer 500 canecas até 10/12 e achou caro." },
        "ai-suggest-reply": { suggestion: "João, consigo manter o preço fechando hoje." },
        "ai-lead-temperature": { temperature: "quente", reason: "prazo curto e volume alto" },
        "ai-product-recommendation": { recommendation: "caneca cerâmica premium" },
        "ai-deadline-calculator": { deadlineText: "produção leva 12 dias úteis" },
        "ai-objection-handler": { answer: "ancore no prazo, não no desconto" },
        "ai-loss-risk": { level: "high", riskScore: 78, recoveryAction: "ligue hoje e ofereça amostra" },
        "ai-price-anchor": { strategy: "cost_per_use", anchorScript: "sai R$ 2,40 por caneca, menos que o café do escritório" },
      }[fn] ?? {};
      return { status: 200, body: corpo };
    },
    ...overrides,
  };
  return { deps: base, chamadas };
}

Deno.test("401 quando o JWT não autentica", async () => {
  const { deps: d } = deps({
    authorize: async () => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
  });
  const res = await handleAssistantGateway(pedido("como estou com o cliente?"), d);
  assertEquals(res.status, 401);
});

Deno.test("400 quando não há pedido", async () => {
  const { deps: d } = deps();
  const res = await handleAssistantGateway(pedido("   "), d);
  assertEquals(res.status, 400);
  const body = await res.json() as { error: string };
  assert(body.error.includes("query"));
});

Deno.test("503 da guarda de IA é repassado sem chamar capacidade", async () => {
  const { deps: d, chamadas } = deps({
    enforceGuards: async () => new Response(JSON.stringify({ code: "AI_QUOTA" }), { status: 503 }),
  });
  const res = await handleAssistantGateway(pedido("resume a conversa"), d);
  assertEquals(res.status, 503);
  assertEquals(chamadas.length, 0);
});

Deno.test("panorama devolve resposta com >=3 fontes e a origem de cada pedaço", async () => {
  const { deps: d, chamadas } = deps();
  const res = await handleAssistantGateway(pedido("como estou com o cliente João?"), d);
  assertEquals(res.status, 200);

  const body = await res.json() as {
    answer: string;
    capabilities: string[];
    pieces: Array<{ capability: string; origin: string; data: unknown }>;
    sources: Array<{ kind: string; origin: string; rows: number }>;
    errors: string[];
  };

  assertEquals(body.capabilities, ["agenda", "resumo_conversa", "temperatura_lead"]);
  // 5 fontes de contexto, todas com origem declarada.
  assertEquals(body.sources.length, 5);
  assertEquals(body.sources.map((s) => s.origin), [
    "assistant_profiles",
    "contacts",
    "conversation_tasks",
    "messages",
    "sales_deals",
  ]);
  const naoVazias = body.sources.filter((s) => s.rows > 0);
  assert(naoVazias.length >= 3, `esperava >=3 fontes com dado, veio ${naoVazias.length}`);
  // Prova de proveniência do pedaço de modelo: `origin` é a edge chamada.
  const origens = body.pieces.map((p) => p.origin);
  assert(origens.includes("conversation_tasks"));
  assert(origens.includes("ai-conversation-summary"));
  assert(origens.includes("ai-lead-temperature"));
  // Agenda não gasta modelo: só as duas capacidades de modelo foram chamadas.
  assertEquals(chamadas.map((c) => c.fn).sort(), ["ai-conversation-summary", "ai-lead-temperature"]);
  assert(body.answer.includes("Cliente quer 500 canecas"), body.answer);
  assert(body.answer.includes("quente"), body.answer);
  assertEquals(body.errors, []);
});

Deno.test("pedido só de agenda responde sem chamar nenhuma edge de modelo", async () => {
  const { deps: d, chamadas } = deps();
  const res = await handleAssistantGateway(pedido("quais são meus compromissos?"), d);
  const body = await res.json() as { answer: string; capabilities: string[] };
  assertEquals(body.capabilities, ["agenda"]);
  assertEquals(chamadas.length, 0);
  assert(body.answer.includes("Ligar para João"));
});

Deno.test("todas as capacidades recebem o MESMO contexto compartilhado", async () => {
  const { deps: d, chamadas } = deps();
  await handleAssistantGateway(pedido("como estou com o cliente, qual o prazo?"), d);
  assertEquals(chamadas.length, 3); // resumo + temperatura + prazo
  const contextos = chamadas.map((c) => c.body.context as string);
  assertEquals(new Set(contextos).size, 1);
  const ctx = contextos[0];
  assert(ctx.includes("brindes corporativos"), ctx);
  assert(ctx.includes("Tom preferido: direto"), ctx);
  // Cada chamada carrega as mesmas mensagens, em ordem cronológica.
  const msgs = chamadas[0].body.messages as Array<{ content: string }>;
  assertEquals(msgs[0].content, "Oi João, tudo bem?");
  assertEquals(msgs[msgs.length - 1].content, "Mas está caro");
});

Deno.test("histórico curto recusa o resumo ANTES de chamar (schema exige 5)", async () => {
  const { deps: d, chamadas } = deps({
    readContext: async () => contextoCompleto({ messages: [{ sender: "contact", content: "oi" }] }),
  });
  const res = await handleAssistantGateway(pedido("como estou com o cliente?"), d);
  const body = await res.json() as { errors: string[]; pieces: Array<{ capability: string }> };
  // Resumo barrado com motivo; temperatura segue (aceita 1 mensagem).
  assert(body.errors.some((e) => e.includes("histórico insuficiente")), JSON.stringify(body.errors));
  assertEquals(chamadas.map((c) => c.fn), ["ai-lead-temperature"]);
  assert(body.pieces.some((p) => p.capability === "agenda"));
});

Deno.test("capacidade desligada aparece como erro e não vira chamada", async () => {
  const { deps: d, chamadas } = deps({
    capabilityEnabled: async (fn) => fn !== "ai-lead-temperature",
  });
  const res = await handleAssistantGateway(pedido("como estou com o cliente?"), d);
  const body = await res.json() as { errors: string[] };
  assert(body.errors.some((e) => e.includes("desligada")), JSON.stringify(body.errors));
  assertEquals(chamadas.map((c) => c.fn), ["ai-conversation-summary"]);
});

Deno.test("falha de uma capacidade não derruba a resposta das outras", async () => {
  const { deps: d } = deps({
    callCapability: async (fn) => {
      if (fn === "ai-lead-temperature") {
        return { status: 502, body: { error: "provedor indisponível" } };
      }
      return { status: 200, body: { summary: "resumo ok" } };
    },
  });
  const res = await handleAssistantGateway(pedido("como estou com o cliente?"), d);
  assertEquals(res.status, 200);
  const body = await res.json() as {
    answer: string;
    errors: string[];
    pieces: Array<{ capability: string; error?: string }>;
  };
  assert(body.answer.includes("resumo ok"), body.answer);
  assert(body.errors.some((e) => e.includes("provedor indisponível")), JSON.stringify(body.errors));
  const quebrada = body.pieces.find((p) => p.capability === "temperatura_lead");
  assertEquals(quebrada?.error?.includes("provedor indisponível"), true);
});

Deno.test("fonte que falha é reportada como erro, não como vazio", async () => {
  const { deps: d } = deps({
    readContext: async () =>
      contextoCompleto({
        agenda: [],
        messages: [],
        sources: [
          { kind: "perfil", origin: "assistant_profiles", rows: 1 },
          { kind: "conversa", origin: "messages", rows: 0, error: "permission denied for table messages" },
        ],
      }),
  });
  const res = await handleAssistantGateway(pedido("quais meus compromissos?"), d);
  const body = await res.json() as { sources: Array<{ origin: string; rows: number; error?: string }> };
  const conversa = body.sources.find((s) => s.origin === "messages");
  assertEquals(conversa?.rows, 0);
  assertEquals(conversa?.error, "permission denied for table messages");
});

Deno.test("pedido sem contato explica a ausência em cada fonte", async () => {
  const { deps: d } = deps({
    readContext: async () =>
      contextoCompleto({
        contactId: null,
        contactName: null,
        agenda: [],
        messages: [],
        deal: null,
        // Espelha o que `loadSharedContext` produz sem contato: erro explícito em
        // cada fonte dependente do contato.
        sources: [
          { kind: "perfil", origin: "assistant_profiles", rows: 1 },
          { kind: "contato", origin: "contacts", rows: 0, error: "sem contato no pedido" },
          { kind: "agenda", origin: "conversation_tasks", rows: 0, error: "sem contato no pedido" },
          { kind: "conversa", origin: "messages", rows: 0, error: "sem contato no pedido" },
          { kind: "negocio", origin: "sales_deals", rows: 0, error: "sem contato no pedido" },
        ],
      }),
  });
  const res = await handleAssistantGateway(pedido("como estou com o cliente?", null), d);
  const body = await res.json() as { sources: Array<{ kind: string; error?: string }> };
  const agenda = body.sources.find((s) => s.kind === "agenda");
  assertEquals(agenda?.error, "sem contato no pedido");
});

Deno.test("mesma frase, mesmo roteamento (determinístico entre chamadas)", async () => {
  const { deps: d } = deps();
  const frase = "como estou com o cliente e o que eu falo?";
  const a = await handleAssistantGateway(pedido(frase), d).then((r) => r.json()) as { capabilities: string[] };
  const b = await handleAssistantGateway(pedido(frase), d).then((r) => r.json()) as { capabilities: string[] };
  assertEquals(a.capabilities, b.capabilities);
  assertEquals(a.capabilities, ["agenda", "resumo_conversa", "sugerir_resposta", "temperatura_lead"]);
});

// ─── unidades puras do contexto ──────────────────────────────────────────────

Deno.test("contextBlock avisa quando não há perfil, em vez de fingir personalização", () => {
  const texto = contextBlock(contextoCompleto({ profile: null }));
  assert(texto.includes("não configurado"), texto);
});

Deno.test("composeAnswer sem nenhum pedaço diz que tudo falhou", () => {
  const texto = composeAnswer([], contextoCompleto());
  assert(texto.includes("todas as fontes falharam"), texto);
});

Deno.test("capabilityBlockedReason barra modelo sem mensagens", () => {
  const ctx = contextoCompleto({ messages: [] });
  assert(capabilityBlockedReason("temperatura_lead", ctx)?.includes("sem mensagens"));
  assertEquals(capabilityBlockedReason("agenda", ctx), null);
});

/** Trava de contrato: o stub do `supabase-js` não pode ser chamado sem env real. */
Deno.test("loadSharedContext não é chamado quando readContext é injetado", async () => {
  let tocou = false;
  const { deps: d } = deps({
    readContext: async (userId, contactId) => {
      tocou = true;
      assertEquals(userId, USER_ID);
      assertEquals(contactId, CONTACT_ID);
      return contextoCompleto();
    },
  });
  await handleAssistantGateway(pedido("oi"), d);
  assertEquals(tocou, true);
  // `loadSharedContext` só é usado pelo `Deno.serve`; aqui provamos que ele existe
  // e é uma função, sem chamá-lo (não há PostgREST no teste).
  assertEquals(typeof loadSharedContext, "function");
});
// Fase 4 — treino por perfil. O que muda por atuação entra no prompt do contexto
// e na escolha de capacidades quando o pedido é vago; nada muda quando o pedido
// traz sinal explícito.

Deno.test("Fase 4: o treino da atuação entra no bloco de contexto enviado às edges", async () => {
  const { deps: d, chamadas } = deps({
    readContext: async () => contextoCompleto({
      profile: { atividade: "venda", foco: "fechar até sexta", ajuda: "relevante", tom: "direto" },
    }),
  });
  const res = await handleAssistantGateway(pedido("resuma a conversa"), d);
  assertEquals(res.status, 200);

  const ctx = String(chamadas[0].body.context);
  assertEquals(ctx.includes("Treino do perfil (venda)"), true);
  assertEquals(ctx.includes("nunca comece baixando o valor"), true);
});

Deno.test("Fase 4: perfis diferentes produzem contexto diferente para a mesma pergunta", async () => {
  const perguntar = async (atividade: string) => {
    const { deps: d, chamadas } = deps({
      readContext: async () => contextoCompleto({
        profile: { atividade, foco: "", ajuda: "relevante", tom: "consultivo" },
      }),
    });
    await handleAssistantGateway(pedido("resuma a conversa"), d);
    return String(chamadas[0].body.context);
  };

  const venda = await perguntar("venda");
  const compra = await perguntar("compra");
  assertEquals(venda === compra, false);
  assertEquals(compra.includes("Treino do perfil (compra)"), true);
});

Deno.test("Fase 4: pedido vago usa as capacidades prioritárias da atuação", async () => {
  const { deps: d } = deps({
    readContext: async () => contextoCompleto({
      profile: { atividade: "atendimento", foco: "", ajuda: "relevante", tom: "consultivo" },
    }),
  });
  const res = await handleAssistantGateway(pedido("oi, tudo bem?"), d);
  assertEquals(res.status, 200);
  const body = await res.json() as { capabilities: string[] };
  // `atendimento` prioriza sugestão de resposta — não é o mínimo genérico.
  assertEquals(body.capabilities, ["agenda", "resumo_conversa", "sugerir_resposta"]);
});

Deno.test("Fase 4: pedido com sinal explícito ignora a prioridade do perfil", async () => {
  const { deps: d } = deps({
    readContext: async () => contextoCompleto({
      profile: { atividade: "supervisao", foco: "", ajuda: "relevante", tom: "formal" },
    }),
  });
  const res = await handleAssistantGateway(pedido("qual o prazo de entrega?"), d);
  const body = await res.json() as { capabilities: string[] };
  assertEquals(body.capabilities, ["calcular_prazo"]);
});

Deno.test("Fase 4: sem perfil a rota vaga continua no mínimo útil", async () => {
  const { deps: d } = deps({ readContext: async () => contextoCompleto({ profile: null }) });
  const res = await handleAssistantGateway(pedido("oi, tudo bem?"), d);
  const body = await res.json() as { capabilities: string[] };
  assertEquals(body.capabilities, ["agenda", "resumo_conversa"]);
});

Deno.test("retenção: pedido de risco de perda chama ai-loss-risk e devolve a ação", async () => {
  const { deps: d, chamadas } = deps();
  const res = await handleAssistantGateway(pedido("o cliente sumiu, vou perder a venda?"), d);
  assertEquals(res.status, 200);
  const body = await res.json() as { capabilities: string[]; answer: string };
  assertEquals(body.capabilities, ["risco_perda"]);
  assertEquals(chamadas.map((c) => c.fn), ["ai-loss-risk"]);
  assertEquals(body.answer.includes("ligue hoje e ofereça amostra"), true);
});

Deno.test("retenção: a IA recebe os dias sem contato calculados do histórico", async () => {
  const { deps: d, chamadas } = deps();
  // Última mensagem em 20/11; o envio de `daysSinceLastContact` é o dado que o
  // modelo não infere do texto e que o motor RADAR já tem.
  const res = await handleAssistantGateway(pedido("o cliente parou de responder, vou perder?"), d);
  const body = await res.json() as { capabilities: string[] };
  assertEquals(body.capabilities.includes("risco_perda"), true);
  const chamadaRisco = chamadas.find((c) => c.fn === "ai-loss-risk");
  const dias = chamadaRisco?.body.daysSinceLastContact;
  assertEquals(typeof dias, "number");
  assertEquals((dias as number) >= 0, true);
});

Deno.test("retenção: pedido de defesa de preço chama ai-price-anchor", async () => {
  const { deps: d, chamadas } = deps();
  const res = await handleAssistantGateway(pedido("como defendo o preço por unidade?"), d);
  const body = await res.json() as { capabilities: string[]; answer: string };
  assertEquals(body.capabilities, ["ancoragem_preco"]);
  assertEquals(chamadas.map((c) => c.fn), ["ai-price-anchor"]);
  assertEquals(body.answer.includes("por caneca"), true);
});

Deno.test("retenção: sem mensagens a capacidade é recusada antes de gastar modelo", async () => {
  const { deps: d, chamadas } = deps({
    readContext: async () => contextoCompleto({ messages: [] }),
  });
  const res = await handleAssistantGateway(pedido("vou perder essa venda?"), d);
  const body = await res.json() as { errors: string[] };
  assertEquals(chamadas.length, 0);
  assertEquals(body.errors.some((e) => e.includes("sem mensagens")), true);
});