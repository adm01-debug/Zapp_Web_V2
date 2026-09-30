/**
 * Contratos de SAÍDA do modelo (etapa IA-025 do plano de IA).
 *
 * Antes deste módulo, cada Edge Function de IA validava a resposta do modelo no
 * braço: `JSON.parse` + regex + coerção manual, cada uma inventando o próprio
 * default (`sentimentScore ??? 50`, `customerSatisfaction ??? 3`,
 * `churnRisk || 'low'`, `keyPoints.slice(0, 5)`). Isso transformava um modelo
 * que devolvia lixo em uma análise plausível — silenciosamente errada.
 *
 * Regra de ouro deste contrato:
 *   1. Campo opcional AUSENTE permanece ausente (`undefined`) — nunca ganha
 *      default. Quem consome decide o que fazer com a ausência.
 *   2. Valor com TIPO ou FAIXA errada é REJEITADO, não corrigido/coagido.
 *      `'80'` não vira 80; `'purple'` não vira `'neutro'`.
 *   3. `buildAiEnvelope` só escreve as chaves que receberam valor — nada de
 *      `context: undefined` poluindo o objeto serializado.
 *
 * Uso:
 *   const parsed = parseModelOutput(ConversationAnalysisOutput, rawJson);
 *   if (!parsed.ok) return buildAiEnvelope({ capability, status: 'error', error: parsed.errors });
 *   return buildAiEnvelope({ capability, status: 'ok', data: parsed.data });
 *
 * Os vocabulários canônicos de sentimento/urgência vivem em `ai-vocabulary.ts`
 * (fonte única): o enum do schema é construído A PARTIR deles, então não existe
 * lista duplicada para dessincronizar.
 */
import { z } from "https://esm.sh/zod@3.23.8";
import { SENTIMENT_VALUES, URGENCY_VALUES } from "./ai-vocabulary.ts";

// `SENTIMENT_VALUES`/`URGENCY_VALUES` podem chegar como tupla `as const` ou como
// array largo, dependendo de quem os declara. O cast normaliza o tipo para o
// que `z.enum` exige sem alterar nada em runtime — os valores continuam sendo
// exatamente os do vocabulário canônico.
type EnumValues = readonly [string, ...string[]];
const asEnumValues = (values: readonly string[]): EnumValues =>
  values as unknown as EnumValues;

// ─── Vocabulários fixos do domínio ───────────────────────────
// Espelham os literais já usados nas Edge Functions e na coluna do banco.
export const DEPARTMENT_VALUES = [
  "vendas",
  "compras",
  "logistica",
  "rh",
  "financeiro",
  "sac",
  "outros",
] as const;

export const CONVERSATION_STATUS_VALUES = [
  "resolvido",
  "pendente",
  "aguardando_cliente",
  "aguardando_atendente",
  "escalado",
] as const;

export const CHURN_RISK_VALUES = ["low", "medium", "high"] as const;

// ─── Blocos reutilizados entre as capacidades ────────────────
const departmentSchema = z.enum(DEPARTMENT_VALUES);
const conversationStatusSchema = z.enum(CONVERSATION_STATUS_VALUES);
const churnRiskSchema = z.enum(CHURN_RISK_VALUES);
const sentimentSchema = z.enum(asEnumValues(SENTIMENT_VALUES));
const urgencySchema = z.enum(asEnumValues(URGENCY_VALUES));

/** Notas 1-10 da atuação do atendente. Objeto opcional; quando presente, os
 *  quatro eixos são obrigatórios (nota parcial não é nota). */
export const AgentPerformanceSchema = z.object({
  empathy: z.number().min(1).max(10),
  clarity: z.number().min(1).max(10),
  efficiency: z.number().min(1).max(10),
  knowledge: z.number().min(1).max(10),
});

// ─── Capacidade: análise de conversa ─────────────────────────
/**
 * Saída esperada de `ai-conversation-analysis`.
 * Opcionais (`sentimentScore`, `customerSatisfaction`, `agentPerformance`,
 * `churnRisk`, `salesOpportunity`) NÃO têm default: ausência é ausência.
 */
export const ConversationAnalysisOutput = z.object({
  department: departmentSchema,
  relationshipType: z.string(),
  summary: z.string().min(1),
  status: conversationStatusSchema,
  keyPoints: z.array(z.string()).max(5),
  nextSteps: z.array(z.string()),
  sentiment: sentimentSchema,
  sentimentScore: z.number().min(0).max(100).optional(),
  customerSatisfaction: z.number().min(1).max(5).optional(),
  topics: z.array(z.string()).max(5),
  urgency: urgencySchema,
  agentPerformance: AgentPerformanceSchema.optional(),
  churnRisk: churnRiskSchema.optional(),
  salesOpportunity: z.string().nullable().optional(),
});

// ─── Capacidade: resumo de conversa ──────────────────────────
/**
 * Mesmos campos da análise. `department` e `relationshipType` são OPCIONAIS
 * aqui porque o resumo pode não devolvê-los — e, quando não devolve, o campo
 * fica ausente em vez de receber `'outros'`/`'não identificado'` inventado.
 */
