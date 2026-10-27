import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';
import { useAuth } from '@/hooks/auth/useAuth';
import { toast } from 'sonner';
import { CONTACT_TYPES } from '@/utils/whatsappFileTypes';
import { CONVERSATION_STATUSES } from '@/types/chat';
import { OPERATIONAL_PRIORITY_VALUES, SENTIMENT_VALUES } from '@/lib/ai-vocabulary';
import { zonedDayStartISO } from '@/lib/localDay';
import { GROUP_CATEGORIES } from '@/hooks/groups/types';

/**
 * Fuso do filtro de segmento. O segmento e gravado como string de filtro e reusado por
 * qualquer usuario (e por contagens no servidor), entao o recorte precisa ser o mesmo para
 * todos: dias de calendario em Sao Paulo, e nao o fuso do navegador de quem montou a regra.
 */
const SEGMENT_TIMEZONE = 'America/Sao_Paulo';

/* ------------------------------------------------------------------ */
/* Modelo de regras                                                   */
/* ------------------------------------------------------------------ */

export type RuleField =
  | 'tags' | 'company' | 'contact_type' | 'conversation_status' | 'channel_type'
  | 'consent_status' | 'lead_score' | 'risk_score' | 'ai_priority' | 'ai_sentiment'
  | 'lead_origin' | 'updated_at' | 'created_at' | 'email'
  | 'city' | 'state' | 'assigned_to' | 'group_category'
  | 'real_sector' | 'real_uf';
export type RuleOp =
  | 'eq' | 'neq' | 'contains' | 'not_contains' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in_last_days' | 'not_in_last_days' | 'is_set' | 'is_empty';

export interface SegmentRule { id: string; field: RuleField; op: RuleOp; value: string }
export interface SegmentRuleGroup { id: string; match: 'and' | 'or'; rules: SegmentRule[] }
/**
 * Conector ENTRE grupos: um único valor para o segmento inteiro, sem
 * precedência mista. O motor combina os grupos com OU — a RPC de audiência
 * monta `AND (grupo1 OU grupo2 …)`
 * (`supabase/migrations/20261002391230_talkx_audience_rpc.sql:277`), então 'or'
 * é o padrão e o divisor do construtor mostra exatamente o que ele aplica. Este
 * campo é o único lugar que o divisor lê; 'and' entre grupos só passa a valer
 * quando a etapa de banco ensinar a RPC a ler `join`.
 */
export type SegmentJoin = 'and' | 'or';
/** Grupos são combinados com OU entre si (como no mockup "Grupo 1 OU Grupo 2"). */
export interface SegmentRules { groups: SegmentRuleGroup[]; join?: SegmentJoin }

export interface TalkXSegment {
  id: string;
  name: string;
  description: string | null;
  origin: 'zapp' | 'crm360' | 'custom';
  status: 'active' | 'inactive';
  is_favorite: boolean;
  rules: SegmentRules;
  estimated_count: number;
  last_used_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  creator?: { name: string | null } | null;
}

