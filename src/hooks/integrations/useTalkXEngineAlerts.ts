// C-11 — alertas do motor (`public.talkx_alerts`).
//
// O tick do motor (`talkx_cron_tick`, a cada 5 min) grava nesta tabela quando
// algo sai do normal: campanha parada, reserva de envio expirada, resultado
// desconhecido, falhas seguidas, motor degradado e expurgo falho. A tabela
// existia desde o pacote de saúde do motor e nenhuma tela a lia (C-11): o
// operador só descobria o problema quando a campanha deixava de sair.
//
// Leitura direta da tabela (não há RPC): a policy `talkx_alerts_select` libera
// SELECT para `authenticated` quando `is_admin_or_supervisor(auth.uid())`; para
// quem não é admin/supervisor a RLS devolve zero linhas (não erro).
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fromTable } from '@/lib/supabaseHelpers';

/** Teto de alertas na tela (o motor abre no máximo um por `kind`+campanha). */
export const ENGINE_ALERTS_LIMIT = 20;

/** Janela de repintura: o motor roda a cada 5 min, então 1 min já é folgado. */
export const ENGINE_ALERTS_REFETCH_MS = 60_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TalkXAlertTone = 'danger' | 'warning' | 'info';

export interface TalkXEngineAlert {
  id: string;
  /** `kind` cru do banco (usado como chave de lista). */
  kind: string;
  /** `null` = alerta global do motor (não é de uma campanha específica). */
  campaignId: string | null;
  openedAt: string;
  /** Rótulo em PT-BR do `kind`. */
  label: string;
  /** Resumo do `payload` (motivo, contadores, último retorno). */
  detail: string | null;
  tone: TalkXAlertTone;
}

/** Rótulo e gravidade de cada `kind` do CHECK de `talkx_alerts`. */
const KIND_META: Record<string, { label: string; tone: TalkXAlertTone }> = {
  stalled_campaign: { label: 'Campanha parada', tone: 'warning' },
  stale_lease: { label: 'Reserva de envio expirada', tone: 'warning' },
  outcome_unknown: { label: 'Resultado desconhecido', tone: 'danger' },
  high_failure_rate: { label: 'Falhas seguidas no envio', tone: 'danger' },
  cron_degraded: { label: 'Motor com problemas', tone: 'danger' },
  purge_failed: { label: 'Expurgo de dados falhou', tone: 'danger' },
};

function trimmedText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length ? text : null;
}

function finiteInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.trunc(value);
}

/**
 * Resume o `payload` do alerta em uma linha. O motor grava pouco: quase sempre
 * `{detected_at, source}`; só o `cron_degraded` traz motivo e contadores
 * (`reason`, `consecutive_failures`, `timeouts`, `last_return_message`).
 */
export function describeEngineAlert(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const data = payload as Record<string, unknown>;
  const parts: string[] = [];

  const reason = trimmedText(data.reason);
  if (reason === 'timeout') parts.push('ciclo do motor sem resposta a tempo');
  else if (reason === 'consecutive_failures') parts.push('ciclo do motor falhando em sequência');
  else if (reason) parts.push(reason);

  const failures = finiteInt(data.consecutive_failures);
  if (failures !== null) parts.push(`${failures} ${failures === 1 ? 'falha seguida' : 'falhas seguidas'}`);
  const timeouts = finiteInt(data.timeouts);
  if (timeouts !== null) parts.push(`${timeouts} ${timeouts === 1 ? 'timeout' : 'timeouts'}`);
  const lastReturn = trimmedText(data.last_return_message);
  if (lastReturn) parts.push(`último retorno: ${lastReturn}`);

  return parts.length ? parts.join(' · ') : null;
}

/** Lê as linhas de `talkx_alerts` sem confiar no formato devolvido pelo banco. */
export function parseEngineAlerts(rows: unknown): TalkXEngineAlert[] {
  if (!Array.isArray(rows)) return [];
  const alerts: TalkXEngineAlert[] = [];
  rows.forEach((raw) => {
    if (!raw || typeof raw !== 'object') return;
    const row = raw as Record<string, unknown>;
    const id = trimmedText(row.id);
    const kind = trimmedText(row.kind);
    const openedAt = trimmedText(row.opened_at);
    if (!id || !kind || !openedAt) return;
    const meta = KIND_META[kind] ?? { label: `Alerta do motor (${kind})`, tone: 'info' as TalkXAlertTone };
    alerts.push({
      id,
      kind,
      campaignId: trimmedText(row.campaign_id),
      openedAt,
      label: meta.label,
      detail: describeEngineAlert(row.payload),
      tone: meta.tone,
    });
  });
  return alerts;
}

export interface UseTalkXEngineAlertsResult {
  alerts: TalkXEngineAlert[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Alertas **abertos** do motor. Com `campaignId` válido, traz os do motor
 * (globais) mais os daquela campanha; sem campanha válida, traz todos os
 * abertos — o painel global do motor.
 */
export function useTalkXEngineAlerts(campaignId?: string | null): UseTalkXEngineAlertsResult {
  const scoped = typeof campaignId === 'string' && UUID_RE.test(campaignId) ? campaignId : null;

  const query = useQuery({
    queryKey: ['talkx-engine-alerts', scoped],
    queryFn: async (): Promise<unknown> => {
      let request = fromTable('talkx_alerts')
        .select('id, kind, campaign_id, payload, opened_at')
        .is('resolved_at', null)
        .order('opened_at', { ascending: false })
        .limit(ENGINE_ALERTS_LIMIT);
      if (scoped) request = request.or(`campaign_id.is.null,campaign_id.eq.${scoped}`);
      const { data, error } = await request;
      if (error) throw new Error('talkx-engine-alerts: falha ao consultar talkx_alerts');
      return data;
    },
    refetchInterval: ENGINE_ALERTS_REFETCH_MS,
    staleTime: 30_000,
  });

  const alerts = useMemo(() => (query.data === undefined ? undefined : parseEngineAlerts(query.data)), [query.data]);

  return {
    alerts,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as Error | null) ?? null,
    refetch: () => { void query.refetch(); },
  };
}