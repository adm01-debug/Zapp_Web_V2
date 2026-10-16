/**
 * Avisos de limite das metas de fila (PM-02, cartão t_549f87e1).
 *
 * O que este hook faz: a cada `QUEUE_GOAL_ALERTS_INTERVAL_MS` (5 min, e só com a aba visível e
 * online, via `useVisiblePolling`) chama `rpc_queue_goal_metrics()` — a métrica REAL de cada fila,
 * nunca uma conta montada no front — e compara com a meta da fila. Ao CRUZAR uma faixa
 * (50/75/100 % do limite para "quanto menor melhor"; 25/50/75 % do mínimo para a taxa de
 * atribuição, que é invertida) o usuário recebe UM aviso, com o nome real da fila.
 *
 * Regras que sustentam o "uma vez por faixa":
 *  - a faixa já anunciada fica em `sessionStorage` com o dia local na chave, então recarregar a
 *    página, remontar o provider ou outro componente usar o hook não repete o mesmo aviso;
 *  - `null` (não medido) NÃO avisa, e `0` (dado — fila vazia) também não cruza faixa nenhuma;
 *  - uma meta zerada não tem percentual: sem aviso, em vez de `Infinity %`;
 *  - se a RPC falhar, o hook fica MUDO em vez de anunciar valor inventado.
 *
 * Visibilidade é do servidor: a RPC devolve as filas ativas para staff e só as filas em que o
 * usuário é membro ativo para quem não é staff. Sem usuário logado não há chamada.
 */
import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import { useVisiblePolling } from '@/hooks/realtime/useVisiblePolling';
import {
  crossedGoalBands,
  formatGoalMetricValue,
  goalMetricPercent,
  QUEUE_GOAL_METRICS,
  worstCrossedGoalBand,
  useQueueGoals,
  type QueueGoalMetricsRow,
} from '@/hooks/business/useQueueGoals';
import { playNotificationSound, showBrowserNotification } from '@/utils/notificationSounds';
import { log } from '@/lib/logger';
import { localDayKey } from '@/lib/localDay';

/** 5 minutos entre varreduras (cartão t_549f87e1). */
export const QUEUE_GOAL_ALERTS_INTERVAL_MS = 5 * 60 * 1000;
export const QUEUE_GOAL_ALERTS_STORAGE_KEY = 'queue-goal-alerts:v1';

function alertKey(queueId: string, metric: string, band: number, day: string): string {
  return `${queueId}:${metric}:${band}:${day}`;
}

function readAnnouncedKeys(): Set<string> {
  try {
    const raw = sessionStorage.getItem(QUEUE_GOAL_ALERTS_STORAGE_KEY);
    if (!raw) return new Set<string>();
    const parsed: unknown = JSON.parse(raw);
    return new Set<string>(Array.isArray(parsed) ? (parsed as string[]) : []);
  } catch {
    // sessionStorage bloqueado (aba privada/modo restrito): a dedupe vale só nesta montagem.
    return new Set<string>();
  }
}

function persistAnnouncedKeys(keys: Set<string>) {
  try {
    sessionStorage.setItem(QUEUE_GOAL_ALERTS_STORAGE_KEY, JSON.stringify([...keys]));
  } catch {
    // Sem persistência o aviso pode repetir no próximo carregamento — repetir é aceitável,
    // deixar de avisar não é.
  }
}

export function useQueueGoalAlerts() {
  const { user } = useAuth();
  const { goals } = useQueueGoals();
  const { settings, isQuietHours } = useNotificationSettings();

  // Metas e preferências entram por ref para que a varredura seja estável: um objetivo salvo na
  // tela não reinicia o intervalo nem dispara varredura extra.
  const goalsRef = useRef(goals);
  useEffect(() => {
    goalsRef.current = goals;
  }, [goals]);

  const preferencesRef = useRef({ settings, isQuietHours });
  useEffect(() => {
    preferencesRef.current = { settings, isQuietHours };
  }, [settings, isQuietHours]);

  const checkQueueGoalAlerts = useCallback(async (signal?: AbortSignal) => {
    if (!user) return;

    let rows: QueueGoalMetricsRow[];
    try {
      const { data, error } = await supabase.rpc('rpc_queue_goal_metrics');
      if (error) throw error;
      rows = (data ?? []) as QueueGoalMetricsRow[];
    } catch (error) {
      // Sem métrica real não há aviso: anunciar limite a partir de conta inventada é pior que ficar mudo.
      log.warn('Não foi possível medir as metas das filas:', error);
      return;
    }

    // A varredura pode terminar depois do logout ou da desmontagem: aí não se anuncia mais nada.
    if (signal?.aborted) return;

    const announced = readAnnouncedKeys();
    const day = localDayKey(new Date()) ?? 'sem-dia';
    let anunciou = false;

    for (const row of rows) {
      const goal = goalsRef.current[row.queue_id];
      if (!goal || !goal.alerts_enabled) continue;

      for (const metric of QUEUE_GOAL_METRICS) {
        const bruto = row[metric.key];
        // `null` = não medido (fila sem base, métrica sem base no período): não avisa.
        if (bruto === null || bruto === undefined) continue;
        const value = Number(bruto);
        if (!Number.isFinite(value)) continue;

        const target = Number(goal[metric.goalKey]);
        const percent = goalMetricPercent(value, target);
        // Meta zerada não define percentual — sem faixa, sem aviso.
        if (percent === null) continue;

        const crossed = crossedGoalBands(percent, metric.direction);
        if (crossed.length === 0) continue;

        const novas = crossed.filter((band) => !announced.has(alertKey(row.queue_id, metric.key, band, day)));
        if (novas.length === 0) continue;

        const band = worstCrossedGoalBand(percent, metric.direction) ?? novas[0];

        // Marca TODAS as faixas já cruzadas: um salto de 40 % para 100 % anuncia só a faixa mais
        // grave, mas não repete 50/75 na varredura seguinte.
        crossed.forEach((b) => announced.add(alertKey(row.queue_id, metric.key, b, day)));
        anunciou = true;

        const { settings: preferencias, isQuietHours: emSilencio } = preferencesRef.current;
        const queueName = row.queue_name;
        const title = metric.direction === 'max'
          ? `Fila ${queueName}: ${band}% do limite`
          : `Fila ${queueName}: ${band}% do mínimo`;
        const description = metric.direction === 'max'
          ? `${metric.label}: ${formatGoalMetricValue(value)} (limite ${formatGoalMetricValue(target)})`
          : `${metric.label}: ${formatGoalMetricValue(value)}% (mínimo ${formatGoalMetricValue(target)}%)`;

        toast.warning(title, { description });

        if (preferencias.soundEnabled && !emSilencio()) {
          playNotificationSound('goal_achieved', preferencias.goalSoundType, preferencias.soundVolume);
        }
        if (preferencias.browserNotifications) {
          showBrowserNotification(title, description, {
            tag: `queue-goal-${row.queue_id}-${metric.key}`,
          });
        }
      }
    }

    if (anunciou) persistAnnouncedKeys(announced);
  }, [user]);

  useVisiblePolling(checkQueueGoalAlerts, QUEUE_GOAL_ALERTS_INTERVAL_MS, !!user);

  return { checkQueueGoalAlerts };
}
