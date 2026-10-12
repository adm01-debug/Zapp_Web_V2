/**
 * Talk X — leitura da supressão, consumida pela tela
 * `src/components/talkx/TalkXSuppression.tsx`: a listagem paginada no servidor
 * (X178), a trilha de atividade (X184/TL-169) e os números do servidor (X179).
 *
 * O hook de lista que morava neste módulo com o nome antigo (listagem sem
 * filtrar `removed_at`, `isSuppressed` em dois passos e remoção com `DELETE`
 * físico) foi removido pelo TL-002 e o nome não pode voltar — o guarda
 * `useTalkXSuppression.hook-morto.test.ts` varre `src/`. A listagem atual é
 * `useSuppressionList`: filtra `removed_at` e a remoção é `UPDATE`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';
import { escapeOrFilterValue } from '@/lib/postgrestFilters';

/* -------------------------------------------------------------------------- */
/* X178 — listagem paginada no servidor                                        */
/* -------------------------------------------------------------------------- */

export type BlacklistReasonCode =
  | 'opt_out'
  | 'invalid_number'
  | 'manual'
  | 'lgpd'
  | 'no_commercial_permission'
  | 'bounce';

/** Situação derivada de uma linha (nunca é coluna: o servidor guarda datas). */
export type SuppressionStatus = 'suprimido' | 'expirado' | 'removido';

/** Linha já normalizada para a tela: o contato vinculado vira campo plano. */
export interface SuppressionRow {
  id: string;
  contact_id: string | null;
  /** Telefone gravado na própria linha (bloqueio só por telefone, sem contato). */
  phone: string | null;
  reason: string | null;
  reason_code: BlacklistReasonCode | null;
  origin: string;
  campaign_id: string | null;
  campaign_name: string | null;
  blocked_by: string | null;
  removed_by: string | null;
  removed_at: string | null;
  expires_at: string | null;
  created_at: string;
  status: SuppressionStatus;
  /** Dados do contato vinculado (nulos quando o bloqueio é só por telefone). */
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_company: string | null;
  contact_avatar_url: string | null;
}

/**
 * Chaves de ordenação aceitas pela listagem. São colunas reais: `status` é
 * derivado de `removed_at`/`expires_at` e não ordena no servidor.
 */
export type SuppressionOrderKey = 'created_at' | 'origin' | 'reason';

const ORDER_KEY_MAP: Record<SuppressionOrderKey, string> = {
  created_at: 'created_at',
  origin: 'origin',
  reason: 'reason',
};

export interface SuppressionListParams {
  page: number;
  pageSize: number;
  /** Busca textual (feita no servidor). */
  search?: string;
  /** Origem escolhida ('all' = todas). */
  origin?: string;
  /** Trecho do motivo ('all' = todos). */
  reason?: string;
  order?: SuppressionOrderKey;
  dir?: 'asc' | 'desc';
}

export interface SuppressionListPage {
  rows: SuppressionRow[];
  /** Total do SERVIDOR com os filtros aplicados — é ele que o rodapé mostra. */
  total: number;
}

export interface BlacklistEditInput {
  id: string;
  reason?: string | null;
  origin?: string;
}

/** Tamanhos de página que o rodapé oferece (o primeiro é o padrão). */
export const SUPPRESSION_PAGE_SIZES = [10, 20, 50] as const;

/** Colunas pedidas na listagem — inclui o contato e o nome da campanha. */
const LIST_COLUMNS =
  'id,contact_id,phone,reason,reason_code,origin,campaign_id,blocked_by,removed_at,removed_by,expires_at,created_at,'
  + 'contacts:contact_id(name,phone,email,company,avatar_url),'
  // campaign_id tem DUAS FKs (talkx_campaigns e talkx_campaign_metrics): sem o
  // nome da restrição o PostgREST recusa o embed por ambiguidade.
  + 'campaign:talkx_campaigns!talkx_blacklist_campaign_id_fkey(name)';

