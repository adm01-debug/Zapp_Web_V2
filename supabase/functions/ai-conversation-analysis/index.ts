import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, requireAuth, checkRateLimit, getClientIP } from "../_shared/validation.ts";
import { AiConversationAnalysisSchema, parseBody } from "../_shared/schemas.ts";
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
    if (!parsed.success) return errorResponse(parsed.error, 400, req);

    const { messages, contactName, contactId } = parsed.data;
    const LOVABLE_API_KEY = requireEnv("LOVABLE_API_KEY");
    const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));

    let contactContext = '';
    if (contactId) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('name, company, tags, ai_priority, ai_sentiment, notes, contact_type')
        .eq('id', contactId)
        .maybeSingle();

      if (contact) {
        contactContext = `\nContexto do cliente: ${contact.name || 'Cliente'}`;
        if (contact.company) contactContext += `, Empresa: ${contact.company}`;
        if (contact.tags?.length) contactContext += `, Tags: ${contact.tags.join(', ')}`;
        if (contact.contact_type) contactContext += `, Tipo: ${contact.contact_type}`;
        if (contact.ai_sentiment) contactContext += `, Sentimento anterior: ${contact.ai_sentiment}`;
      }

      const { data: prevAnalyses } = await supabase
        .from('conversation_analyses')
        .select('sentiment, sentiment_score, summary, urgency, created_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(3);

      if (prevAnalyses && prevAnalyses.length > 0) {
        contactContext += `\nAnálises anteriores: ${prevAnalyses.map(a => `[${a.sentiment} ${a.sentiment_score}%] ${a.summary?.substring(0, 80)}`).join(' | ')}`;
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

    let analysisData;
    if (toolCall?.function?.arguments) {
      try {
        analysisData = JSON.parse(toolCall.function.arguments);
      } catch {
        log.error("Failed to parse tool_call arguments");
        const jsonMatch = toolCall.function.arguments.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysisData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("AI returned malformed JSON");
        }
      }
    } else {
      const content = (data.choices as Array<{message: {content?: string}}>)?.[0]?.message?.content;
      let parsedContent = null;
      if (content) {
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) parsedContent = JSON.parse(jsonMatch[0]);
        } catch {
          parsedContent = null;
        }
      }
      analysisData = parsedContent || {
        summary: content || 'Não foi possível gerar análise.',
        status: 'pendente',
        keyPoints: [],
        sentiment: 'neutro',
        sentimentScore: 50,
        customerSatisfaction: 3,
        topics: [],
        urgency: 'media'
      };
    }

    const validDepartments = ['vendas', 'compras', 'logistica', 'rh', 'financeiro', 'sac', 'outros'];
    analysisData = {
      department: validDepartments.includes(analysisData.department) ? analysisData.department : 'outros',
      relationshipType: typeof analysisData.relationshipType === 'string' ? analysisData.relationshipType : 'não identificado',
      summary: analysisData.summary || 'Resumo não disponível',
      status: ['resolvido', 'pendente', 'aguardando_cliente', 'aguardando_atendente', 'escalado'].includes(analysisData.status) ? analysisData.status : 'pendente',
      keyPoints: Array.isArray(analysisData.keyPoints) ? analysisData.keyPoints.slice(0, 5) : [],
      nextSteps: Array.isArray(analysisData.nextSteps) ? analysisData.nextSteps : [],
      sentiment: ['positivo', 'neutro', 'negativo', 'critico'].includes(analysisData.sentiment) ? analysisData.sentiment : 'neutro',
      sentimentScore: typeof analysisData.sentimentScore === 'number' ? Math.max(0, Math.min(100, analysisData.sentimentScore)) : 50,
      customerSatisfaction: typeof analysisData.customerSatisfaction === 'number' ? Math.max(1, Math.min(5, analysisData.customerSatisfaction)) : 3,
      topics: Array.isArray(analysisData.topics) ? analysisData.topics.slice(0, 5) : [],
      urgency: ['baixa', 'media', 'alta', 'critica'].includes(analysisData.urgency) ? analysisData.urgency : 'media',
      agentPerformance: analysisData.agentPerformance || null,
      churnRisk: ['low', 'medium', 'high'].includes(analysisData.churnRisk) ? analysisData.churnRisk : 'low',
      salesOpportunity: analysisData.salesOpportunity || null,
    };

    let analysisId: string | null = null;

    if (contactId) {
      const { data: insertedAnalysis, error: insertError } = await supabase
        .from('conversation_analyses')
        .insert({
          contact_id: contactId,
          department: analysisData.department,
          relationship_type: analysisData.relationshipType,
          summary: analysisData.summary,
          sentiment: analysisData.sentiment,
          sentiment_score: analysisData.sentimentScore,
          customer_satisfaction: analysisData.customerSatisfaction,
          key_points: analysisData.keyPoints,
          next_steps: analysisData.nextSteps,
          topics: analysisData.topics,
          urgency: analysisData.urgency,
          status: analysisData.status,
          message_count: messages.length,
        })
        .select('id')
        .single();

      if (insertError) {
        log.warn("Failed to persist conversation analysis", {
          contactId,
          error: insertError.message,
        });
      } else {
        analysisId = insertedAnalysis?.id ?? null;
      }

      const { error: updateError } = await supabase
        .from('contacts')
        .update({
          ai_sentiment: analysisData.sentiment,
          ai_priority: analysisData.urgency === 'critica' ? 'urgent' : analysisData.urgency,
        })
        .eq('id', contactId);

      if (updateError) {
        log.warn("Failed to update contact AI fields", {
          contactId,
          error: updateError.message,
        });
      }
    }

    log.done(200, { analysisId, messageCount: messages.length });
    return jsonResponse({ ...analysisData, analysisId }, 200, req);
  } catch (error) {
    log.error("Error analyzing conversation", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500, req);
  }
});