export const RULE_FIELDS: { value: RuleField; label: string; kind: 'text' | 'array' | 'number' | 'date' | 'enum' | 'uuid'; category: 'basico' | 'comportamento' | 'comercial' | 'lgpd'; options?: string[]; comingSoon?: boolean; ponteOnly?: boolean }[] = [
  { value: 'tags', label: 'Tags', kind: 'array', category: 'basico' },
  { value: 'company', label: 'Empresa', kind: 'text', category: 'basico' },
  { value: 'city', label: 'Cidade', kind: 'text', category: 'basico' },
  { value: 'state', label: 'UF', kind: 'text', category: 'basico' },
  // Setor de atividade e UF REAIS (ponte Singu): ponteOnly:true — esses campos
  // exigem p_contact_ids da ponte para ser resolvidos; sem a ponte a RPC não
  // tem coluna para filtrar.
  { value: 'real_sector', label: 'Setor de atividade (real)', kind: 'enum', category: 'basico', ponteOnly: true },
  { value: 'real_uf', label: 'UF (real)', kind: 'enum', category: 'basico', ponteOnly: true },
  { value: 'group_category', label: 'Grupo', kind: 'enum', category: 'basico', options: GROUP_CATEGORIES.map((c) => c.value) },
  { value: 'email', label: 'E-mail', kind: 'text', category: 'basico' },
  { value: 'channel_type', label: 'Canal de origem', kind: 'text', category: 'basico' },
  { value: 'lead_origin', label: 'Origem do lead', kind: 'text', category: 'basico', comingSoon: true },
  { value: 'assigned_to', label: 'Responsável', kind: 'uuid', category: 'comercial' },
  { value: 'contact_type', label: 'Tipo do contato', kind: 'enum', category: 'comercial', options: CONTACT_TYPES.map((t) => t.value) },
  { value: 'conversation_status', label: 'Status da conversa', kind: 'enum', category: 'comportamento', options: [...CONVERSATION_STATUSES] },
  { value: 'lead_score', label: 'Lead score', kind: 'number', category: 'comercial', comingSoon: true },
  { value: 'risk_score', label: 'Risco de churn', kind: 'number', category: 'comportamento', comingSoon: true },
  { value: 'ai_priority', label: 'Prioridade (IA)', kind: 'enum', category: 'comportamento', options: [...OPERATIONAL_PRIORITY_VALUES] },
  { value: 'ai_sentiment', label: 'Sentimento (IA)', kind: 'enum', category: 'comportamento', options: [...SENTIMENT_VALUES] },
  { value: 'updated_at', label: 'Última interação', kind: 'date', category: 'comportamento' },
  { value: 'created_at', label: 'Data de cadastro', kind: 'date', category: 'basico' },
  { value: 'consent_status', label: 'Consentimento (LGPD)', kind: 'enum', category: 'lgpd', options: ['granted', 'unknown', 'revoked'] },
];

export const RULE_OPS: Record<string, { value: RuleOp; label: string }[]> = {
  text: [
    { value: 'eq', label: 'é igual a' }, { value: 'neq', label: 'é diferente de' },
    { value: 'contains', label: 'contém' }, { value: 'not_contains', label: 'não contém' },
    { value: 'is_set', label: 'está preenchido' }, { value: 'is_empty', label: 'está vazio' },
  ],
  enum: [{ value: 'eq', label: 'é igual a' }, { value: 'neq', label: 'é diferente de' }, { value: 'is_empty', label: 'está vazio' }],
  uuid: [{ value: 'eq', label: 'é igual a' }, { value: 'neq', label: 'é diferente de' }, { value: 'is_empty', label: 'está vazio' }],
  array: [{ value: 'contains', label: 'contém' }, { value: 'not_contains', label: 'não contém' }, { value: 'is_empty', label: 'está vazio' }],
  number: [
    { value: 'eq', label: 'é igual a' }, { value: 'gt', label: 'maior que' }, { value: 'gte', label: 'maior ou igual a' },
    { value: 'lt', label: 'menor que' }, { value: 'lte', label: 'menor ou igual a' },
  ],
  date: [{ value: 'in_last_days', label: 'nos últimos (dias)' }, { value: 'not_in_last_days', label: 'há mais de (dias)' }],
};

export const emptyRules = (): SegmentRules => ({ groups: [{ id: crypto.randomUUID(), match: 'and', rules: [] }], join: 'or' });
export const newRule = (): SegmentRule => ({ id: crypto.randomUUID(), field: 'tags', op: 'contains', value: '' });

export const rulesJoin = (rules: SegmentRules | null | undefined): SegmentJoin => (rules?.join === 'and' ? 'and' : 'or');

export function isRuleComplete(rule: SegmentRule): boolean {
  const def = RULE_FIELDS.find((f) => f.value === rule.field);
  if (!def) return false;
  if (rule.op === 'is_set' || rule.op === 'is_empty') return true;
  const value = rule.value.trim();
  if (!value) return false;
  if (def.kind === 'number') return !Number.isNaN(Number(value));
  if (def.kind === 'date') {
    const days = Number(value);
    return Number.isFinite(days) && days > 0;
  }
  return true;
}

