import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, requireAuth, checkRateLimit, getClientIP, createAuthedClient } from "../_shared/validation.ts";
import { AiConversationSummarySchema, CONTEXT_CONTRACT_VERSION, measureConversationContext, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { normalizeSentiment, normalizeUrgency, urgencyToOperationalPriority } from "../_shared/ai-vocabulary.ts";
import { normalizeScore } from "../_shared/ai-values.ts";
import { ConversationSummaryOutput, buildAiEnvelope, parseModelOutput } from "../_shared/ai-response-contracts.ts";
import { callAiWithTracking, extractUserIdFromRequest } from "../_shared/ai-usage.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";

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
    const LOVABLE_API_KEY = requireEnv("LOVABLE_API_KEY");
    const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));

    // Este client roda com service_role (bypassa RLS). Sem esta checagem,
    // qualquer usuário autenticado poderia usar contactId de um contato que
    // não enxerga para ler notas/sentimento/histórico (PII) — a RLS real de
    // `contacts` é a fonte de verdade de visibilidade.
    let visibleContactId: string | null = contactId ?? null;
    if (visibleContactId) {
      const authedClient = await createAuthedClient(req);
      const { data: visibleContact } = await authedClient
        .from('contacts')
        .select('id')
        .eq('id', visibleContactId)
        .maybeSingle();
      if (!visibleContact) {
        visibleContactId = null;
      }
    }

    // Fetch contact context for richer analysis
    let contactContext = '';
    if (visibleContactId) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('name, company, tags, ai_priority, ai_sentiment, notes')
        .eq('id', visibleContactId)
        .maybeSingle();

      if (contact) {
        contactContext = `\nContexto: ${contact.name || 'Cliente'}, Empresa: ${contact.company || 'N/A'}, Tags: ${contact.tags?.join(', ') || 'Nenhuma'}`;
      }

      const { data: prevAnalyses } = await supabase
        .from('conversation_analyses')
        .select('sentiment, summary, created_at')
        .eq('contact_id', visibleContactId)
        .order('created_at', { ascending: false })
        .limit(3);

      if (prevAnalyses && prevAnalyses.length > 0) {
        contactContext += `\nHistórico: ${prevAnalyses.map(a => `[${a.sentiment}] ${a.summary}`).join(' | ')}`;
      }
    }

    const conversationText = messages
      .map((msg) =>
        `[${msg.sender === 'agent' ? 'Atendente' : contactName || 'Cliente'}]: ${msg.content || ''}`
      )
      .join('\n');

    const systemPrompt = `Você é um analista sênior de inteligência conversacional de uma empresa distribuidora/comercial.

CONTEXTO DO NEGÓCIO — Nossa empresa opera múltiplos departamentos que se comunicam via WhatsApp:
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

    const { response, data } = await callAiWithTracking({
      functionName: 'ai-conversation-summary',
      userId,
      apiKey: LOVABLE_API_KEY,
      body: {
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Conversa com ${contactName || 'Cliente'}:\n\n${conversationText}` }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_analysis",
              description: "Generate a comprehensive analysis of the conversation",
              parameters: {
                type: "object",
                properties: {
                  department: { type: "string", enum: ["vendas", "compras", "logistica", "rh", "financeiro", "sac", "outros"], description: "Departamento identificado" },
                  relationshipType: { type: "string", description: "Tipo de relação identificada (ex: vendedor→cliente)" },
                  summary: { type: "string", description: "Brief summary (max 3 sentences)" },
                  status: { type: "string", enum: ["resolvido", "pendente", "aguardando_cliente", "aguardando_atendente", "escalado"] },
                  keyPoints: { type: "array", items: { type: "string" }, description: "Key points (max 5)" },
                  nextSteps: { type: "array", items: { type: "string" }, description: "Actionable next steps" },
                  sentiment: { type: "string", enum: ["positivo", "neutro", "negativo", "critico"] },
                  sentimentScore: { type: "number", description: "Sentiment score 0-100 (100=very positive)" },
                  customerSatisfaction: { type: "number", description: "Estimated CSAT 1-5" },
                  agentPerformance: {
                    type: "object",
                    properties: {
                      empathy: { type: "number" }, clarity: { type: "number" },
                      efficiency: { type: "number" }, knowledge: { type: "number" },
                    },
                  },
                  churnRisk: { type: "string", enum: ["low", "medium", "high"] },
                  salesOpportunity: { type: "string", description: "Description of sales opportunity or null" },
                  topics: { type: "array", items: { type: "string" }, description: "Main topics discussed" },
                  urgency: { type: "string", enum: ["baixa", "media", "alta", "critica"] },
                },
                required: ["department", "summary", "status", "keyPoints", "sentiment", "sentimentScore", "customerSatisfaction", "topics", "urgency"],
                additionalProperties: false,
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_analysis" } }
      },
    });

    if (!response.ok || !data) {
      if (response.status === 429) return errorResponse("Rate limit exceeded", 429, req);
      if (response.status === 402) return errorResponse("Payment required", 402, req);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const toolCall = (data.choices as Array<{message: {tool_calls?: Array<{function: {arguments: string}}>; content?: string}}>)?.[0]?.message?.tool_calls?.[0];
    const rawContent = (data.choices as Array<{message: {content?: string}}>)?.[0]?.message?.content;

    // Extrai o objeto JSON do modelo. O fallback que sintetizava um resumo
    // (texto genérico + nota de sentimento e CSAT fixos) foi removido (IA-023):
    // sem JSON parseável não existe resumo — a resposta vira erro explícito,
    // nunca dado fabricado.
    let rawOutput: unknown = null;
    if (toolCall?.function?.arguments) {
      try {
        rawOutput = JSON.parse(toolCall.function.arguments);
      } catch {
        log.error("Failed to parse tool_call arguments");
        const jsonMatch = toolCall.function.arguments.match(/\{[\s\S]*\}/);
        try { rawOutput = jsonMatch ? JSON.parse(jsonMatch[0]) : null; } catch { rawOutput = null; }
      }
    } else if (typeof rawContent === 'string') {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { rawOutput = JSON.parse(jsonMatch[0]); } catch { rawOutput = null; }
      }
    }

    const contextBudget = measureConversationContext(messages, periodDays);

    if (!rawOutput || typeof rawOutput !== 'object') {
      log.warn("Model returned no parseable JSON");
      return jsonResponse(buildAiEnvelope({
        capability: 'ai-conversation-summary',
        status: 'error',
        error: 'A IA não devolveu um resumo em formato válido; nada foi gravado.',
        context: contextBudget,
        evidence: { contractVersion: CONTEXT_CONTRACT_VERSION },
      }), 502, req);
    }

    // Legado conhecido é TRADUZIDO antes do contrato (IA-021/IA-022); valor
    // inventado (ex.: 'purple') segue inválido e é rejeitado logo abaixo.
    const rawSummary = rawOutput as Record<string, unknown>;
    const vocabularyConversions: Array<{ field: string; from: unknown; to: string }> = [];
    const legacySentiment = normalizeSentiment(rawSummary.sentiment);
    if (legacySentiment.known && legacySentiment.value && legacySentiment.value !== rawSummary.sentiment) {
      vocabularyConversions.push({ field: 'sentiment', from: rawSummary.sentiment, to: legacySentiment.value });
      rawSummary.sentiment = legacySentiment.value;
    }
    const legacyUrgency = normalizeUrgency(rawSummary.urgency);
    if (legacyUrgency.known && legacyUrgency.value && legacyUrgency.value !== rawSummary.urgency) {
      vocabularyConversions.push({ field: 'urgency', from: rawSummary.urgency, to: legacyUrgency.value });
      rawSummary.urgency = legacyUrgency.value;
    }

    // Contrato de saída da capacidade (IA-025): estrutura ou valor incorreto é
    // rejeitado ANTES de renderizar ou persistir.
    const validated = parseModelOutput(ConversationSummaryOutput, rawSummary);
    if (!validated.ok) {
      log.warn("Model output rejected by contract", {
        errors: validated.errors.map((e) => `${e.path}: ${e.message}`).slice(0, 8),
      });
      return jsonResponse(buildAiEnvelope({
        capability: 'ai-conversation-summary',
        status: 'error',
        error: 'A resposta do modelo não atende ao contrato de resumo; nada foi gravado.',
        context: contextBudget,
        evidence: { contractVersion: CONTEXT_CONTRACT_VERSION, errors: validated.errors },
      }), 502, req);
    }

    const analysis = validated.data;

    // Números passam pelo contrato numérico (IA-023): ausente continua ausente e
    // escala trocada (0,7 querendo dizer 70%) é recusada — nunca vira 50 nem 3.
    const sentimentScore = normalizeScore(analysis.sentimentScore, { min: 0, max: 100, scale: 'percent' });
    const customerSatisfaction = normalizeScore(analysis.customerSatisfaction, { min: 1, max: 5, scale: 'integer' });
    const valueIssues: Record<string, string> = {};
    if (analysis.sentimentScore !== undefined && sentimentScore.issue) valueIssues.sentimentScore = sentimentScore.issue;
    if (analysis.customerSatisfaction !== undefined && customerSatisfaction.issue) valueIssues.customerSatisfaction = customerSatisfaction.issue;

    // Urgência (analítica, pt) e prioridade (operacional, EN) são grandezas
    // separadas: a conversão é explícita, não mais uma comparação com um token
    // em inglês que nunca casava com o valor em português do modelo.
    const operationalPriority = urgencyToOperationalPriority(normalizeUrgency(analysis.urgency).value);

    let analysisId: string | null = null;
    let projected = false;

    if (visibleContactId) {
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
        return jsonResponse(buildAiEnvelope({
          capability: 'ai-conversation-summary',
          status: 'error',
          error: 'Não foi possível gravar o resumo; nada foi alterado no contato.',
          context: contextBudget,
          evidence: { contractVersion: CONTEXT_CONTRACT_VERSION },
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
        context: contextBudget,
        evidence: {
          contractVersion: CONTEXT_CONTRACT_VERSION,
          valueIssues,
          vocabularyConversions,
          projected,
        },
        data: analysis,
      }),
      analysisId,
    }, 200, req);
  } catch (error) {
    log.error("Error generating summary", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500, req);
  }
});
