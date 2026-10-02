/**
 * Pipeline compartilhado das capacidades de CONVERSA por IA
 * (`ai-conversation-analysis` e `ai-conversation-summary`).
 *
 * POR QUE ESTE MÓDULO EXISTE: as duas funções nasceram uma copiando a outra —
 * checagem de visibilidade do contato, montagem do texto da conversa, corpo da
 * chamada ao modelo, extração do JSON, tradução do vocabulário legado e leitura
 * da resposta eram byte a byte iguais. O SonarCloud mediu 4,6% de duplicação em
 * código novo (limite 3%) exatamente nesses trechos; este módulo é a cópia
 * ÚNICA deles.
 *
 * O que é ESPECÍFICO de cada capacidade continua com ela e chega aqui como
 * PARÂMETRO explícito: schema Zod, prompt de sistema, esquema da ferramenta do
 * modelo e mensagens de erro. Nada aqui adivinha domínio nem inventa default:
 * valor ausente continua ausente, valor inválido continua rejeitado pelo
 * contrato de saída de quem chamou.
 *
 * O contrato HTTP público das duas funções não muda: mesmas mensagens, mesmos
 * status, mesma ordem de operações, mesmos campos gravados.
 *
 * POR QUE A ANÁLISE USA OS CONSTRUTORES DE RESPOSTA E O RESUMO NÃO: o contrato
 * de origem do `ai-conversation-summary` (teste que lê o fonte daquela função)
 * fixa a forma LITERAL do envelope de rejeição, do registro gravado na RPC e do
 * envelope de sucesso; por isso o resumo mantém esse trecho escrito no próprio
 * arquivo, usando daqui só as FÁBRICAS de envelope (`persistenceFailureEnvelope`
 * e `conversationRunEnvelope`), que são as mesmas para os dois. O
 * `ai-conversation-analysis` não tem essa amarra e chama os construtores de
 * resposta completos. É a única diferença de estilo entre as duas funções.
 */
import { jsonResponse, errorResponse, Logger, createAuthedClient } from "./validation.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { generateWithRouting } from "./ai-generate.ts";
import type { AiPurpose } from "./ai-routing.ts";
import { parseJsonObject } from "./ai-json.ts";
import { buildAiEnvelope, type ContractIssue } from "./ai-response-contracts.ts";
import type { NormalizedNumber } from "./ai-values.ts";
import { CONTEXT_CONTRACT_VERSION, type ConversationContextBudget } from "./schemas.ts";

/** Uma mensagem da conversa, como o corpo da requisição entrega. */
export interface ConversationTurn {
  sender?: string;
  content?: string;
}

/**
 * Checagem de visibilidade do contato (IA-004).
 *
 * A função roda com service_role (bypassa RLS): sem esta confirmação, qualquer
 * usuário autenticado poderia usar um `contactId` que não enxerga para ler
 * notas/sentimento/histórico (PII). Quem manda é a RLS real de `contacts`,
 * consultada por um client autenticado com o token do próprio usuário.
 * Contato inexistente/invisível é tratado como AUSENTE (`null`), nunca como
 * erro — a capacidade segue sem contexto de contato.
 */
export async function resolveVisibleContactId(
  req: Request,
  contactId?: string | null,
): Promise<string | null> {
  const candidate = contactId ?? null;
  if (!candidate) return candidate;

  const authedClient = await createAuthedClient(req);
  const { data: visibleContact } = await authedClient
    .from('contacts')
    .select('id')
    .eq('id', candidate)
    .maybeSingle();
  return visibleContact ? candidate : null;
}

/**
 * Texto da conversa no formato que o prompt espera: `[quem falou]: conteúdo`.
 * `sender === 'agent'` é o nosso lado; qualquer outro valor é o interlocutor,
 * identificado pelo nome do contato (ou "Cliente" quando não há nome).
 */
export function buildConversationText(
  turns: ConversationTurn[],
  contactName?: string | null,
): string {
  const speaker = contactName || 'Cliente';
  return turns
    .map((turn) => `[${turn.sender === 'agent' ? 'Atendente' : speaker}]: ${turn.content || ''}`)
    .join('\n');
}

/** Esquema da ferramenta do modelo: nomes das propriedades + obrigatórias. */
export interface ConversationToolSchema {
  properties: Record<string, unknown>;
  required: string[];
}

export interface ConversationToolDefinition {
  name: string;
  description: string;
  schema: ConversationToolSchema;
}

/** Propriedades do esquema da ferramenta iguais nas duas capacidades. */
export const CONVERSATION_STATUS_TOOL_SCHEMA = {
  type: "string",
  enum: ["resolvido", "pendente", "aguardando_cliente", "aguardando_atendente", "escalado"],
};

