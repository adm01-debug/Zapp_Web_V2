import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, requireAuth, checkRateLimit, getClientIP, verifyHmacSignature, createAuthedClient } from "../_shared/validation.ts";
import { ChatbotL1Schema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { callAiWithTracking, extractUserIdFromRequest } from "../_shared/ai-usage.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";
import { ChatbotL1Output, parseModelOutput } from "../_shared/ai-response-contracts.ts";
import { normalizeSentiment, normalizeOperationalPriority } from "../_shared/ai-vocabulary.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("chatbot-l1");

  // Read body once; support either JWT auth or HMAC webhook auth
  const rawBody = await req.text();
  const webhookSecret = Deno.env.get("CHATBOT_L1_WEBHOOK_SECRET");
  const sigHeader =
    req.headers.get("x-webhook-signature") ||
    req.headers.get("x-signature") ||
    "";
  let userId: string | null = null;
  let isWebhook = false;

  if (webhookSecret && sigHeader && await verifyHmacSignature(rawBody, sigHeader, webhookSecret)) {
    isWebhook = true;
  } else {
    const authCheck = await requireAuth(req);
    if (authCheck instanceof Response) return authCheck;
    userId = extractUserIdFromRequest(req);
    const guard = await enforceAiGuards({ functionName: "chatbot-l1", userId, req, perUserPerMinute: 30, dailyQuota: 1000 });
    if (guard) return guard;
  }

  try {
    const ip = getClientIP(req);
    const { allowed } = checkRateLimit(`chatbot:${ip}`, isWebhook ? 120 : 30, 60_000);
    if (!allowed) return errorResponse("Rate limit exceeded. Please try again later.", 429, req);

    let bodyJson: unknown;
    try { bodyJson = JSON.parse(rawBody); } catch { return errorResponse("Invalid JSON body", 400, req); }
    const parsed = parseBody(ChatbotL1Schema, bodyJson);
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { contactId, message, connectionId } = parsed.data;
    const LOVABLE_API_KEY = requireEnv("LOVABLE_API_KEY");
    const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));

    // Chamada autenticada por JWT (não-webhook): sem esta checagem, um agente
    // logado poderia mandar contactId de qualquer contato e fazer o bot L1
    // colocar nome/empresa/sentimento no prompt da IA, vazando PII de forma
    // indireta via resposta gerada. Chamadas via webhook HMAC já são
    // confiáveis (contactId vem do fluxo real da mensagem inbound), então
    // pulam esta checagem.
    if (!isWebhook) {
      const authedClient = await createAuthedClient(req);
      const { data: visibleContact } = await authedClient
        .from('contacts')
        .select('id')
        .eq('id', contactId)
        .maybeSingle();
      if (!visibleContact) {
        return jsonResponse({ handled: false, reason: 'contact_not_visible' }, 200, req);
      }
    }

    // Check if chatbot is active for this connection
    const { data: flow } = await supabase
      .from('chatbot_flows')
      .select('*')
      .eq('is_active', true)
      .eq('trigger_type', 'ai_l1')
      .limit(1)
      .maybeSingle();

    if (!flow) {
      return jsonResponse({ handled: false, reason: 'no_active_flow' }, 200, req);
    }

    // RAG: Search Knowledge Base
    const { data: relevantArticles } = await supabase
      .rpc('search_knowledge_base', { search_query: message, max_results: 5 });

    let kbContext = '';
    if (relevantArticles && relevantArticles.length > 0) {
      kbContext = relevantArticles
        .map((a: { category?: string; title: string; content: string; rank: number }) =>
          `[${a.category || 'Geral'}] ${a.title} (relevância: ${(a.rank * 100).toFixed(0)}%):\n${a.content.substring(0, 800)}`
        )
        .join('\n---\n');
    } else {
      const { data: fallbackArticles } = await supabase
        .from('knowledge_base_articles')
        .select('title, content, category')
        .eq('is_published', true)
        .limit(5);

      if (fallbackArticles && fallbackArticles.length > 0) {
        kbContext = fallbackArticles
          .map(a => `[${a.category || 'Geral'}] ${a.title}: ${a.content.substring(0, 400)}`)
          .join('\n---\n');
      }
    }

    // Fetch conversation history
    const { data: history } = await supabase
      .from('messages')
      .select('content, sender, message_type')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(15);

    const conversationHistory = (history || []).reverse().map((m: { sender: string; content: string }) => ({
      role: m.sender === 'agent' ? 'assistant' : 'user',
      content: m.content,
    }));

    // Fetch contact context
    let contactContext = '';
    const { data: contact } = await supabase
      .from('contacts')
      .select('name, company, tags, ai_priority, ai_sentiment')
      .eq('id', contactId)
      .maybeSingle();

    if (contact) {
      // Vocabulário CANÔNICO (IA-021/IA-022): o valor cru do banco é traduzido
      // (legado EN → pt-BR / EN→EN de prioridade) e, quando não é reconhecido,
      // simplesmente não entra no prompt — nada de `|| 'neutro'`/`|| 'normal'`.
      const previousSentiment = normalizeSentiment(contact.ai_sentiment);
      const previousPriority = normalizeOperationalPriority(contact.ai_priority);
      const linhas = [
        `- Nome: ${contact.name || 'Desconhecido'}`,
        `- Empresa: ${contact.company || 'N/A'}`,
        `- Tags: ${contact.tags?.join(', ') || 'Nenhuma'}`,
      ];
      if (previousPriority.value) linhas.push(`- Prioridade: ${previousPriority.value}`);
      if (previousSentiment.value) linhas.push(`- Sentimento: ${previousSentiment.value}`);
      contactContext = `\nCONTEXTO DO CLIENTE:\n${linhas.join('\n')}`;
    }

    const systemPrompt = `Você é um assistente de atendimento automatizado (Nível 1) via WhatsApp.
Seu objetivo é resolver dúvidas usando a Base de Conhecimento da empresa com respostas precisas e contextualizadas.

BASE DE CONHECIMENTO (artigos mais relevantes para a pergunta):
${kbContext || 'Nenhum artigo disponível.'}
${contactContext}

REGRAS:
1. Se a pergunta pode ser respondida com a Base de Conhecimento, responda diretamente com informações ESPECÍFICAS dos artigos.
2. Cite dados concretos dos artigos (valores, procedimentos, prazos) quando disponíveis.
3. Se a pergunta é complexa, requer ação humana, ou o cliente está irritado, transfira para humano.
4. NUNCA invente informações que não estão na Base de Conhecimento.
5. Se não encontrou artigos relevantes mas é uma saudação/despedida, responda normalmente.
6. Se não tiver certeza, transfira para humano.
7. Adapte o tom ao sentimento do cliente (mais cuidadoso com clientes insatisfeitos).

Responda em JSON:
{
  "handled": true,
  "response": "sua resposta ao cliente",
  "transfer_to_human": false,
  "transfer_reason": null,
  "confidence": 0.95,
  "matched_article": "título do artigo usado ou null",
  "detected_intent": "categoria da intenção (suporte, vendas, reclamação, etc)",
  "detected_sentiment": "positivo|neutro|negativo|critico"
}`;

    const { response, data } = await callAiWithTracking({
      functionName: 'chatbot-l1',
      userId,
      apiKey: LOVABLE_API_KEY,
      body: {
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationHistory,
          { role: "user", content: message },
        ],
        temperature: 0.3,
      },
    });

    if (!response.ok || !data) {
      if (response.status === 429 || response.status === 402) {
        return jsonResponse({ handled: false, reason: 'rate_limit' }, response.status, req);
      }
      throw new Error(`AI error: ${response.status}`);
    }

    const content = (data.choices as Array<{message: {content: string}}>)?.[0]?.message?.content;

    let rawOutput: unknown = null;
    if (typeof content === 'string') {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { rawOutput = JSON.parse(jsonMatch[0]); } catch { rawOutput = null; }
      }
    }

    if (!rawOutput || typeof rawOutput !== 'object') {
      return jsonResponse({ handled: false, reason: 'parse_error' }, 200, req);
    }

    // O sentimento CRU é traduzido ANTES do contrato (IA-021): o legado em
    // inglês vira o canônico pt-BR e o valor desconhecido é OMITIDO — ausência
    // continua ausência, sem default inventado.
    const rawRecord = rawOutput as Record<string, unknown>;
    const legacySentiment = normalizeSentiment(rawRecord.detected_sentiment);
    if (legacySentiment.known && legacySentiment.value) {
      rawRecord.detected_sentiment = legacySentiment.value;
    } else {
      delete rawRecord.detected_sentiment;
    }

    // Contrato de saída (IA-025): `confidence` precisa ser NÚMERO em 0-1 —
    // string (`'0.9'`) ou percentual é REJEITADO, não coagido.
    const validated = parseModelOutput(ChatbotL1Output, rawRecord);
    if (!validated.ok) {
      log.warn("Model output rejected by contract", {
        errors: validated.errors.map((e) => `${e.path}: ${e.message}`).slice(0, 8),
      });
      return jsonResponse({ handled: false, reason: 'invalid_output' }, 200, req);
    }

    const result = validated.data;

    // Confiança AUSENTE não transfere por default: só o valor medido abaixo do
    // limite força a transferência.
    if (result.confidence !== undefined && result.confidence < 0.6) {
      result.transfer_to_human = true;
      result.transfer_reason = 'low_confidence';
    }

    // Update contact AI metadata — só com valor CANÔNICO reconhecido; campo
    // desconhecido NÃO é escrito (antes ia o inglês cru vindo do modelo).
    const detectedSentiment = normalizeSentiment(result.detected_sentiment);
    const updateData: Record<string, string> = {};
    if (detectedSentiment.value) updateData.ai_sentiment = detectedSentiment.value;
    // Sentimento negativo/crítico eleva a prioridade OPERACIONAL do front.
    if (detectedSentiment.value === 'negativo' || detectedSentiment.value === 'critico') {
      updateData.ai_priority = 'high';
    }
    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase.from('contacts').update(updateData).eq('id', contactId);
      if (updateError) {
        log.error("Failed to update contact AI metadata", { contactId, error: updateError.message });
      }
    }

    log.done(200);
    return jsonResponse({
      handled: !result.transfer_to_human,
      response: result.response,
      transfer_to_human: result.transfer_to_human,
      transfer_reason: result.transfer_reason ?? null,
      confidence: result.confidence ?? null,
      matched_article: result.matched_article ?? null,
      detected_intent: result.detected_intent ?? null,
      detected_sentiment: detectedSentiment.value,
    }, 200, req);
  } catch (error: unknown) {
    log.error("Error in chatbot-l1", { error: error instanceof Error ? error.message : String(error) });
    // errorResponse (nao jsonResponse) para status 500: sanitiza a mensagem
    // antes de expor ao cliente — mesmo padrao das demais edges (ai-proxy,
    // ai-auto-tag, etc). O jsonResponse direto vazava error.message
    // (js/stack-trace-exposure).
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500, req);
  }
});
