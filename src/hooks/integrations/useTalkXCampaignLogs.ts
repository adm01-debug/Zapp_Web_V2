import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';

/**
 * C-11 — log de entrega da campanha (`talkx_campaign_logs`).
 *
 * O motor grava cada tentativa em `talkx_delivery_log` e a RPC que lê esse
 * histórico já existia, mas nenhuma tela lia: quando um destinatário não
 * recebia, o operador só via o status final, sem saber em que etapa falhou.
 * O histórico aqui vem do servidor, paginado por cursor composto
 * (`created_at` + `id`): a RPC recusa só `created_at` com 22023 porque, em
 * empate de timestamp, a página seguinte perderia linhas.
 */

type TalkXRpc = (name: string, args: Record<string, unknown>) => Promise<{
  data: unknown;
  error: { message: string; code?: string } | null;
}>;

/** A RPC limita o `p_limit` em 1..1000; 100 mantém a tabela leve no painel. */
export const TALKX_CAMPAIGN_LOG_PAGE_SIZE = 100;

export interface TalkXCampaignLogRow {
  id: string;
  campaignId: string | null;
  recipientId: string | null;
  /** Tentativa do destinatário (1 = primeiro envio). */
  attempt: number;
  stage: string;
  outcome: string;
  httpStatus: number | null;
  errorCode: string | null;
  workerId: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface TalkXCampaignLogCursor {
  after: string;
  afterId: string;
}

export interface TalkXCampaignLogPage {
  rows: TalkXCampaignLogRow[];
  nextCursor: TalkXCampaignLogCursor | null;
}

export interface TalkXCampaignLogPerson {
  name: string | null;
  phone: string | null;
}

const STAGE_LABELS: Record<string, string> = {
  claim: 'Reserva',
  suppress_check: 'Checagem de bloqueio',
  dispatch: 'Envio',
  complete: 'Conclusão',
  reconcile: 'Reconciliação',
};

const OUTCOME_LABELS: Record<string, string> = {
  sent: 'Enviado',
  failed: 'Falhou',
  outcome_unknown: 'Sem confirmação',
  skipped: 'Ignorado',
  rescheduled: 'Reagendado',
  no_claim: 'Sem reserva',
  stopped: 'Interrompido',
};

/**
 * Códigos que aparecem no log: os da própria RPC e os devolvidos pelo
 * WhatsApp. Código desconhecido continua visível — esconder seria pior do que
 * mostrar o número cru.
 */
const ERROR_HINTS: Record<string, string> = {
  '131026': 'Número não recebe mensagem (sem WhatsApp)',
  '131047': 'Fora da janela de 24h do WhatsApp',
  '130429': 'Limite de envio do WhatsApp atingido',
  rate_limited: 'Limite de envio atingido',
  service_role_required: 'Chamada sem permissão de serviço',
  talkx_admin_required: 'Somente administradores e supervisores',
  talkx_campaign_logs_cursor_incompleto: 'Paginação inválida — recarregue o log',
};

const EMPTY_PEOPLE: Record<string, TalkXCampaignLogPerson> = {};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function trimmedText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text;
}

/** Traduz a linha crua da RPC para o contrato da tela; linha sem id/data é lixo. */
export function logRowFromServer(raw: unknown): TalkXCampaignLogRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id : null;
  const createdAt = typeof row.created_at === 'string' ? row.created_at : null;
  if (!id || !createdAt) return null;
  const attempt = toNumber(row.attempt);
  return {
    id,
    campaignId: typeof row.campaign_id === 'string' ? row.campaign_id : null,
    recipientId: typeof row.recipient_id === 'string' ? row.recipient_id : null,
    attempt: attempt !== null && attempt > 0 ? Math.floor(attempt) : 0,
    stage: typeof row.stage === 'string' ? row.stage : '',
    outcome: typeof row.outcome === 'string' ? row.outcome : '',
    httpStatus: toNumber(row.http_status),
    errorCode: trimmedText(row.error_code),
    workerId: trimmedText(row.worker_id),
    durationMs: toNumber(row.duration_ms),
    createdAt,
  };
}

/**
 * Cursor da próxima página: só existe quando a página veio cheia (página
 * curta = fim do log). Sai da última linha porque a RPC ordena crescente.
 */
