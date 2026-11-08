/**
 * copilot-live — Motor RADAR ao Vivo (CV-141)
 *
 * Recebe um tick do front (contexto da conversa) e devolve insights B·R·I·N·D·E
 * calculados pelo modelo. Utiliza cursor incremental (last_contact_message_at)
 * para processar apenas as mensagens novas, two-tier routing e merge atômico
 * via RPC merge_brinde_state com otimistic locking.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.87.1';
import { allowedOriginFor } from '../_shared/cors-origins.ts';
import { enforceAiCapability } from '../_shared/ai-feature-flags.ts';
import { enforceAiGuards } from '../_shared/ai-guards.ts';
import { generateWithRouting } from '../_shared/ai-generate.ts';
import {
  CopilotLiveOutputSchema,
  buildAiEnvelope,
  parseModelOutput,
  type CopilotLiveOutput,
} from '../_shared/ai-response-contracts.ts';

function cors(req: Request) {
  return {
    'Access-Control-Allow-Origin': allowedOriginFor(req),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function json(body: unknown, status = 200, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json' },
  });
}

interface TickPayload {
  conversation_id: string;
  contact_id?: string;
  last_client_message?: string;
  draft_text?: string;
  brinde_meter?: number;
  sale_stage?: string;
  session_id?: string;
}

/** Padrões de momento-chave — só avaliados em mensagens do CONTATO (from_me: false). */
const KEY_MOMENT_PATTERNS: Array<{ key: string; re: RegExp }> = [
  { key: 'price_request',       re: /\b(preço|valor|quanto|custa|custo|orçamento|proposta)\b/i },
  { key: 'objection',           re: /\b(caro|expensive|não tenho|sem verba|inviável|impossível|muito)\b/i },
  { key: 'buy_signal',          re: /\b(quero|preciso|vou levar|pode enviar|fechar|pedido|comprar|quantidade)\b/i },
  { key: 'competitor_mention',  re: /\b(concorrente|outro fornecedor|cotando|pesquisando preço)\b/i },
];

function detectKeyMoments(messages: Array<{ from_me: boolean; content: string }>): string[] {
  const detected = new Set<string>();
  for (const msg of messages) {
    if (msg.from_me) continue;
    for (const p of KEY_MOMENT_PATTERNS) {
      if (p.re.test(msg.content)) detected.add(p.key);
    }
  }
  return [...detected];
}

/** Nível de roteamento: tier-2 quando há momento-chave de alta prioridade. */
function requiresTier2(keyMoments: string[]): boolean {
  return keyMoments.some((k) => k === 'price_request' || k === 'objection' || k === 'buy_signal' || k === 'competitor_mention');
}

