import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';
import { useAuth } from '@/hooks/auth/useAuth';
import { toast } from 'sonner';

/* ------------------------------------------------------------------ */
/* Modelo de regras                                                   */
/* ------------------------------------------------------------------ */

export type RuleField =
  | 'tags' | 'company' | 'contact_type' | 'conversation_status' | 'channel_type'
  | 'consent_status' | 'lead_score' | 'risk_score' | 'ai_priority' | 'ai_sentiment'
  | 'lead_origin' | 'updated_at' | 'created_at' | 'email';
export type RuleOp =
  | 'eq' | 'neq' | 'contains' | 'not_contains' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in_last_days' | 'not_in_last_days' | 'is_set' | 'is_empty';

export interface SegmentRule { id: string; field: RuleField; op: RuleOp; value: string }
export interface SegmentRuleGroup { id: string; match: 'and' | 'or'; rules: SegmentRule[] }
/** Grupos são combinados com OU entre si (como no mockup "Grupo 1 OU Grupo 2"). */
export interface SegmentRules { groups: SegmentRuleGroup[] }

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

export const RULE_FIELDS: { value: RuleField; label: string; kind: 'text' | 'array' | 'number' | 'date' | 'enum'; category: 'basico' | 'comportamento' | 'comercial' | 'lgpd'; options?: string[] }[] = [
  { value: 'tags', label: 'Tags', kind: 'array', category: 'basico' },
  { value: 'company', label: 'Empresa', kind: 'text', category: 'basico' },
  { value: 'email', label: 'E-mail', kind: 'text', category: 'basico' },
  { value: 'channel_type', label: 'Canal de origem', kind: 'text', category: 'basico' },
  { value: 'lead_origin', label: 'Origem do lead', kind: 'text', category: 'basico' },
  { value: 'contact_type', label: 'Tipo do contato', kind: 'enum', category: 'comercial', options: ['cliente', 'lead', 'fornecedor', 'parceiro'] },
  { value: 'conversation_status', label: 'Status da conversa', kind: 'enum', category: 'comportamento', options: ['open', 'pending', 'resolved', 'waiting'] },
  { value: 'lead_score', label: 'Lead score', kind: 'number', category: 'comercial' },
  { value: 'risk_score', label: 'Risco de churn', kind: 'number', category: 'comportamento' },
  { value: 'ai_priority', label: 'Prioridade (IA)', kind: 'enum', category: 'comportamento', options: ['high', 'urgent', 'medium', 'low'] },
  { value: 'ai_sentiment', label: 'Sentimento (IA)', kind: 'enum', category: 'comportamento', options: ['positive', 'neutral', 'negative'] },
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
  array: [{ value: 'contains', label: 'contém' }, { value: 'not_contains', label: 'não contém' }, { value: 'is_empty', label: 'está vazio' }],
  number: [
    { value: 'eq', label: 'é igual a' }, { value: 'gt', label: 'maior que' }, { value: 'gte', label: 'maior ou igual a' },
    { value: 'lt', label: 'menor que' }, { value: 'lte', label: 'menor ou igual a' },
  ],
  date: [{ value: 'in_last_days', label: 'nos últimos (dias)' }, { value: 'not_in_last_days', label: 'há mais de (dias)' }],
};

export const emptyRules = (): SegmentRules => ({ groups: [{ id: crypto.randomUUID(), match: 'and', rules: [] }] });
export const newRule = (): SegmentRule => ({ id: crypto.randomUUID(), field: 'tags', op: 'contains', value: '' });

