import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { useUserRole } from '@/hooks/system/useUserRole';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import { playNotificationSound, showBrowserNotification } from '@/utils/notificationSounds';
import { log } from '@/lib/logger';
import { localDayKey } from '@/lib/localDay';
import { getQueueAlertBand, type QueueAlertMetric } from './useQueueGoals';

/** Intervalo padrao entre consultas (configuravel pelo chamador). */
export const QUEUE_GOAL_ALERTS_INTERVAL_MS = 5 * 60 * 1000;
/** Janela de dias usada pela RPC para a taxa de atribuicao. */
export const QUEUE_GOAL_ALERTS_DAYS = 7;
/** Validade da memoria de faixas em localStorage. */
export const ALERT_BAND_TTL_MS = 24 * 60 * 60 * 1000;

const STORAGE_PREFIX = 'queue-goal-alerts:v1';

/** Linha de `queue_goal_metrics()` (metricas reais + metas da fila). */
export interface QueueGoalMetricRow {
  queue_id: string;
  queue_name: string;
  waiting_contacts: number;
  avg_wait_minutes: number | null;
  assignment_rate: number | null;
  messages_pending: number;
  max_waiting_contacts: number | null;
  max_avg_wait_minutes: number | null;
  min_assignment_rate: number | null;
  max_messages_pending: number | null;
  alerts_enabled: boolean | null;
}

export interface QueueGoalAlertCheck {
  metric: QueueAlertMetric;
  label: string;
  value: number | null;
  limit: number | null;
  invert: boolean;
}

/**
 * As 4 metricas da fila com a regra de faixa de cada uma. `value`/`limit` `null`
 * significam "sem base de dados" ou "meta nao configurada" — nesses casos NAO
 * avisamos (0 e dado legitimo; NULL e "nao medido").
 */
export function buildQueueGoalChecks(row: QueueGoalMetricRow): QueueGoalAlertCheck[] {
  return [
    {
      metric: 'waiting_contacts',
      label: 'contatos aguardando',
      value: row.waiting_contacts,
      limit: row.max_waiting_contacts,
      invert: false,
    },
    {
      metric: 'wait_time',
      label: 'tempo medio de espera',
      value: row.avg_wait_minutes,
      limit: row.max_avg_wait_minutes,
      invert: false,
    },
    {
      metric: 'assignment_rate',
      label: 'taxa de atribuição',
      value: row.assignment_rate,
      limit: row.min_assignment_rate,
      invert: true,
    },
    {
      metric: 'messages_pending',
      label: 'mensagens pendentes',
      value: row.messages_pending,
      limit: row.max_messages_pending,
      invert: false,
    },
  ];
}

interface StoredAlertBands {
  at?: number;
  bands?: Record<string, number>;
}

/**
 * Le a memoria de faixas do dia. Descarta (devolve `{}`) quando o registro passou
 * do TTL ou esta corrompido; `localStorage` indisponivel (modo privado) tambem cai
 * no `{}` — o aviso continua funcionando dentro da sessao.
 */
export function readAlertBands(dayKey: string, now: number = Date.now()): Record<string, number> {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}:${dayKey}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredAlertBands;
    if (!parsed || typeof parsed.at !== 'number' || !parsed.bands) return {};
    if (now - parsed.at > ALERT_BAND_TTL_MS) return {};
    return parsed.bands;
  } catch {
    return {};
  }
}

/**
 * Grava a memoria do dia e limpa os mapas de dias anteriores (TTL). Sem
 * `localStorage`, o alerta segue valido apenas na sessao atual.
 */