export function splitRules(rules: SegmentRules | null | undefined): { complete: SegmentRules; incompleteCount: number } {
  let incompleteCount = 0;
  const groups = (rules?.groups ?? [])
    .map((group) => {
      const completeRules = group.rules.filter((rule) => {
        if (RULE_FIELDS.find((f) => f.value === rule.field)?.comingSoon) {
          incompleteCount += 1;
          return false;
        }
        if (isRuleComplete(rule)) return true;
        incompleteCount += 1;
        return false;
      });
      return { ...group, rules: completeRules };
    })
    .filter((group) => group.rules.length > 0);
  return { complete: { groups }, incompleteCount };
}

const quoted = (v: string) => `"${v.replace(/[\\"]/g, (c) => (c === '\\' ? '\\\\' : '\\"'))}"`;

function ruleToFilter(r: SegmentRule): string | null {
  const def = RULE_FIELDS.find((f) => f.value === r.field);
  if (!def) return null;
  if (def.comingSoon) return null;
  if (def.ponteOnly) return null;
  const v = r.value.trim();
  switch (r.op) {
    case 'is_set': return `${r.field}.not.is.null`;
    case 'is_empty': {
      if (def.kind === 'array') return `or(${r.field}.is.null,${r.field}.eq.{})`;
      if (def.kind === 'uuid') return `${r.field}.is.null`;
      return `or(${r.field}.is.null,${r.field}.eq.)`;
    }
    case 'in_last_days': {
      const d = Number(v); if (!d) return null;
      return `${r.field}.gte.${zonedDayStartISO(SEGMENT_TIMEZONE, d - 1)}`;
    }
    case 'not_in_last_days': {
      const d = Number(v); if (!d) return null;
      return `${r.field}.lt.${zonedDayStartISO(SEGMENT_TIMEZONE, d - 1)}`;
    }
    default: break;
  }
  if (!v) return null;
  if (def.kind === 'array') {
    if (r.op === 'contains') return `${r.field}.cs.{${quoted(v)}}`;
    if (r.op === 'not_contains') return `or(${r.field}.is.null,${r.field}.not.cs.{${quoted(v)}})`;
    return null;
  }
  if (def.kind === 'number') {
    const n = Number(v); if (Number.isNaN(n)) return null;
    return `${r.field}.${r.op}.${n}`;
  }
  switch (r.op) {
    case 'eq': return `${r.field}.eq.${quoted(v)}`;
    case 'neq': return `or(${r.field}.is.null,${r.field}.neq.${quoted(v)})`;
    case 'contains': return `${r.field}.ilike.${quoted(`*${v}*`)}`;
    case 'not_contains': return `or(${r.field}.is.null,${r.field}.not.ilike.${quoted(`*${v}*`)})`;
    default: return null;
  }
}

export function rulesToPostgrest(rules: SegmentRules | null | undefined): string | null {
  const rawGroups = rules?.groups ?? [];
  const groups = rawGroups
    .map((g) => {
      if (g.match !== 'and' && g.match !== 'or') throw new Error('Grupo de segmento inválido');
      const filters = g.rules.map((rule) => {
        const filter = ruleToFilter(rule);
        if (!filter) throw new Error(`Regra de segmento inválida: ${rule.field}`);
        return filter;
      });
      return { match: g.match, filters };
    })
    .filter((g) => g.filters.length > 0);
  if (groups.length === 0) return null;
  const parts = groups.map((g) => (g.filters.length === 1 ? g.filters[0] : `${g.match}(${g.filters.join(',')})`) );
  return parts.length === 1 ? parts[0] : parts.join(',');
}

function audienceRulesPayload(rules: SegmentRules | null | undefined): { groups: SegmentRuleGroup[] } {
  return { groups: rules?.groups ?? [] };
}