interface RawSuppressionRow {
  id: string;
  contact_id: string | null;
  phone: string | null;
  reason: string | null;
  reason_code: BlacklistReasonCode | null;
  origin: string;
  campaign_id: string | null;
  blocked_by: string | null;
  removed_by: string | null;
  removed_at: string | null;
  expires_at: string | null;
  created_at: string;
  contacts: { name: string | null; phone: string | null; email: string | null; company: string | null; avatar_url: string | null } | null;
  campaign: { name: string | null } | null;
}

/** Removido vence expirado; expirado vence suprimido. */
export function suppressionStatus(
  row: { removed_at: string | null; expires_at: string | null },
  now: number = Date.now(),
): SuppressionStatus {
  if (row.removed_at) return 'removido';
  if (row.expires_at && Date.parse(row.expires_at) <= now) return 'expirado';
  return 'suprimido';
}

/** Converte a linha do servidor no que a tela desenha (um só lugar faz o de-para). */
export function toSuppressionRow(raw: RawSuppressionRow, now: number = Date.now()): SuppressionRow {
  return {
    id: raw.id,
    contact_id: raw.contact_id,
    phone: raw.phone,
    reason: raw.reason,
    reason_code: raw.reason_code,
    origin: raw.origin,
    campaign_id: raw.campaign_id,
    campaign_name: raw.campaign?.name ?? null,
    blocked_by: raw.blocked_by,
    removed_by: raw.removed_by,
    removed_at: raw.removed_at,
    expires_at: raw.expires_at,
    created_at: raw.created_at,
    status: suppressionStatus(raw, now),
    contact_name: raw.contacts?.name ?? null,
    contact_phone: raw.contacts?.phone ?? null,
    contact_email: raw.contacts?.email ?? null,
    contact_company: raw.contacts?.company ?? null,
    contact_avatar_url: raw.contacts?.avatar_url ?? null,
  };
}

/** Chave de cache: TODO parâmetro entra — mudar filtro/página refaz a consulta. */
export function suppressionQueryKey(params: SuppressionListParams) {
  return [
    'talkx-suppression',
    params.page,
    params.pageSize,
    params.search?.trim() ?? '',
    params.origin ?? 'all',
    params.reason ?? 'all',
    params.order ?? 'created_at',
    params.dir ?? 'desc',
  ] as const;
}

/** Termo "com cara de telefone": só dígitos e pontuação de telefone. */
const PHONE_TERM = /^[\d\s()+.-]+$/;
/** Teto de contatos casados por telefone na busca (cabe na URL do `in.(...)`). */
const SEARCH_PHONE_CONTACT_LIMIT = 200;

/**
 * Ponto único de leitura paginada. Sempre exclui removidos (`removed_at is
 * null`), para o total bater com os KPIs.
 *
 * Busca: o telefone gravado na própria supressão fica na linha PAI (bloqueio só
 * por telefone não tem contato), então um termo com cara de telefone filtra o
 * `phone` do pai — e os contatos de mesmo telefone, resolvidos antes por
 * `contact_id.in.(...)`, para o bloqueio vinculado a um contato continuar
 * achável. Qualquer outro termo (nome, e-mail) restringe o PAI pelo embed
 * `contacts!inner` + `referencedTable`; o `.or()` nunca mistura coluna do pai
 * com coluna do embed, que o PostgREST não aplica ao pai.
 */