const esc = (v: string) => v.replace(/[,.()"]/g, (c) => (c === '"' ? '\\"' : c === ',' ? '\\,' : c)).trim();
const quoted = (v: string) => `"${v.replace(/"/g, '\\"')}"`;

function ruleToFilter(r: SegmentRule): string | null {
  const def = RULE_FIELDS.find((f) => f.value === r.field);
  if (!def) return null;
  const v = r.value.trim();
  switch (r.op) {
    case 'is_set': return def.kind === 'array' ? `${r.field}.not.is.null` : `${r.field}.not.is.null`;
    case 'is_empty': return def.kind === 'array' ? `or(${r.field}.is.null,${r.field}.eq.{})` : `or(${r.field}.is.null,${r.field}.eq.)`;
    case 'in_last_days': {
      const d = Number(v); if (!d) return null;
      return `${r.field}.gte.${new Date(Date.now() - d * 86_400_000).toISOString()}`;
    }
    case 'not_in_last_days': {
      const d = Number(v); if (!d) return null;
      return `${r.field}.lt.${new Date(Date.now() - d * 86_400_000).toISOString()}`;
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
    case 'contains': return `${r.field}.ilike.${quoted(`*${esc(v)}*`)}`;
    case 'not_contains': return `or(${r.field}.is.null,${r.field}.not.ilike.${quoted(`*${esc(v)}*`)})`;
    default: return null;
  }
}

/**
 * Converte regras válidas em filtro PostgREST. Um conjunto explicitamente
 * vazio ainda representa a base inteira, mas uma regra inválida nunca pode ser
 * silenciosamente removida: isso ampliaria a audiência sem consentimento.
 */
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
  const parts = groups.map((g) => (g.filters.length === 1 ? g.filters[0] : `${g.match}(${g.filters.join(',')})`));
  return parts.length === 1 ? (groups[0].filters.length === 1 ? parts[0] : parts[0]) : parts.join(',');
}

function applyRules<T extends { or: (f: string) => T }>(q: T, rules: SegmentRules | null | undefined): T {
  const f = rulesToPostgrest(rules);
  if (!f) return q;
  // .or() já envolve o filtro em or(...); um único and(...) continua correto.
  return q.or(f);
}

/** Estimativa (count exato) do público de um conjunto de regras. */
export async function countAudience(rules: SegmentRules | null | undefined): Promise<number> {
  let q = supabase.from('contacts').select('id', { count: 'exact', head: true }).not('phone', 'is', null);
  q = applyRules(q, rules);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

export interface AudienceContact { id: string; name: string; nickname: string | null; phone: string; company: string | null; avatar_url: string | null; tags: string[] | null }

/** Resolve os contatos do público (limite alto; usado para amostra e para gerar os destinatários). */
export async function resolveAudience(rules: SegmentRules | null | undefined, limit = 5000): Promise<AudienceContact[]> {
  let q = supabase.from('contacts')
    .select('id, name, nickname, phone, company, avatar_url, tags')
    .not('phone', 'is', null)
    .order('name')
    .limit(limit);
  q = applyRules(q, rules);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AudienceContact[];
}

export function useAudienceEstimate(rules: SegmentRules | null | undefined, enabled = true) {
  const key = JSON.stringify(rules ?? null);
  return useQuery({
    queryKey: ['talkx-audience-estimate', key],
    queryFn: async () => {
      const [count, sample] = await Promise.all([countAudience(rules), resolveAudience(rules, 5)]);
      return { count, sample };
    },
    enabled,
    staleTime: 15_000,
  });
}

/* ------------------------------------------------------------------ */
/* CRUD                                                               */
/* ------------------------------------------------------------------ */

export function useTalkXSegments() {
  const qc = useQueryClient();
  const { profile } = useAuth();

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

  const invalidate = () => qc.invalidateQueries({ queryKey: ['talkx-segments'] });

  const createSegment = useMutation({
    mutationFn: async (input: Partial<TalkXSegment> & { name: string; rules: SegmentRules }) => {
      const estimated_count = await countAudience(input.rules);
      const { data, error } = await fromTable('talkx_segments')
        .insert({ ...input, estimated_count, created_by: profile?.id ?? null })
        .select().single();
      if (error) throw error;
      return data as TalkXSegment;
    },
    onSuccess: () => { invalidate(); toast.success('Segmento publicado'); },
    onError: (e: Error) => toast.error(`Erro ao salvar segmento: ${e.message}`),
  });

  const updateSegment = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<TalkXSegment> & { id: string }) => {
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

  return {
    segments: segmentsQuery.data ?? [],
    isLoading: segmentsQuery.isLoading,
    isError: segmentsQuery.isError,
    error: segmentsQuery.error as Error | null,
    refetch: segmentsQuery.refetch,
    createSegment, updateSegment, deleteSegment, refreshEstimates,
  };
}
