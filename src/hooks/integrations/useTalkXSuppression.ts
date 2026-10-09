import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { escapeOrFilterValue } from '@/lib/postgrestFilters';
import { useAuth } from '@/hooks/auth/useAuth';
import { toast } from 'sonner';

/**
 * X178 — único ponto de acesso à lista de supressão do Talk X.
 *
 * Antes desta etapa havia duas fontes: este hook (morto, ninguém importava,
 * listava sem filtrar `removed_at`, cortava em 500 linhas e removia com
 * `DELETE`) e a tela `TalkXSuppression.tsx`, que consultava o Supabase por
 * conta própria, filtrava e paginava em memória. A tela agora só fala com
 * este hook.
 *
 * A leitura é paginada NO SERVIDOR: filtros, ordenação, `count` e
 * `range(offset, offset + limite - 1)` vão na consulta — a tela nunca recebe a
 * tabela inteira. `fetchSuppressionPage` é o único ponto a trocar quando a RPC
 * `talkx_suppression_list` de X176 entrar no banco vivo: hoje ela ainda não
 * existe (`grep talkx_suppression_list supabase/` = 0), então a leitura vem da
 * tabela que o servidor já grava, `talkx_blacklist`.
 *
 * Remover deixou de ser `DELETE`: grava `removed_at`/`removed_by` (`UPDATE`),
 * como pede o plano — o registro vira histórico e a auditoria não perde autor.
 */

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

/** Chaves de ordenação aceitas pela listagem (viram coluna do servidor). */
export type SuppressionOrderKey = 'created_at' | 'origin' | 'reason' | 'status';

/** Mapeia chaves de ordenação da UI para colunas reais do banco. */
const ORDER_KEY_MAP: Record<SuppressionOrderKey, string> = {
  created_at: 'created_at',
  origin: 'origin',
  reason: 'reason',
  status: 'removed_at',
};