export async function fetchSuppressionPage(params: SuppressionListParams): Promise<SuppressionListPage> {
  const { page, pageSize, search, origin, reason, order = 'created_at', dir = 'desc' } = params;
  const from = (Math.max(1, page) - 1) * pageSize;
  const to = from + pageSize - 1;

  const term = search?.trim();
  const phoneTerm = term && PHONE_TERM.test(term) ? term.replace(/\D/g, '') : '';

  let phoneFilter = '';
  if (phoneTerm) {
    const { data: contactRows, error: contactError } = await supabase
      .from('contacts')
      .select('id')
      .ilike('phone', `%${phoneTerm}%`)
      .limit(SEARCH_PHONE_CONTACT_LIMIT);
    if (contactError) throw contactError;
    const contactIds = ((contactRows ?? []) as { id: string }[]).map((c) => c.id);
    phoneFilter = [`phone.ilike.${escapeOrFilterValue(`%${phoneTerm}%`)}`, ...(contactIds.length ? [`contact_id.in.(${contactIds.join(',')})`] : [])].join(',');
  }

  // `!inner` só entra na busca por nome/e-mail: é ele que faz o embed restringir
  // as linhas do pai (sem ele o PostgREST só anula o embed). Sem busca, o
  // bloqueio só por telefone (sem contato) continua na listagem.
  const textSearch = Boolean(term) && !phoneTerm;
  const columns = textSearch ? LIST_COLUMNS.replace('contacts:contact_id(', 'contacts:contact_id!inner(') : LIST_COLUMNS;
  let query = supabase
    .from('talkx_blacklist')
    .select(columns, { count: 'exact' })
    .is('removed_at', null);
  if (origin && origin !== 'all') query = query.eq('origin', origin);
  if (reason && reason !== 'all') query = query.ilike('reason', `%${reason}%`);
  if (phoneFilter) query = query.or(phoneFilter);
  if (textSearch && term) {
    const pattern = escapeOrFilterValue(`%${term}%`);
    query = query.or(`name.ilike.${pattern},email.ilike.${pattern}`, { referencedTable: 'contacts' });
  }
  // Ordem determinística: a chave pedida + `id` como desempate, para a
  // paginação por offset não repetir nem pular linha empatada.
  const ascending = dir !== 'desc';
  query = query.order(ORDER_KEY_MAP[order], { ascending }).order('id', { ascending });
  const { data, error, count } = await query.range(from, to);
  if (error) throw error;
  const rows = ((data ?? []) as unknown as RawSuppressionRow[]).map((row) => toSuppressionRow(row));
  return { rows, total: count ?? rows.length };
}

/** Contato disponível para bloquear (o que o modal de adicionar mostra). */
export interface SuppressionContactOption {
  id: string;
  name: string;
  phone: string | null;
  company: string | null;
}

/** Teto de contatos devolvidos na busca do modal (mesmo padrão do SLARuleFormDialog). */
export const SUPPRESSION_CONTACT_SEARCH_LIMIT = 50;

/**
 * Busca de contato do modal "Adicionar": consulta o SERVIDOR (o PostgREST corta
 * a resposta, então filtrar só o primeiro lote esconderia quem está fora dele —
 * #407/R2-MOD-035) e tira dali quem já está suprimido — a exclusão é feita
 * contra o banco, não contra a página da tabela, senão um contato já bloqueado
 * numa página distante voltaria como disponível.
 */
export async function fetchSuppressionContactOptions(term: string): Promise<SuppressionContactOption[]> {
  let query = supabase.from('contacts').select('id, name, phone, company').not('phone', 'is', null);
  if (term) {
    const escaped = escapeOrFilterValue(`%${term}%`);
    query = query.or(`name.ilike.${escaped},phone.ilike.${escaped}`);
  }
  const { data, error } = await query.order('name').limit(SUPPRESSION_CONTACT_SEARCH_LIMIT);
  if (error) throw error;
  const contacts = (data ?? []) as SuppressionContactOption[];
  if (contacts.length === 0) return contacts;
  const ids = contacts.map((c) => c.id);
  const { data: blocked, error: blockedError } = await supabase.from('talkx_blacklist').select('contact_id')
    .is('removed_at', null).in('contact_id', ids);
  if (blockedError) throw blockedError;
  const blockedIds = new Set(((blocked ?? []) as { contact_id: string | null }[]).map((r) => r.contact_id));
  return contacts.filter((c) => !blockedIds.has(c.id));
}

