/**
 * Contratos de saída do modelo (IA-025).
 *
 * O que estes testes protegem, em uma frase: o contrato REJEITA saída errada e
 * nunca INVENTA valor. Cada caso abaixo corresponde a uma forma de erro que o
 * código antigo (JSON.parse + coerção) escondia:
 *   - `'purple'`  virava `'neutro'`            → aqui é rejeitado;
 *   - `'80'`      virava `80` (ou caía no 50)  → aqui é rejeitado;
 *   - 6 keyPoints eram cortados em 5           → aqui é rejeitado;
 *   - nota 11 virava nota de atendimento       → aqui é rejeitado;
 *   - campo opcional ausente virava 50/3/'low' → aqui continua ausente;
 *   - `0` (sentimento neutro de verdade)       → precisa sobreviver como 0.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { SENTIMENT_VALUES, URGENCY_VALUES } from "../ai-vocabulary.ts";
import {
  AutoTagOutput,
  buildAiEnvelope,
  ConversationAnalysisOutput,
  ConversationSummaryOutput,
  parseModelOutput,
  SuggestedRepliesOutput,
} from "../ai-response-contracts.ts";

// Valores válidos tirados do próprio vocabulário canônico — assim o teste
// segue válido mesmo que a lista evolua em ai-vocabulary.ts.
const SENTIMENT_OK = SENTIMENT_VALUES[0];
const URGENCY_OK = URGENCY_VALUES[0];

/** Fixture mínima válida de análise; cada teste sobrescreve só o que importa. */
function baseAnalysis(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    department: "vendas",
    relationshipType: "cliente em negociação",
    summary: "Cliente pediu orçamento e confirmou interesse no plano anual.",
    status: "pendente",
    keyPoints: ["pediu orçamento", "confirmou interesse"],
    nextSteps: ["enviar proposta"],
    sentiment: SENTIMENT_OK,
    topics: ["orçamento"],
    urgency: URGENCY_OK,
    ...overrides,
  };
}

function baseSummary(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    summary: "Resumo curto da conversa.",
    status: "resolvido",
    keyPoints: ["assunto resolvido"],
    nextSteps: [],
    sentiment: SENTIMENT_OK,
    topics: [],
    urgency: URGENCY_OK,
    ...overrides,
  };
}

// ─── 1. Caminho feliz ────────────────────────────────────────
Deno.test("análise bem formada passa e preserva os valores", () => {
  const raw = baseAnalysis({
    sentimentScore: 82,
    customerSatisfaction: 4,
    agentPerformance: { empathy: 9, clarity: 8, efficiency: 7, knowledge: 10 },
    churnRisk: "low",
    salesOpportunity: "upgrade para plano pro",
  });

  const result = parseModelOutput(ConversationAnalysisOutput, raw);
  assert(result.ok, `esperava sucesso, veio: ${!result.ok ? JSON.stringify(result.errors) : ""}`);
  assertEquals(result.data.department, "vendas");
  assertEquals(result.data.summary, raw.summary);
  assertEquals(result.data.keyPoints, ["pediu orçamento", "confirmou interesse"]);
  assertEquals(result.data.sentimentScore, 82);
  assertEquals(result.data.customerSatisfaction, 4);
  assertEquals(result.data.agentPerformance?.empathy, 9);
  assertEquals(result.data.churnRisk, "low");
  assertEquals(result.data.salesOpportunity, "upgrade para plano pro");
});

// ─── 2. Estrutura errada é REJEITADA, não corrigida ──────────
Deno.test("sentiment fora do vocabulário canônico é rejeitado", () => {
  const result = parseModelOutput(ConversationAnalysisOutput, baseAnalysis({ sentiment: "purple" }));
  assert(!result.ok, "sentiment 'purple' não pode ser aceito nem coagido para 'neutro'");
  assert(
    result.errors.some((e) => e.path === "sentiment"),
    `esperava erro em 'sentiment': ${JSON.stringify(result.errors)}`,
  );
});

Deno.test("sentimentScore em string é rejeitado (não vira 80)", () => {
  const result = parseModelOutput(ConversationAnalysisOutput, baseAnalysis({ sentimentScore: "80" }));
  assert(!result.ok, "sentimentScore '80' (string) deve ser rejeitado");
  assert(
    result.errors.some((e) => e.path === "sentimentScore"),
    `esperava erro em 'sentimentScore': ${JSON.stringify(result.errors)}`,
  );
});

