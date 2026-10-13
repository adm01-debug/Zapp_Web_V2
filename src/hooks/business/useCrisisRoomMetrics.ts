import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Sala de Crise — leitura do agregado medido no banco.
 *
 * R2-AUTH-036 / PF-02: a tela lia 4 consultas soltas no navegador com `Promise.all`,
 * cada uma cortada em 1.000 linhas pelo PostgREST, e ainda ignorava `.error` — quando
 * uma consulta falhava, os cartões mostravam **0** e o selo dizia "Operação normal".
 * Agora a fonte é a RPC `public.crisis_room_snapshot()`, que devolve as 4 métricas num
 * único agregado (e só para admin/supervisor). Este hook é a única ponte entre a tela
 * e a RPC: se a leitura falhar, o estado é de ERRO (`isError`), nunca de zero.
 *
 * Regras que este arquivo garante para quem consome:
 *   1. Atualiza sozinho: `refetchInterval` de 45 s (dentro dos 30–60 s pedidos).
 *   2. Aba oculta pausa o relógio (`refetchInterval: false`) e volta a medir assim que
 *      a aba reaparece.
 *   3. Falha nunca vira zero: campo ausente ou não numérico faz a leitura inteira
 *      falhar (`isError`), e `metrics`/`isCrisis` ficam `undefined`/`null` — a tela
 *      mostra "—", não "0" nem selo verde.
 *   4. `dataUpdatedAt` diz quando o último agregado bom chegou (para "Atualizado há X").
 *   5. Reconexão de rede re-sincroniza (`refetchOnReconnect: true`), sem depender da
 *      configuração do QueryClient do consumidor.
 */

/** Intervalo de atualização automática, em ms (faixa pedida: 30–60 s). */
export const CRISIS_ROOM_REFETCH_INTERVAL_MS = 45_000;

/** Chave da RPC no banco. */
export const CRISIS_ROOM_RPC = 'crisis_room_snapshot' as const;

/** Chave estável da query (uma Sala de Crise por app). */
export const CRISIS_ROOM_QUERY_KEY = ['crisis-room-snapshot'] as const;

/** Valores como saem da RPC — já tipados, sem nenhum zero inventado. */
export interface CrisisRoomSnapshot {
  unansweredMessages: number;
  unansweredConversations: number;
  onlineAgents: number;
  totalAgents: number;
  slaBreached: number;
  /** `null` = não medido (não há agente online para servir de denominador). */
  queueRatio: number | null;
  windowMinutes: number;
  slaWindowHours: number;
  generatedAt: string;
}

export type CrisisMetricKey =
  | 'unanswered_messages'
  | 'queue_ratio'
  | 'sla_breached'
  | 'online_agents';

/**
 * `unknown` existe para o valor que NÃO foi medido (`null`): a tela não pode pintar
 * de verde nem de crítico o que não foi medido.
 */
export type CrisisSeverity = 'ok' | 'warning' | 'critical' | 'unknown';

/** Limiares de atenção e crítico de cada cartão (paridade com a tela). */
export interface CrisisThresholds {
  attention: number;
  critical: number;
  /** `true` quando MENOR é pior (ex.: agentes online). */
  lowerIsWorse: boolean;
}

export const CRISIS_THRESHOLDS: Record<CrisisMetricKey, CrisisThresholds> = {
  // "Msgs sem resposta (1h)": atenção > 20, crítico > 30.
  unanswered_messages: { attention: 20, critical: 30, lowerIsWorse: false },
  // "Carga por agente": atenção > 10, crítico > 15.
  queue_ratio: { attention: 10, critical: 15, lowerIsWorse: false },
  // "SLA estourados": atenção > 5, crítico > 10.
  sla_breached: { attention: 5, critical: 10, lowerIsWorse: false },
  // "Agentes ativos": atenção < 4, crítico < 2.
  online_agents: { attention: 4, critical: 2, lowerIsWorse: true },
};

/** Um cartão da Sala de Crise pronto para render (os dois limiares inclusos). */
export interface CrisisMetricReadout {
  key: CrisisMetricKey;
  label: string;
  unit: string;
  /** `null` = não medido. */
  value: number | null;
  attention: number;
  critical: number;
  lowerIsWorse: boolean;
  severity: CrisisSeverity;
}

