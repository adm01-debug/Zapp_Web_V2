/**
 * copilot-live — Edge Function stub (CV-141)
 *
 * Recebe um tick do RADAR (contexto da conversa) e devolve insights
 * calculados no servidor. Hoje retorna resposta estática para que o
 * front possa ser deployado sem dependência de LLM; a lógica real
 * será adicionada iterativamente.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.87.1';
import { allowedOriginFor } from '../_shared/cors-origins.ts';
import { generateWithRouting } from '../_shared/ai-generate.ts';

function cors(req: Request) {
  return {
    'Access-Control-Allow-Origin': allowedOriginFor(req),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

interface TickPayload {
  session_id?: string;
  conversation_id: string;
  contact_id?: string;
  last_client_message?: string;
  draft_text?: string;
  brinde_meter?: number;
  sale_stage?: string;
  messages?: Array<{ content: string; sender: string }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors(req) });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...cors(req), 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...cors(req), 'Content-Type': 'application/json' },
      });
    }

    // copilot_sessions.profile_id e copilot_insights.profile_id referenciam
    // auth.users(id) — usar user.id para todas as escritas/filtros nessas tabelas.
    const userId = user.id;

    // contacts.assigned_to armazena profiles.id (não auth.users.id).
    // Resolver o profiles.id do chamador apenas para comparar com assigned_to.
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!profileRow) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 403,
        headers: { ...cors(req), 'Content-Type': 'application/json' },
      });
    }
    // profileId é usado SOMENTE para comparar com contacts.assigned_to.
    const profileId = profileRow.id as string;

    const payload: TickPayload = await req.json();

    if (!payload.conversation_id) {
      return new Response(JSON.stringify({ error: 'conversation_id is required' }), {
        status: 400,
        headers: { ...cors(req), 'Content-Type': 'application/json' },
      });
    }

    // contact_id vem do payload (o front já conhece); fallback para userId
    // apenas como última instância — garante NOT NULL sem depender de tabela
    // auxiliar que pode não existir em todos os deploys.
    const contactId = payload.contact_id ?? userId;

    // INSERT atômico: seta profile_id = userId na primeira chamada.
    // Em conflito (23505, unique conversation_id), cai em UPDATE condicional
    // guardado por .eq('profile_id', userId).
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
      .select('id')
      .single();

    let session: { id: string } | null = insertedSession;

    if (insertError) {
      if (insertError.code !== '23505') {
        console.error('session insert error', insertError);
        return new Response(JSON.stringify({ error: 'Session error' }), {
          status: 500,
          headers: { ...cors(req), 'Content-Type': 'application/json' },
        });
      } else {
        // Conflito: atualiza apenas campos não-proprietários, ownership guardado
        // por profile_id = userId — 0 rows = outro usuário é o dono, ou
        // conversa foi transferida para este usuário.
        const updateData: Record<string, unknown> = {
          last_tick_at: new Date().toISOString(),
        };
        if (payload.sale_stage) updateData.sale_stage = payload.sale_stage;
        if (payload.brinde_meter != null) updateData.brinde_meter = payload.brinde_meter;

        const { data: updatedSession, error: updateError } = await supabase
          .from('copilot_sessions')
          .update(updateData)
          .eq('conversation_id', payload.conversation_id)
          .eq('profile_id', userId)
          .select('id')
          .single();

        if (updateError || !updatedSession) {
          // Zero rows: ou o dono é outro usuário, ou a conversa foi transferida.

          // Antes de verificar contacts, confirmar que contactId do payload
          // bate com o que está gravado na sessão — evita session takeover
          // via contactId fabricado pelo chamador.
          const { data: existingSession } = await supabase
            .from('copilot_sessions')
            .select('contact_id')
            .eq('conversation_id', payload.conversation_id)
            .maybeSingle();

          if (!existingSession || existingSession.contact_id !== contactId) {
            return new Response(JSON.stringify({ error: 'Forbidden' }), {
              status: 403,
              headers: { ...cors(req), 'Content-Type': 'application/json' },
            });
          }

          // Verificar se o chamador é agora o responsável pelo contato.
          // contacts.assigned_to armazena profiles.id — comparar com profileId.
          const { data: contact } = await supabase
            .from('contacts')
            .select('assigned_to')
            .eq('id', contactId)
            .maybeSingle();

          if (!contact || contact.assigned_to !== profileId) {
            return new Response(JSON.stringify({ error: 'Forbidden' }), {
              status: 403,
              headers: { ...cors(req), 'Content-Type': 'application/json' },
            });
          }

          // Conversa transferida: transfere ownership para o novo dono (userId).
          const { data: transferredSession, error: transferError } = await supabase
            .from('copilot_sessions')
            .update({ ...updateData, profile_id: userId })
            .eq('conversation_id', payload.conversation_id)
            .select('id')
            .single();

          if (transferError || !transferredSession) {
            return new Response(JSON.stringify({ error: 'Forbidden' }), {
              status: 403,
              headers: { ...cors(req), 'Content-Type': 'application/json' },
            });
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
    }

    // Gera sugestão contextual via AI
    const insight = await generateLiveSuggestion({
      lastClientMessage: payload.last_client_message,
      draftText: payload.draft_text,
      saleStage: payload.sale_stage,
      userId,
    });

    if (session?.id) {
      await supabase.from('copilot_insights').insert({
        session_id: session.id,
        profile_id: userId,
        insight_type: 'suggestion',
        content: insight.content,
        source: 'edge',
        model_version: insight.modelVersion,
      });
    }

    return new Response(
      JSON.stringify({ ok: true, session_id: session?.id ?? null, insight }),
      { headers: { ...cors(req), 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('copilot-live error', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...cors(req), 'Content-Type': 'application/json' },
    });
  }
});

/* ——— AI suggestion generator ——— */