Deno.test("sentimentScore fora da faixa 0-100 é rejeitado", () => {
  assert(!parseModelOutput(ConversationAnalysisOutput, baseAnalysis({ sentimentScore: 101 })).ok);
  assert(!parseModelOutput(ConversationAnalysisOutput, baseAnalysis({ sentimentScore: -1 })).ok);
});

Deno.test("customerSatisfaction fora da faixa 1-5 é rejeitada", () => {
  assert(!parseModelOutput(ConversationAnalysisOutput, baseAnalysis({ customerSatisfaction: 6 })).ok);
  assert(!parseModelOutput(ConversationAnalysisOutput, baseAnalysis({ customerSatisfaction: 0 })).ok);
});

Deno.test("keyPoints com 6 itens é rejeitado (não é cortado para 5)", () => {
  const result = parseModelOutput(
    ConversationAnalysisOutput,
    baseAnalysis({ keyPoints: ["a", "b", "c", "d", "e", "f"] }),
  );
  assert(!result.ok, "6 keyPoints deve falhar em vez de virar 5");
  assert(
    result.errors.some((e) => e.path === "keyPoints"),
    `esperava erro em 'keyPoints': ${JSON.stringify(result.errors)}`,
  );
});

Deno.test("agentPerformance com nota 11 é rejeitado", () => {
  const result = parseModelOutput(
    ConversationAnalysisOutput,
    baseAnalysis({
      agentPerformance: { empathy: 11, clarity: 8, efficiency: 7, knowledge: 10 },
    }),
  );
  assert(!result.ok, "nota 11 deve ser rejeitada, não limitada a 10");
  assert(
    result.errors.some((e) => e.path === "agentPerformance.empathy"),
    `esperava erro achatado em 'agentPerformance.empathy': ${JSON.stringify(result.errors)}`,
  );
});

Deno.test("churnRisk 'lowish' é rejeitado", () => {
  const result = parseModelOutput(ConversationAnalysisOutput, baseAnalysis({ churnRisk: "lowish" }));
  assert(!result.ok, "churnRisk fora do enum deve ser rejeitado");
  assert(
    result.errors.some((e) => e.path === "churnRisk"),
    `esperava erro em 'churnRisk': ${JSON.stringify(result.errors)}`,
  );
});

Deno.test("campo obrigatório ausente é rejeitado", () => {
  const semSummary = baseAnalysis();
  delete semSummary.summary;
  const result = parseModelOutput(ConversationAnalysisOutput, semSummary);
  assert(!result.ok, "summary ausente deve falhar");
  assert(result.errors.some((e) => e.path === "summary"), JSON.stringify(result.errors));
});

// ─── 3. Opcionais ausentes NÃO viram default ─────────────────
Deno.test("opcional ausente continua ausente (não vira 50/3/'low')", () => {
  const result = parseModelOutput(ConversationAnalysisOutput, baseAnalysis());
  assert(result.ok, "a fixture sem opcionais precisa ser válida");

  assertEquals(result.data.sentimentScore, undefined);
  assertEquals(result.data.customerSatisfaction, undefined);
  assertEquals(result.data.agentPerformance, undefined);
  assertEquals(result.data.churnRisk, undefined);
  assertEquals(result.data.salesOpportunity, undefined);

  // Não basta ser `undefined`: a chave não pode ter sido sequer criada.
  assert(!("sentimentScore" in result.data), "sentimentScore não pode virar chave");
  assert(!("customerSatisfaction" in result.data), "customerSatisfaction não pode virar chave");
  assert(!("churnRisk" in result.data), "churnRisk não pode virar chave");
  assert(!("salesOpportunity" in result.data), "salesOpportunity não pode virar chave");
});

// ─── 4. Zero (e os limites) sobrevivem ───────────────────────
Deno.test("sentimentScore 0 sobrevive como 0 (não é tratado como ausência)", () => {
  const result = parseModelOutput(
    ConversationAnalysisOutput,
    baseAnalysis({ sentimentScore: 0, customerSatisfaction: 1 }),
  );
  assert(result.ok, "0 é um valor válido de sentimento");
  assertEquals(result.data.sentimentScore, 0);
  assert("sentimentScore" in result.data, "0 não pode ser descartado");
  assertEquals(result.data.customerSatisfaction, 1);
});

