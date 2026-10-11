import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, requireAuth, createAuthedClient } from "../_shared/validation.ts";
import { decideReassignConversation, REASSIGN_DENIED_MESSAGE } from "../_shared/voice-copilot-authz.ts";
import { escapeOrFilterValue } from "../_shared/postgrest-filters.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";

/**
 * Superfície mínima do client autenticado (supabase-js) usada por
 * `searchEmailThreads`. Duck-typed de propósito: o teste unitário injeta um
 * fake que emula a RLS real que o `authedClient` (anon key + JWT do caller)
 * aplica nas tabelas de e-mail.
 */
export interface EmailSearchQueryBuilder {
  select(columns: string): EmailSearchQueryBuilder;
  or(filter: string): EmailSearchQueryBuilder;
  eq(column: string, value: unknown): EmailSearchQueryBuilder;
  ilike(column: string, pattern: string): EmailSearchQueryBuilder;
  order(column: string, options?: { ascending?: boolean }): EmailSearchQueryBuilder;
  limit(count: number): PromiseLike<{ data: unknown; error: unknown }>;
}

export interface EmailSearchDb {
  from(table: string): EmailSearchQueryBuilder;
}

export interface EmailThreadSummary {
  id: string;
  subject: string;
  snippet: string;
  is_unread: boolean;
  last_message_at: string;
  contact_id: string | null;
}

/**
 * Mesma sanitização de `search_contacts`: remove curingas do PostgREST (% _ \)
 * e apara espaços, para que o termo do usuário não quebre/escale o filtro.
 * Traço do teclado iOS (em-dash U+2014 e vizinhos: en-dash, hífen duplo,
 * sinal de menos) vira hífen ASCII, para não quebrar o `ilike` do assunto.
 */
export function sanitizeEmailSearchTerm(value: unknown): string {
  return String(value ?? '')
    .replace(/[—–―−]/g, '-')
    .replace(/[%_\\]/g, '')
    .trim();
}

/**
 * Ação `search_emails` (Voz/Co-piloto): busca threads por contato (nome/e-mail)
 * e/ou por texto do assunto. Parte SEMPRE do `authedClient` — as RLS de
 * `email_threads`/`email_messages`/`contacts` (mig 20260403105341) filtram por
 * `auth.uid()`, então um contato/conta alheia nunca aparece. O client
 * service_role NÃO é usado aqui. Sem termo útil, devolve [] e não consulta.
 */
export async function searchEmailThreads(
  authedClient: EmailSearchDb,
  params: { query?: unknown; subjectQuery?: unknown; contactQuery?: unknown },
): Promise<EmailThreadSummary[]> {
  const subjectTerm = sanitizeEmailSearchTerm(params.subjectQuery ?? params.query);
  const contactTerm = sanitizeEmailSearchTerm(params.contactQuery);
  if (!subjectTerm && !contactTerm) return [];

  // Resolve o contato visível (RLS) quando o usuário informou nome/e-mail.
  // Exatamente UM contato → composição `.eq('contact_id', id)` (+ `.ilike`
  // no assunto quando houver termo). Múltiplos → ambíguo: [] com warn, sem
  // tocar em email_threads (nada de `.or(contact_id.in.(...))`: uuid cru sem
  // aspas quebrava o PostgREST com 400).
  let contactId: string | null = null;
  if (contactTerm) {
    const cq = escapeOrFilterValue(`%${contactTerm}%`);
    const { data, error } = await authedClient
      .from('contacts')
      .select('id')
      .or(`name.ilike.${cq},email.ilike.${cq}`)
      .limit(25);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ id: string }>;
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) {
      // Nenhum contato visível casou. Só segue se houver termo de assunto.
      if (!subjectTerm) return [];
    } else if (ids.length === 1) {
      contactId = ids[0];
    } else {
      console.warn(
        `[search_emails] contato ambíguo: ${ids.length} contatos visíveis casaram; devolvendo [] sem consultar threads`,
      );
      return [];
    }
  }

  if (contactId !== null) {
    let qb = authedClient
      .from('email_threads')
      .select('id, subject, snippet, is_unread, last_message_at, contact_id')
      .eq('contact_id', contactId);
    if (subjectTerm) {
      qb = qb.ilike('subject', `%${subjectTerm}%`);
    }
    const { data, error } = await qb
      .order('last_message_at', { ascending: false })
      .limit(5);
    if (error) throw error;
    return (data ?? []) as EmailThreadSummary[];
  }

  const orParts: string[] = [];
  if (subjectTerm) {
    const q = escapeOrFilterValue(`%${subjectTerm}%`);
    orParts.push(`subject.ilike.${q}`, `snippet.ilike.${q}`);
  }

  const { data, error } = await authedClient
    .from('email_threads')
    .select('id, subject, snippet, is_unread, last_message_at, contact_id')
    .or(orParts.join(','))
    .order('last_message_at', { ascending: false })
    .limit(5);
  if (error) throw error;
  return (data ?? []) as EmailThreadSummary[];
}

