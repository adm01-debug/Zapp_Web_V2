import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, requireAuth } from "../_shared/validation.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const authCheck = await requireAuth(req);
  if (authCheck instanceof Response) return authCheck;
  const __uid = (authCheck as { userId: string }).userId;

  const log = new Logger("voice-copilot-action");

  try {
    const { action, params } = await req.json();

    const supabaseUrl = requireEnv('SUPABASE_URL');
    const supabaseKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    log.info("Processing voice action", { action });

    let result: unknown;

    switch (action) {
      case 'search_contacts': {
        const { query } = params;
        // Sanitize input: remove SQL wildcards and special chars
        const sanitized = String(query || '').replace(/[%_\\]/g, '').trim();
        if (!sanitized) {
          result = [];
          break;
        }
        const { data, error } = await supabase
          .from('contacts')
          .select('id, name, phone, email, company, ai_sentiment, assigned_to')
          .or(`name.ilike.%${sanitized}%,phone.ilike.%${sanitized}%,email.ilike.%${sanitized}%`)
          .limit(5);
        if (error) throw error;
        result = data;
        break;
      }

      case 'get_conversation_summary': {
        const { contactId } = params;
        const { data: analysis } = await supabase
          .from('conversation_analyses')
          .select('summary, sentiment, key_points, urgency')
          .eq('contact_id', contactId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        result = analysis || { summary: 'Nenhuma análise disponível para este contato.' };
        break;
      }

      case 'get_dashboard_metrics': {
        const { count: totalContacts } = await supabase
          .from('contacts')
          .select('*', { count: 'exact', head: true });

        const { count: openConversations } = await supabase
          .from('contacts')
          .select('*', { count: 'exact', head: true })
          .not('ai_sentiment', 'is', null);

        const { count: negativeAlerts } = await supabase
          .from('contacts')
          .select('*', { count: 'exact', head: true })
          .in('ai_sentiment', ['negative', 'very_negative']);

        result = {
          totalContacts: totalContacts || 0,
          openConversations: openConversations || 0,
          negativeAlerts: negativeAlerts || 0,
        };
        break;
      }

      case 'assign_conversation': {
        const { contactId, agentName } = params;
        // Find agent by name
        const { data: agent } = await supabase
          .from('profiles')
          .select('id, name')
          .ilike('name', `%${agentName}%`)
          .eq('is_active', true)
          .limit(1)
          .single();

        if (!agent) {
          result = { success: false, message: `Agente "${agentName}" não encontrado.` };
          break;
        }

        const { error } = await supabase
          .from('contacts')
          .update({ assigned_to: agent.id })
          .eq('id', contactId);

        result = error
          ? { success: false, message: 'Erro ao atribuir conversa.' }
          : { success: true, message: `Conversa atribuída para ${agent.name}.` };
        break;
      }

      case 'create_note': {
        const { contactId, content } = params;
        // authorId nunca vem do body: o client pode forjar autoria de nota
        // interna. Resolve o profile do usuário já autenticado por requireAuth.
        const { data: authorProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', __uid)
          .maybeSingle();

        if (!authorProfile) {
          result = { success: false, message: 'Usuário sem perfil associado.' };
          break;
        }

        const { error } = await supabase
          .from('contact_notes')
          .insert({ contact_id: contactId, content, author_id: authorProfile.id });
        result = error
          ? { success: false, message: 'Erro ao criar nota.' }
          : { success: true, message: 'Nota criada com sucesso.' };
        break;
      }

      case 'list_agents': {
        const { data } = await supabase
          .from('profiles')
          .select('id, name, role, is_active, department')
          .eq('is_active', true)
          .order('name');
        result = data || [];
        break;
      }

      case 'get_queue_status': {
        const { data } = await supabase
          .from('queues')
          .select('id, name, description, is_active');
        result = data || [];
        break;
      }

      default:
        result = { error: `Ação desconhecida: ${action}` };
    }

    log.done(200, { action });
    return jsonResponse({ result }, 200, req);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error("Unhandled error", { error: msg });
    return errorResponse(msg, 500, req);
  }
});