// ─── 5. Path achatado e casos não-objeto ─────────────────────
Deno.test("erro de array aponta o índice exato (keyPoints.1)", () => {
  const result = parseModelOutput(
    ConversationAnalysisOutput,
    baseAnalysis({ keyPoints: ["ok", 42] }),
  );
  assert(!result.ok, "elemento numérico em keyPoints deve falhar");
  assert(
    result.errors.some((e) => e.path === "keyPoints.1"),
    `esperava path achatado 'keyPoints.1': ${JSON.stringify(result.errors)}`,
  );
});

Deno.test("saída que não é objeto é rejeitada com path raiz vazio", () => {
  const result = parseModelOutput(ConversationAnalysisOutput, "não é um objeto");
  assert(!result.ok);
  assertEquals(result.errors[0].path, "");
  assert(result.errors[0].message.length > 0, "o erro precisa ter mensagem");
});

// ─── 6. salesOpportunity aceita null (≠ ausente) ─────────────
Deno.test("salesOpportunity aceita null e string, e permanece o que veio", () => {
  const comNull = parseModelOutput(ConversationAnalysisOutput, baseAnalysis({ salesOpportunity: null }));
  assert(comNull.ok);
  assertEquals(comNull.data.salesOpportunity, null);

  const comTexto = parseModelOutput(
    ConversationAnalysisOutput,
    baseAnalysis({ salesOpportunity: "vender módulo de relatórios" }),
  );
  assert(comTexto.ok);
  assertEquals(comTexto.data.salesOpportunity, "vender módulo de relatórios");
});

// ─── 7. ConversationSummaryOutput ────────────────────────────
Deno.test("resumo dispensa department/relationshipType sem inventar valor", () => {
  const result = parseModelOutput(ConversationSummaryOutput, baseSummary());
  assert(result.ok, `resumo sem departamento deve passar: ${!result.ok ? JSON.stringify(result.errors) : ""}`);
  assertEquals(result.data.department, undefined);
  assertEquals(result.data.relationshipType, undefined);
  assert(!("department" in result.data), "department ausente não pode virar 'outros'");
  assert(!("relationshipType" in result.data), "relationshipType ausente não pode virar texto inventado");
  assertEquals(result.data.sentimentScore, undefined);
});

Deno.test("resumo continua exigindo os campos do núcleo", () => {
  const semResumo = baseSummary();
  delete semResumo.summary;
  const result = parseModelOutput(ConversationSummaryOutput, semResumo);
  assert(!result.ok, "summary é obrigatório também no resumo");
  assert(result.errors.some((e) => e.path === "summary"), JSON.stringify(result.errors));
});

// ─── 8. SuggestedRepliesOutput ───────────────────────────────
Deno.test("respostas sugeridas: exatamente 3 itens passam", () => {
  const result = parseModelOutput(SuggestedRepliesOutput, [
    { type: "direct", text: "Olá! Como posso ajudar?" },
    { type: "empathetic", text: "Entendo sua situação.", emoji: "💬" },
    { type: "followup", text: "Você pode me contar mais detalhes?" },
  ]);
  assert(result.ok, `3 sugestões válidas devem passar: ${!result.ok ? JSON.stringify(result.errors) : ""}`);
  assertEquals(result.data.length, 3);
  assertEquals(result.data[1].emoji, "💬");
  assertEquals(result.data[0].emoji, undefined);
  assert(!("emoji" in result.data[0]), "emoji ausente não vira chave");
});

Deno.test("respostas sugeridas: quantidade diferente de 3 é rejeitada", () => {
  assert(
    !parseModelOutput(SuggestedRepliesOutput, [
      { type: "direct", text: "a" },
      { type: "direct", text: "b" },
    ]).ok,
  );
  assert(
    !parseModelOutput(SuggestedRepliesOutput, [
      { type: "direct", text: "a" },
      { type: "direct", text: "b" },
      { type: "direct", text: "c" },
      { type: "direct", text: "d" },
    ]).ok,
  );
});

Deno.test("respostas sugeridas: texto vazio é rejeitado com path achatado", () => {
  const result = parseModelOutput(SuggestedRepliesOutput, [
    { type: "direct", text: "" },
    { type: "direct", text: "ok" },
    { type: "direct", text: "ok" },
  ]);
  assert(!result.ok, "text vazio não é sugestão");
  assert(
    result.errors.some((e) => e.path === "0.text"),
    `esperava path achatado '0.text': ${JSON.stringify(result.errors)}`,
  );
});

