import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const TranscriptSchema = z.object({
  transcript: z.string().min(1).max(2000).transform(s => s.trim()),
});

const VALID_ACTIONS = new Set(['search', 'filter', 'navigate', 'sort', 'clear', 'answer']);
const VALID_ROUTES = new Set([
  'inbox', 'dashboard', 'contacts', 'campaigns', 'team', 'settings',
  'sentiment-alerts', 'chatbot-builder', 'queues', 'knowledge-base',
  'calls', 'automations', 'groups', 'tags', 'wallet', 'crm360',
  'reports', 'security',
]);
const VALID_SORT = new Set(['newest', 'oldest', 'name', 'priority']);
const VALID_SENTIMENT = new Set(['positive', 'negative', 'neutral']);

const SYSTEM_PROMPT = `Você é um assistente de voz inteligente para um sistema de CRM e atendimento ao cliente via WhatsApp.
Sua função é interpretar comandos de voz e retornar uma ação estruturada.

CONTEXTO: Sistema completo de gestão de conversas (inbox), contatos, campanhas, equipe de agentes, filas de atendimento, análise de sentimento, chatbot builder, dashboards de métricas, base de conhecimento, automações, VoIP, grupos de WhatsApp e CRM 360°.

AÇÕES DISPONÍVEIS:
- search: Buscar contatos, conversas ou informações
- navigate: Navegar para uma seção do sistema
- filter: Filtrar conversas ou contatos por critérios
- sort: Ordenar listas por critérios específicos
- clear: Limpar filtros ou busca atual
- answer: Responder uma pergunta sobre o sistema ou dar informações gerais

ROTAS DISPONÍVEIS PARA NAVEGAÇÃO (use exatamente o valor da rota):
- inbox (caixa de entrada, mensagens)
- dashboard (painel, métricas, visão geral)
- contacts (contatos, clientes)
- campaigns (campanhas, disparos)
- team (equipe, agentes, time)
- settings (configurações, ajustes)
- sentiment-alerts (alertas de sentimento, humor)
- chatbot-builder (chatbot, fluxos, bot)
- queues (filas, filas de atendimento)
- knowledge-base (base de conhecimento, FAQ, artigos)
- calls (chamadas, VoIP, telefone)
- automations (automações, regras automáticas)
- groups (grupos, grupos de WhatsApp)
- tags (tags, etiquetas, marcadores)
- wallet (carteira, wallet, carteira de clientes)
- crm360 (CRM, CRM 360, visão 360)
- reports (relatórios, reports, análises)
- security (segurança, proteção, auditoria, logs de auditoria, audit)

REGRA IMPORTANTE: Quando o usuário pedir para "abrir", "ir para", "mostrar" ou "navegar para" qualquer seção listada acima, SEMPRE use action="navigate" com a rota correspondente. NUNCA use action="answer" para pedidos de navegação.

Responda SEMPRE usando a ferramenta execute_voice_command.
Seja conciso, amigável e responda em português brasileiro.
Máximo 2 frases na resposta.`;