export const KEY_POINTS_TOOL_SCHEMA = {
  type: "array",
  items: { type: "string" },
  description: "Key points (max 5)",
};

export const NEXT_STEPS_TOOL_SCHEMA = {
  type: "array",
  items: { type: "string" },
  description: "Actionable next steps",
};

export const SENTIMENT_TOOL_SCHEMA = {
  type: "string",
  enum: ["positivo", "neutro", "negativo", "critico"],
};

export const CHURN_RISK_TOOL_SCHEMA = {
  type: "string",
  enum: ["low", "medium", "high"],
};

/** Campos do contato usados no prompt (a projeção vem por parâmetro). */
export interface ContactPromptFields {
  name?: string | null;
  company?: string | null;
  tags?: string[] | null;
  ai_priority?: string | null;
  ai_sentiment?: string | null;
  notes?: string | null;
  contact_type?: string | null;
}

/** Campos das análises anteriores usados no prompt. */
export interface RecentAnalysisPromptFields {
  sentiment?: string | null;
  sentiment_score?: number | null;
  summary?: string | null;
  urgency?: string | null;
  created_at?: string | null;
}

/**
 * Contexto de contato do prompt: a linha visível do contato e as três últimas
 * análises dele. A busca é a mesma nas duas capacidades (mesmas tabelas, mesmo
 * limit); o que muda é a PROJEÇÃO de colunas que cada prompt aproveita — por
 * isso ela vem por parâmetro, junto com o client service_role já criado por
 * quem chama. A ordem das duas consultas é a que existia em cada função.
 */
export async function loadContactPromptContext(input: {
  supabase: SupabaseClient;
  contactId: string;
  contactColumns: string;
  analysisColumns: string;
}): Promise<{ contact: ContactPromptFields | null; recentAnalyses: RecentAnalysisPromptFields[] }> {
  const { data: contact } = await input.supabase
    .from('contacts')
    .select(input.contactColumns)
    .eq('id', input.contactId)
    .maybeSingle();

  const { data: recentAnalyses } = await input.supabase
    .from('conversation_analyses')
    .select(input.analysisColumns)
    .eq('contact_id', input.contactId)
    .order('created_at', { ascending: false })
    .limit(3);

  return {
    contact: (contact ?? null) as ContactPromptFields | null,
    recentAnalyses: (recentAnalyses ?? []) as RecentAnalysisPromptFields[],
  };
}

/**
 * Versão do contexto de IA do contato (IA-048): o instante da última projeção de
 * IA aplicada ao contato (`contacts.ai_projection_updated_at`), ou `null` quando
 * o contato nunca recebeu projeção. É o "relógio" contra o qual a revalidação
 * compara — a MESMA coluna que a trava de recência do banco usa.
 *
 * Lança quando a leitura falha (erro de rede/consulta): quem chama decide entre
 * tratar como "não medido" (não cancela) e propagar. Nunca devolve um instante
 * inventado.
 */
export async function loadContactProjectionVersion(
  supabase: SupabaseClient,
  contactId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('contacts')
    .select('ai_projection_updated_at')
    .eq('id', contactId)
    .maybeSingle();
  if (error) throw error;
  const value = (data as { ai_projection_updated_at?: string | null } | null)?.ai_projection_updated_at ?? null;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Parâmetros da chamada roteada que ESTE pipeline entrega ao despacho central:
 * política do SERVIDOR em `system` (IA-037) e conversa do cliente em
 * `messages`, mais a ferramenta forçada (`tools` + `toolChoice`).
 *
 * O MODELO não existe aqui: quem o escolhe é o `generateWithRouting`, a partir do
 * provedor resolvido pela finalidade (IA-035). Nada de `model` fixo no corpo.
 */
export interface ConversationModelPayload {
  system: string;
  messages: Array<{ role: 'user'; content: string }>;
  tools: unknown[];
  toolChoice: unknown;
}

/**
 * Parâmetros da chamada ao modelo, idênticos nas duas capacidades: mesma forma
 * de mensagens (system + conversa) e mesma forma de ferramenta (function call
 * forçada). O que muda é exatamente o que chega por parâmetro: prompt,
 * nome/descrição da ferramenta e o esquema das propriedades.
 */
export function buildConversationModelBody(input: {
  systemPrompt: string;
  contactName?: string | null;
  conversationText: string;
  tool: ConversationToolDefinition;
}): ConversationModelPayload {
  const { tool } = input;
  return {
    system: input.systemPrompt,
    messages: [
      { role: 'user', content: `Conversa com ${input.contactName || 'Cliente'}:\n\n${input.conversationText}` },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: "object",
            properties: tool.schema.properties,
            required: tool.schema.required,
            additionalProperties: false,
          },
        },
      },
    ],
    toolChoice: { type: "function", function: { name: tool.name } },
  };
}

