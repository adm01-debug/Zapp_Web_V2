/**
 * copilot-live — Edge Function stub (CV-141)
 *
 * Recebe um tick do RADAR (contexto da conversa) e devolve insights
 * calculados no servidor. Hoje retorna resposta estática para que o
 * front possa ser deployado sem dependência de LLM; a lógica real
 * será adicionada iterativamente.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.87.1';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TickPayload {
  session_id?: string;
  conversation_id: string;
  last_client_message?: string;
  draft_text?: string;
  brinde_meter?: number;
  sale_stage?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const payload: TickPayload = await req.json();

    if (!payload.conversation_id) {
      return new Response(JSON.stringify({ error: 'conversation_id is required' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Resolve o contact_id real a partir da conversa antes do INSERT;
    // contact_id é NOT NULL na tabela e precisa do valor correto na criação.
    const { data: conversation } = await supabase
      .from('conversations')
      .select('contact_id')
      .eq('id', payload.conversation_id)
      .maybeSingle();
    const contactId = conversation?.contact_id ?? user.id;

    // INSERT atômico: seta profile_id na primeira chamada e não pode ser
    // sobrescrito. Em conflito (23505, unique conversation_id), cai em UPDATE
    // condicional guardado por .eq('profile_id', user.id) — 0 rows = ou dono
    // diferente, ou conversa foi transferida para este usuário.
    // Elimina a janela de corrida do padrão SELECT+upsert anterior.
    const { data: insertedSession, error: insertError } = await supabase
      .from('copilot_sessions')
      .insert({
        conversation_id: payload.conversation_id,
        profile_id: user.id,
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
      } else {
        // Conflito: atualiza apenas campos não-proprietários, ownership guardado
        // por profile_id — 0 rows significa que outro usuário é o dono,
        // ou a conversa foi transferida para este usuário (ver abaixo).
        const updateData: Record<string, unknown> = {
          last_tick_at: new Date().toISOString(),
        };
        if (payload.sale_stage) updateData.sale_stage = payload.sale_stage;
        if (payload.brinde_meter != null) updateData.brinde_meter = payload.brinde_meter;

        const { data: updatedSession, error: updateError } = await supabase
          .from('copilot_sessions')
          .update(updateData)
          .eq('conversation_id', payload.conversation_id)
          .eq('profile_id', user.id)
          .select('id')
          .single();

        if (updateError || !updatedSession) {
          // Zero rows: ou o dono da sessão é outro usuário, ou a conversa foi
          // transferida para este usuário via transfer_conversation (que atualiza
          // contacts.assigned_to mas não copilot_sessions.profile_id).
          // Verificamos se o chamador é agora o responsável pelo contato.
          const { data: contact } = await supabase
            .from('contacts')
            .select('assigned_to')
            .eq('id', contactId)
            .maybeSingle();

          if (!contact || contact.assigned_to !== user.id) {
            return new Response(JSON.stringify({ error: 'Forbidden' }), {
              status: 403,
              headers: { ...CORS, 'Content-Type': 'application/json' },
            });
          }

          // Conversa foi transferida: transfere ownership da sessão para o novo dono.
          const { data: transferredSession, error: transferError } = await supabase
            .from('copilot_sessions')
            .update({ ...updateData, profile_id: user.id })
            .eq('conversation_id', payload.conversation_id)
            .select('id')
            .single();

          if (transferError || !transferredSession) {
            return new Response(JSON.stringify({ error: 'Forbidden' }), {
              status: 403,
              headers: { ...CORS, 'Content-Type': 'application/json' },
            });
          }
          session = transferredSession;
        } else {
          session = updatedSession;
        }
      }
    }

    // Stub insight — real LLM call replaced in next iteration
    const insight = {
      type: 'suggestion' as const,
      content: 'Continue qualificando: pergunte sobre orçamento e quantidade.',
      source: 'edge' as const,
    };

    if (session?.id) {
      await supabase.from('copilot_insights').insert({
        session_id: session.id,
        profile_id: user.id,
        insight_type: insight.type,
        content: insight.content,
        source: insight.source,
        model_version: 'stub-v1',
      });
    }

    return new Response(
      JSON.stringify({ ok: true, session_id: session?.id ?? null, insight }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('copilot-live error', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
