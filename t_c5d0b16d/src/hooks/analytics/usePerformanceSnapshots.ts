import { useState, useCallback } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('PerformanceSnapshots');
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/auth/useAuth';
import { toast } from 'sonner';

export interface PerformanceSnapshot {
  id: string;
  profile_id: string;
  fcp: number;
  page_load: number;
  dom_ready: number;
  ttfb: number;
  memory_used: number;
  memory_total: number;
  dom_nodes: number;
  network_type: string;
  rtt: number;
  overall_score: number;
  user_agent: string | null;
  created_at: string;
}

export function usePerformanceSnapshots() {
  const { profile } = useAuth();
  const [history, setHistory] = useState<PerformanceSnapshot[]>([]);
  const [loading, setLoading] = useState(false);

  const saveSnapshot = useCallback(async (data: {
    fcp: number;
    page_load: number;
    dom_ready: number;
    ttfb: number;
    memory_used: number;
    memory_total: number;
    dom_nodes: number;
    network_type: string;
    rtt: number;
    overall_score: number;
  }) => {
    if (!profile?.id) return;

    try {
      await supabase.from('performance_snapshots').insert({
        profile_id: profile.id,
        ...data,
        user_agent: navigator.userAgent,
      } as unknown as Database['public']['Tables']['performance_snapshots']['Insert']);
    } catch (err) {
      // Silent fail — don't interrupt UX for telemetry
      log.warn('Failed to save performance snapshot:', err);
    }
  }, [profile?.id]);

  const loadHistory = useCallback(async (hours = 24) => {
    setLoading(true);
    try {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('performance_snapshots')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(500);

      if (error) throw error;
      setHistory((data || []) as PerformanceSnapshot[]);
    } catch (err) {
      log.warn('Failed to load performance history:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearOldSnapshots = useCallback(async () => {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      await supabase
        .from('performance_snapshots')
        .delete()
        .lt('created_at', sevenDaysAgo);
      toast.success('Dados antigos removidos');
      await loadHistory();
    } catch (err) {
      toast.error('Erro ao limpar dados');
    }
  }, [loadHistory]);

  return {
    history,
    loading,
    saveSnapshot,
    loadHistory,
    clearOldSnapshots,
  };
}