export function writeAlertBands(
  dayKey: string,
  bands: Record<string, number>,
  now: number = Date.now()
): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}:${dayKey}`, JSON.stringify({ at: now, bands }));
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`${STORAGE_PREFIX}:`) && key !== `${STORAGE_PREFIX}:${dayKey}`) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Sem localStorage: o aviso nao persiste entre recarregamentos, mas nao quebra a tela.
  }
}

/**
 * Aviso GLOBAL das metas de fila: montado uma vez no app (dentro do provider de
 * notificacoes), so para staff (`admin`/`supervisor`, que sao quem pode ler a RPC).
 * Consulta `queue_goal_metrics()` em intervalo configuravel e emite UM toast por
 * PASSAGEM de faixa (50/75/100; 25/50/75 nas invertidas) por fila e metrica.
 *
 * A faixa alcancada e memorizada por (fila, metrica, dia) em `localStorage`, com
 * TTL, para nao repetir o mesmo aviso ao recarregar a pagina. Em horario
 * silencioso o aviso e adiado (nao marca a faixa), para sair depois do periodo.
 */
export function useQueueGoalAlerts(options: { intervalMs?: number; days?: number } = {}) {
  const intervalMs = options.intervalMs ?? QUEUE_GOAL_ALERTS_INTERVAL_MS;
  const days = options.days ?? QUEUE_GOAL_ALERTS_DAYS;
  const { user } = useAuth();
  const { isSupervisor } = useUserRole();
  const { settings, isQuietHours } = useNotificationSettings();
  const inFlightRef = useRef(false);
  // Memoria da sessao (alem do localStorage): evita repetir o aviso na mesma
  // execucao mesmo quando o `localStorage` esta indisponivel.
  const memoRef = useRef<{ day: string; bands: Record<string, number> }>({ day: '', bands: {} });

  const checkQueueGoalAlerts = useCallback(async () => {
    if (!user || !isSupervisor) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const { data, error } = await supabase.rpc('queue_goal_metrics', { p_days: days });
      if (error) {
        log.warn('[queue-goal-alerts] falha ao ler metricas de fila; sem aviso.', error);
        return;
      }

      const day = localDayKey(new Date());
      if (!day) return;

      const session = memoRef.current;
      if (session.day !== day) {
        session.day = day;
        session.bands = {};
      }

      const rows = (data ?? []) as QueueGoalMetricRow[];
      const stored = readAlertBands(day);
      let changed = false;

      for (const row of rows) {
        if (!row?.alerts_enabled) continue;

        for (const check of buildQueueGoalChecks(row)) {
          if (check.limit == null || check.value == null) continue;

          const band = getQueueAlertBand(check.value, check.limit, check.invert);
          if (band == null) continue;

          const memoKey = `${row.queue_id}:${check.metric}`;
          const alreadyAlerted = Math.max(stored[memoKey] ?? 0, session.bands[memoKey] ?? 0);
          if (band <= alreadyAlerted) continue;

          // Horario silencioso: adia sem marcar, para avisar quando o periodo passar.
          if (isQuietHours()) continue;

          stored[memoKey] = band;
          session.bands[memoKey] = band;
          changed = true;

          const queueName = row.queue_name || row.queue_id.slice(0, 8);
          const pct = Math.round((check.value / check.limit) * 100);
          const title = '⚠️ Meta da fila em risco';
          const message = `Fila ${queueName}: ${check.label} em ${pct}% do limite (${check.value}/${check.limit})`;

          toast.info(title, { description: message });
          if (settings.soundEnabled) {
            playNotificationSound('goal_achieved', settings.goalSoundType, settings.soundVolume);
          }
          if (settings.browserNotifications) {
            showBrowserNotification(title, message);
          }
        }
      }

      if (changed) writeAlertBands(day, stored);
    } catch (err) {
      log.error('[queue-goal-alerts] erro ao verificar metas de fila:', err);
    } finally {
      inFlightRef.current = false;
    }
  }, [user, isSupervisor, days, isQuietHours, settings]);

  useEffect(() => {
    if (!user || !isSupervisor) return;

    checkQueueGoalAlerts();
    const id = setInterval(checkQueueGoalAlerts, intervalMs);

    return () => clearInterval(id);
  }, [user, isSupervisor, checkQueueGoalAlerts, intervalMs]);

  return { checkQueueGoalAlerts };
}
