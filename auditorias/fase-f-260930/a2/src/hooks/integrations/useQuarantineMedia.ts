import { useCallback, useEffect, useRef, useState } from 'react';
import { queryExternalProxy } from '@/lib/externalProxy';
import { log } from '@/lib/logger';
import { quarantineStore } from '@/lib/quarantineStore';

/**
 * Representa um registro da tabela `media_quarantine` (VPS externa Zap Webb)
 * gerado pelas 3 camadas de antivírus ClamAV (47 regras + heurística + hash).
 */
export interface QuarantineRecord {
  id: string;
  message_id?: string | null;
  remote_jid?: string | null;
  instance_name?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  file_hash?: string | null;
  threat_name?: string | null;
  threat_level?: 'low' | 'medium' | 'high' | 'critical' | string | null;
  scan_engine?: string | null;
  decision?: 'pending' | 'allowed' | 'deleted' | 'whitelisted' | string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export type QuarantineFilter = 'all' | 'pending' | 'allowed' | 'deleted' | 'whitelisted';
export type QuarantineDecision = 'allowed' | 'deleted' | 'whitelisted';

interface UseQuarantineMediaResult {
  records: QuarantineRecord[];
  total: number;
  loading: boolean;
  error: string | null;
  filter: QuarantineFilter;
  setFilter: (next: QuarantineFilter) => void;
  refresh: () => Promise<void>;
  decide: (id: string, decision: QuarantineDecision) => Promise<void>;
  pendingCount: number;
  notConfigured: boolean;
}

const TABLE_NAME = 'media_quarantine';
const PAGE_LIMIT = 200;

export function useQuarantineMedia(): UseQuarantineMediaResult {
  const [records, setRecords] = useState<QuarantineRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [filter, setFilter] = useState<QuarantineFilter>('pending');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters = filter === 'all'
        ? []
        : [{ column: 'decision', operator: 'eq', value: filter }];

      const [main, pending] = await Promise.all([
        queryExternalProxy<QuarantineRecord>({
          table: TABLE_NAME,
          select: '*',
          filters,
          order: { column: 'created_at', ascending: false },
          limit: PAGE_LIMIT,
          countMode: 'exact',
        }),
        queryExternalProxy<QuarantineRecord>({
          table: TABLE_NAME,
          select: 'id',
          filters: [{ column: 'decision', operator: 'eq', value: 'pending' }],
          countMode: 'exact',
          limit: 1,
        }),
      ]);

      if (!mountedRef.current) return;

      // External proxy retorna `{ data: [], notConfigured: true }` quando VPS off.
      const cast = main as unknown as { notConfigured?: boolean };
      if (cast.notConfigured) {
        setNotConfigured(true);
        setRecords([]);
        setTotal(0);
        setPendingCount(0);
        return;
      }
      setNotConfigured(false);
      const list = Array.isArray(main.data) ? main.data : [];
      setRecords(list);
      // Sync global store so inline message badges reflect admin actions.
      quarantineStore.upsertMany(list);
      setTotal(main.count ?? main.data?.length ?? 0);
      setPendingCount(pending.count ?? 0);
    } catch (err) {
      log.error('useQuarantineMedia fetch error', err);
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Erro ao buscar quarentena');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  const decide = useCallback(async (id: string, decision: QuarantineDecision) => {
    // Optimistic update
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, decision } : r)));
    try {
      await queryExternalProxy({
        action: 'update',
        table: TABLE_NAME,
        data: { decision, reviewed_at: new Date().toISOString() },
        match: { id },
      });
      await fetchRecords();
    } catch (err) {
      log.error('useQuarantineMedia decide error', err);
      // rollback
      await fetchRecords();
      throw err;
    }
  }, [fetchRecords]);

  return {
    records,
    total,
    loading,
    error,
    filter,
    setFilter,
    refresh: fetchRecords,
    decide,
    pendingCount,
    notConfigured,
  };
}