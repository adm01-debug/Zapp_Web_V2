import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import {
  handleCors, errorResponse, jsonResponse,
  sanitizeString, isValidUUID, checkRateLimit, getClientIP, requireEnv, Logger, requireAuth,
  createAuthedClient,
} from "../_shared/validation.ts";
import { AiAutoTagSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { callAiWithTracking, extractUserIdFromRequest } from "../_shared/ai-usage.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";
import { AutoTagOutput, buildAiEnvelope, parseModelOutput } from "../_shared/ai-response-contracts.ts";
import { normalizeSentiment, normalizeOperationalPriority } from "../_shared/ai-vocabulary.ts";
import { normalizeScore } from "../_shared/ai-values.ts";
import { parseJsonObject } from "../_shared/ai-json.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const authCheck = await requireAuth(req);
  if (authCheck instanceof Response) return authCheck;
  const __uid = (authCheck as { userId: string }).userId;
  const __guard = await enforceAiGuards({ functionName: "ai-auto-tag", userId: __uid, req });
  if (__guard) return __guard;


  const log = new Logger("ai-auto-tag");
  const userId = extractUserIdFromRequest(req);

  try {
    const ip = getClientIP(req);
    const { allowed } = checkRateLimit(`autotag:${ip}`, 20, 60_000);
    if (!allowed) return errorResponse("Rate limit exceeded", 429, req);

    const parsed = parseBody(AiAutoTagSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { contactId, messages: inputMessages } = parsed.data;
    let validContactId = contactId && isValidUUID(contactId) ? contactId : null;

    const LOVABLE_API_KEY = requireEnv("LOVABLE_API_KEY");
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (validContactId) {
      // Este client roda com service_role (bypassa RLS). Sem esta checagem,
      // qualquer usuário autenticado poderia usar contactId de um contato que
      // não enxerga para ler resumo/sentimento (PII) e gravar tags/prioridade
      // nele — a RLS real de `contacts` é a fonte de verdade de visibilidade.
      const authedClient = await createAuthedClient(req);
      const { data: visibleContact } = await authedClient
        .from('contacts')
        .select('id')
        .eq('id', validContactId)
        .maybeSingle();
      if (!visibleContact) {
        validContactId = null;
      }
    }

    let conversationMessages = inputMessages;
    if (!conversationMessages && validContactId) {
      const { data } = await supabase
        .from('messages')
        .select('content, sender, message_type')
        .eq('contact_id', validContactId)
        .order('created_at', { ascending: false })
        .limit(20);
      conversationMessages = data || [];
    }

    if (!conversationMessages || conversationMessages.length === 0) {
      // Sem conversa não existe classificação a inventar: devolve a estrutura
      // vazia em vez de afirmar sentimento/prioridade ('neutral'/'normal').
      return jsonResponse({
        ...buildAiEnvelope({ capability: 'ai-auto-tag', status: 'ok', data: { tags: [] } }),
        tags: [],
      }, 200, req);
    }

    const conversationText = conversationMessages
      .map((m) =>
        `${sanitizeString(String(m.sender || 'unknown'), 50)}: ${sanitizeString(String(m.content || ''), 1000)}`
      )
      .join('\n');

    const { data: queues } = await supabase
      .from('queues')
      .select('id, name, description')
      .eq('is_active', true);

    const queueList = queues && queues.length > 0
      ? queues.map((q: { name: string; id: string; description: string | null }) =>
          `- "${q.name}" (${q.id}): ${q.description || 'Sem descrição'}`
        ).join('\n')
      : '';

    log.info("Classifying conversation", { contactId: validContactId, msgCount: conversationMessages.length });

    const { response, data } = await callAiWithTracking({
      functionName: 'ai-auto-tag',
      userId,
      apiKey: LOVABLE_API_KEY,
      body: {
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Você é um classificador avançado de conversas de atendimento ao cliente. Analise a conversa e retorne classificação completa.

Categorias possíveis: suporte_tecnico, vendas, financeiro, reclamacao, elogio, duvida, urgente, cancelamento, troca, entrega, pagamento, produto, servico, feedback, agendamento, orcamento

${queueList ? `FILAS DISPONÍVEIS:\n${queueList}` : ''}

Responda APENAS em JSON:
{
  "tags": [{"name": "tag_name", "confidence": 0.95}],
  "sentiment": "positive|neutral|negative|critical",
  "priority": "low|normal|high|urgent",
  "priority_reason": "motivo da prioridade",
  "summary": "resumo em 1 linha",
  "suggested_queue_id": "uuid da fila sugerida ou null",
  "suggested_queue_reason": "motivo da sugestão",
  "customer_intent": "o que o cliente quer resolver",
  "requires_immediate_attention": false,
  "escalation_reason": null
}`
          },
          { role: "user", content: conversationText }
        ],
        temperature: 0.3,
      },
    });

    if (!response.ok || !data) {
      if (response.status === 429) return errorResponse("Rate limit exceeded", 429, req);
      if (response.status === 402) return errorResponse("Payment required", 402, req);
      throw new Error(`AI error: ${response.status}`);
    }

    const content = (data.choices as Array<{message: {content: string}}>)?.[0]?.message?.content;

    // Extrai o objeto JSON do modelo. O fallback que sintetizava
    // `{ tags: [], sentiment: 'neutral', priority: 'normal' }` foi removido: sem
    // JSON parseável não existe classificação — default inventado é pior que erro.
    let rawOutput: unknown = null;
    if (typeof content === 'string') {
      rawOutput = parseJsonObject(content);
    }

    if (!rawOutput || typeof rawOutput !== 'object') {
      log.warn("Model returned no parseable JSON");
      return jsonResponse(buildAiEnvelope({
        capability: 'ai-auto-tag',
        status: 'error',
        error: 'O modelo não devolveu uma classificação em formato válido; nada foi gravado.',
      }), 502, req);
    }

    // Contrato de saída (IA-025): estrutura ou valor fora do contrato é
    // rejeitado ANTES de qualquer gravação — nunca coagido nem completado.
    const validated = parseModelOutput(AutoTagOutput, rawOutput);
    if (!validated.ok) {
      log.warn("Model output rejected by contract", {
        errors: validated.errors.map((e) => `${e.path}: ${e.message}`).slice(0, 8),
      });
      return jsonResponse(buildAiEnvelope({
        capability: 'ai-auto-tag',
        status: 'error',
        error: 'A resposta do modelo não atende ao contrato de classificação; nada foi gravado.',
        evidence: { errors: validated.errors },
      }), 502, req);
    }

    // O contrato governa as tags; sentimento/prioridade vivem no objeto cru e
    // são normalizados abaixo (vocabulário canônico) — extra keys são ignoradas
    // pelo schema, então lemos do objeto cru.
    const result = rawOutput as Record<string, unknown>;

    // Confiança por tag (IA-023): 0 continua 0 e ausente vai como `null` (a
    // coluna aceita null; o RPC trata). Nada de `Number(...) || 0`.
    const tagPayload: Array<{ name: string; confidence: number | null }> = [];
    for (const tag of validated.data.tags) {
      const name = sanitizeString(tag.name, 100);
      if (!name) continue;
      const confidence = normalizeScore(tag.confidence, { min: 0, max: 1, scale: 'ratio' });
      tagPayload.push({ name, confidence: confidence.value });
    }

    let tagsReplaced = false;
    if (validContactId && tagPayload.length > 0) {
      // Uma única transação no banco (IA-028): apaga SOMENTE as etiquetas de IA
      // e insere as novas, preservando etiqueta humana. O par anterior (delete
      // seguido de insert) não era atômico e ignorava {error} nos dois awaits.
      const { error: tagsError } = await supabase.rpc('replace_ai_conversation_tags', {
        p_contact_id: validContactId,
        p_tags: tagPayload,
      });

      if (tagsError) {
        log.error("Failed to replace AI conversation tags", {
          contactId: validContactId,
          error: tagsError.message,
        });
        return jsonResponse(buildAiEnvelope({
          capability: 'ai-auto-tag',
          status: 'error',
          error: 'Não foi possível gravar as etiquetas de IA; nada foi alterado no contato.',
          evidence: { tagCount: tagPayload.length },
        }), 502, req);
      }
      tagsReplaced = true;
    }

    if (validContactId) {
      // Vocabulário CANÔNICO (IA-021/IA-022): o legado em inglês do modelo é
      // traduzido; valor DESCONHECIDO não é escrito (nada de cair para
      // 'neutral'/'normal') — o campo simplesmente não é tocado.
      const updatedSentiment = normalizeSentiment(result.sentiment);
      const updatedPriority = normalizeOperationalPriority(result.priority);

      const updateData: Record<string, string> = {};
      if (updatedSentiment.value) updateData.ai_sentiment = updatedSentiment.value;
      if (updatedPriority.value) updateData.ai_priority = updatedPriority.value;

      const suggestedQueueId = typeof result.suggested_queue_id === 'string'
        ? result.suggested_queue_id
        : null;

      if (suggestedQueueId && isValidUUID(suggestedQueueId)) {
        // Este client roda com service_role (bypassa RLS e o trigger
        // trg_prevent_contact_queue_hijack, que só restringe role=authenticated).
        // Sem esta checagem, a sugestão da IA (prompt-injetável via mensagens do
        // cliente) poderia rotear o contato para qualquer fila.
        const { data: isAdmin } = await supabase
          .rpc('is_admin_or_supervisor', { _user_id: __uid });

        let canRouteToQueue = Boolean(isAdmin);
        if (!canRouteToQueue) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('user_id', __uid)
            .maybeSingle();

          if (profile) {
            const { data: membership } = await supabase
              .from('queue_members')
              .select('id')
              .eq('queue_id', suggestedQueueId)
              .eq('profile_id', profile.id)
              .eq('is_active', true)
              .maybeSingle();
            canRouteToQueue = Boolean(membership);
          }
        }

        if (canRouteToQueue) {
          updateData.queue_id = suggestedQueueId;
        }
      }

      if (Object.keys(updateData).length > 0) {
        const { error: contactError } = await supabase
          .from('contacts')
          .update(updateData)
          .eq('id', validContactId);
        if (contactError) {
          log.error("Failed to update contact AI fields", {
            contactId: validContactId,
            error: contactError.message,
          });
        }
      }

      if (result.requires_immediate_attention === true && updatedPriority.value === 'urgent') {
        const { data: admins } = await supabase
          .from('user_roles')
          .select('user_id')
          .in('role', ['admin', 'supervisor'])
          .limit(5);

        if (admins) {
          const reason = sanitizeString(result.escalation_reason, 200)
            ?? sanitizeString(result.priority_reason, 200);
          const { error: notifyError } = await supabase.from('notifications').insert(
            admins.map((a: { user_id: string }) => ({
              user_id: a.user_id,
              type: 'urgent_conversation',
              title: '🚨 Conversa Urgente Detectada',
              message: `${sanitizeString(result.summary, 200) || 'Conversa requer atenção imediata'}. Motivo: ${reason || 'Alta prioridade'}`,
              metadata: { contact_id: validContactId, priority: updatedPriority.value, sentiment: updatedSentiment.value },
            }))
          );
          if (notifyError) {
            log.error("Failed to notify admins about urgent conversation", { error: notifyError.message });
          }
        }
      }
    }

    log.done(200, { tags: tagPayload.length, tagsReplaced });
    return jsonResponse({
      ...buildAiEnvelope({
        capability: 'ai-auto-tag',
        status: 'ok',
        data: result,
        evidence: { tagCount: tagPayload.length, tagsReplaced },
      }),
      // Compatibilidade com o front: a chave `tags` segue no topo da resposta.
      tags: validated.data.tags,
    }, 200, req);
  } catch (error: unknown) {
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500, req);
  }
});