type TalkXAudienceRpc = (name: string, args: Record<string, unknown>) => Promise<{
  data: unknown;
  error: { message: string } | null;
}>;

const AUDIENCE_RPC_PAGE_LIMIT = 1000;

/** Lança se as regras contiverem campos que exigem a ponte Singu (ponteOnly). */
function assertNoPonteOnlyFields(rules: SegmentRules | null | undefined): void {
  const ponteFields = (rules?.groups ?? [])
    .flatMap((g) => g.rules)
    .filter((r) => RULE_FIELDS.find((f) => f.value === r.field)?.ponteOnly);
  if (ponteFields.length > 0) {
    throw new Error('real_sector e real_uf exigem p_contact_ids da ponte Singu para serem resolvidos');
  }
}

export async function countAudience(rules: SegmentRules | null | undefined, segmentIds?: string[]): Promise<number> {
  assertNoPonteOnlyFields(rules);
  const rpc = supabase.rpc.bind(supabase) as unknown as TalkXAudienceRpc;
  const { data, error } = await rpc('talkx_resolve_audience', {
    p_rules: audienceRulesPayload(rules),
    p_segment_ids: segmentIds ?? null,
    p_mode: 'count',
    p_limit: null,
    p_after: null,
  });
  if (error) throw new Error(error.message);
  const result = data as { eligible?: number } | null;
  return Number(result?.eligible ?? 0);
}

export interface AudienceContact { id: string; name: string; nickname: string | null; phone: string; company: string | null; avatar_url: string | null; tags: string[] | null }

export async function resolveAudience(rules: SegmentRules | null | undefined, limit = 5000, segmentIds?: string[]): Promise<AudienceContact[]> {
  assertNoPonteOnlyFields(rules);
  const rpc = supabase.rpc.bind(supabase) as unknown as TalkXAudienceRpc;
  const target = Math.max(0, Math.floor(limit));
  const rows: AudienceContact[] = [];
  let after: string | null = null;

  while (rows.length < target) {
    const pageSize = Math.min(AUDIENCE_RPC_PAGE_LIMIT, target - rows.length);
    const { data, error } = await rpc('talkx_resolve_audience', {
      p_rules: audienceRulesPayload(rules),
      p_segment_ids: segmentIds ?? null,
      p_mode: 'page',
      p_limit: pageSize,
      p_after: after,
    });
    if (error) throw new Error(error.message);
    const page = (data ?? {}) as { rows?: AudienceContact[]; has_more?: boolean; next_after?: string | null };
    const batch = page.rows ?? [];
    rows.push(...batch);
    if (!page.has_more || batch.length === 0) break;
    after = page.next_after ?? null;
    if (!after) break;
  }

  return rows;
}

export function useAudienceEstimate(rules: SegmentRules | null | undefined, enabled = true) {
  const key = JSON.stringify(rules ?? null);
  const { complete, incompleteCount } = splitRules(rules);
  return useQuery({
    queryKey: ['talkx-audience-estimate', key],
    queryFn: async () => {
      const [count, sample] = await Promise.all([countAudience(complete), resolveAudience(complete, 5)]);
      return { count, sample, incompleteCount };
    },
    enabled,
    staleTime: 15_000,
  });
}

/* ------------------------------------------------------------------ */
/* X103 — KPIs da biblioteca de segmentos (RPC talkx_segment_library_stats) */
/* ------------------------------------------------------------------ */

export interface TalkXSegmentLibraryMonth {
  month: string;
  has_data: boolean;
  total_segments: number | null;
  active_segments: number | null;
  crm360_segments: number | null;
  deliveries: number | null;
  conversions: number | null;
  conversion_pct: number | null;
}

export interface TalkXSegmentLibraryConversion {
  value_pct: number | null;
  previous_pct: number | null;
  delta_pp: number | null;
  has_data: boolean;
  deliveries: number;
  conversions: number;
  previous_deliveries: number;
  previous_conversions: number;
  min_deliveries: number;
}