export function nextLogCursor(
  rows: TalkXCampaignLogRow[],
  pageSize: number = TALKX_CAMPAIGN_LOG_PAGE_SIZE,
): TalkXCampaignLogCursor | null {
  if (rows.length < pageSize) return null;
  const last = rows[rows.length - 1];
  if (!last?.createdAt || !last?.id) return null;
  return { after: last.createdAt, afterId: last.id };
}

export function stageLabel(stage: string | null | undefined): string {
  if (!stage) return '—';
  return STAGE_LABELS[stage] ?? stage;
}

export function outcomeLabel(outcome: string | null | undefined): string {
  if (!outcome) return '—';
  return OUTCOME_LABELS[outcome] ?? outcome;
}

/** Cor do resultado: só o que exporta conteúdo para o cliente fica verde. */
export function outcomeTone(outcome: string | null | undefined): string {
  if (outcome === 'sent') return 'text-dash-green';
  if (outcome === 'failed') return 'text-dash-red';
  return 'text-foreground-secondary';
}

export function describeLogError(code: string | null | undefined): string | null {
  const key = trimmedText(code);
  if (!key) return null;
  return ERROR_HINTS[key] ?? key;
}

export function formatLogDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`;
}

export async function fetchTalkXCampaignLogPage(
  campaignId: string,
  cursor: TalkXCampaignLogCursor | null,
): Promise<TalkXCampaignLogPage> {
  const args: Record<string, unknown> = {
    p_campaign_id: campaignId,
    p_limit: TALKX_CAMPAIGN_LOG_PAGE_SIZE,
  };
  if (cursor) {
    args.p_after = cursor.after;
    args.p_after_id = cursor.afterId;
  }
  const rpc = supabase.rpc.bind(supabase) as unknown as TalkXRpc;
  const { data, error } = await rpc('talkx_campaign_logs', args);
  if (error) throw error;
  const rows = (Array.isArray(data) ? data : [])
    .map(logRowFromServer)
    .filter((row): row is TalkXCampaignLogRow => row !== null);
  return { rows, nextCursor: nextLogCursor(rows) };
}

/** Nomes dos destinatários da página carregada (a RPC devolve só o id). */
async function fetchLogPeople(ids: string[]): Promise<Record<string, TalkXCampaignLogPerson>> {
  if (ids.length === 0) return EMPTY_PEOPLE;
  const { data } = await fromTable('talkx_recipients')
    .select('id, contacts:contact_id(name, phone)')
    .in('id', ids);
  const people: Record<string, TalkXCampaignLogPerson> = {};
  (Array.isArray(data) ? data : []).forEach((raw) => {
    const row = raw as { id?: unknown; contacts?: { name?: unknown; phone?: unknown } | null };
    if (typeof row.id !== 'string') return;
    people[row.id] = {
      name: trimmedText(row.contacts?.name),
      phone: trimmedText(row.contacts?.phone),
    };
  });
  return people;
}

export function useTalkXCampaignLogs(campaignId: string | null | undefined) {
  const enabled = !!campaignId;
  const query = useInfiniteQuery({
    queryKey: ['talkx-campaign-logs', campaignId],
    enabled,
    initialPageParam: null as TalkXCampaignLogCursor | null,
    queryFn: ({ pageParam }) => fetchTalkXCampaignLogPage(campaignId as string, pageParam),
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    staleTime: 30_000,
  });

  const rows = useMemo(
    () => (query.data?.pages ?? []).flatMap((page) => page.rows),
    [query.data],
  );

  const recipientIds = useMemo(() => {
    const ids = new Set<string>();
    rows.forEach((row) => { if (row.recipientId) ids.add(row.recipientId); });
    return Array.from(ids).sort();
  }, [rows]);

  const people = useQuery({
    queryKey: ['talkx-campaign-logs', campaignId, 'pessoas', recipientIds],
    enabled: enabled && recipientIds.length > 0,
    queryFn: () => fetchLogPeople(recipientIds),
    staleTime: 5 * 60_000,
  });

  return {
    rows,
    isLoading: enabled && query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: () => { void query.refetch(); },
    hasMore: query.hasNextPage === true,
    isLoadingMore: query.isFetchingNextPage,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
    people: people.data ?? EMPTY_PEOPLE,
    peopleLoading: people.isLoading,
  };
}