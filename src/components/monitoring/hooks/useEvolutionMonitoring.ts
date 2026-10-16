import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useMonitoringData } from './useMonitoringData';
import { useMonitoringActions } from './useMonitoringActions';
import { useMonitoringNotifications } from './useMonitoringNotifications';
import type { TimePeriod } from './types';

export type { TimePeriod, DiagnosticResult, ConnectionInfo, HealthLog, MessageStats, WebhookTestResult, WebhookConfig, UptimeInfo, SparklineData, InstanceUptime, MonitoringErrors } from './types';

/** Rajada de eventos realtime vira UMA única consulta após esta pausa. */
export const REALTIME_DEBOUNCE_MS = 500;

export function useEvolutionMonitoring() {
  const [period, setPeriod] = useState<TimePeriod>('12h');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(30);
  const countdownRef = useRef(30);
  const periodRef = useRef(period);
  // Mantém a ref com o período atual fora do render (react-hooks/refs).
  useEffect(() => { periodRef.current = period; }, [period]);

  const { notificationsEnabled, soundEnabled, setSoundEnabled, requestNotifications, checkDisconnections } = useMonitoringNotifications();
  const { connections, healthLogs, availabilityLogs, healthLogsTruncated, loading, messageStats, uptime, sparklines, instanceUptimes, errors, lastUpdatedAt, fetchData: rawFetch } = useMonitoringData(checkDisconnections);

  const fetchData = useCallback(async (p?: TimePeriod) => {
    // Aba em segundo plano não consulta: sem usuário lendo, é só custo de rede e de banco.
    if (typeof document !== 'undefined' && document.hidden) return;
    await rawFetch(p || periodRef.current);
  }, [rawFetch]);

  const actions = useMonitoringActions(fetchData);

  // Realinha com o banco vem por realtime: rajada de eventos vira UMA consulta (debounce),
  // e mudança de status dispara na hora (é o que o operador precisa ver).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void fetchData();
    }, REALTIME_DEBOUNCE_MS);
  }, [fetchData]);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  // Ligar/desligar o auto-refresh zera o contador no PRÓPRIO handler (setState dentro do
  // efeito dispara a regra react-hooks/set-state-in-effect e render em cascata).
  const changeAutoRefresh = useCallback((enabled: boolean) => {
    countdownRef.current = 30;
    setCountdown(30);
    setAutoRefresh(enabled);
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    countdownRef.current = 30;
    const tick = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);
      if (countdownRef.current <= 0) { countdownRef.current = 30; setCountdown(30); void fetchData(); }
    }, 1000);
    return () => clearInterval(tick);
  }, [autoRefresh, fetchData]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel(`monitoring-status-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_connections' }, (payload) => {
        const antes = (payload.old as { status?: string } | null)?.status;
        const depois = (payload.new as { status?: string } | null)?.status;
        if (typeof antes === 'string' && typeof depois === 'string' && antes !== depois) {
          if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
          void fetchData();
          return;
        }
        scheduleRefetch();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData, scheduleRefetch]);

  // Volta da aba: uma consulta imediata e o contador zerado (a pausa não vira atraso acumulado).
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) return;
      countdownRef.current = 30;
      setCountdown(30);
      void fetchData();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [fetchData]);

  const changePeriod = useCallback((p: TimePeriod) => { setPeriod(p); fetchData(p); }, [fetchData]);

  return {
    connections, healthLogs, availabilityLogs, healthLogsTruncated, loading, messageStats, uptime,
    sparklines, instanceUptimes, notificationsEnabled, soundEnabled, setSoundEnabled, requestNotifications,
    period, changePeriod, autoRefresh, setAutoRefresh: changeAutoRefresh, countdown,
    ...actions, refetch: fetchData, errors, lastUpdatedAt,
  };
}
