/**
 * CV-021 — copilot-live edge function
 *
 * Processa um tick do copiloto: recebe o estado atual da sessão,
 * gera insights (local ou via AI) e persiste em copilot_insights.
 *
 * Ativado pelo trigger copilot_tick_trigger após mensagem elegível.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface TickPayload {
  session_id: string;
  conversation_id: string;
  profile_id: string;
  messages: Array<{ content: string; sender: 'contact' | 'vendor'; created_at: string }>;
  state_version: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }

  try {
    const payload: TickPayload = await req.json();
    const { session_id, profile_id, messages, state_version } = payload;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Geração local de insight (placeholder — AI call será adicionada em CV-022+)
    const lastContact = messages.filter((m) => m.sender === 'contact').slice(-1)[0];
    if (!lastContact) {
      return new Response(JSON.stringify({ ok: true, insights: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const insight = buildLocalInsight(lastContact.content);
    if (!insight) {
      return new Response(JSON.stringify({ ok: true, insights: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { error } = await supabase.from('copilot_insights').insert({
      session_id,
      profile_id,
      insight_type: insight.type,
      content: insight.content,
      source: 'edge',
      state_version,
    });

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, insights: 1 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('copilot-live error:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

function buildLocalInsight(
  text: string,
): { type: string; content: string } | null {
  const t = text.toLowerCase();
  if (/quanto custa|qual o pre[cç]o|valor/.test(t)) {
    return { type: 'suggestion', content: 'Pergunta de preço detectada — apresente faixa de valor por quantidade antes de dar número exato.' };
  }
  if (/vou pensar|depois vejo|não sei ainda|qualquer coisa/.test(t)) {
    return { type: 'alert', content: 'Sinal de esfriamento — cliente em modo "vou pensar". Faça uma pergunta diagnóstica para entender a real objeção.' };
  }
  if (/quando fica pronto|prazo|data do evento|para quando/.test(t)) {
    return { type: 'next_action', content: 'Calcule o prazo real: data do evento − frete − produção − gravação − aprovação de arte.' };
  }
  if (/concorrente|outro fornecedor|outro site|achei mais barato/.test(t)) {
    return { type: 'objection', content: 'Concorrência detectada — destaque diferencial de prazo e qualidade de gravação, não entre em guerra de preço.' };
  }
  return null;
}
