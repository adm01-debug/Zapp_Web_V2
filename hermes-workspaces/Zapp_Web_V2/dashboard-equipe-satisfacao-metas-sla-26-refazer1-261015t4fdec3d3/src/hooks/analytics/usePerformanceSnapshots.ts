import { useState, useCallback, useRef } from 'react';
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
    // As colunas de performance_snapshots são nullable: o que o navegador não
    // mede é gravado como null, nunca como 0 MB / 0 ms / '4g' inventado (R2-INF-029).
    memory_used: number | null;
    memory_total: number | null;
    dom_nodes: number;
    network_type: string | null;
    rtt: number | null;
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
    lastRangeHoursRef.current = hours;
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

  // Última janela (em horas) pedida por loadHistory: a recarga após limpar os
  // snapshots antigos reusa o período selecionado em vez de voltar ao padrão.
  // Declarado depois de loadHistory de propósito: o ref só é lido/escrito
  // quando os callbacks rodam, já com a renderização concluída.
  const lastRangeHoursRef = useRef(24);

  const clearOldSnapshots = useCallback(async () => {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      // O cliente do Supabase resolve a Promise com `{ error }` em erro de
      // PostgREST/RLS (não lança): sem inspecionar o retorno, o hook anunciava
      // remoção mesmo com o DELETE recusado. Zero linhas também não é remoção.
      const { data, error } = await supabase
        .from('performance_snapshots')
        .delete()
        .lt('created_at', sevenDaysAgo)
        .select('id');
      if (error) throw error;

      const removidos = data?.length ?? 0;
      if (removidos > 0) {
        toast.success('Dados antigos removidos');
      } else {
        toast.success('Nenhum snapshot antigo para remover');
      }
      await loadHistory(lastRangeHoursRef.current);
    } catch (err) {
      // Preserva o histórico exibido e avisa que a limpeza NÃO foi confirmada.
      log.warn('Failed to clear old performance snapshots:', err);
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