/** Apenas campos de log que não exponham conteúdo de mensagem. */
function logStage(stage: string, ctx: Record<string, unknown>): void {
  console.log(JSON.stringify({ level: 'info', source: 'copilot-live', stage, ...ctx }));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors(req) });
  }

  try {
    // ── Layer 0: feature flag ──────────────────────────────────
    const capabilityBlock = await enforceAiCapability({ functionName: 'copilot-live', req });
    if (capabilityBlock) return capabilityBlock;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── Autenticação ───────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing authorization' }, 401, req);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return json({ error: 'Unauthorized' }, 401, req);
    }

    // ── Layer 1: AI guards (rate limit + daily quota) ──────────
    const guardBlock = await enforceAiGuards({ functionName: 'copilot-live', userId: user.id, req });
    if (guardBlock) return guardBlock;

    // copilot_sessions.profile_id e copilot_insights.profile_id referenciam
    // auth.users(id) — usar user.id para todas as escritas/filtros nessas tabelas.
    const userId = user.id;

    // contacts.assigned_to armazena profiles.id (não auth.users.id).
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!profileRow) {
      return json({ error: 'Profile not found' }, 403, req);
    }
    const profileId = profileRow.id as string;

    const payload: TickPayload = await req.json();

    if (!payload.conversation_id) {
      return json({ error: 'conversation_id is required' }, 400, req);
    }

    const contactId = payload.contact_id ?? userId;

    // ── Sessão: insert atômico com fallback para update ────────
    const { data: insertedSession, error: insertError } = await supabase
      .from('copilot_sessions')
      .insert({
        conversation_id: payload.conversation_id,
        profile_id: userId,
        contact_id: contactId,
        ...(payload.sale_stage && { sale_stage: payload.sale_stage }),
        ...(payload.brinde_meter != null && { brinde_meter: payload.brinde_meter }),
        last_tick_at: new Date().toISOString(),
      })
      .select('id, state_version, brinde_meter, sale_stage, temperature, brinde_evidence, comm_style, decision_role, occasion, stakeholders, last_tick_at')
      .single();

    let session: { id: string; state_version: number; brinde_meter: number; sale_stage: string; temperature: number; brinde_evidence: Record<string, string | null>; comm_style: string[]; decision_role: string | null; occasion: string | null; stakeholders: unknown[] } | null = insertedSession;

    if (insertError) {
      if (insertError.code !== '23505') {
        console.error('session insert error', insertError);
        return json({ error: 'Session error' }, 500, req);
      }

      const updateData: Record<string, unknown> = { last_tick_at: new Date().toISOString() };
      if (payload.sale_stage) updateData.sale_stage = payload.sale_stage;
      if (payload.brinde_meter != null) updateData.brinde_meter = payload.brinde_meter;

      const { data: updatedSession, error: updateError } = await supabase
        .from('copilot_sessions')
        .update(updateData)
        .eq('conversation_id', payload.conversation_id)
        .eq('profile_id', userId)
        .select('id, state_version, brinde_meter, sale_stage, temperature, brinde_evidence, comm_style, decision_role, occasion, stakeholders, last_tick_at')
        .single();

      if (updateError || !updatedSession) {
        // Zero rows: verificar se a conversa foi transferida para este usuário.
        const { data: existingSession } = await supabase
          .from('copilot_sessions')
          .select('contact_id')
          .eq('conversation_id', payload.conversation_id)
          .maybeSingle();

        if (!existingSession || existingSession.contact_id !== contactId) {
          return json({ error: 'Forbidden' }, 403, req);
        }

        // Verificar se o chamador é agora o responsável pelo contato.
        const { data: contact } = await supabase
          .from('contacts')
          .select('assigned_to')
          .eq('id', contactId)
          .maybeSingle();

        if (!contact || contact.assigned_to !== profileId) {
          return json({ error: 'Forbidden' }, 403, req);
        }

        // Transfere ownership para o novo dono.
        const { data: transferredSession, error: transferError } = await supabase
          .from('copilot_sessions')
          .update({ ...updateData, profile_id: userId })
          .eq('conversation_id', payload.conversation_id)
          .select('id, state_version, brinde_meter, sale_stage, temperature, brinde_evidence, comm_style, decision_role, occasion, stakeholders, last_tick_at')
          .single();

        if (transferError || !transferredSession) {
          return json({ error: 'Forbidden' }, 403, req);
        }

        // Transfere também os insights para que o novo dono os veja.
        await supabase
          .from('copilot_insights')
          .update({ profile_id: userId })
          .eq('session_id', transferredSession.id);

        session = transferredSession;
      } else {
        session = updatedSession;
      }
    }

    if (!session) {
      return json({ error: 'Session unavailable' }, 500, req);
    }

    // ── Cursor incremental: carregar apenas mensagens novas ────
    const cursorQuery = supabase
      .from('messages')
      .select('id, content, from_me, created_at')
      .eq('conversation_id', payload.conversation_id)
      .order('created_at', { ascending: false })
      .limit(30);

    const { data: rawMessages } = await cursorQuery;
    const messages = (rawMessages ?? [])
      .reverse()
      .map((m) => ({ id: m.id as string, content: (m.content ?? '') as string, from_me: Boolean(m.from_me), created_at: (m.created_at ?? '') as string }));

    if (messages.length === 0) {
      return json({ ok: true, session_id: session.id, insight: null }, 200, req);
    }

    // ── Detectar momentos-chave (somente msgs do contato) ──────
    const keyMoments = detectKeyMoments(messages);
    const tier2 = requiresTier2(keyMoments);

    logStage('key-moments-detected', {
      session_id: session.id,
      key_moments: keyMoments,
      tier2,
      message_count: messages.length,
    });

    const conversationText = messages
      .map((m) => `${m.from_me ? '[ATENDENTE]' : '[CLIENTE]'}: ${m.content}`)
      .join('\n');

    const briContext = [
      session.brinde_meter > 0 ? `Meter atual: ${session.brinde_meter}/6` : null,
      session.sale_stage ? `Estágio: ${session.sale_stage}` : null,
      session.temperature > 0 ? `Temperatura: ${session.temperature}` : null,
      session.decision_role ? `Papel decisor: ${session.decision_role}` : null,
      session.occasion ? `Ocasião detectada: ${session.occasion}` : null,
    ].filter(Boolean).join('; ');

    const systemPrompt = `Você é o RADAR, copiloto de vendas de brindes corporativos.
Analise a conversa e extraia inteligência B·R·I·N·D·E:
- B = Budget (orçamento do cliente)
- R = Responsible (quem toma a decisão)
- I = Intention (finalidade/evento dos brindes)
- N = Need (quantidade estimada)
- D = Deadline (prazo de entrega necessário)
- E = Engagement (nível de envolvimento/interesse)

Contexto da sessão: ${briContext || 'sessão nova'}.
${tier2 ? `ATENÇÃO — momento-chave detectado: ${keyMoments.join(', ')}. Priorize insight acionável imediato.` : ''}

Responda em português brasileiro. Retorne JSON com:
{
  "insight_type": "suggestion"|"warning"|"info"|"celebration",
  "content": "insight acionável em até 100 palavras",
  "brinde_delta": { campos B·R·I·N·D·E identificados APENAS nesta mensagem },
  "sale_stage": "estágio atualizado SE mudou",
  "temperature": número 0-100 SE diferente do atual,
  "key_moments": ["price_request"|"objection"|"buy_signal"|"competitor_mention"],
  "occasion": "evento/ocasião SE detectado",
  "comm_style": ["formal"|"informal"|"técnico"|"objetivo"],
  "decision_role": "buyer"|"user"|"approver"|"intermediary"|"unknown",
  "stakeholders": [{"name":"...","role":"..."}]
}
Omita chaves sem valor. brinde_delta só inclui campos com valor concreto extraído desta conversa.`;

    const idempotencyKey = `copilot-live:${session.id}:${session.state_version}`;

    logStage('calling-model', {
      session_id: session.id,
      state_version: session.state_version,
      tier2,
      idempotency_key: idempotencyKey,
    });

    const result = await generateWithRouting({
      purpose: 'copilot',
      functionName: 'copilot-live',
      userId,
      idempotencyKey,
      messages: [
        {
          role: 'user',
          content: `Conversa:\n${conversationText}`,
        },
      ],
      system: systemPrompt,
      need: {
        outputTokens: 400,
      },
      temperature: tier2 ? 0.3 : 0.5,
    });

    if (!result.ok || !result.data) {
      logStage('model-error', {
        session_id: session.id,
        status: result.status,
        error_code: result.errorCode,
      });
      return json(
        buildAiEnvelope({ capability: 'copilot-live', status: 'error', error: result.status }),
        502,
        req,
      );
    }

    const validated = parseModelOutput(CopilotLiveOutputSchema, result.data);
    if (!validated.ok) {
      logStage('contract-rejected', {
        session_id: session.id,
        errors: validated.errors?.slice(0, 3),
      });
      return json(
        buildAiEnvelope({ capability: 'copilot-live', status: 'error', error: 'Model output contract violation' }),
        502,
        req,
      );
    }

    const output: CopilotLiveOutput = validated.data;

    if (output.brinde_delta && Object.keys(output.brinde_delta).length > 0) {
      const delta: Record<string, unknown> = {};
      if (output.brinde_delta.budget)      delta['B'] = output.brinde_delta.budget;
      if (output.brinde_delta.responsible) delta['R'] = output.brinde_delta.responsible;
      if (output.brinde_delta.intention)   delta['I'] = output.brinde_delta.intention;
      if (output.brinde_delta.quantity)    delta['N'] = output.brinde_delta.quantity;
      if (output.brinde_delta.deadline)    delta['D'] = output.brinde_delta.deadline;
      if (output.brinde_delta.delivery)    delta['E'] = output.brinde_delta.delivery;

      await supabase.rpc('merge_brinde_state', {
        p_session_id: session.id,
        p_delta:      delta,
        p_version:    session.state_version,
      });
    }

    const sessionUpdate: Record<string, unknown> = {};
    if (output.sale_stage)    sessionUpdate.sale_stage    = output.sale_stage;
    if (output.temperature != null) sessionUpdate.temperature = output.temperature;
    if (output.brinde_delta?.meter != null) sessionUpdate.brinde_meter = output.brinde_delta.meter;
    if (output.occasion)      sessionUpdate.occasion      = output.occasion;
    if (output.decision_role) sessionUpdate.decision_role = output.decision_role;
    if (output.comm_style && output.comm_style.length > 0) sessionUpdate.comm_style = output.comm_style;
    if (output.stakeholders && output.stakeholders.length > 0) sessionUpdate.stakeholders = output.stakeholders;

    if (Object.keys(sessionUpdate).length > 0) {
      await supabase
        .from('copilot_sessions')
        .update(sessionUpdate)
        .eq('id', session.id);
    }

    const { data: insight } = await supabase
      .from('copilot_insights')
      .insert({
        session_id:    session.id,
        profile_id:    userId,
        insight_type:  output.insight_type,
        content:       output.content,
        source:        'edge',
        model_version: `${result.model ?? 'unknown'}`,
        ...(keyMoments.length > 0 && { metadata: { key_moments: keyMoments } }),
      })
      .select('id')
      .single();

    logStage('insight-persisted', {
      session_id:  session.id,
      insight_id:  insight?.id ?? null,
      insight_type: output.insight_type,
    });

    return json(
      {
        ok:          true,
        session_id:  session.id,
        insight: {
          id:           insight?.id ?? null,
          type:         output.insight_type,
          content:      output.content,
          key_moments:  keyMoments,
          brinde_delta: output.brinde_delta ?? null,
          sale_stage:   output.sale_stage ?? session.sale_stage,
          temperature:  output.temperature ?? session.temperature,
        },
      },
      200,
      req,
    );
  } catch (err) {
    console.error('copilot-live error', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
