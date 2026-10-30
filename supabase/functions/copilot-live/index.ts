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

    // Guard: verifica ownership de sessão existente antes do upsert.
    // Sem isso, qualquer autenticado pode sobrescrever profile_id de outro vendedor
    // passando o conversation_id da vítima (o conflict target é só conversation_id).
    const { data: existingSession } = await supabase
      .from('copilot_sessions')
      .select('profile_id')
      .eq('conversation_id', payload.conversation_id)
      .maybeSingle();

    if (existingSession && existingSession.profile_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Upsert copilot session
    const { data: session, error: sessionError } = await supabase
      .from('copilot_sessions')
      .upsert(
        {
          conversation_id: payload.conversation_id,
          profile_id: user.id,
          contact_id: user.id, // placeholder — enriched by future tick
          ...(payload.sale_stage && { sale_stage: payload.sale_stage }),
          ...(payload.brinde_meter !== undefined && { brinde_meter: payload.brinde_meter }),
          last_tick_at: new Date().toISOString(),
        },
        { onConflict: 'conversation_id', ignoreDuplicates: false }
      )
      .select('id')
      .single();

    if (sessionError) {
      console.error('session upsert error', sessionError);
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