const METRIC_LABELS: Record<CrisisMetricKey, { label: string; unit: string }> = {
  unanswered_messages: { label: 'Msgs sem resposta (1h)', unit: 'msgs' },
  queue_ratio: { label: 'Carga por agente', unit: 'conv/agente' },
  sla_breached: { label: 'SLA estourados', unit: 'conversas' },
  online_agents: { label: 'Agentes ativos', unit: 'online' },
};

/** Severidade a partir do limiar (nunca "ok" para valor não medido). */
export function crisisSeverity(key: CrisisMetricKey, value: number | null): CrisisSeverity {
  if (value == null || !Number.isFinite(value)) return 'unknown';
  const { attention, critical, lowerIsWorse } = CRISIS_THRESHOLDS[key];
  if (lowerIsWorse) {
    if (value < critical) return 'critical';
    if (value < attention) return 'warning';
    return 'ok';
  }
  if (value > critical) return 'critical';
  if (value > attention) return 'warning';
  return 'ok';
}

/**
 * Monta os 4 cartões a partir do agregado. `queue_ratio` ausente (`null`) vira
 * severidade `unknown` — "não medido" e "zero medido" não se confundem.
 */
export function buildCrisisMetricReadouts(snapshot: CrisisRoomSnapshot): CrisisMetricReadout[] {
  const values: Record<CrisisMetricKey, number | null> = {
    unanswered_messages: snapshot.unansweredMessages,
    queue_ratio: snapshot.queueRatio,
    sla_breached: snapshot.slaBreached,
    online_agents: snapshot.onlineAgents,
  };
  return (Object.keys(CRISIS_THRESHOLDS) as CrisisMetricKey[]).map((key) => {
    const { attention, critical, lowerIsWorse } = CRISIS_THRESHOLDS[key];
    const value = values[key];
    return {
      key,
      label: METRIC_LABELS[key].label,
      unit: METRIC_LABELS[key].unit,
      value,
      attention,
      critical,
      lowerIsWorse,
      severity: crisisSeverity(key, value),
    };
  });
}

function exigirNumero(origem: Record<string, unknown>, campo: string): number {
  const valor = origem[campo];
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    // Campo ausente/inválido = leitura falhada. Jamais cair para 0: zero é uma
    // medida legítima (operação calma) e não pode nascer de uma resposta quebrada.
    throw new Error(`Sala de Crise: resposta inválida (${campo} ausente)`);
  }
  return valor;
}

function exigirTexto(origem: Record<string, unknown>, campo: string): string {
  const valor = origem[campo];
  if (typeof valor !== 'string' || valor.length === 0) {
    throw new Error(`Sala de Crise: resposta inválida (${campo} ausente)`);
  }
  return valor;
}

/** Converte o `jsonb` cru da RPC no snapshot tipado; campo faltando = erro. */
export function parseCrisisRoomSnapshot(raw: unknown): CrisisRoomSnapshot {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Sala de Crise: resposta inválida (agregado ausente)');
  }
  const origem = raw as Record<string, unknown>;
  // queue_ratio é o único que pode ser null (sem agente online) — mas se vier
  // número, precisa ser número de verdade.
  const ratioBruto = origem.queue_ratio;
  let queueRatio: number | null;
  if (ratioBruto === null || ratioBruto === undefined) {
    queueRatio = null;
  } else if (typeof ratioBruto === 'number' && Number.isFinite(ratioBruto)) {
    queueRatio = ratioBruto;
  } else {
    throw new Error('Sala de Crise: resposta inválida (queue_ratio)');
  }

  return {
    unansweredMessages: exigirNumero(origem, 'unanswered_messages'),
    unansweredConversations: exigirNumero(origem, 'unanswered_conversations'),
    onlineAgents: exigirNumero(origem, 'online_agents'),
    totalAgents: exigirNumero(origem, 'total_agents'),
    slaBreached: exigirNumero(origem, 'sla_breached'),
    queueRatio,
    windowMinutes: exigirNumero(origem, 'window_minutes'),
    slaWindowHours: exigirNumero(origem, 'sla_window_hours'),
    generatedAt: exigirTexto(origem, 'generated_at'),
  };
}

