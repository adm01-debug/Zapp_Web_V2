import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, requireAuth, createAuthedClient, markDegraded } from "../_shared/validation.ts";
import { decideReassignConversation, REASSIGN_DENIED_MESSAGE } from "../_shared/voice-copilot-authz.ts";
import { escapeOrFilterValue } from "../_shared/postgrest-filters.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";

/**
 * Busca de produtos por voz: reusa a MESMA edge que o CmdK já chama
 * (`useCatalogQuickSearch` -> promogifts-catalog), em vez de reescrever a
 * busca aqui. Assim RLS, limite por ação e cota continuam num único lugar
 * (lá); o serviço de voz só repassa o JWT do chamador como Authorization e
 * usa a anon key como `apikey` do gateway (nunca a service_role).
 */
const CATALOG_FUNCTION_NAME = "promogifts-catalog";
/** Mesmo tamanho de página do CmdK (useCatalogQuickSearch: limit 8). */
const CATALOG_SEARCH_LIMIT = 8;
const CATALOG_SEARCH_MAX_QUERY = 200;

export interface CatalogSearchOptions {
  supabaseUrl: string;
  /** anon key — vai só como `apikey` do gateway, nunca como Authorization. */
  apikey: string;
  /** JWT do chamador já validado por requireAuth. */
  authHeader: string;
  fetchImpl?: typeof fetch;
}

export interface CatalogSearchResult {
  products: unknown[];
  total: number;
  /** true quando o catálogo respondeu erro — o consumidor distingue
   * "sem resultado" de "catálogo indisponível" (nada de fail-open silencioso). */
  failed?: boolean;
}

/**
 * POST para a edge de catálogo com os MESMOS parâmetros que o CmdK envia.
 * A resposta de promogifts-catalog é `{ data: products[], meta: { total } }`.
 */
