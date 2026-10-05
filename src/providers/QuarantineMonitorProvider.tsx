import { useEffect, useRef } from 'react';
import { queryExternalProxy } from '@/lib/externalProxy';
import { quarantineStore } from '@/lib/quarantineStore';
import {
  resetQuarantineMonitorStatus,
  setQuarantineMonitorStatus,
} from '@/lib/quarantineMonitorStatus';
import type { QuarantineRecord } from '@/hooks/integrations/useQuarantineMedia';
import { useAuth } from '@/hooks/auth/useAuth';
import { RoleService } from '@/services/role.service';
import { useToast } from '@/hooks/ui/use-toast';
import { getLogger } from '@/lib/logger';

const log = getLogger('QuarantineMonitor');

const HYDRATE_LIMIT = 500;
const POLL_INTERVAL_MS = 30_000; // 30s — quarantine is rarely time-critical
const TRANSIENT_BACKOFF_MAX_MS = 5 * 60_000; // teto do backoff de falha transitória

/**
 * Decisões que o selo conhece. Consultar TODAS (e não só `pending`/`deleted`) é
 * o que permite OBSERVAR a liberação por valor — o registro volta como
 * `allowed`/`whitelisted` — em vez de inferi-la porque ele saiu do filtro
 * (R2-API-066).
 */
const MONITORED_DECISIONS = ['pending', 'deleted', 'allowed', 'whitelisted'];

/**
 * Mounts a silent monitor that:
 *  1. Hydrates the global quarantine store with the current quarantine records
 *     (pending/deleted AND allowed/whitelisted) so message bubbles render the
 *     🛡️ badge on first paint and reflect the latest decision.
 *  2. Polls every 30s; when admins are online and new pending records appear,
 *     surfaces a destructive toast (acts as a frontend "reverse webhook" until
 *     the VPS pushes events directly).
 *
 * No-op when the external VPS proxy is not configured (`notConfigured`). A
 * transient failure backs off and retries instead of disabling the monitor for
 * the whole session.
 */
export function QuarantineMonitorProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdminRef = useRef(false);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const firstRunRef = useRef(true);
  const disabledRef = useRef(false);
  const failuresRef = useRef(0);

  useEffect(() => {
    if (!user) {
      knownIdsRef.current.clear();
      quarantineStore.clear();
      firstRunRef.current = true;
      disabledRef.current = false;
      failuresRef.current = 0;
      resetQuarantineMonitorStatus();
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const detectAdmin = async () => {
      try {
        const roles = await RoleService.fetchUserRoles(user.id);
        isAdminRef.current = roles.includes('admin') || roles.includes('supervisor');
      } catch (err) {
        log.warn('Falha ao detectar role admin', err);
      }
    };

    const tick = async () => {
      if (cancelled || disabledRef.current) return;
      let nextDelay = POLL_INTERVAL_MS;
      try {
        const res = await queryExternalProxy<QuarantineRecord>({
          table: 'media_quarantine',
          select: 'id,message_id,decision,threat_name,threat_level,scan_engine,media_type,mime_type,created_at,reviewed_at',
          filters: [{ column: 'decision', operator: 'in', value: MONITORED_DECISIONS }],
          order: { column: 'created_at', ascending: false },
          limit: HYDRATE_LIMIT,
          countMode: 'exact',
        });
        if (cancelled) return;

        const cast = res as unknown as { notConfigured?: boolean };
        if (cast.notConfigured) {
          // VPS proxy not wired — stop polling silently, permanently.
          disabledRef.current = true;
          setQuarantineMonitorStatus({ status: 'disabled' });
          return;
        }

        const records = Array.isArray(res.data) ? res.data : [];
        // `count` (countMode: 'exact') diz se a janela de 500 foi truncada. Só
        // reconciliamos por ausência quando ela é um retrato completo.
        const total = typeof res.count === 'number' ? res.count : records.length;
        const truncated = total > records.length;
        quarantineStore.reconcile(records, { truncated });

        // Detect new pending records since last tick (skip first run).
        if (isAdminRef.current && !firstRunRef.current) {
          const newPending = records.filter(
            (r) => r.decision === 'pending' && r.id && !knownIdsRef.current.has(r.id),
          );
          if (newPending.length > 0) {
            toast({
              title: `🛡️ ${newPending.length} nova(s) mídia(s) em quarentena`,
              description: newPending[0].threat_name
                ? `Ameaça mais recente: ${newPending[0].threat_name}`
                : 'Revisar no painel Segurança › Quarentena.',
              variant: 'destructive',
            });
          }
        }
        knownIdsRef.current = new Set(records.map((r) => r.id).filter(Boolean) as string[]);
        firstRunRef.current = false;
        failuresRef.current = 0;
        setQuarantineMonitorStatus({ status: 'ok', lastUpdatedAt: Date.now(), consecutiveFailures: 0 });
      } catch (err) {
        // `notConfigured` is returned as data by the proxy, never thrown here.
        // Anything that lands here is a TRANSIENT failure (500/502, relay,
        // network). R2-API-066: back off and retry — do NOT disable the monitor
        // for the whole session.
        failuresRef.current += 1;
        nextDelay = Math.min(
          POLL_INTERVAL_MS * 2 ** (failuresRef.current - 1),
          TRANSIENT_BACKOFF_MAX_MS,
        );
        log.debug('Quarantine poll transient error (will retry)', nextDelay, err);
        setQuarantineMonitorStatus({ status: 'error', consecutiveFailures: failuresRef.current });
      } finally {
        if (!cancelled && !disabledRef.current) {
          timer = setTimeout(tick, nextDelay);
        }
      }
    };

    void detectAdmin().then(tick);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [user, toast]);

  return <>{children}</>;
}