// ─── 9. AutoTagOutput ────────────────────────────────────────
Deno.test("auto-tag válido passa", () => {
  const result = parseModelOutput(AutoTagOutput, {
    tags: [
      { name: "suporte", confidence: 0.9 },
      { name: "financeiro", confidence: 0.4 },
    ],
  });
  assert(result.ok, `tags válidas devem passar: ${!result.ok ? JSON.stringify(result.errors) : ""}`);
  assertEquals(result.data.tags.length, 2);
  assertEquals(result.data.tags[0].confidence, 0.9);
});

Deno.test("auto-tag: confiança fora de 0-1 é rejeitada (path achatado)", () => {
  const result = parseModelOutput(AutoTagOutput, {
    tags: [
      { name: "ok", confidence: 0.5 },
      { name: "suspeita", confidence: 1.5 },
    ],
  });
  assert(!result.ok, "confidence 1.5 deve ser rejeitada (não é % )");
  assert(
    result.errors.some((e) => e.path === "tags.1.confidence"),
    `esperava path achatado 'tags.1.confidence': ${JSON.stringify(result.errors)}`,
  );
});

Deno.test("auto-tag: nome vazio é rejeitado", () => {
  const result = parseModelOutput(AutoTagOutput, { tags: [{ name: "", confidence: 0.5 }] });
  assert(!result.ok, "tag sem nome não serve");
  assert(result.errors.some((e) => e.path === "tags.0.name"), JSON.stringify(result.errors));
});

// ─── 10. Envelope comum ──────────────────────────────────────
Deno.test("envelope não inclui chaves undefined", () => {
  const envelope = buildAiEnvelope({
    capability: "conversation_analysis",
    status: "ok",
    data: { department: "vendas" },
  });

  assertEquals(envelope.capability, "conversation_analysis");
  assertEquals(envelope.status, "ok");
  assert("data" in envelope, "data presente deve aparecer");
  assert(!("context" in envelope), "context ausente não pode virar chave");
  assert(!("evidence" in envelope), "evidence ausente não pode virar chave");
  assert(!("error" in envelope), "error ausente não pode virar chave");
  assertEquals(Object.keys(envelope).sort(), ["capability", "data", "status"]);
});

Deno.test("envelope de erro carrega o erro e omite os demais opcionais", () => {
  const envelope = buildAiEnvelope({
    capability: "auto_tag",
    status: "error",
    error: [{ path: "tags.1.confidence", message: "fora de 0-1" }],
  });

  assertEquals(envelope.status, "error");
  assert("error" in envelope, "o erro precisa estar no envelope");
  assert(!("data" in envelope));
  assert(!("context" in envelope));
  assert(!("evidence" in envelope));
  assertEquals(Object.keys(envelope).sort(), ["capability", "error", "status"]);
});

Deno.test("envelope preserva valor presente, inclusive null (≠ ausente)", () => {
  const comContexto = buildAiEnvelope({
    capability: "conversation_summary",
    status: "partial",
    context: null,
    evidence: { messageCount: 12 },
  });
  assert("context" in comContexto, "null explícito é presença, não ausência");
  assertEquals(comContexto.context, null);
  assert("evidence" in comContexto);
  assertEquals(comContexto.evidence, { messageCount: 12 });
});

Deno.test("envelope recebendo undefined explícito também não cria a chave", () => {
  const envelope = buildAiEnvelope({
    capability: "suggested_replies",
    status: "ok",
    context: undefined,
    data: undefined,
  });
  assertEquals(Object.keys(envelope).sort(), ["capability", "status"]);
});

// ─── 11. Integração parser + envelope ────────────────────────
Deno.test("parser e envelope juntos: falha vira status 'error' com paths achatados", () => {
  const parsed = parseModelOutput(ConversationAnalysisOutput, baseAnalysis({ sentiment: "purple" }));
  assert(!parsed.ok);

  const envelope = buildAiEnvelope({
    capability: "conversation_analysis",
    status: "error",
    error: parsed.errors,
  });

  assertEquals(envelope.status, "error");
  assert(!("data" in envelope), "não pode haver data quando a validação falhou");
  const erro = envelope.error as Array<{ path: string }>;
  assert(
    erro.some((e) => e.path === "sentiment"),
    `o envelope precisa levar o caminho do erro: ${JSON.stringify(erro)}`,
  );
});
