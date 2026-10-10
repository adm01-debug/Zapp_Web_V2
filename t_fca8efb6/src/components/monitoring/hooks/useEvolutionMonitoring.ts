import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useMonitoringData } from './useMonitoringData';
import { useMonitoringActions } from './useMonitoringActions';
import { useMonitoringNotifications } from './useMonitoringNotifications';
import type { TimePeriod } from './types';

export type { TimePeriod, DiagnosticResult, ConnectionInfo, HealthLog, MessageStats, WebhookTestResult, WebhookConfig, UptimeInfo, SparklineData, InstanceUptime } from './types';

export function useEvolutionMonitoring() {
  const [period, setPeriod] = useState<TimePeriod>('12h');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(30);
  const countdownRef = useRef(30);
  const periodRef = useRef(period);
  periodRef.current = period;

  const { notificationsEnabled, soundEnabled, setSoundEnabled, requestNotifications, checkDisconnections } = useMonitoringNotifications();
  const { connections, healthLogs, loading, messageStats, uptime, sparklines, instanceUptimes, fetchData: rawFetch } = useMonitoringData(checkDisconnections);

  const fetchData = useCallback(async (p?: TimePeriod) => {
    await rawFetch(p || periodRef.current);
  }, [rawFetch]);

  const actions = useMonitoringActions(fetchData);

  useEffect(() => {
    if (!autoRefresh) return;
    countdownRef.current = 30;
    setCountdown(30);
    const tick = setInterval(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);
      if (countdownRef.current <= 0) { countdownRef.current = 30; setCountdown(30); fetchData(); }
    }, 1000);
    return () => clearInterval(tick);
  }, [autoRefresh, fetchData]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel('monitoring-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_connections' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const changePeriod = useCallback((p: TimePeriod) => { setPeriod(p); fetchData(p); }, [fetchData]);

  return {
    connections, healthLogs, loading, messageStats, uptime,
    sparklines, instanceUptimes, notificationsEnabled, soundEnabled, setSoundEnabled, requestNotifications,
    period, changePeriod, autoRefresh, setAutoRefresh, countdown,
    ...actions, refetch: fetchData,
  };
}