export async function handleVoiceCopilotActionRequest(req: Request): Promise<Response> {
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
    // Client autenticado como o caller: usado nas leituras abaixo para que a
    // RLS real de `contacts`/`profiles` filtre por auth.uid(), em vez do
    // client service_role (que bypassa RLS e vazaria PII/dashboard para
    // qualquer usuário autenticado do app, não só agentes).
    const authedClient = await createAuthedClient(req);

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
        const q = escapeOrFilterValue(`%${sanitized}%`);
        const { data, error } = await authedClient
          .from('contacts')
          .select('id, name, phone, email, company, ai_sentiment, assigned_to')
          .or(`name.ilike.${q},phone.ilike.${q},email.ilike.${q}`)
          .limit(5);
        if (error) throw error;
        result = data;
        break;
      }

      case 'search_emails': {
        // Leitura via authedClient (RLS): nunca service_role.
        result = await searchEmailThreads(authedClient as unknown as EmailSearchDb, params);
        break;
      }

      case 'get_conversation_summary': {
        const { contactId } = params;
        const { data: analysis } = await authedClient
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
        const { count: totalContacts } = await authedClient
          .from('contacts')
          .select('*', { count: 'exact', head: true });

        // Conversa aberta = MESMA definicao do dashboard (RPC
        // dashboard_contact_counts, campo 'open': assigned_to IS NOT NULL e
        // conversation_status = 'open'). A versao anterior contava contato com
        // ai_sentiment preenchido — o default 'neutro' fabricado de TODO
        // contato, que passou a ser ausencia (NULL) e zeraria a metrica.
        const { count: openConversations } = await authedClient
          .from('contacts')
          .select('*', { count: 'exact', head: true })
          .not('assigned_to', 'is', null)
          .eq('conversation_status', 'open');

        // Alertas negativos: vocabulario canonico pt-BR (positivo|neutro|
        // negativo|critico). Os literais EN ('negative'/'very_negative') nao
        // existem mais no banco e nunca casavam (filtro morto); 'critico' e o
        // pior nivel canonico e substitui o extinto 'very_negative'.
        const { count: negativeAlerts } = await authedClient
          .from('contacts')
          .select('*', { count: 'exact', head: true })
          .in('ai_sentiment', ['negativo', 'critico']);

        result = {
          totalContacts: totalContacts || 0,
          openConversations: openConversations || 0,
          negativeAlerts: negativeAlerts || 0,
        };
        break;
      }

      case 'assign_conversation': {
        const { contactId, agentName } = params;

        // Este client roda com service_role (bypassa RLS). Sem esta checagem,
        // qualquer usuário autenticado poderia reatribuir um contato que não
        // enxerga — a RLS real de `contacts` é a fonte de verdade de
        // visibilidade (mesmo padrão dos casos de leitura acima).
        const { data: visibleContact } = await authedClient
          .from('contacts')
          .select('id')
          .eq('id', contactId)
          .maybeSingle();
        if (!visibleContact) {
          result = { success: false, message: 'Contato não encontrado.' };
          break;
        }

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

        // L4 (IA-004 / N19): a checagem acima é de VISIBILIDADE. Como a escrita roda
        // com service_role (bypassa a RLS de contacts), sem esta segunda checagem de
        // PAPEL um agent que apenas enxergasse o contato moveria a conversa para
        // qualquer colega ativo. Perfil e papéis do chamador NUNCA vêm do body: saem
        // do JWT já verificado por requireAuth. Agente reivindica para si; reatribuir
        // para outra pessoa exige admin/supervisor.
        const { data: callerProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', __uid)
          .maybeSingle();

        const { data: callerRoles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', __uid);

        const reassignDecision = decideReassignConversation({
          targetProfileId: agent.id,
          callerProfileId: callerProfile?.id ?? null,
          callerRoles: (callerRoles ?? []).map((row: { role: string }) => row.role),
        });

        if (!reassignDecision.allowed) {
          result = { success: false, message: REASSIGN_DENIED_MESSAGE };
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

        // Mesma checagem de visibilidade do caso acima: sem ela, qualquer
        // usuário autenticado poderia anotar um contato que não enxerga.
        const { data: visibleContact } = await authedClient
          .from('contacts')
          .select('id')
          .eq('id', contactId)
          .maybeSingle();
        if (!visibleContact) {
          result = { success: false, message: 'Contato não encontrado.' };
          break;
        }

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
        // Diretorio de staff (nome/departamento), nao PII de cliente — mantem
        // service_role de proposito. A RLS de profiles so libera o proprio
        // registro para nao-admin (correto para o app em geral), mas aqui
        // quebraria o handoff por voz: qualquer agente comum ficaria sem ver
        // a lista de colegas para transferir conversa.
        const { data } = await supabase
          .from('profiles')
          .select('id, name, role, is_active, department')
          .eq('is_active', true)
          .order('name');
        result = data || [];
        break;
      }

      case 'get_queue_status': {
        const { data } = await authedClient
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
}

if (import.meta.main) Deno.serve(handleVoiceCopilotActionRequest);
