import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, requireAuth, checkRateLimit, getClientIP, createAuthedClient } from "../_shared/validation.ts";
import { AiConversationSummarySchema, CONTEXT_CONTRACT_VERSION, contextCancelledEnvelope, measureConversationContext, parseBody, revalidateContextBeforeEffect, validationErrorResponse } from "../_shared/schemas.ts";
import { normalizeSentiment, normalizeUrgency, urgencyToOperationalPriority } from "../_shared/ai-vocabulary.ts";
import { normalizeScore } from "../_shared/ai-values.ts";
import { ConversationSummaryOutput, buildAiEnvelope, parseModelOutput } from "../_shared/ai-response-contracts.ts";
import { parseJsonObject } from "../_shared/ai-json.ts";
import { extractUserIdFromRequest } from "../_shared/ai-usage.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";
import { CHURN_RISK_TOOL_SCHEMA, CONVERSATION_STATUS_TOOL_SCHEMA, KEY_POINTS_TOOL_SCHEMA, NEXT_STEPS_TOOL_SCHEMA, SENTIMENT_TOOL_SCHEMA, type ConversationToolDefinition, applyVocabularyConversion, buildConversationModelBody, buildConversationText, collectValueIssues, contractRejectionEvidence, conversationRunEnvelope, loadContactProjectionVersion, loadContactPromptContext, noModelPayloadResponse, persistenceFailureEnvelope, requestConversationModelJson, resolveVisibleContactId, summarizeContractIssues } from "../_shared/ai-conversation-pipeline.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const authCheck = await requireAuth(req);
  if (authCheck instanceof Response) return authCheck;
  const __uid = (authCheck as { userId: string }).userId;
  const __guard = await enforceAiGuards({ functionName: "ai-conversation-summary", userId: __uid, req });
  if (__guard) return __guard;


  const log = new Logger("ai-conversation-summary");
  const userId = extractUserIdFromRequest(req);

  try {
    const ip = getClientIP(req);
    const { allowed } = checkRateLimit(`summary:${ip}`, 10, 60_000);
    if (!allowed) return errorResponse("Rate limit exceeded. Please try again later.", 429, req);

    const parsed = parseBody(AiConversationSummarySchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { messages, contactName, contactId, periodDays } = parsed.data;
    // IA-048: identidade da requisição e versão do contexto declarada pelo cliente.
    const requestId = parsed.data.requestId ?? null;
    // `contextVersion` (nome semântico) ou `periodKey` (nome canônico do frontend):
    // o mesmo identificador de contexto pode chegar por qualquer um dos dois.
    const declaredContextVersion = parsed.data.contextVersion ?? parsed.data.periodKey ?? null;
    const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));

    // Visibilidade do contato (IA-004): este client é service_role (bypassa RLS).
    const visibleContactId = await resolveVisibleContactId(req, contactId);

    // IA-048: versão do contato no INÍCIO da requisição (antes de chamar o modelo).
    // `undefined` = não foi possível medir (a revalidação não cancela no escuro);
    // `null` = medido, o contato ainda não tem projeção.
    let versionAtRequestStart: string | null | undefined;
    if (visibleContactId) {
      try {
        versionAtRequestStart = await loadContactProjectionVersion(supabase, visibleContactId);
      } catch (versionError) {
        versionAtRequestStart = undefined;
        log.warn("Não foi possível ler a versão do contato no início da requisição", {
          contactId: visibleContactId,
          error: versionError instanceof Error ? versionError.message : String(versionError),
        });
      }
    }

    // Fetch contact context for richer analysis
    let contactContext = '';
    if (visibleContactId) {
      const { contact, recentAnalyses } = await loadContactPromptContext({
        supabase,
        contactId: visibleContactId,
        contactColumns: 'name, company, tags, ai_priority, ai_sentiment, notes',
        analysisColumns: 'sentiment, summary, created_at',
      });

      if (contact) {
        contactContext = `\nContexto: ${contact.name || 'Cliente'}, Empresa: ${contact.company || 'N/A'}, Tags: ${contact.tags?.join(', ') || 'Nenhuma'}`;
      }

      if (recentAnalyses.length > 0) {
        contactContext += `\nHistórico: ${recentAnalyses.map(a => `[${a.sentiment}] ${a.summary}`).join(' | ')}`;
      }
    }

    const conversationText = buildConversationText(messages, contactName);

    const systemPrompt = `Você é um analista sênior de inteligência conversacional de uma empresa distribuidora/comercial.

CONTEXTO DO NEGÓCIO — Nossa empresa opera múltiplos departamentos que se comunicam com diferentes públicos via WhatsApp:
• VENDAS: Vendedores atendem clientes (empresas/lojistas) — pedidos, condições, follow-ups comerciais.
• COMPRAS: Time de compras interage com FORNECEDORES — cotações, prazos, acompanhamento de produção.
• LOGÍSTICA: Logística cota e acompanha TRANSPORTADORAS — fretes, rastreio, ocorrências.
• RH: Interage com COLABORADORES — questões trabalhistas, benefícios, comunicação interna.
• FINANCEIRO: Cobranças com clientes, pagamentos com fornecedores.
• SAC/SUPORTE: Reclamações, trocas, devoluções, pós-venda.

REGRA: Identifique o departamento e tipo de relação antes de analisar. Isso muda a interpretação.
${contactContext}

Foque em:
- Identificar o problema/necessidade REAL do interlocutor (não apenas o que ele disse)
- Avaliar a qualidade do atendimento do nosso colaborador
- Detectar oportunidades de melhoria ou negócio
- Identificar riscos (churn, rompimento com fornecedor, turnover)
- Sugerir ações concretas e mensuráveis`;

    // Ferramenta (function call) desta capacidade: o schema muda, a chamada não.
    const conversationTool: ConversationToolDefinition = {
      name: "generate_analysis",
      description: "Generate a comprehensive analysis of the conversation",
      schema: {
        properties: {
          department: { type: "string", enum: ["vendas", "compras", "logistica", "rh", "financeiro", "sac", "outros"], description: "Departamento identificado" },
          relationshipType: { type: "string", description: "Tipo de relação identificada (ex: vendedor→cliente)" },
          summary: { type: "string", description: "Brief summary (max 3 sentences)" },
          status: CONVERSATION_STATUS_TOOL_SCHEMA,
          keyPoints: KEY_POINTS_TOOL_SCHEMA,
          nextSteps: NEXT_STEPS_TOOL_SCHEMA,
          sentiment: SENTIMENT_TOOL_SCHEMA,
          sentimentScore: { type: "number", description: "Sentiment score 0-100 (100=very positive)" },
          customerSatisfaction: { type: "number", description: "Estimated CSAT 1-5" },
          agentPerformance: {
            type: "object",
            properties: {
              empathy: { type: "number" }, clarity: { type: "number" },
              efficiency: { type: "number" }, knowledge: { type: "number" },
            },
          },
          churnRisk: CHURN_RISK_TOOL_SCHEMA,
          salesOpportunity: { type: "string", description: "Description of sales opportunity or null" },
          topics: { type: "array", items: { type: "string" }, description: "Main topics discussed" },
          urgency: { type: "string", enum: ["baixa", "media", "alta", "critica"] },
        },
        required: ["department", "summary", "status", "keyPoints", "sentiment", "sentimentScore", "customerSatisfaction", "topics", "urgency"],
      },
    };

    const { failure, rawOutput } = await requestConversationModelJson({
      functionName: 'ai-conversation-summary',
      purpose: 'summary',
      userId,
      // IA-051 — o id do clique (IA-048) atravessa o pipeline até o log de consumo.
      requestId,
      body: buildConversationModelBody({ systemPrompt, contactName, conversationText, tool: conversationTool }),
      log,
      req,
    });
    if (failure) return failure;

    const contextBudget = measureConversationContext(messages, periodDays);

    if (!rawOutput || typeof rawOutput !== 'object') {
      log.warn("Model returned no parseable JSON");
      return noModelPayloadResponse({
        capability: 'ai-conversation-summary',
        error: 'A IA não devolveu um resumo em formato válido; nada foi gravado.',
        context: contextBudget,
        req,
      });
    }

    // Legado conhecido é TRADUZIDO antes do contrato (IA-021/IA-022); valor
    // inventado (ex.: 'purple') segue inválido e é rejeitado logo abaixo.
    const rawSummary = rawOutput as Record<string, unknown>;
    const vocabularyConversions: Array<{ field: string; from: unknown; to: string }> = [];
    const legacySentiment = normalizeSentiment(rawSummary.sentiment);
    if (legacySentiment.known) applyVocabularyConversion(rawSummary, 'sentiment', legacySentiment, vocabularyConversions);
    const legacyUrgency = normalizeUrgency(rawSummary.urgency);
    if (legacyUrgency.known) applyVocabularyConversion(rawSummary, 'urgency', legacyUrgency, vocabularyConversions);

    // Contrato de saída da capacidade (IA-025): estrutura ou valor incorreto é
    // rejeitado ANTES de renderizar ou persistir.
    const validated = parseModelOutput(ConversationSummaryOutput, rawSummary);
    if (!validated.ok) {
      log.warn("Model output rejected by contract", { errors: summarizeContractIssues(validated.errors) });
      return jsonResponse(buildAiEnvelope({
        capability: 'ai-conversation-summary',
        status: 'error',
        error: 'A resposta do modelo não atende ao contrato de resumo; nada foi gravado.',
        ...contractRejectionEvidence(contextBudget, validated.errors),
      }), 502, req);
    }

    const analysis = validated.data;

    // Números passam pelo contrato numérico (IA-023): ausente continua ausente e
    // escala trocada (0,7 querendo dizer 70%) é recusada — nunca vira 50 nem 3.
    const sentimentScore = normalizeScore(analysis.sentimentScore, { min: 0, max: 100, scale: 'percent' });
    const customerSatisfaction = normalizeScore(analysis.customerSatisfaction, { min: 1, max: 5, scale: 'integer' });
    const valueIssues = collectValueIssues(analysis, { sentimentScore, customerSatisfaction });

    // Urgência (analítica, pt) e prioridade (operacional, EN) são grandezas
    // separadas: a conversão é explícita, não mais uma comparação com um token
    // em inglês que nunca casava com o valor em português do modelo.
    const operationalPriority = urgencyToOperationalPriority(normalizeUrgency(analysis.urgency).value);

    let analysisId: string | null = null;
    let projected = false;

    if (visibleContactId) {
      // IA-048: REVALIDA o contexto (contato ainda visível + versão vigente) ANTES
      // de qualquer efeito no servidor. Uma resposta atrasada de um período antigo
      // encontra a versão avançada e é cancelada — nada é persistido e nada
      // sobrescreve a projeção do contato.
      const revalidation = await revalidateContextBeforeEffect({
        expectedContactId: visibleContactId,
        declaredVersion: declaredContextVersion,
        versionAtRequestStart,
        reloadVisibleContactId: () => resolveVisibleContactId(req, visibleContactId),
        loadCurrentVersion: () => loadContactProjectionVersion(supabase, visibleContactId),
      });
      if (!revalidation.current) {
        log.info("Contexto superado; resumo não persistido", {
          requestId,
          reason: revalidation.reason,
          currentVersion: revalidation.currentVersion,
        });
        return jsonResponse(contextCancelledEnvelope({
          capability: 'ai-conversation-summary',
          requestId,
          context: contextBudget,
          reason: revalidation.reason,
          currentVersion: revalidation.currentVersion,
        }), 200, req);
      }

      // Uma única transação no banco: grava a análise COMPLETA (incluindo
      // department/relationshipType/agentPerformance/churnRisk/salesOpportunity,
      // hoje descartados) e projeta no contato com trava de recência
      // (IA-026/IA-027). O UPDATE solto em `contacts` deixou de existir.
      const { data: persisted, error: persistError } = await supabase.rpc('persist_conversation_analysis', {
        p_contact_id: visibleContactId,
        p_analysis: {
          department: analysis.department ?? null,
          relationship_type: analysis.relationshipType ?? null,
          summary: analysis.summary,
          sentiment: analysis.sentiment,
          sentiment_score: sentimentScore.value,
          customer_satisfaction: customerSatisfaction.value,
          key_points: analysis.keyPoints,
          next_steps: analysis.nextSteps,
          topics: analysis.topics,
          urgency: analysis.urgency,
          status: analysis.status,
          message_count: messages.length,
          agent_performance: analysis.agentPerformance ?? null,
          churn_risk: analysis.churnRisk ?? null,
          sales_opportunity: analysis.salesOpportunity ?? null,
          analysis_version: CONTEXT_CONTRACT_VERSION,
          period_days: periodDays ?? null,
          coverage: contextBudget,
          ai_priority: operationalPriority,
        },
        p_analyzed_at: new Date().toISOString(),
      });

      if (persistError) {
        log.error("Failed to persist conversation summary", {
          contactId: visibleContactId,
          error: persistError.message,
        });
        return jsonResponse(persistenceFailureEnvelope({
          capability: 'ai-conversation-summary',
          error: 'Não foi possível gravar o resumo; nada foi alterado no contato.',
          context: contextBudget,
        }), 502, req);
      }

      const persistedResult = persisted as { analysis_id?: string; projected?: boolean } | null;
      analysisId = persistedResult?.analysis_id ?? null;
      projected = persistedResult?.projected === true;
    }

    log.done(200, { analysisId, messageCount: messages.length, projected });
    return jsonResponse({
      ...buildAiEnvelope({
        capability: 'ai-conversation-summary',
        status: Object.keys(valueIssues).length > 0 ? 'partial' : 'ok',
        ...conversationRunEnvelope(contextBudget, valueIssues, vocabularyConversions, projected, requestId),
        data: analysis,
      }),
      analysisId,
    }, 200, req);
  } catch (error) {
    log.error("Error generating summary", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500, req);
  }
});