/** Converte o erro de permissão do PostgREST (42501) em um sinal para a tela. */
export function isSuppressionPermissionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === '42501' || (typeof message === 'string' && message.includes('42501'));
}

/** Listagem paginada no servidor + edição de motivo/origem da linha. */
export function useSuppressionList(params: SuppressionListParams) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: suppressionQueryKey(params),
    queryFn: () => fetchSuppressionPage(params),
    // Mantém a página anterior à vista durante a troca de página/filtro.
    placeholderData: (previous) => previous,
  });

  const updateEntry = useMutation({
    mutationFn: async (input: BlacklistEditInput) => {
      const { error } = await supabase.from('talkx_blacklist').update({
        reason: input.reason ?? null,
        ...(input.origin ? { origin: input.origin } : {}),
      }).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['talkx-suppression'] });
      qc.invalidateQueries({ queryKey: ['talkx-blacklist'] });
      qc.invalidateQueries({ queryKey: ['talkx-suppression-activity'] });
      toast.success('Entrada atualizada');
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  return {
    rows: query.data?.rows ?? [],
    /** Total do servidor (todos os filtros aplicados), não o da página. */
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isPermissionError: isSuppressionPermissionError(query.error),
    refetch: query.refetch,
    updateEntry,
  };
}

/* -------------------------------------------------------------------------- */
/* X184 — Atividade recente da lista, lida dos eventos de ENTIDADE             */
/* -------------------------------------------------------------------------- */

/**
 * Tipos que a trilha de supressão usa em `talkx_campaign_events`: os três de
 * linha (`suppression_add/remove/update`) estão no CHECK do banco desde a V11
 * (`M:20260929730000:33-37`); os dois de lote (`import`/`export`) entram com a
 * importação e a exportação da lista (V74/V75).
 *
 * O leitor filtra por ESTE vocabulário e não por `entity_type` — que a F06
 * ("Trilha de supressão", V71–V80) ainda formaliza. O evento de entidade
 * (`entity_type` `suppression`/`suppression_batch`) é o caso comum, mas o mesmo
 * `event_type` também pode estar gravado junto de uma campanha, e essa
 * atividade é da lista do mesmo jeito; o que o usuário não pode ver, o RLS barra.
 */
export const SUPPRESSION_ACTIVITY_EVENT_TYPES = [
  'suppression_add',
  'suppression_remove',
  'suppression_update',
  'suppression_import',
  'suppression_export',
] as const;

export type SuppressionActivityEventType = (typeof SUPPRESSION_ACTIVITY_EVENT_TYPES)[number];

/** Ação da trilha: o que a tela agrupa em ícone + título. */
export type SuppressionActivityAction = 'add' | 'remove' | 'update' | 'import' | 'export';