const STAGE_LABELS: Record<string, string> = {
  qualificacao: 'qualificação',
  apresentacao: 'apresentação',
  negociacao: 'negociação',
  fechamento: 'fechamento',
  pos_venda: 'pós-venda',
};

async function generateLiveSuggestion(opts: {
  lastClientMessage?: string;
  draftText?: string;
  saleStage?: string;
  userId: string;
}): Promise<{ content: string; modelVersion: string }> {
  const stageLabel = opts.saleStage ? (STAGE_LABELS[opts.saleStage] ?? opts.saleStage) : 'indefinido';

  const system = `Você é o Copiloto RADAR, assistente de vendas de brindes corporativos B2B.
Analise o contexto da conversa e dê UMA sugestão objetiva para o vendedor avançar no estágio de ${stageLabel}.
A sugestão deve ser direta (máx. 120 caracteres), acionável e específica para o momento da conversa.
Responda APENAS com o texto da sugestão, sem prefixos, aspas ou explicação.`;

  const userContent = [
    opts.lastClientMessage ? `Última mensagem do cliente: "${opts.lastClientMessage}"` : null,
    opts.draftText ? `Rascunho do vendedor: "${opts.draftText}"` : null,
  ].filter(Boolean).join('\n') || `Estágio atual: ${stageLabel}. Sugira uma próxima ação.`;

  try {
    const { response, data } = await generateWithRouting({
      purpose: 'copilot',
      functionName: 'copilot-live',
      userId: opts.userId,
      system,
      messages: [{ role: 'user', content: userContent }],
      temperature: 0.4,
    });

    if (!response.ok || !data) {
      return fallbackSuggestion(opts.saleStage);
    }

    const content = (data as { choices?: Array<{ message?: { content?: unknown } }> })
      .choices?.[0]?.message?.content;
    const text = typeof content === 'string' ? content.trim().slice(0, 200) : '';

    if (!text) return fallbackSuggestion(opts.saleStage);

    const modelUsed = (data as { model?: string }).model ?? 'unknown';
    return { content: text, modelVersion: modelUsed };
  } catch {
    return fallbackSuggestion(opts.saleStage);
  }
}

function fallbackSuggestion(stage?: string): { content: string; modelVersion: string } {
  const fallbacks: Record<string, string> = {
    qualificacao: 'Pergunte sobre o evento e o número de participantes.',
    apresentacao: 'Apresente até 3 opções alinhadas ao orçamento do cliente.',
    negociacao: 'Destaque o custo por uso — não o custo total.',
    fechamento: 'Pergunte o que falta para avançar com o pedido.',
    pos_venda: 'Confirme a satisfação e solicite indicação.',
  };
  return {
    content: fallbacks[stage ?? ''] ?? 'Qualifique o lead com perguntas abertas.',
    modelVersion: 'fallback-v1',
  };
}