export interface ConversationModelRequest {
  /**
   * Finalidade do uso no roteamento central. NÃO tem default: as duas
   * capacidades declaram a sua (`'summary'` no resumo, `'analysis'` na análise)
   * e finalidade ausente é erro de programação tratado pelo pipeline — chutar
   * uma finalidade trocaria o provedor de quem chamou.
   */
  purpose: AiPurpose;
  functionName: string;
  userId: string | null;
  body: ConversationModelPayload;
  log: Logger;
  req: Request;
}

/**
 * Chama a IA pelo despacho central e devolve o JSON do modelo já extraído.
 *
 * Mesma sequência de antes, agora num só lugar: chamada roteada pela finalidade
 * (e auditada em `ai_usage_logs` pelo próprio despacho), erro de provedor
 * (429/402 devolvem `failure`; o resto estoura e vira 500 no chamador) e
 * extração do objeto — `tool_calls[0].function.arguments` e, se não houver tool
 * call, o `content` como texto JSON. Sem JSON parseável o resultado é
 * `rawOutput` não-objeto e quem chamou responde 502; nada é fabricado no lugar.
 */
export async function requestConversationModelJson(
  request: ConversationModelRequest,
): Promise<{ failure: Response | null; rawOutput: unknown }> {
  // Erro de PROGRAMAÇÃO, nunca de provedor: sem finalidade não existe roteamento
  // possível e escolher uma por conta própria mudaria a chamada paga de lugar.
  if (!request.purpose) {
    throw new TypeError(
      `${request.functionName}: 'purpose' é obrigatório em requestConversationModelJson (roteamento central).`,
    );
  }

  const { response, data } = await generateWithRouting({
    purpose: request.purpose,
    functionName: request.functionName,
    userId: request.userId,
    system: request.body.system,
    messages: request.body.messages,
    tools: request.body.tools,
    toolChoice: request.body.toolChoice,
  });

  if (!response.ok || !data) {
    if (response.status === 429) return { failure: errorResponse("Rate limit exceeded", 429, request.req), rawOutput: null };
    if (response.status === 402) return { failure: errorResponse("Payment required", 402, request.req), rawOutput: null };
    throw new Error(`AI gateway error: ${response.status}`);
  }

  const message = (data.choices as Array<{
    message?: { tool_calls?: Array<{ function?: { arguments?: string } }>; content?: string };
  }>)?.[0]?.message;
  const toolArguments = message?.tool_calls?.[0]?.function?.arguments;

  if (toolArguments) {
    try {
      return { failure: null, rawOutput: JSON.parse(toolArguments) };
    } catch {
      request.log.error("Failed to parse tool_call arguments");
      return { failure: null, rawOutput: parseJsonObject(toolArguments) };
    }
  }
  if (typeof message?.content === 'string') {
    return { failure: null, rawOutput: parseJsonObject(message.content) };
  }
  return { failure: null, rawOutput: null };
}

/**
 * Resposta 502 de "o modelo não devolveu JSON utilizável". A mensagem é da
 * capacidade (análise/resumo); o envelope e o status são comuns.
 */
export function noModelPayloadResponse(input: {
  capability: string;
  error: string;
  context: ConversationContextBudget;
  req: Request;
}): Response {
  return jsonResponse(buildAiEnvelope({
    capability: input.capability,
    status: 'error',
    error: input.error,
    context: input.context,
    evidence: { contractVersion: CONTEXT_CONTRACT_VERSION },
  }), 502, input.req);
}

/** Erros do contrato de saída em linhas curtas para o log (até 8, como antes). */
export function summarizeContractIssues(issues: ContractIssue[]): string[] {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).slice(0, 8);
}

/** Contexto + evidência da rejeição do contrato de saída (mesma forma nas duas). */
export function contractRejectionEvidence(
  context: ConversationContextBudget,
  issues: ContractIssue[],
): { context: ConversationContextBudget; evidence: { contractVersion: typeof CONTEXT_CONTRACT_VERSION; errors: ContractIssue[] } } {
  return { context, evidence: { contractVersion: CONTEXT_CONTRACT_VERSION, errors: issues } };
}

/**
 * Envelope de falha ao GRAVAR a análise (IA-026/IA-027): mesma forma nas duas
 * capacidades. O status HTTP continua com quem chama, para o contrato de cada
 * função seguir legível no próprio arquivo.
 */
export function persistenceFailureEnvelope(input: {
  capability: string;
  error: string;
  context: ConversationContextBudget;
}) {
  return buildAiEnvelope({
    capability: input.capability,
    status: 'error',
    error: input.error,
    context: input.context,
    evidence: { contractVersion: CONTEXT_CONTRACT_VERSION },
  });
}