export async function searchCatalogProducts(
  query: unknown,
  options: CatalogSearchOptions,
): Promise<CatalogSearchResult> {
  const search = String(query ?? "").trim().slice(0, CATALOG_SEARCH_MAX_QUERY);
  if (!search) return { products: [], total: 0 };

  const fetcher = options.fetchImpl ?? fetch;
  const response = await fetcher(`${options.supabaseUrl}/functions/v1/${CATALOG_FUNCTION_NAME}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // O JWT do chamador é repassado (não a service key): a authz real do
      // catálogo continua sendo dele.
      Authorization: options.authHeader,
      apikey: options.apikey,
    },
    body: JSON.stringify({
      action: "list_products",
      search,
      limit: CATALOG_SEARCH_LIMIT,
      compact: true,
    }),
  });

  if (!response.ok) {
    markDegraded("catalog_search_unavailable");
    return { products: [], total: 0, failed: true };
  }

  const payload = await response.json().catch(() => null) as
    | { data?: unknown; meta?: { total?: unknown } }
    | null;
  const products = Array.isArray(payload?.data) ? payload.data as unknown[] : [];
  const total = typeof payload?.meta?.total === "number" ? payload.meta.total : products.length;
  return { products, total };
}

/**
 * Valores canônicos de `conversation_tasks.status` (módulo Tarefas:
 * src/hooks/tasks/workItem.types.ts + o CHECK da coluna no banco). Qualquer
 * outro valor é recusado — o copiloto não inventa status.
 */
export const TASK_STATUSES = ['backlog', 'todo', 'doing', 'waiting', 'done', 'cancelled'] as const;

/**
 * Sinônimos de "tarefa em aberto" na fala do usuário ("minhas tarefas abertas"):
 * tudo menos `done`/`cancelled`. Não é um status da coluna — é um atalho de
 * linguagem natural que o copiloto traduz para o filtro equivalente.
 */
const OPEN_TASK_STATUS_ALIASES = new Set(['aberta', 'abertas', 'aberto', 'abertos', 'open', 'em aberto']);

/** Injeção de dependências para o teste rodar o handler real sem rede nem env. */
export interface VoiceCopilotDeps {
  /** Autenticação; por padrão usa `requireAuth(req)` (JWT + política de rede). */
  authorize?: (req: Request) => Promise<{ userId: string } | Response>;
  /** Client service_role; por padrão criado com as envs. */
  supabase?: SupabaseClient;
  /** Client com o JWT do caller (RLS real); por padrão `createAuthedClient(req)`. */
  authedClient?: SupabaseClient;
  /** Leitura de env; por padrão `requireEnv`. */
  env?: (key: string) => string;
  /** Substitui o POST para a edge de catálogo (`search_catalog_products`); por padrão `fetch`. */
  catalogFetch?: typeof fetch;
}

export async function handleVoiceCopilotAction(
  req: Request,
  deps: VoiceCopilotDeps = {},
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const authCheck = deps.authorize ? await deps.authorize(req) : await requireAuth(req);
  if (authCheck instanceof Response) return authCheck;
  const __uid = (authCheck as { userId: string }).userId;

  const log = new Logger("voice-copilot-action");

  try {
    const { action, params } = await req.json();

    const readEnv = deps.env ?? ((key: string) => requireEnv(key));
    const supabaseUrl = readEnv('SUPABASE_URL');
    const supabaseKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = deps.supabase ?? createClient(supabaseUrl, supabaseKey);
    // Client autenticado como o caller: usado nas leituras abaixo para que a
    // RLS real de `contacts`/`profiles`/`conversation_tasks` filtre por
    // auth.uid(), em vez do client service_role (que bypassa RLS e vazaria
    // PII/dashboard para qualquer usuário autenticado do app, não só agentes).
    const authedClient = deps.authedClient ?? await createAuthedClient(req);

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

      case 'search_tasks': {
        // Tarefas PESSOAIS do módulo Tarefas (src/components/tasks/). A leitura
        // sai pelo authedClient: a RLS real de `conversation_tasks` decide o
        // que o chamador enxerga — o copiloto só devolve o que o próprio
        // usuário já vê no módulo. O service_role bypassaria a RLS e vazaria
        // tarefa de outra pessoa.
        const { query, status } = params ?? {};
        // Mesma sanitização do search_contacts: remove curingas/escape do
        // PostgREST (a gramática do `.or()` não tem escape automático).
        const sanitized = String(query || '').replace(/[%_\\]/g, '').trim();

        // Status é validado ANTES de tocar o banco: valor fora do vocabulário
        // não vira consulta — recusa em vez de devolver lixo.
        const statusFilter = typeof status === 'string' ? status.trim().toLowerCase() : '';
        let statusFilterValue: string | null = null;
        let statusExcluded: string | null = null;
        if (statusFilter) {
          if ((TASK_STATUSES as readonly string[]).includes(statusFilter)) {
            statusFilterValue = statusFilter;
          } else if (OPEN_TASK_STATUS_ALIASES.has(statusFilter)) {
            statusExcluded = '(done,cancelled)';
          } else {
            result = [];
            break;
          }
        }

        let q = authedClient
          .from('conversation_tasks')
          .select('id, title, description, status, priority, due_date, assigned_to, created_by, contact_id')
          // Ordem determinística e útil por voz: prazo mais próximo primeiro e,
          // no empate, a criada por último.
          .order('due_date', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(10);

        if (sanitized) {
          const like = escapeOrFilterValue(`%${sanitized}%`);
          q = q.or(`title.ilike.${like},description.ilike.${like}`);
        }
        if (statusFilterValue) q = q.eq('status', statusFilterValue);
        if (statusExcluded) q = q.not('status', 'in', statusExcluded);

        const { data, error } = await q;
        if (error) throw error;
        result = data ?? [];
        break;
      }

      case 'search_catalog_products': {
        const { query } = params;
        // Mesma edge e mesmos parâmetros do CmdK; a resposta tem o conteúdo
        // de produto (id, nome, sku, preço, imagem principal) que a voz lê.
        // A authz real do catálogo continua sendo o JWT do chamador: sem ele,
        // 401 sem nem chamar o catálogo (nada de fallback para '').
        const authHeader =
          req.headers.get('Authorization') ?? req.headers.get('authorization');
        if (!authHeader) {
          return errorResponse('Missing Authorization bearer token', 401, req);
        }
        const anonKey = readEnv('SUPABASE_ANON_KEY');
        result = await searchCatalogProducts(query, {
          supabaseUrl,
          apikey: anonKey,
          authHeader,
          fetchImpl: deps.catalogFetch,
        });
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

if (import.meta.main) {
  Deno.serve((req) => handleVoiceCopilotAction(req));
}
