import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, requireAuth, checkRateLimit, getClientIP, createAuthedClient } from "../_shared/validation.ts";
import { AiConversationAnalysisSchema, CONTEXT_CONTRACT_VERSION, measureConversationContext, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { normalizeSentiment, normalizeUrgency, urgencyToOperationalPriority } from "../_shared/ai-vocabulary.ts";
import { normalizeScore } from "../_shared/ai-values.ts";
import { ConversationAnalysisOutput, buildAiEnvelope, parseModelOutput } from "../_shared/ai-response-contracts.ts";
import { callAiWithTracking, extractUserIdFromRequest } from "../_shared/ai-usage.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";

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

    let contactContext = '';
    if (visibleContactId) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('name, company, tags, ai_priority, ai_sentiment, notes, contact_type')
        .eq('id', visibleContactId)
        .maybeSingle();

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

      const { data: prevAnalyses } = await supabase
        .from('conversation_analyses')
        .select('sentiment, sentiment_score, summary, urgency, created_at')
        .eq('contact_id', visibleContactId)
        .order('created_at', { ascending: false })
        .limit(3);

      if (prevAnalyses && prevAnalyses.length > 0) {
        // Histórico sem "undefined%": nota ausente é dita como ausente (IA-023).
        contactContext += `\nAnálises anteriores: ${prevAnalyses.map(a => {
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

    const conversationText = messages
      .map((msg) => `[${msg.sender === 'agent' ? 'Atendente' : contactName || 'Cliente'}]: ${msg.content || ''}`)
      .join('\n');

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

    const { response, data } = await callAiWithTracking({
      functionName: 'ai-conversation-analysis',
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
              name: "analyze_conversation",
              description: "Perform comprehensive analysis of the customer service conversation",
              parameters: {
                type: "object",
                properties: {
                  department: { type: "string", enum: ["vendas", "compras", "logistica", "rh", "financeiro", "sac", "outros"], description: "Departamento identificado na conversa" },
                  relationshipType: { type: "string", description: "Tipo de relação: vendedor→cliente, comprador→fornecedor, logística→transportadora, RH→colaborador, financeiro→cliente, sac→cliente, etc." },
                  summary: { type: "string", description: "Brief summary (max 4 sentences) identifying department and relationship" },
                  status: { type: "string", enum: ["resolvido", "pendente", "aguardando_cliente", "aguardando_atendente", "escalado"] },
                  keyPoints: { type: "array", items: { type: "string" }, description: "Key points (max 5)" },
                  nextSteps: { type: "array", items: { type: "string" }, description: "Actionable next steps" },
                  sentiment: { type: "string", enum: ["positivo", "neutro", "negativo", "critico"] },
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
                  churnRisk: { type: "string", enum: ["low", "medium", "high"] },
                  salesOpportunity: { type: "string", description: "Sales/business opportunity description or null" },
                },
                required: ["department", "relationshipType", "summary", "status", "keyPoints", "sentiment", "sentimentScore", "urgency", "customerSatisfaction"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "analyze_conversation" } }
      },
    });

    if (!response.ok || !data) {
      if (response.status === 429) return errorResponse("Rate limit exceeded", 429, req);
      if (response.status === 402) return errorResponse("Payment required", 402, req);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const toolCall = (data.choices as Array<{message: {tool_calls?: Array<{function: {arguments: string}}>; content?: string}}>)?.[0]?.message?.tool_calls?.[0];
    const rawContent = (data.choices as Array<{message: {content?: string}}>)?.[0]?.message?.content;

    // Extrai o objeto JSON do modelo. O fallback que sintetizava "análise" com
    // sentimento/nota inventados foi removido (IA-023): sem JSON parseável não
    // existe análise — a resposta vira erro explícito, não dado fabricado.
    let rawOutput: unknown = null;
    if (toolCall?.function?.arguments) {
      try {
        rawOutput = JSON.parse(toolCall.function.arguments);
      } catch {
        log.error("Failed to parse tool_call arguments");
        const jsonMatch = toolCall.function.arguments.match(/\{[\s\S]*\}/);
        rawOutput = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
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
        capability: 'ai-conversation-analysis',
        status: 'error',
        error: 'A IA não devolveu uma análise em formato válido; nada foi gravado.',
        context: contextBudget,
        evidence: { contractVersion: CONTEXT_CONTRACT_VERSION },
      }), 502, req);
    }

    // Legado conhecido é TRADUZIDO antes do contrato (IA-021/IA-022); valor
    // inventado (ex.: 'purple') continua inválido e é rejeitado abaixo.
    const rawAnalysis = rawOutput as Record<string, unknown>;
    const vocabularyConversions: Array<{ field: string; from: unknown; to: string }> = [];
    const legacySentiment = normalizeSentiment(rawAnalysis.sentiment);
    if (legacySentiment.known && legacySentiment.value && legacySentiment.value !== rawAnalysis.sentiment) {
      vocabularyConversions.push({ field: 'sentiment', from: rawAnalysis.sentiment, to: legacySentiment.value });
      rawAnalysis.sentiment = legacySentiment.value;
    }
    const legacyUrgency = normalizeUrgency(rawAnalysis.urgency);
    if (legacyUrgency.known && legacyUrgency.value && legacyUrgency.value !== rawAnalysis.urgency) {
      vocabularyConversions.push({ field: 'urgency', from: rawAnalysis.urgency, to: legacyUrgency.value });
      rawAnalysis.urgency = legacyUrgency.value;
    }

    // Contrato de saída da capacidade (IA-025): estrutura ou valor incorreto é
    // rejeitado ANTES de renderizar ou persistir.
    const validated = parseModelOutput(ConversationAnalysisOutput, rawAnalysis);
    if (!validated.ok) {
      log.warn("Model output rejected by contract", {
        errors: validated.errors.map((e) => `${e.path}: ${e.message}`).slice(0, 8),
      });
      return jsonResponse(buildAiEnvelope({
        capability: 'ai-conversation-analysis',
        status: 'error',
        error: 'A resposta do modelo não atende ao contrato de análise; nada foi gravado.',
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
    // separadas: a conversão é explícita, não mais um `=== 'critical'` morto.
    const operationalPriority = urgencyToOperationalPriority(normalizeUrgency(analysis.urgency).value);

    let analysisId: string | null = null;
    let projected = false;

    if (visibleContactId) {
      // Uma única transação no banco: grava a análise COMPLETA e projeta no
      // contato com trava de recência (IA-026/IA-027). Falha em qualquer etapa
      // desfaz tudo — não existe estado em que a análise não gravou e o contato
      // mudou, nem projeção sobrescrita por análise de período antigo.
      const { data: persisted, error: persistError } = await supabase.rpc('persist_conversation_analysis', {
        p_contact_id: visibleContactId,
        p_analysis: {
          department: analysis.department,
          relationship_type: analysis.relationshipType,
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
        log.error("Failed to persist conversation analysis", {
          contactId: visibleContactId,
          error: persistError.message,
        });
        return jsonResponse(buildAiEnvelope({
          capability: 'ai-conversation-analysis',
          status: 'error',
          error: 'Não foi possível gravar a análise; nada foi alterado no contato.',
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
        capability: 'ai-conversation-analysis',
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
    log.error("Error analyzing conversation", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500, req);
  }
});