/** Visibilidade da aba: o relógio só corre com a Sala de Crise à vista. */
function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  );
  useEffect(() => {
    const aoTrocar = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', aoTrocar);
    return () => document.removeEventListener('visibilitychange', aoTrocar);
  }, []);
  return visible;
}

export interface UseCrisisRoomMetricsOptions {
  /** Sobrescreve o intervalo (ms). `false` desliga o relógio automático. */
  refetchIntervalMs?: number | false;
  enabled?: boolean;
}

export interface UseCrisisRoomMetricsResult {
  /** Agregado tipado; `undefined` enquanto não há leitura boa (ou em erro). */
  snapshot: CrisisRoomSnapshot | undefined;
  /** Os 4 cartões com os DOIS limiares; `undefined` quando não há leitura boa. */
  metrics: CrisisMetricReadout[] | undefined;
  /** `true` quando algum cartão está em crítico; `null` quando não há medição. */
  isCrisis: boolean | null;
  /** Falha na leitura (permissão negada, rede, agregado inválido). Nunca vira zero. */
  isError: boolean;
  error: Error | null;
  /** Primeira carga (é o único momento do skeleton). */
  isFirstLoad: boolean;
  /** Qualquer busca em andamento (refetch de fundo, botão "Atualizar"). */
  isRefreshing: boolean;
  /** Carimbo da última leitura boa (`Date.now()`); 0 quando nunca houve. */
  dataUpdatedAt: number;
  /** Força uma leitura agora (botão "Atualizar"). */
  refetch: () => void;
  /** Intervalo automático em vigor (ms) ou `false` se pausado/desligado. */
  refetchIntervalMs: number | false;
}

export function useCrisisRoomMetrics(
  options: UseCrisisRoomMetricsOptions = {},
): UseCrisisRoomMetricsResult {
  const visible = useDocumentVisible();
  const intervaloConfigurado = options.refetchIntervalMs ?? CRISIS_ROOM_REFETCH_INTERVAL_MS;
  // Aba oculta pausa o relógio; nem intervalo nem coleta em segundo plano.
  const refetchInterval = visible ? intervaloConfigurado : false;

  const query = useQuery({
    queryKey: CRISIS_ROOM_QUERY_KEY,
    enabled: options.enabled ?? true,
    queryFn: async (): Promise<CrisisRoomSnapshot> => {
      const { data, error } = await supabase.rpc(CRISIS_ROOM_RPC);
      if (error) throw new Error(error.message || 'Sala de Crise: falha ao medir');
      return parseCrisisRoomSnapshot(data);
    },
    // Sala de Crise é painel de operação: cada ciclo mede de novo, sem cache de 5 min.
    staleTime: 0,
    // Reconexão re-sincroniza mesmo que o QueryClient do consumidor desligue o padrão.
    refetchOnReconnect: true,
    refetchInterval,
  });

  // Ao voltar a aba para a frente, mede já — não espera o próximo ciclo de 45 s.
  const estavaOculta = useRef(!visible);
  const { refetch } = query;
  useEffect(() => {
    if (visible && estavaOculta.current) void refetch();
    estavaOculta.current = !visible;
  }, [visible, refetch]);

  const snapshot = query.data;
  const metrics = snapshot ? buildCrisisMetricReadouts(snapshot) : undefined;

  return {
    snapshot,
    metrics,
    // `null` (e não `false`) quando não há medição: a tela não pode anunciar
    // "Operação normal" sobre um dado que não existe (PF-02).
    isCrisis: metrics ? metrics.some((m) => m.severity === 'critical') : null,
    isError: query.isError,
    error: (query.error as Error | null) ?? null,
    isFirstLoad: query.isLoading,
    isRefreshing: query.isFetching,
    dataUpdatedAt: query.dataUpdatedAt,
    refetch: () => {
      void refetch();
    },
    refetchIntervalMs: refetchInterval,
  };
}