export interface TalkXSegmentLibraryStats {
  generated_at: string;
  timezone: string;
  month_start: string;
  total_segments: number;
  active_this_month: number;
  active_previous_month: number;
  active_delta: number;
  crm360_connected: number;
  crm360_previous_month: number;
  crm360_delta: number;
  conversion: TalkXSegmentLibraryConversion;
  series: TalkXSegmentLibraryMonth[];
}

type TalkXLibraryStatsRpc = (name: string, args: Record<string, unknown>) => Promise<{
  data: unknown;
  error: { message: string } | null;
}>;

export const LIBRARY_STATS_QUERY_KEY = ['talkx-segment-library-stats', SEGMENT_TIMEZONE] as const;

export function useSegmentLibraryStats() {
  return useQuery({
    queryKey: LIBRARY_STATS_QUERY_KEY,
    queryFn: async () => {
      const rpc = supabase.rpc.bind(supabase) as unknown as TalkXLibraryStatsRpc;
      const { data, error } = await rpc('talkx_segment_library_stats', { p_timezone: SEGMENT_TIMEZONE });
      if (error) throw new Error(error.message);
      return data as TalkXSegmentLibraryStats;
    },
    staleTime: 60_000,
  });
}

/* ------------------------------------------------------------------ */
/* X114 — seleção em massa e ações pela RPC guardada                   */
/* ------------------------------------------------------------------ */

export type TalkXSegmentBulkAction = 'draft' | 'activate' | 'deactivate' | 'archive' | 'tag';

export interface TalkXSegmentBulkResult {
  segment_id: string;
  action: TalkXSegmentBulkAction;
  succeeded: boolean;
  status: string | null;
  archived_at: string | null;
  tags: string[] | null;
  error_code: string | null;
  error_message: string | null;
}

export const BULK_ACTION_MAX_IDS = 200;

type TalkXBulkRpc = (name: string, args: Record<string, unknown>) => Promise<{
  data: unknown;
  error: { message: string; code?: string | null } | null;
}>;

const bulkFailure = (
  segmentId: string,
  action: TalkXSegmentBulkAction,
  code: string,
  message: string,
): TalkXSegmentBulkResult => ({
  segment_id: segmentId,
  action,
  succeeded: false,
  status: null,
  archived_at: null,
  tags: null,
  error_code: code,
  error_message: message,
});

export async function applySegmentBulkAction(input: {
  action: TalkXSegmentBulkAction;
  ids: string[];
  tag?: string;
}): Promise<TalkXSegmentBulkResult[]> {
  const ids = Array.from(new Set(input.ids.filter((id) => typeof id === 'string' && id.trim() !== '')));
  if (ids.length === 0) throw new Error('Selecione ao menos um segmento.');
  const tag = input.tag?.trim();
  if (input.action === 'tag' && !tag) throw new Error('Informe a tag para aplicar em massa.');

  const rpc = supabase.rpc.bind(supabase) as unknown as TalkXBulkRpc;
  const results: TalkXSegmentBulkResult[] = [];

  for (let start = 0; start < ids.length; start += BULK_ACTION_MAX_IDS) {
    const chunk = ids.slice(start, start + BULK_ACTION_MAX_IDS);
    const args: Record<string, unknown> = { p_action: input.action, p_segment_ids: chunk };
    if (input.action === 'tag') args.p_tag = tag;
    const { data, error } = await rpc('talkx_segment_bulk_action', args);

    if (error) {
      for (const id of chunk) results.push(bulkFailure(id, input.action, error.code ?? 'ERRO', error.message));
      continue;
    }

    const rows = (Array.isArray(data) ? data : []) as TalkXSegmentBulkResult[];
    const byId = new Map(rows.map((row) => [row.segment_id, row]));
    for (const id of chunk) {
      const row = byId.get(id);
      results.push(row
        ? { ...row, succeeded: row.succeeded === true }
        : bulkFailure(id, input.action, 'SEM_RESPOSTA', 'O servidor não respondeu por este segmento.'));
    }
  }

  return results;
}

