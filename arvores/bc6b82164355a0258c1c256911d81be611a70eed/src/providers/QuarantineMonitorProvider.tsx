import { useEffect, useRef } from 'react';
import { queryExternalProxy } from '@/lib/externalProxy';
import { quarantineStore } from '@/lib/quarantineStore';
import type { QuarantineRecord } from '@/hooks/integrations/useQuarantineMedia';
import { useAuth } from '@/hooks/auth/useAuth';
import { RoleService } from '@/services/role.service';
import { useToast } from '@/hooks/ui/use-toast';
import { getLogger } from '@/lib/logger';

const log = getLogger('QuarantineMonitor');

const HYDRATE_LIMIT = 500;
const POLL_INTERVAL_MS = 30_000; // 30s — quarantine is rarely time-critical

/**
 * Mounts a silent monitor that:
 *  1. Hydrates the global quarantine store with non-allowed records so message
 *     bubbles render the 🛡️ badge on first paint.
 *  2. Polls every 30s; when admins are online and new pending records appear,
 *     surfaces a destructive toast (acts as a frontend "reverse webhook" until
 *     the VPS pushes events directly).
 *
 * No-op when external VPS proxy is not configured.
 */
export function QuarantineMonitorProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdminRef = useRef(false);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const firstRunRef = useRef(true);
  const disabledRef = useRef(false);

  useEffect(() => {
    if (!user) {
      knownIdsRef.current.clear();
      quarantineStore.clear();
      firstRunRef.current = true;
      disabledRef.current = false;
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
      try {
        const res = await queryExternalProxy<QuarantineRecord>({
          table: 'media_quarantine',
          select: 'id,message_id,decision,threat_name,threat_level,scan_engine,media_type,mime_type,created_at',
          filters: [{ column: 'decision', operator: 'in', value: ['pending', 'deleted'] }],
          order: { column: 'created_at', ascending: false },
          limit: HYDRATE_LIMIT,
        });
        if (cancelled) return;

        const cast = res as unknown as { notConfigured?: boolean };
        if (cast.notConfigured) {
          // VPS proxy not wired — stop polling silently.
          disabledRef.current = true;
          return;
        }

        const records = Array.isArray(res.data) ? res.data : [];
        quarantineStore.upsertMany(records);

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
      } catch (err) {
        // Unexpected error (externalProxy already handles 403/404 as notConfigured).
        // Log at debug level and stop polling — external proxy is optional.
        log.debug('Quarantine poll error (external proxy unavailable)', err);
        disabledRef.current = true;
      } finally {
        if (!cancelled && !disabledRef.current) {
          timer = setTimeout(tick, POLL_INTERVAL_MS);
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
