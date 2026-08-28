import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, requireAuth, checkRateLimit, getClientIP } from "../_shared/validation.ts";
import { AiConversationSummarySchema, parseBody } from "../_shared/schemas.ts";
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
    if (!parsed.success) return errorResponse(parsed.error, 400, req);

    const { messages, contactName, contactId } = parsed.data;
    const LOVABLE_API_KEY = requireEnv("LOVABLE_API_KEY");
    const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));

    // Fetch contact context for richer analysis
    let contactContext = '';
    if (contactId) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('name, company, tags, ai_priority, ai_sentiment, notes')
        .eq('id', contactId)
        .maybeSingle();

      if (contact) {
        contactContext = `\nContexto: ${contact.name || 'Cliente'}, Empresa: ${contact.company || 'N/A'}, Tags: ${contact.tags?.join(', ') || 'Nenhuma'}`;
      }

      const { data: prevAnalyses } = await supabase
        .from('conversation_analyses')
        .select('sentiment, summary, created_at')
        .eq('contact_id', contactId)
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

    let analysisData;
    if (toolCall?.function?.arguments) {
      try {
        analysisData = JSON.parse(toolCall.function.arguments);
      } catch (parseErr) {
        log.error("Failed to parse tool_call arguments", { raw: toolCall.function.arguments });
        // Attempt to extract JSON from malformed response
        const jsonMatch = toolCall.function.arguments.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysisData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("AI returned malformed JSON in tool_call");
        }
      }
    } else {
      const content = (data.choices as Array<{message: {content?: string}}>)?.[0]?.message?.content;
      // Try to extract structured data from content if possible
      let parsed = null;
      if (content) {
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
        } catch { /* fallback below */ }
      }
      analysisData = parsed || { summary: content || 'Não foi possível gerar análise.', status: 'pendente', keyPoints: [], sentiment: 'neutro', sentimentScore: 50, customerSatisfaction: 3, topics: [], urgency: 'media' };
    }

    // Validate required fields with defaults
    analysisData = {
      summary: analysisData.summary || 'Resumo não disponível',
      status: ['resolvido', 'pendente', 'aguardando_cliente', 'aguardando_atendente', 'escalado'].includes(analysisData.status) ? analysisData.status : 'pendente',
      keyPoints: Array.isArray(analysisData.keyPoints) ? analysisData.keyPoints : [],
      nextSteps: Array.isArray(analysisData.nextSteps) ? analysisData.nextSteps : [],
      sentiment: ['positivo', 'neutro', 'negativo', 'critico'].includes(analysisData.sentiment) ? analysisData.sentiment : 'neutro',
      sentimentScore: typeof analysisData.sentimentScore === 'number' ? Math.max(0, Math.min(100, analysisData.sentimentScore)) : 50,
      customerSatisfaction: typeof analysisData.customerSatisfaction === 'number' ? Math.max(1, Math.min(5, analysisData.customerSatisfaction)) : 3,
      agentPerformance: analysisData.agentPerformance || null,
      churnRisk: analysisData.churnRisk || 'low',
      salesOpportunity: analysisData.salesOpportunity || null,
      topics: Array.isArray(analysisData.topics) ? analysisData.topics : [],
      urgency: ['baixa', 'media', 'alta', 'critica'].includes(analysisData.urgency) ? analysisData.urgency : 'media',
    };

    // Save analysis to database
    if (contactId) {
      await supabase.from('conversation_analyses').insert({
        contact_id: contactId,
        summary: analysisData.summary,
        sentiment: analysisData.sentiment,
        sentiment_score: analysisData.sentimentScore,
        customer_satisfaction: analysisData.customerSatisfaction,
        key_points: analysisData.keyPoints,
        next_steps: analysisData.nextSteps || [],
        topics: analysisData.topics,
        urgency: analysisData.urgency,
        status: analysisData.status,
        message_count: messages.length,
      });

      await supabase.from('contacts').update({
        ai_sentiment: analysisData.sentiment,
        ai_priority: analysisData.urgency === 'critical' ? 'urgent' : analysisData.urgency,
      }).eq('id', contactId);
    }

    log.done(200);
    return jsonResponse(analysisData, 200, req);
  } catch (error) {
    log.error("Error generating summary", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500, req);
  }
});
