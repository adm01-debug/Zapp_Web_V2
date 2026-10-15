import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/auth/useAuth';
import { useUserRole } from '@/hooks/system/useUserRole';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';

const log = getLogger('PerformanceSnapshots');

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

/**
 * 'me' = só os snapshots do perfil logado (padrão);
 * 'todos' = todos os perfis — só é honrado para admin/supervisor, que são
 * quem a policy de SELECT/DELETE de performance_snapshots libera para
 * ver/apagar de todos (migration 20260403143300).
 */
export type SnapshotScope = 'me' | 'todos';

const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

/** Existe algum snapshot mais antigo que o corte, no escopo pedido? */
async function existeSnapshotAntigo(
  cutoff: string,
  escopo: SnapshotScope,
  profileId: string | null,
): Promise<boolean> {
  let query = supabase
    .from('performance_snapshots')
    .select('id')
    .lt('created_at', cutoff)
    .limit(1);
  if (escopo === 'me') {
    if (!profileId) return false;
    query = query.eq('profile_id', profileId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export function usePerformanceSnapshots() {
  const { profile } = useAuth();
  // isSupervisor = admin ou supervisor, o mesmo conjunto de is_admin_or_supervisor().
  const { isSupervisor } = useUserRole();
  const canSeeAll = isSupervisor;
  const profileId = profile?.id ?? null;
  const [history, setHistory] = useState<PerformanceSnapshot[]>([]);
  const [loading, setLoading] = useState(false);

  // Últimos parâmetros pedidos por loadHistory: a recarga após limpar os
  // snapshots antigos reusa o período E o escopo selecionados em vez de voltar
  // ao padrão.
  const lastRangeHoursRef = useRef(24);
  const lastScopeRef = useRef<SnapshotScope>('me');

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
    if (!profileId) return;

    try {
      await supabase.from('performance_snapshots').insert({
        profile_id: profileId,
        ...data,
        user_agent: navigator.userAgent,
      } as unknown as Database['public']['Tables']['performance_snapshots']['Insert']);
    } catch (err) {
      // Silent fail — don't interrupt UX for telemetry
      log.warn('Failed to save performance snapshot:', err);
    }
  }, [profileId]);

  const loadHistory = useCallback(async (hours = 24, scope: SnapshotScope = 'me') => {
    // 'todos' só vale para admin/supervisor; qualquer outro pedido cai no escopo
    // do próprio perfil (a RLS já restringiria, mas o filtro é explícito aqui).
    const escopo: SnapshotScope = scope === 'todos' && canSeeAll ? 'todos' : 'me';
    lastRangeHoursRef.current = hours;
    lastScopeRef.current = escopo;

    if (escopo === 'me' && !profileId) {
      // Sem perfil não há escopo próprio: zera a lista e não deixa carregando preso.
      setHistory([]);
      return;
    }

    setLoading(true);
    try {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      let query = supabase
        .from('performance_snapshots')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(500);
      if (escopo === 'me' && profileId) {
        query = query.eq('profile_id', profileId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setHistory((data || []) as PerformanceSnapshot[]);
    } catch (err) {
      log.warn('Failed to load performance history:', err);
    } finally {
      setLoading(false);
    }
  }, [profileId, canSeeAll]);

  const clearOldSnapshots = useCallback(async () => {
    const escopo = lastScopeRef.current;
    try {
      const sevenDaysAgo = new Date(Date.now() - SETE_DIAS_MS).toISOString();
      // O cliente do Supabase resolve a Promise com `{ error }` em erro de
      // PostgREST/RLS (não lança): sem inspecionar o retorno, o hook anunciava
      // remoção mesmo com o DELETE recusado.
      let del = supabase
        .from('performance_snapshots')
        .delete()
        .lt('created_at', sevenDaysAgo);
      if (escopo === 'me' && profileId) {
        del = del.eq('profile_id', profileId);
      }
      // As linhas removidas distinguem "removi" de "nada a remover": a RLS
      // descarta as linhas sem erro quando nega o DELETE.
      const { data, error } = await del.select('id');
      if (error) throw error;

      const removidos = data?.length ?? 0;
      if (removidos > 0) {
        toast.success('Dados antigos removidos');
        await loadHistory(lastRangeHoursRef.current, escopo);
        return;
      }

      // Zero linhas pode ser "não havia nada" OU a RLS negando (a policy de
      // DELETE é só admin/supervisor: agente não apaga nem os próprios). Confere
      // a existência no escopo para não anunciar o motivo errado.
      const existemAntigos = await existeSnapshotAntigo(sevenDaysAgo, escopo, profileId);
      if (existemAntigos) {
        toast.error('Sem permissão para limpar estes snapshots');
      } else {
        toast.success('Nenhum snapshot antigo para remover');
      }
    } catch (err) {
      // Preserva o histórico exibido e avisa que a limpeza NÃO foi confirmada.
      log.warn('Failed to clear old performance snapshots:', err);
      toast.error('Erro ao limpar dados');
    }
  }, [loadHistory, profileId]);

  return {
    history,
    loading,
    saveSnapshot,
    loadHistory,
    clearOldSnapshots,
    /** true = admin/supervisor (pode ver/limpar snapshots de todos). */
    canSeeAll,
  };
}