export const ConversationSummaryOutput = ConversationAnalysisOutput.extend({
  department: departmentSchema.optional(),
  relationshipType: z.string().optional(),
});

// ─── Capacidade: respostas sugeridas ─────────────────────────
/** `ai-suggest-reply` devolve EXATAMENTE 3 sugestões. */
export const SuggestedReplyItemSchema = z.object({
  type: z.string(),
  text: z.string().min(1),
  emoji: z.string().optional(),
});

export const SuggestedRepliesOutput = z
  .array(SuggestedReplyItemSchema)
  .length(3);

// ─── Capacidade: auto-tag ────────────────────────────────────
/** `ai-auto-tag` devolve tags com confiança em 0-1 (não 0-100). */
export const AutoTagItemSchema = z.object({
  name: z.string().min(1),
  // Confiança OPCIONAL: ausente é ausente. O consumidor grava `null` (a coluna
  // aceita null) em vez de inventar 0 — o código antigo coagia
  // `Number(t.confidence) || 0`. Quando vem, é número em 0-1 (não percentual).
  confidence: z.number().min(0).max(1).optional(),
});

export const AutoTagOutput = z.object({
  tags: z.array(AutoTagItemSchema),
});

// ─── Capacidade: chatbot L1 ──────────────────────────────────
/**
 * Saída esperada de `chatbot-l1`.
 *
 * `confidence` é NÚMERO de verdade: `'0.9'` (string) ou `95` (percentual) são
 * REJEITADOS em vez de coagidos — o código antigo comparava
 * `result.confidence < 0.6` sobre o que viesse, e uma string passava batido.
 * Ausente continua ausente (não vira 0).
 *
 * `detected_sentiment` é o sentimento CANÔNICO (pt-BR). O legado em inglês é
 * traduzido e o valor desconhecido é omitido ANTES de chegar aqui — o contrato
 * não adivinha sentimento.
 */
export const ChatbotL1Output = z.object({
  handled: z.boolean(),
  response: z.string().min(1),
  transfer_to_human: z.boolean(),
  transfer_reason: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
  matched_article: z.string().nullable().optional(),
  detected_intent: z.string().nullable().optional(),
  detected_sentiment: sentimentSchema.optional(),
});

// ─── Tipos inferidos (o "por capacidade" do consumidor) ──────
export type ConversationAnalysisOutput = z.infer<typeof ConversationAnalysisOutput>;
export type ConversationSummaryOutput = z.infer<typeof ConversationSummaryOutput>;
export type SuggestedRepliesOutput = z.infer<typeof SuggestedRepliesOutput>;
export type AutoTagOutput = z.infer<typeof AutoTagOutput>;
export type ChatbotL1Output = z.infer<typeof ChatbotL1Output>;
export type AgentPerformance = z.infer<typeof AgentPerformanceSchema>;

// ─── Parser com erros achatados ──────────────────────────────
/** Erro de contrato com o caminho achatado (ex.: `keyPoints.5`). */
export interface ContractIssue {
  path: string;
  message: string;
}

export type ParseModelOutputResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: ContractIssue[] };

/**
 * Valida a saída crua do modelo contra um schema, sem coagir nada:
 * - sucesso  → `{ ok: true, data }` com o valor já tipado;
 * - falha    → `{ ok: false, errors }`, cada erro com `path` achatado
 *   (`resultado.error.issues[i].path.join('.')`).
 *
 * O `path` achatado é o que permite apontar o índice exato de um array
 * (`keyPoints.5`) em vez do genérico `keyPoints`.
 */
export function parseModelOutput<T>(
  schema: z.ZodType<T>,
  raw: unknown,
): ParseModelOutputResult<T> {
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  };
}

// ─── Envelope comum de execução ──────────────────────────────
export type AiRunStatus = "ok" | "partial" | "error";

export interface AiEnvelopeInput<T = unknown> {
  capability: string;
  status: AiRunStatus;
  context?: unknown;
  evidence?: unknown;
  error?: unknown;
  data?: T;
}

/**
 * Envelope comum a toda execução de IA, para observabilidade uniforme.
 *
 * Só escreve as chaves que receberam um valor NÃO-`undefined` — assim uma
 * capacidade que não produz `evidence` não carrega `evidence: undefined` no
 * objeto (que sumiria no `JSON.stringify` de qualquer forma, mas mentiria em
 * `'evidence' in envelope`). `null` explícito É preservado: significa "sei que
 * não há", diferente de "não se aplica".
 */
export function buildAiEnvelope<T = unknown>(
  input: AiEnvelopeInput<T>,
): { capability: string; status: AiRunStatus } & Partial<{
  context: unknown;
  evidence: unknown;
  error: unknown;
  data: T;
}> {
  const envelope: {
    capability: string;
    status: AiRunStatus;
    context?: unknown;
    evidence?: unknown;
    error?: unknown;
    data?: T;
  } = { capability: input.capability, status: input.status };

  if (input.context !== undefined) envelope.context = input.context;
  if (input.evidence !== undefined) envelope.evidence = input.evidence;
  if (input.error !== undefined) envelope.error = input.error;
  if (input.data !== undefined) envelope.data = input.data;

  return envelope;
}