export interface SuppressionActivityItem {
  id: string;
  /** `null` quando o `event_type` gravado não está no contrato da tela. */
  action: SuppressionActivityAction | null;
  title: string;
  /** E-mail do contato; telefone quando não há e-mail. `null` = evento sem contato. */
  contactLabel: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface SuppressionActivityPage {
  items: SuppressionActivityItem[];
  /** Contagem exata do servidor — não o tamanho da página. */
  total: number;
}

const ACTION_BY_EVENT_TYPE: Record<SuppressionActivityEventType, SuppressionActivityAction> = {
  suppression_add: 'add',
  suppression_remove: 'remove',
  suppression_update: 'update',
  suppression_import: 'import',
  suppression_export: 'export',
};

/** Ação de um `event_type` da trilha; `null` para tipo fora do contrato. */
export function suppressionActivityAction(eventType: string | null | undefined): SuppressionActivityAction | null {
  if (!eventType) return null;
  return (ACTION_BY_EVENT_TYPE as Record<string, SuppressionActivityAction>)[eventType] ?? null;
}

/**
 * Título do item no vocabulário da tela (X184). O evento de lote traz a
 * contagem na mensagem (V74/V75); sem número legível o título sai sem contagem,
 * em vez de inventar um valor.
 */
export function suppressionActivityTitle(eventType: string | null | undefined, message: string | null | undefined): string {
  switch (suppressionActivityAction(eventType)) {
    case 'add': return 'Contato adicionado à lista';
    case 'remove': return 'Contato removido da lista';
    case 'update': return 'Motivo atualizado';
    case 'export': return 'Lista exportada';
    case 'import': {
      const digits = (message ?? '').match(/\d+/)?.[0];
      if (!digits) return 'Contatos importados';
      const n = Number(digits);
      return n === 1 ? '1 contato importado' : `${n} contatos importados`;
    }
    default: return 'Atividade na lista de supressão';
  }
}

interface SuppressionActivityEventRow {
  id: string;
  event_type: string | null;
  message: string | null;
  entity_id: string | null;
  created_at: string;
  actor: { name: string | null } | null;
}

interface BlacklistEntryRow {
  id: string;
  contact_id: string | null;
  phone: string | null;
}

interface ContactLabelRow {
  id: string;
  email: string | null;
  phone: string | null;
}

/**
 * Contato de cada evento pelo `entity_id` (id da linha de `talkx_blacklist`) —
 * a tabela de eventos não tem FK para o contato, então a resolução é em duas
 * consultas. Supressão de telefone avulso não tem contato: aí o rótulo é o
 * telefone da própria linha da lista.
 */
async function resolveActivityContactLabels(rows: SuppressionActivityEventRow[]): Promise<Map<string, string | null>> {
  const labels = new Map<string, string | null>();
  const entityIds = Array.from(new Set(rows.map((r) => r.entity_id).filter((id): id is string => !!id)));
  if (entityIds.length === 0) return labels;

  const { data: entries, error: entryError } = await fromTable('talkx_blacklist')
    .select('id,contact_id,phone')
    .in('id', entityIds);
  if (entryError) throw entryError;
  const entryRows = (entries ?? []) as BlacklistEntryRow[];

  const contactIds = Array.from(new Set(entryRows.map((e) => e.contact_id).filter((id): id is string => !!id)));
  const contacts: ContactLabelRow[] = [];
  if (contactIds.length > 0) {
    const { data: contactRows, error: contactError } = await fromTable('contacts')
      .select('id,email,phone')
      .in('id', contactIds);
    if (contactError) throw contactError;
    contacts.push(...((contactRows ?? []) as ContactLabelRow[]));
  }
  const contactById = new Map(contacts.map((c) => [c.id, c]));

  for (const entry of entryRows) {
    const contact = entry.contact_id ? contactById.get(entry.contact_id) : undefined;
    const email = contact?.email?.trim() ?? '';
    const digits = (contact?.phone ?? entry.phone ?? '').replace(/\D/g, '');
    labels.set(entry.id, email || (digits ? `+${digits}` : null));
  }
  return labels;
}

export interface FetchTalkXSuppressionActivityOptions {
  /** Itens por página (5 no rail, 20 no histórico). */
  limit?: number;
  /** Página 0-based; o servidor recebe a fatia (`range`), não o teto de linhas. */
  page?: number;
  /** Filtro por tipo; `all` = trilha inteira. */
  eventType?: SuppressionActivityEventType | 'all';
}

/** Leitura da trilha de supressão (eventos de entidade), mais recentes primeiro. */
export async function fetchTalkXSuppressionActivity({
  limit = 5, page = 0, eventType = 'all',
}: FetchTalkXSuppressionActivityOptions = {}): Promise<SuppressionActivityPage> {
  const from = page * limit;
  let query = fromTable('talkx_campaign_events')
    .select('id,event_type,message,created_at,entity_id,actor:actor_id(name)', { count: 'exact' })
    .in('event_type', SUPPRESSION_ACTIVITY_EVENT_TYPES);
  if (eventType !== 'all') query = query.eq('event_type', eventType);

  // A página é pedida como FATIA (`range`), depois da ordem determinística —
  // nunca um `.limit()` solto, que devolveria um subconjunto arbitrário.
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    // Desempate obrigatório: sem ele a fatia de uma página pode repetir item
    // entre chamadas quando dois eventos caem no mesmo instante.
    .order('id', { ascending: false })
    .range(from, from + limit - 1);
  if (error) throw error;

  const rows = (data ?? []) as SuppressionActivityEventRow[];
  const labels = await resolveActivityContactLabels(rows);

  return {
    items: rows.map((row) => ({
      id: row.id,
      action: suppressionActivityAction(row.event_type),
      title: suppressionActivityTitle(row.event_type, row.message),
      contactLabel: row.entity_id ? labels.get(row.entity_id) ?? null : null,
      actorName: row.actor?.name ?? null,
      createdAt: row.created_at,
    })),
    // Sem a contagem do servidor, o total é o que a página prova existir.
    total: typeof count === 'number' ? count : from + rows.length,
  };
}

/**
 * Trilha de supressão para a tela: os 5 últimos itens no rail e o histórico
 * paginado do modal. `enabled` evita a consulta do histórico com o modal fechado.
 */
export function useTalkXSuppressionActivity({
  limit = 5, page = 0, eventType = 'all', enabled = true,
}: FetchTalkXSuppressionActivityOptions & { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: ['talkx-suppression-activity', limit, page, eventType],
    queryFn: () => fetchTalkXSuppressionActivity({ limit, page, eventType }),
    enabled,
  });