/** Sanitize AI output to only allow valid enum values */
function sanitizeResult(raw: Record<string, unknown>): Record<string, unknown> {
  const action = VALID_ACTIONS.has(String(raw.action)) ? String(raw.action) : 'answer';
  const response = String(raw.response || 'Desculpe, não entendi o comando.').slice(0, 500);

  const data: Record<string, unknown> = {};
  const rawData = (raw.data && typeof raw.data === 'object') ? raw.data as Record<string, unknown> : {};

  if (typeof rawData.query === 'string') data.query = rawData.query.slice(0, 200);
  if (typeof rawData.route === 'string' && VALID_ROUTES.has(rawData.route)) data.route = rawData.route;
  if (typeof rawData.sortBy === 'string' && VALID_SORT.has(rawData.sortBy)) data.sortBy = rawData.sortBy;

  if (rawData.filters && typeof rawData.filters === 'object') {
    const f = rawData.filters as Record<string, unknown>;
    const filters: Record<string, unknown> = {};
    if (typeof f.sentiment === 'string' && VALID_SENTIMENT.has(f.sentiment)) filters.sentiment = f.sentiment;
    if (typeof f.assigned === 'boolean') filters.assigned = f.assigned;
    if (typeof f.unread === 'boolean') filters.unread = f.unread;
    if (typeof f.contactType === 'string') filters.contactType = String(f.contactType).slice(0, 50);
    if (typeof f.category === 'string') filters.category = String(f.category).slice(0, 50);
    if (typeof f.status === 'string') filters.status = String(f.status).slice(0, 50);
    if (Object.keys(filters).length > 0) data.filters = filters;
  }

  return { action, response, data };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("voice-agent");

  try {
    const LOVABLE_API_KEY = requireEnv('LOVABLE_API_KEY');

    const body = await req.json().catch(() => null);
    const parsed = TranscriptSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(JSON.stringify(parsed.error.flatten().fieldErrors), 400, req);
    }

    const { transcript } = parsed.data;
    log.info("Processing voice command", { transcript: transcript.substring(0, 100) });

    // Timeout for AI gateway call
    const aiController = new AbortController();
    const aiTimeout = setTimeout(() => aiController.abort(), 12000);

    let response: Response;
    try {
      response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: transcript },
          ],
          tools: [{
            type: 'function',
            function: {
              name: 'execute_voice_command',
              description: 'Execute a voice command from the user in the CRM system',
              parameters: {
                type: 'object',
                properties: {
                  action: {
                    type: 'string',
                    enum: ['search', 'filter', 'navigate', 'sort', 'clear', 'answer'],
                  },
                  response: {
                    type: 'string',
                    description: 'Friendly response to speak back in Portuguese (max 2 sentences)',
                  },
                  data: {
                    type: 'object',
                    properties: {
                      query: { type: 'string', description: 'Search query text' },
                      route: {
                        type: 'string',
                        enum: [...VALID_ROUTES],
                      },
                      sortBy: {
                        type: 'string',
                        enum: ['newest', 'oldest', 'name', 'priority'],
                      },
                      filters: {
                        type: 'object',
                        properties: {
                          sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
                          assigned: { type: 'boolean' },
                          unread: { type: 'boolean' },
                          contactType: { type: 'string' },
                          category: { type: 'string' },
                          status: { type: 'string' },
                        },
                      },
                    },
                  },
                },
                required: ['action', 'response'],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: 'function', function: { name: 'execute_voice_command' } },
        }),
        signal: aiController.signal,
      });
    } catch (fetchErr) {
      clearTimeout(aiTimeout);
      const isTimeout = fetchErr instanceof Error && fetchErr.name === 'AbortError';
      log.error('AI fetch failed', { timeout: isTimeout });
      return jsonResponse(
        { action: 'answer', response: isTimeout ? 'A IA demorou para responder. Tente novamente.' : 'Erro ao processar comando.', data: {} },
        200,
        req
      );
    } finally {
      clearTimeout(aiTimeout);
    }

    if (!response.ok) {
      if (response.status === 429) return errorResponse('Rate limit exceeded', 429, req);
      if (response.status === 402) return errorResponse('AI credits exhausted', 402, req);
      const errText = await response.text().catch(() => '');
      log.error('AI gateway error', { status: response.status, detail: errText.substring(0, 300) });
      // Return graceful fallback instead of 500
      return jsonResponse(
        { action: 'answer', response: 'Desculpe, houve um problema com a IA. Tente novamente.', data: {} },
        200,
        req
      );
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    let rawResult: Record<string, unknown>;
    if (toolCall?.function?.arguments) {
      try { rawResult = JSON.parse(toolCall.function.arguments); } catch {
        rawResult = { action: 'answer', response: 'Desculpe, não entendi o comando.' };
      }
    } else {
      const content = aiData.choices?.[0]?.message?.content || '';
      try { rawResult = JSON.parse(content); } catch {
        rawResult = { action: 'answer', response: content || 'Desculpe, não entendi.' };
      }
    }

    // Sanitize ALL AI output before returning to client
    const result = sanitizeResult(rawResult);

    log.done(200, { action: result.action });
    return jsonResponse(result, 200, req);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error('Unhandled error', { error: msg });
    // Always return a usable response
    return jsonResponse(
      { action: 'answer', response: 'Erro inesperado. Tente novamente.', data: {} },
      200,
      req
    );
  }
});