/* ------------------------------------------------------------------ */
/* CRUD                                                               */
/* ------------------------------------------------------------------ */

export type TalkXSegmentsViewMode = 'list' | 'grid';

export function useTalkXSegments() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [viewMode, setViewMode] = useState<TalkXSegmentsViewMode>('list');

  const segmentsQuery = useQuery({
    queryKey: ['talkx-segments'],
    queryFn: async () => {
      const { data, error } = await fromTable('talkx_segments')
        .select('*, creator:created_by(name)')
        .order('is_favorite', { ascending: false })
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TalkXSegment[];
    },
  });

  const libraryStatsQuery = useSegmentLibraryStats();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['talkx-segments'] });
    qc.invalidateQueries({ queryKey: LIBRARY_STATS_QUERY_KEY });
  };

  const createSegment = useMutation({
    mutationFn: async (input: Partial<TalkXSegment> & { name: string; rules: SegmentRules }) => {
      const userId = profile?.id;
      if (!userId) throw new Error('Perfil ainda não carregado');
      const estimated_count = await countAudience(input.rules);
      const { data, error } = await fromTable('talkx_segments')
        .insert({ ...input, estimated_count, created_by: userId })
        .select().single();
      if (error) throw error;
      return data as TalkXSegment;
    },
    onSuccess: () => { invalidate(); toast.success('Segmento publicado'); },
    onError: (e: Error) => toast.error(`Erro ao salvar segmento: ${e.message}`),
  });

  const updateSegment = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<TalkXSegment> & { id: string }) => {
      if (!profile?.id) throw new Error('Perfil ainda não carregado');
      const patch: Record<string, unknown> = { ...updates };
      delete patch.creator;
      if (updates.rules) patch.estimated_count = await countAudience(updates.rules);
      const { data, error } = await fromTable('talkx_segments').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data as TalkXSegment;
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(`Erro ao atualizar segmento: ${e.message}`),
  });

  const deleteSegment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await fromTable('talkx_segments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Segmento excluído'); },
    onError: (e: Error) => toast.error(`Erro ao excluir: ${e.message}`),
  });

  const refreshEstimates = useMutation({
    mutationFn: async (segments: TalkXSegment[]) => {
      await Promise.all(segments.map(async (s) => {
        const estimated_count = await countAudience(s.rules);
        if (estimated_count !== s.estimated_count) await fromTable('talkx_segments').update({ estimated_count }).eq('id', s.id);
      }));
    },
    onSuccess: () => invalidate(),
  });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const bulkAction = useMutation({
    mutationFn: (input: { action: TalkXSegmentBulkAction; ids?: string[]; tag?: string }) =>
      applySegmentBulkAction({ action: input.action, ids: input.ids ?? selectedIds, tag: input.tag }),
    onSuccess: () => invalidate(),
  });

  return {
    segments: segmentsQuery.data ?? [],
    isLoading: segmentsQuery.isLoading,
    isError: segmentsQuery.isError,
    error: segmentsQuery.error as Error | null,
    refetch: segmentsQuery.refetch,
    libraryStats: libraryStatsQuery.data ?? null,
    libraryStatsLoading: libraryStatsQuery.isLoading,
    libraryStatsError: libraryStatsQuery.error as Error | null,
    refetchLibraryStats: libraryStatsQuery.refetch,
    createSegment, updateSegment, deleteSegment, refreshEstimates,
    viewMode, setViewMode,
    selectedIds,
    isSelected: (id: string) => selectedIds.includes(id),
    toggleSelect: (id: string) => setSelectedIds((prev) =>
      (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    selectAll: (ids: string[]) => setSelectedIds(Array.from(new Set(ids))),
    clearSelection: () => setSelectedIds([]),
    runBulkAction: (input: { action: TalkXSegmentBulkAction; ids?: string[]; tag?: string }) =>
      bulkAction.mutateAsync(input),
    isBulkRunning: bulkAction.isPending,
  };
}