  return {
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as Error | null) ?? null,
    refetch: query.refetch,
  };
}

/* -------------------------------------------------------------------------- */
/* X179 — números da tela lidos do servidor (`talkx_suppression_stats`)       */
/* -------------------------------------------------------------------------- */

/** Um dos quatro números da tela: valor da janela, valor do período anterior e a série das mini-barras. */
export type TalkXSuppressionStat = {
  value: number;
  /** Período anterior de mesma duração. Zero (ou ausente) esconde a variação no card. */
  previous: number;
  /** Série de 8 pontos para as mini-barras do KPI. */
  series: number[];
};

/**
 * X176/X179 — resposta de `talkx_suppression_stats(p_days)`: suprimidos ativos
 * (sem expirados nem removidos), opt-outs da janela (`reason_code='opt_out'`, o
 * que inclui `auto_optout`), bloqueios manuais e campanhas iniciadas que
 * respeitam a lista — mais o total de campanhas iniciadas, denominador do
 * medidor do Centro de proteção.
 */
export type TalkXSuppressionStats = {
  active: TalkXSuppressionStat;
  optouts: TalkXSuppressionStat;
  manual: TalkXSuppressionStat;
  protected: TalkXSuppressionStat & { total_started: number };
};

/** RPC que ainda não está em `types.ts` (a migration é de outra trilha). */
type TalkXSuppressionStatsRpc = (name: string, args: Record<string, unknown>) => Promise<{
  data: unknown;
  error: { message: string } | null;
}>;

/**
 * X179 — os KPIs e o painel de proteção passam a ler `talkx_suppression_stats`
 * (X176) em vez de contar o que a lista carregou: "Opt-outs 30 dias" era
 * `origin === 'optout'` sem janela e ignorando `auto_optout`, e "Campanhas
 * protegidas" não tinha fonte. Sem resposta do servidor a tela não inventa
 * número: o card mostra "—".
 */
export function useTalkXSuppressionStats(days = 30) {
  return useQuery({
    queryKey: ['talkx-suppression-stats', days],
    queryFn: async () => {
      const rpc = supabase.rpc as unknown as TalkXSuppressionStatsRpc;
      const { data, error } = await rpc('talkx_suppression_stats', { p_days: days });
      if (error) throw new Error(error.message);
      return (data ?? null) as TalkXSuppressionStats | null;
    },
  });
}
