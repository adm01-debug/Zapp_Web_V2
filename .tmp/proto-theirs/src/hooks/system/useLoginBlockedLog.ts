import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVisiblePolling } from '@/hooks/realtime/useVisiblePolling';

/** Ação gravada em public.audit_logs quando o login é barrado por IP/país. */
export const LOGIN_BLOCK_ACTION = 'login_blocked';
/** Colunas explícitas (nunca `*`): a lista de segurança não puxa a linha toda. */
export const LOGIN_BLOCKED_LOG_COLUMNS = 'id, details, ip_address, user_agent, created_at';
const POLL_INTERVAL_MS = 15_000;
const LIMIT = 50;

export interface LoginBlockRow {
  id: string;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

/**
 * Lê os bloqueios de login (audit_logs action='login_blocked') e o modo do
 * bloqueio geográfico, com polling só enquanto a aba está visível.
 * Acesso a dados fica fora do componente (regra lint no-restricted-imports).
 */
export function useLoginBlockedLog(enabled = true) {
  const [rows, setRows] = useState<LoginBlockRow[]>([]);
  const [geoMode, setGeoMode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);

  const fetchData = useCallback(async (signal: AbortSignal) => {
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
    const [blocos, geo] = await Promise.all([
      supabase
        .from('audit_logs')
        .select(LOGIN_BLOCKED_LOG_COLUMNS)
        .eq('action', LOGIN_BLOCK_ACTION)
        .order('created_at', { ascending: false })
        .limit(LIMIT)
        .abortSignal(requestSignal),
      supabase.from('geo_blocking_settings').select('mode').limit(1).maybeSingle(),
    ]);

    if (signal.aborted) return;
    if (blocos.error) {
      setErro(true);
    } else {
      setErro(false);
      setRows((blocos.data as LoginBlockRow[] | null) ?? []);
    }
    setGeoMode(geo.error ? null : (geo.data?.mode ?? null));
    setLoading(false);
  }, []);

  const refetch = useVisiblePolling(fetchData, POLL_INTERVAL_MS, enabled);

  return { rows, geoMode, loading, erro, refetch };
}