/** Contexto + evidência do envelope de execução bem-sucedida (IA-025). */
export function conversationRunEnvelope(
  context: ConversationContextBudget,
  valueIssues: Record<string, string>,
  vocabularyConversions: Array<{ field: string; from: unknown; to: string }>,
  projected: boolean,
  requestId?: string | null,
): {
  context: ConversationContextBudget;
  evidence: {
    contractVersion: typeof CONTEXT_CONTRACT_VERSION;
    valueIssues: Record<string, string>;
    vocabularyConversions: Array<{ field: string; from: unknown; to: string }>;
    projected: boolean;
  };
  requestId?: string;
} {
  return {
    context,
    evidence: { contractVersion: CONTEXT_CONTRACT_VERSION, valueIssues, vocabularyConversions, projected },
    // IA-048: ecoa o identificador da requisição SÓ quando o cliente mandou um.
    ...(typeof requestId === 'string' && requestId.length > 0 ? { requestId } : {}),
  };
}

/**
 * Registro canônico gravado por `persist_conversation_analysis`: o de-para
 * análise→coluna do banco existe uma única vez aqui. `computed` são os valores
 * calculados no handler (contrato numérico, coerção de contexto, prioridade
 * operacional) e chegam com o NOME DA COLUNA, para o mapeamento não se repetir
 * em cada capacidade.
 */
export function conversationAnalysisRecord(
  analysis: Record<string, unknown>,
  computed: Record<string, unknown>,
): Record<string, unknown> {
  return {
    department: analysis.department ?? null,
    relationship_type: analysis.relationshipType ?? null,
    summary: analysis.summary,
    sentiment: analysis.sentiment,
    key_points: analysis.keyPoints,
    next_steps: analysis.nextSteps,
    topics: analysis.topics,
    urgency: analysis.urgency,
    status: analysis.status,
    ...computed,
  };
}

/** Resposta de falha ao GRAVAR (IA-026/IA-027) no envelope comum. */
export function conversationPersistFailureResponse(input: {
  capability: string;
  message: string;
  context: ConversationContextBudget;
  req: Request;
}): Response {
  return jsonResponse(
    persistenceFailureEnvelope({ capability: input.capability, error: input.message, context: input.context }),
    502,
    input.req,
  );
}

/** Resposta da execução bem-sucedida: envelope comum + analysisId no topo. */
export function conversationRunResponse(input: {
  capability: string;
  status: 'ok' | 'partial';
  context: ConversationContextBudget;
  valueIssues: Record<string, string>;
  vocabularyConversions: Array<{ field: string; from: unknown; to: string }>;
  projected: boolean;
  analysisId: string | null;
  data: unknown;
  req: Request;
  /** IA-048: identificador da requisição, ecoado para o cliente descartar com segurança. */
  requestId?: string | null;
}): Response {
  return jsonResponse({
    ...buildAiEnvelope({
      capability: input.capability,
      status: input.status,
      ...conversationRunEnvelope(input.context, input.valueIssues, input.vocabularyConversions, input.projected, input.requestId),
      data: input.data,
    }),
    analysisId: input.analysisId,
  }, 200, input.req);
}

/**
 * Issues das notas normalizadas (IA-023), só para os campos que o modelo
 * MANDOU: campo ausente continua ausente e não gera issue.
 */
export function collectValueIssues(
  source: { sentimentScore?: number; customerSatisfaction?: number },
  normalized: { sentimentScore: NormalizedNumber; customerSatisfaction: NormalizedNumber },
): Record<string, string> {
  const issues: Record<string, string> = {};
  if (source.sentimentScore !== undefined && normalized.sentimentScore.issue) {
    issues.sentimentScore = normalized.sentimentScore.issue;
  }
  if (source.customerSatisfaction !== undefined && normalized.customerSatisfaction.issue) {
    issues.customerSatisfaction = normalized.customerSatisfaction.issue;
  }
  return issues;
}

/**
 * Tradução do vocabulário legado (IA-021/IA-022) de UM campo, aplicada sobre o
 * objeto cru do modelo antes do contrato de saída. Só registra conversão quando
 * o token era conhecido E difere do cru; valor desconhecido é deixado como está
 * para o contrato rejeitar (não existe adivinhação).
 */
export function applyVocabularyConversion(
  target: Record<string, unknown>,
  field: string,
  match: { value: string | null },
  conversions: Array<{ field: string; from: unknown; to: string }>,
): void {
  if (!match.value || match.value === target[field]) return;
  conversions.push({ field, from: target[field], to: match.value });
  target[field] = match.value;
}
