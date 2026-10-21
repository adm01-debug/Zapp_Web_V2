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

export const RULE_FIELDS: { value: RuleField; label: string; kind: 'text' | 'array' | 'number' | 'date' | 'enum' | 'uuid'; category: 'basico' | 'comportamento' | 'comercial' | 'lgpd'; options?: string[]; comingSoon?: boolean }[] = [
  { value: 'tags', label: 'Tags', kind: 'array', category: 'basico' },
  { value: 'company', label: 'Empresa', kind: 'text', category: 'basico' },
  { value: 'city', label: 'Cidade', kind: 'text', category: 'basico' },
  { value: 'state', label: 'UF', kind: 'text', category: 'basico' },
  // Setor de atividade e UF REAIS (ponte Singu): o valor vive em
  // companies.ramo_atividade / company_addresses.estado (is_primary) e nao em
  // public.contacts, entao nao vem de texto livre digitado no Zapp. kind enum
  // com igualdade exata (eq/neq/is_empty); sem `options` fixas — a lista de
  // ramos/UFs vem da RPC do Singu, e uma constante local ofereceria valor que a
  // ponte pode recusar. Sem `category` nova: entram no grupo básico junto de
  // Empresa/Cidade/UF. company/city/state seguem intactos (segmentos salvos).
  { value: 'real_sector', label: 'Setor de atividade (real)', kind: 'enum', category: 'basico' },
  { value: 'real_uf', label: 'UF (real)', kind: 'enum', category: 'basico' },
  // Valores canônicos dos grupos (mesma lista que classifica public.contacts.group_category),
  // para a regra nunca oferecer categoria que o banco não guarda.
  { value: 'group_category', label: 'Grupo', kind: 'enum', category: 'basico', options: GROUP_CATEGORIES.map((c) => c.value) },
  { value: 'email', label: 'E-mail', kind: 'text', category: 'basico' },
  { value: 'channel_type', label: 'Canal de origem', kind: 'text', category: 'basico' },
  { value: 'lead_origin', label: 'Origem do lead', kind: 'text', category: 'basico', comingSoon: true },
  { value: 'assigned_to', label: 'Responsável', kind: 'uuid', category: 'comercial' },
  // Tipos de contato e status de conversa vem das fontes canonicas: uma regra de segmento
  // nunca pode oferecer valor que o banco rejeita (a lista local tinha 'lead'/'sicoob_gifts',
  // extintos, e omitia 3 dos 6 tipos reais).
  { value: 'contact_type', label: 'Tipo do contato', kind: 'enum', category: 'comercial', options: CONTACT_TYPES.map((t) => t.value) },
  { value: 'conversation_status', label: 'Status da conversa', kind: 'enum', category: 'comportamento', options: [...CONVERSATION_STATUSES] },
  // Nada calcula contacts.lead_score/risk_score (sempre 0/nulo): filtrar por eles nunca muda o
  // resultado. Ficam "em breve" (nao selecionaveis) ate existir calculo real a partir de dado do banco.
  { value: 'lead_score', label: 'Lead score', kind: 'number', category: 'comercial', comingSoon: true },
  { value: 'risk_score', label: 'Risco de churn', kind: 'number', category: 'comportamento', comingSoon: true },
  // Opções vindas do vocabulário canônico (IA-021/IA-022): sentimento em pt-BR
  // e prioridade na escala EN do front. Uma regra de segmento nunca pode
  // oferecer valor que o banco não guarda.
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
  // uuid (ex.: public.contacts.assigned_to) aceita igualdade, mas NAO 'contem':
  // o PostgREST viraria ilike numa coluna uuid e o Postgres rejeita
  // ("operator does not exist: uuid ~~* text").
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

/**
 * O conector que vale para o segmento inteiro. Regras gravadas antes deste
 * campo (e as que o wizard monta) não trazem `join`: o padrão 'or' mantém o que
 * o motor sempre aplicou e evita que a tela prometa um E que a contagem/entrega
 * não fazem.
 */
export const rulesJoin = (rules: SegmentRules | null | undefined): SegmentJoin => (rules?.join === 'and' ? 'and' : 'or');

/**
 * Uma condição só é utilizável quando tem valor para o seu tipo: texto/enum/array
 * exigem valor não vazio; número e data exigem valor numérico válido (dias > 0).
 * `is_set`/`is_empty` não pedem valor. Campo desconhecido nunca é completo — a
 * condição nasce em branco no construtor e não pode ir para o motor.
 */
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

/**
 * Separa as condições completas das incompletas. Só as completas podem ir para a
 * estimativa/PostgREST (uma regra vazia derrubaria o count para 0 e o botão para
 * de funcionar); as incompletas viram apenas a contagem que a tela exibe fora da
 * estimativa. Grupos que ficam sem nenhuma condição completa são descartados,
 * como já faz o `rulesToPostgrest`.
 */
export function splitRules(rules: SegmentRules | null | undefined): { complete: SegmentRules; incompleteCount: number } {
  let incompleteCount = 0;
  const groups = (rules?.groups ?? [])
    .map((group) => {
      const completeRules = group.rules.filter((rule) => {
        // "Em breve" (lead_score/risk_score): a regra é completa e bem descrita
        // (isRuleComplete/describeRule dizem a verdade), mas a coluna nunca é
        // calculada — então fica fora da estimativa/PostgREST e barra a
        // publicação via validateSegment, sem quebrar o catálogo v2.
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

// Escapa \ ANTES de escapar " — em um unico passe, para nao deixar uma barra
// invertida do valor original "engolir" a aspa de fechamento do filtro
// PostgREST (js/incomplete-sanitization: sem isso, um valor terminado em \
// fecha a string do filtro antes do previsto). Virgula nao precisa de escape
// aqui: dentro de uma string entre aspas, o parser do PostgREST nao a trata
// como separador de filtros — escapa-la geraria uma barra invertida espuria
// no valor buscado (achado do Codex na PR #896: "Acme, Inc" deixava de bater
// porque o escape da virgula, ao passar por esta funcao, dobrava a barra).
const quoted = (v: string) => `"${v.replace(/[\\"]/g, (c) => (c === '\\' ? '\\\\' : '\\"'))}"`;

function ruleToFilter(r: SegmentRule): string | null {
  const def = RULE_FIELDS.find((f) => f.value === r.field);
  if (!def) return null;
  if (r.field === 'real_sector' || r.field === 'real_uf') return null;
  // "Em breve" nunca gera filtro PostgREST: a coluna não é calculada e qualquer
  // filtro sobre ela seria morto (sempre 0/nulo). Falha fechada via rulesToPostgrest.
  if (def.comingSoon) return null;
  const v = r.value.trim();
  switch (r.op) {
    case 'is_set': return `${r.field}.not.is.null`;
    case 'is_empty': {
      if (def.kind === 'array') return `or(${r.field}.is.null,${r.field}.eq.{})`;
      // Coluna uuid nao compara com string vazia (`eq.`): "vazio" aqui e apenas nulo.
      if (def.kind === 'uuid') return `${r.field}.is.null`;
      return `or(${r.field}.is.null,${r.field}.eq.)`;
    }
    // "nos ultimos (dias)" / "ha mais de (dias)" sao DIAS DE CALENDARIO no fuso do produto, nao
    // uma janela de d*24h: as 22h30 em SP a janela de 7 dias alcancava o 8o dia de calendario e a
    // audiencia saia um dia mais larga. Mesma semantica de dias de calendario do R3-06 (timeline).
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
  return parts.length === 1 ? parts[0] : parts.join(',');
}

/** Formato aceito pela RPC talkx_resolve_audience (X016): { groups: [...] }. */
function audienceRulesPayload(rules: SegmentRules | null | undefined): { groups: SegmentRuleGroup[] } {
  return { groups: rules?.groups ?? [] };
}

type TalkXAudienceRpc = (name: string, args: Record<string, unknown>) => Promise<{
  data: unknown;
  error: { message: string } | null;
}>;

/** Teto de uma página da RPC de audiência (X016). */
const AUDIENCE_RPC_PAGE_LIMIT = 1000;

/**
 * X017 — a contagem do público é decidida no servidor pela RPC
 * talkx_resolve_audience (X016), com o MESMO critério de elegibilidade do
 * snapshot (deleted_at/LID/telefone/visibilidade). Antes o navegador contava via
 * PostgREST filtrando só `phone not null`, o que superestimava o público.
 */
export async function countAudience(rules: SegmentRules | null | undefined, segmentIds?: string[]): Promise<number> {

  { const _rf = rules?.groups?.flatMap((g) => g.rules ?? []).find((r) => r.field === 'real_sector' || r.field === 'real_uf')?.field; if (_rf) throw new Error(_rf + ' exige pre-resolucao via p_contact_ids (ponte Singu)'); }
  const rpc = supabase.rpc as unknown as TalkXAudienceRpc;

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

/**
 * X017 — a amostra/lista do público passa a vir da RPC talkx_resolve_audience
 * (modo `page`, keyset) em vez do PostgREST no navegador. O telefone chega
 * mascarado pelo servidor e a paginação percorre até `limit` (ou o fim da lista).
 */
export async function resolveAudience(rules: SegmentRules | null | undefined, limit = 5000, segmentIds?: string[]): Promise<AudienceContact[]> {

  { const _rf2 = rules?.groups?.flatMap((g) => g.rules ?? []).find((r) => r.field === 'real_sector' || r.field === 'real_uf')?.field; if (_rf2) throw new Error(_rf2 + ' exige pre-resolucao via p_contact_ids (ponte Singu)'); }
  const rpc = supabase.rpc as unknown as TalkXAudienceRpc;

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

/** Um ponto da série mensal da RPC (`series[8]`), do mês mais antigo ao corrente. */
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

/** Chave da consulta dos KPIs (X103) — a mesma usada para invalidar depois de salvar. */
export const LIBRARY_STATS_QUERY_KEY = ['talkx-segment-library-stats', SEGMENT_TIMEZONE] as const;

/**
 * X103 — os KPIs da biblioteca são decididos no servidor pela RPC
 * `talkx_segment_library_stats`. O navegador não soma mais `estimated_count` nem
 * conta `status = 'active'`: "Ativos este mês" é uso real (campanha iniciada no
 * mês) e "Conversão média" vem das entregas/conversões com base mínima.
 */
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
/* (talkx_segment_bulk_action, entregue em t_9c7ad8fc)                 */
/* ------------------------------------------------------------------ */

/**
 * Ações que a RPC guardada aceita. "Excluir" da biblioteca é `archive`
 * (decisão N22: arquivar, não apagar).
 */
export type TalkXSegmentBulkAction = 'draft' | 'activate' | 'deactivate' | 'archive' | 'tag';

/**
 * Uma linha da RPC `talkx_segment_bulk_action`: o resultado é POR SEGMENTO — o
 * lote nunca devolve um único veredito nem para no primeiro item recusado.
 */
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

/** Teto de ids por chamada da RPC (t_9c7ad8fc); acima disso o lote é dividido. */
export const BULK_ACTION_MAX_IDS = 200;

type TalkXBulkRpc = (name: string, args: Record<string, unknown>) => Promise<{
  data: unknown;
  error: { message: string; code?: string | null } | null;
}>;

/** Resultado de falha de um segmento: nada foi aplicado e o hook diz o porquê. */
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

/**
 * Aplica uma ação da biblioteca a vários segmentos pela RPC guardada
 * `talkx_segment_bulk_action`. A guarda de uso de X101 é decidida NO SERVIDOR,
 * por segmento: item em campanha `scheduled`/`sending`/`paused` volta
 * `succeeded: false` com `error_code` `P0001` e o nome da campanha dentro de
 * `error_message`. O hook repete o veredito do servidor — item bloqueado nunca
 * aparece como aplicado.
 *
 * O lote é dividido em chamadas de no máximo `BULK_ACTION_MAX_IDS` (a RPC recusa
 * acima disso) e a falha de uma chamada não descarta as outras: cada segmento
 * recebe o próprio resultado.
 */
export async function applySegmentBulkAction(input: {
  action: TalkXSegmentBulkAction;
  ids: string[];
  tag?: string;
}): Promise<TalkXSegmentBulkResult[]> {
  // Ids únicos, como a própria RPC faz — sem isto um id repetido ficaria "sem
  // resposta" na hora de casar as linhas devolvidas.
  const ids = Array.from(new Set(input.ids.filter((id) => typeof id === 'string' && id.trim() !== '')));
  if (ids.length === 0) throw new Error('Selecione ao menos um segmento.');
  const tag = input.tag?.trim();
  // Falha fechada ANTES de chamar o servidor: entrada inválida não aplica nada.
  if (input.action === 'tag' && !tag) throw new Error('Informe a tag para aplicar em massa.');

  const rpc = supabase.rpc.bind(supabase) as unknown as TalkXBulkRpc;
  const results: TalkXSegmentBulkResult[] = [];

  for (let start = 0; start < ids.length; start += BULK_ACTION_MAX_IDS) {
    const chunk = ids.slice(start, start + BULK_ACTION_MAX_IDS);
    const args: Record<string, unknown> = { p_action: input.action, p_segment_ids: chunk };
    if (input.action === 'tag') args.p_tag = tag;
    const { data, error } = await rpc('talkx_segment_bulk_action', args);

    if (error) {
      // Erro de entrada/transporte desta chamada: nada dela foi aplicado. Vira
      // falha item a item em vez de derrubar o lote inteiro.
      for (const id of chunk) results.push(bulkFailure(id, input.action, error.code ?? 'ERRO', error.message));
      continue;
    }

    const rows = (Array.isArray(data) ? data : []) as TalkXSegmentBulkResult[];
    const byId = new Map(rows.map((row) => [row.segment_id, row]));
    for (const id of chunk) {
      const row = byId.get(id);
      // Sem linha para o segmento não há prova de aplicação: falha, não sucesso.
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

/** Modo de visualização da biblioteca de segmentos: lista (uma coluna) ou grade. */
export type TalkXSegmentsViewMode = 'list' | 'grid';

export function useTalkXSegments() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  // Alternância lista/grade da biblioteca. O projeto não persiste preferência de
  // modo (Contatos também guarda `viewMode` em estado local): fica na sessão.
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
    // Publicar/editar/excluir segmento muda o estoque e a origem dos KPIs: sem
    // isto o total do topo fica velho até o próximo recarregamento.
    qc.invalidateQueries({ queryKey: LIBRARY_STATS_QUERY_KEY });
  };

  const createSegment = useMutation({
    mutationFn: async (input: Partial<TalkXSegment> & { name: string; rules: SegmentRules }) => {
      // O perfil pode ainda não ter carregado quando o clique acontece; sem o id
      // a RLS rejeita o insert (created_by nulo). Falha com mensagem clara em vez
      // de gravar um segmento órfão.
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

  // X114 — seleção em massa da biblioteca. Guardamos só os ids: "selecionar
  // todos" é o que a tela considerar visível (filtro/página), não o catálogo.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const bulkAction = useMutation({
    mutationFn: (input: { action: TalkXSegmentBulkAction; ids?: string[]; tag?: string }) =>
      applySegmentBulkAction({ action: input.action, ids: input.ids ?? selectedIds, tag: input.tag }),
    // A ação pode mudar status/arquivo/tags: lista e KPIs voltam do servidor.
    onSuccess: () => invalidate(),
  });

  return {
    segments: segmentsQuery.data ?? [],
    isLoading: segmentsQuery.isLoading,
    isError: segmentsQuery.isError,
    error: segmentsQuery.error as Error | null,
    refetch: segmentsQuery.refetch,
    // X103 — KPIs da biblioteca; a tela não recalcula nada no navegador.
    libraryStats: libraryStatsQuery.data ?? null,
    libraryStatsLoading: libraryStatsQuery.isLoading,
    libraryStatsError: libraryStatsQuery.error as Error | null,
    refetchLibraryStats: libraryStatsQuery.refetch,
    createSegment, updateSegment, deleteSegment, refreshEstimates,
    viewMode, setViewMode,
    // X114 — seleção e ações em massa (RPC guardada talkx_segment_bulk_action).
    // `runBulkAction` devolve o resultado POR SEGMENTO; a tela decide o que
    // mostrar, mas item barrado pela guarda chega aqui com `succeeded: false`.
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