export interface SuppressionListParams {
  page: number;
  pageSize: number;
  /** Busca textual: casa nome, e-mail e dígitos de telefone (feita no servidor). */
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

export interface SuppressionTotals {
  /** Contatos suprimidos ativos (sem removidos). */
  total: number;
  /** Opt-outs dos últimos 30 dias (inclui o opt-out automático da campanha). */
  optouts30d: number;
  /** Bloqueios manuais. */
  manual: number;
}

export interface BlacklistInput {
  contact_id?: string | null;
  phone?: string | null;
  reason?: string;
  reason_code?: BlacklistReasonCode;
  origin?: string;
  campaign_id?: string | null;
  expires_at?: string | null;
  source_message_id?: string | null;
}

export interface BlacklistEditInput {
  id: string;
  reason?: string | null;
  origin?: string;
  expires_at?: string | null;
}

/** Tamanho padrão da página e os tamanhos que o rodapé oferece. */
export const SUPPRESSION_DEFAULT_PAGE_SIZE = 10;
export const SUPPRESSION_PAGE_SIZES = [10, 20, 50] as const;
/** Janela dos KPIs de opt-out. */
export const SUPPRESSION_OPT_OUT_DAYS = 30;

/** Colunas pedidas na listagem — inclui o contato e o nome da campanha. */
const LIST_COLUMNS =
  'id,contact_id!inner(name,email,phone),phone,reason,reason_code,origin,campaign_id,blocked_by,removed_at,removed_by,expires_at,created_at,'
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

/** Removido vence expirado; expirado vence suprimido (a mesma ordem do plano). */
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

/** Ponto único de leitura paginada (é aqui que a RPC de X176 entra). */
export async function fetchSuppressionPage(params: SuppressionListParams): Promise<SuppressionListPage> {
  const { page, pageSize, search, origin, reason, order = 'created_at', dir = 'desc' } = params;
  const from = (Math.max(1, page) - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('talkx_blacklist')
    .select(LIST_COLUMNS, { count: 'exact' })
    .is('removed_at', null);
  if (origin && origin !== 'all') query = query.eq('origin', origin);
  if (reason && reason !== 'all') query = query.ilike('reason', `%${reason}%`);
  if (search && search.trim()) {
    const term = escapeOrFilterValue(`%${search.trim()}%`);
    query = query
      .or(`phone.ilike.${term},reason.ilike.${term}`)
      .or(`contacts.name.ilike.${term},contacts.email.ilike.${term},contacts.phone.ilike.${term}`);
  }
  // Ordernação determinística: a chave pedida + `id` como desempate, para a
  // paginação por offset não repetir nem pular linha empatada.
  const descending = dir === 'desc';
  const orderColumn = ORDER_KEY_MAP[order];
  query = query.order(orderColumn, { ascending: !descending }).order('id', { ascending: !descending });
  const { data, error, count } = await query.range(from, to);
  if (error) throw error;
  const rows = ((data ?? []) as unknown as RawSuppressionRow[]).map((row) => toSuppressionRow(row));
  return { rows, total: count ?? rows.length };
}

/** Contadores dos KPIs: `count` no servidor, nunca sobre a página carregada. */
export async function fetchSuppressionTotals(now: number = Date.now()): Promise<SuppressionTotals> {
  const since = new Date(now - SUPPRESSION_OPT_OUT_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const [total, optouts, manual] = await Promise.all([
    supabase.from('talkx_blacklist').select('id', { count: 'exact', head: true }).is('removed_at', null),
    supabase.from('talkx_blacklist').select('id', { count: 'exact', head: true })
      .in('origin', ['optout', 'auto_optout']).is('removed_at', null).gte('created_at', since),
    supabase.from('talkx_blacklist').select('id', { count: 'exact', head: true })
      .eq('origin', 'manual').is('removed_at', null),
  ]);
  if (total.error) throw total.error;
  if (optouts.error) throw optouts.error;
  if (manual.error) throw manual.error;
  return { total: total.count ?? 0, optouts30d: optouts.count ?? 0, manual: manual.count ?? 0 };
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
  const { data: blocked, error: blockedError } = await supabase
    .from('talkx_blacklist')
    .select('contact_id')
    .is('removed_at', null)
    .in('contact_id', ids);
  if (blockedError) throw blockedError;
  const blockedIds = new Set(((blocked ?? []) as { contact_id: string | null }[]).map((r) => r.contact_id));
  return contacts.filter((c) => !blockedIds.has(c.id));
}

/** Hook da busca de contato do modal (só consulta com o modal aberto). */
export function useSuppressionContactSearch(term: string, enabled: boolean) {
  return useQuery({
    queryKey: ['talkx-suppression-contacts', term],
    queryFn: () => fetchSuppressionContactOptions(term),
    enabled,
  });
}

/** Converte o erro de permissão do PostgREST (42501) em um sinal para a tela. */
export function isSuppressionPermissionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === '42501' || (typeof message === 'string' && message.includes('42501'));
}

export function useTalkXSuppression(params: SuppressionListParams) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['talkx-suppression'] });
    qc.invalidateQueries({ queryKey: ['talkx-suppression-totals'] });
  };

  const query = useQuery({
    queryKey: suppressionQueryKey(params),
    queryFn: () => fetchSuppressionPage(params),
    // Mantém a página anterior à vista durante a troca de página/filtro.
    placeholderData: (previous) => previous,
  });

  const totalsQuery = useQuery({
    queryKey: ['talkx-suppression-totals', SUPPRESSION_OPT_OUT_DAYS],
    queryFn: () => fetchSuppressionTotals(),
  });

  /**
   * Autoria sai do perfil ativo (profiles.id), não do auth.users: `blocked_by`
   * e `removed_by` referenciam profiles(id) e o id de auth.users não é o mesmo
   * (0 dos 6 perfis tem id = user_id) — gravar `auth.uid()` violava a FK.
   */
  const addEntry = useMutation({
    mutationFn: async (input: BlacklistInput) => {
      const phone = input.phone ? input.phone.replace(/\D/g, '') : null;
      if (!phone && !input.contact_id) throw new Error('phone ou contact_id obrigatório');
      const { error } = await supabase.from('talkx_blacklist').insert({
        contact_id: input.contact_id ?? null,
        phone,
        reason: input.reason ?? null,
        reason_code: input.reason_code ?? 'manual',
        origin: input.origin ?? 'manual',
        campaign_id: input.campaign_id ?? null,
        expires_at: input.expires_at ?? null,
        source_message_id: input.source_message_id ?? null,
        blocked_by: profile?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Contato adicionado à lista de supressão'); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const updateEntry = useMutation({
    mutationFn: async (input: BlacklistEditInput) => {
      const { error } = await supabase.from('talkx_blacklist').update({
        reason: input.reason ?? null,
        ...(input.origin ? { origin: input.origin } : {}),
        ...(input.expires_at !== undefined ? { expires_at: input.expires_at } : {}),
      }).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Entrada atualizada'); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  /** Remover é `UPDATE` de `removed_at` (nunca `DELETE`): o autor fica gravado. */
  const removeEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('talkx_blacklist').update({
        removed_by: profile?.id ?? null,
        removed_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Contato removido da lista de supressão'); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  return {
    rows: query.data?.rows ?? [],
    /** Total do servidor (todos os filtros aplicados), não o da página. */
    total: query.data?.total ?? 0,
    totals: totalsQuery.data ?? { total: 0, optouts30d: 0, manual: 0 },
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isPermissionError: isSuppressionPermissionError(query.error),
    refetch: query.refetch,
    addEntry,
    updateEntry,
    removeEntry,
  };
}
