import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, requireAuth, checkRateLimit, getClientIP, createAuthedClient } from "../_shared/validation.ts";
import { AiConversationAnalysisSchema, CONTEXT_CONTRACT_VERSION, contextCancelledEnvelope, measureConversationContext, parseBody, revalidateContextBeforeEffect, validationErrorResponse } from "../_shared/schemas.ts";
import { normalizeSentiment, normalizeUrgency, urgencyToOperationalPriority } from "../_shared/ai-vocabulary.ts";
import { normalizeScore } from "../_shared/ai-values.ts";
import { ConversationAnalysisOutput, buildAiEnvelope, parseModelOutput } from "../_shared/ai-response-contracts.ts";
import { parseJsonObject } from "../_shared/ai-json.ts";
import { extractUserIdFromRequest } from "../_shared/ai-usage.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";
import { CHURN_RISK_TOOL_SCHEMA, CONVERSATION_STATUS_TOOL_SCHEMA, KEY_POINTS_TOOL_SCHEMA, NEXT_STEPS_TOOL_SCHEMA, SENTIMENT_TOOL_SCHEMA, type ConversationToolDefinition, applyVocabularyConversion, buildConversationModelBody, buildConversationText, collectValueIssues, contractRejectionEvidence, conversationAnalysisRecord, conversationPersistFailureResponse, conversationRunResponse, loadContactProjectionVersion, loadContactPromptContext, noModelPayloadResponse, requestConversationModelJson, resolveVisibleContactId, summarizeContractIssues } from "../_shared/ai-conversation-pipeline.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const authCheck = await requireAuth(req);
  if (authCheck instanceof Response) return authCheck;
  const __uid = (authCheck as { userId: string }).userId;
  const __guard = await enforceAiGuards({ functionName: "ai-conversation-analysis", userId: __uid, req });
  if (__guard) return __guard;


  const log = new Logger("ai-conversation-analysis");
  const userId = extractUserIdFromRequest(req);

  try {
    const ip = getClientIP(req);
    const { allowed } = checkRateLimit(`analysis:${ip}`, 10, 60_000);
    if (!allowed) return errorResponse("Rate limit exceeded. Please try again later.", 429, req);

    const parsed = parseBody(AiConversationAnalysisSchema, await req.json());
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
    // `undefined` sinaliza "não foi possível medir" — a revalidação NÃO cancela no
    // escuro; `null` é "medido: o contato ainda não tem projeção".
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

    let contactContext = '';
    if (visibleContactId) {
      const { contact, recentAnalyses } = await loadContactPromptContext({
        supabase,
        contactId: visibleContactId,
        contactColumns: 'name, company, tags, ai_priority, ai_sentiment, notes, contact_type',
        analysisColumns: 'sentiment, sentiment_score, summary, urgency, created_at',
      });

      if (contact) {
        contactContext = `\nContexto do cliente: ${contact.name || 'Cliente'}`;
        if (contact.company) contactContext += `, Empresa: ${contact.company}`;
        if (contact.tags?.length) contactContext += `, Tags: ${contact.tags.join(', ')}`;
        if (contact.contact_type) contactContext += `, Tipo: ${contact.contact_type}`;
        // O sentimento anterior entra no prompt já no vocabulário CANÔNICO
        // (IA-021): antes o modelo recebia o valor cru, que podia estar em inglês.
        const previousSentiment = normalizeSentiment(contact.ai_sentiment);
        if (previousSentiment.value) contactContext += `, Sentimento anterior: ${previousSentiment.value}`;
      }

      if (recentAnalyses.length > 0) {
        // Histórico sem "undefined%": nota ausente é dita como ausente (IA-023).
        contactContext += `\nAnálises anteriores: ${recentAnalyses.map(a => {
          const s = normalizeSentiment(a.sentiment);
          const score = normalizeScore(a.sentiment_score, { min: 0, max: 100, scale: 'percent' });
          const label = `${s.value ?? 'sentimento não classificado'} ${score.value === null ? 'sem nota' : `${score.value}%`}`;
          return `[${label}] ${typeof a.summary === 'string' ? a.summary.substring(0, 80) : ''}`;
        }).join(' | ')}`;
      }

      if (typeof periodDays === 'number') {
        contactContext += `\nRecorte pedido: ${messages.length} mensagens dos últimos ${periodDays} dias.`;
      }
    }

    const conversationText = buildConversationText(messages, contactName);

    const systemPrompt = `Você é um analista sênior de inteligência conversacional de uma empresa distribuidora/comercial. Seu papel é compreender o CONTEXTO REAL de cada conversa e fornecer insights acionáveis e precisos.

CONTEXTO DO NEGÓCIO — Nossa empresa opera múltiplos departamentos que se comunicam com diferentes públicos via WhatsApp:
• VENDAS: Nossos vendedores atendem clientes (empresas/lojistas) — negociam pedidos, prazos, condições, catálogos e follow-ups comerciais.
• COMPRAS: Nosso time de compras interage com FORNECEDORES — negocia preços, prazos de entrega, acompanha produção e solicita cotações.
• LOGÍSTICA: Nosso time de logística cota e acompanha TRANSPORTADORAS — rastreia entregas, negocia fretes, resolve ocorrências de transporte.
• RH: Nosso RH interage com COLABORADORES internos — trata questões trabalhistas, benefícios, admissão, documentação e comunicação interna.
• FINANCEIRO: Interage com clientes para cobranças, negociação de dívidas, envio de boletos e com fornecedores para pagamentos.
• SAC/SUPORTE: Atende clientes finais com reclamações, trocas, devoluções e pós-venda.

REGRA CRÍTICA: Identifique SEMPRE qual departamento e qual tipo de relação está em jogo (vendedor→cliente, comprador→fornecedor, logística→transportadora, RH→colaborador, etc.). Isso muda completamente a interpretação do sentimento, urgência e próximos passos.

${contactContext}

Analise a conversa de forma profunda e forneça:
1. Resumo conciso (máx 4 frases) identificando o departamento, o tipo de interlocutor e o problema/tema real
2. Status da conversa
3. Pontos-chave (máx 5)
4. Próximos passos concretos e acionáveis (adequados ao departamento identificado)
5. Sentimento do interlocutor com score 0-100
6. Tópicos principais (máx 5 palavras-chave)
7. Urgência detectada (considere impacto financeiro, prazo e criticidade operacional)
8. Satisfação estimada (1-5)
9. Desempenho do nosso colaborador (empatia, clareza, eficiência, conhecimento - cada 1-10)
10. Risco de perda (churn para clientes, rompimento para fornecedores, turnover para colaboradores)
11. Oportunidade (venda/upsell para clientes, melhoria de condição para compras, otimização para logística)

Considere tom, frustração, complexidade, tempo de resposta e qualidade do atendimento.
Responda em português brasileiro.`;

    log.info("Calling AI for conversation analysis", {
      contactId,
      messageCount: messages.length,
    });

    // Ferramenta (function call) desta capacidade: o schema muda, a chamada não.
    const conversationTool: ConversationToolDefinition = {
      name: "analyze_conversation",
      description: "Perform comprehensive analysis of the customer service conversation",
      schema: {
        properties: {
          department: { type: "string", enum: ["vendas", "compras", "logistica", "rh", "financeiro", "sac", "outros"], description: "Departamento identificado na conversa" },
          relationshipType: { type: "string", description: "Tipo de relação: vendedor→cliente, comprador→fornecedor, logística→transportadora, RH→colaborador, financeiro→cliente, sac→cliente, etc." },
          summary: { type: "string", description: "Brief summary (max 4 sentences) identifying department and relationship" },
          status: CONVERSATION_STATUS_TOOL_SCHEMA,
          keyPoints: KEY_POINTS_TOOL_SCHEMA,
          nextSteps: NEXT_STEPS_TOOL_SCHEMA,
          sentiment: SENTIMENT_TOOL_SCHEMA,
          sentimentScore: { type: "number", description: "Sentiment 0-100" },
          topics: { type: "array", items: { type: "string" }, description: "Main topics (max 5)" },
          urgency: { type: "string", enum: ["baixa", "media", "alta", "critica"] },
          customerSatisfaction: { type: "number", description: "CSAT 1-5" },
          agentPerformance: {
            type: "object",
            properties: {
              empathy: { type: "number", description: "1-10" },
              clarity: { type: "number", description: "1-10" },
              efficiency: { type: "number", description: "1-10" },
              knowledge: { type: "number", description: "1-10" },
            },
          },
          churnRisk: CHURN_RISK_TOOL_SCHEMA,
          salesOpportunity: { type: "string", description: "Sales/business opportunity description or null" },
        },
        required: ["department", "relationshipType", "summary", "status", "keyPoints", "sentiment", "sentimentScore", "urgency", "customerSatisfaction"],
      },
    };

    const { failure, rawOutput } = await requestConversationModelJson({
      functionName: 'ai-conversation-analysis',
      purpose: 'analysis',
      userId,
      body: buildConversationModelBody({ systemPrompt, contactName, conversationText, tool: conversationTool }),
      log,
      req,
    });
    if (failure) return failure;

    const contextBudget = measureConversationContext(messages, periodDays);

    if (!rawOutput || typeof rawOutput !== 'object') {
      log.warn("Model returned no parseable JSON");
      return noModelPayloadResponse({
        capability: 'ai-conversation-analysis',
        error: 'A IA não devolveu uma análise em formato válido; nada foi gravado.',
        context: contextBudget,
        req,
      });
    }

    // Legado conhecido é TRADUZIDO antes do contrato (IA-021/IA-022); valor
    // inventado (ex.: 'purple') continua inválido e é rejeitado abaixo.
    const rawAnalysis = rawOutput as Record<string, unknown>;
    const vocabularyConversions: Array<{ field: string; from: unknown; to: string }> = [];
    const legacySentiment = normalizeSentiment(rawAnalysis.sentiment);
    if (legacySentiment.known) applyVocabularyConversion(rawAnalysis, 'sentiment', legacySentiment, vocabularyConversions);
    const legacyUrgency = normalizeUrgency(rawAnalysis.urgency);
    if (legacyUrgency.known) applyVocabularyConversion(rawAnalysis, 'urgency', legacyUrgency, vocabularyConversions);

    // Contrato de saída da capacidade (IA-025): estrutura ou valor incorreto é
    // rejeitado ANTES de renderizar ou persistir.
    const validated = parseModelOutput(ConversationAnalysisOutput, rawAnalysis);
    if (!validated.ok) {
      log.warn("Model output rejected by contract", { errors: summarizeContractIssues(validated.errors) });
      return jsonResponse(buildAiEnvelope({
        capability: 'ai-conversation-analysis',
        status: 'error',
        error: 'A resposta do modelo não atende ao contrato de análise; nada foi gravado.',
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
    // separadas: a conversão é explícita, não mais um `=== 'critical'` morto.
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
        log.info("Contexto superado; análise não persistida", {
          requestId,
          reason: revalidation.reason,
          currentVersion: revalidation.currentVersion,
        });
        return jsonResponse(contextCancelledEnvelope({
          capability: 'ai-conversation-analysis',
          requestId,
          context: contextBudget,
          reason: revalidation.reason,
          currentVersion: revalidation.currentVersion,
        }), 200, req);
      }

      // Uma única transação no banco: grava a análise COMPLETA e projeta no
      // contato com trava de recência (IA-026/IA-027). Falha em qualquer etapa
      // desfaz tudo — não existe estado em que a análise não gravou e o contato
      // mudou, nem projeção sobrescrita por análise de período antigo.
      const { data: persisted, error: persistError } = await supabase.rpc('persist_conversation_analysis', {
        p_contact_id: visibleContactId,
        p_analysis: conversationAnalysisRecord(analysis, {
          sentiment_score: sentimentScore.value,
          customer_satisfaction: customerSatisfaction.value,
          message_count: messages.length,
          agent_performance: analysis.agentPerformance ?? null,
          churn_risk: analysis.churnRisk ?? null,
          sales_opportunity: analysis.salesOpportunity ?? null,
          analysis_version: CONTEXT_CONTRACT_VERSION,
          period_days: periodDays ?? null,
          coverage: contextBudget,
          ai_priority: operationalPriority,
        }),
        p_analyzed_at: new Date().toISOString(),
      });

      if (persistError) {
        log.error("Failed to persist conversation analysis", {
          contactId: visibleContactId,
          error: persistError.message,
        });
        return conversationPersistFailureResponse({
          capability: 'ai-conversation-analysis',
          message: 'Não foi possível gravar a análise; nada foi alterado no contato.',
          context: contextBudget,
          req,
        });
      }

      const persistedResult = persisted as { analysis_id?: string; projected?: boolean } | null;
      analysisId = persistedResult?.analysis_id ?? null;
      projected = persistedResult?.projected === true;
    }

    log.done(200, { analysisId, messageCount: messages.length, projected });
    return conversationRunResponse({
      capability: 'ai-conversation-analysis',
      status: Object.keys(valueIssues).length > 0 ? 'partial' : 'ok',
      context: contextBudget,
      valueIssues,
      vocabularyConversions,
      projected,
      analysisId,
      data: analysis,
      req,
      requestId,
    });
  } catch (error) {
    log.error("Error analyzing conversation", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500, req);
  }
});
