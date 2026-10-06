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
/** Tamanho de cada página da consulta de liberações (mesma janela do proxy). */
const RELEASES_PAGE_SIZE = 500;
/** Teto de páginas da consulta de liberações (trava de segurança, não laço infinito). */
const RELEASES_MAX_PAGES = 200;
const POLL_INTERVAL_MS = 30_000; // 30s — quarantine is rarely time-critical
const TRANSIENT_BACKOFF_MAX_MS = 5 * 60_000; // teto do backoff de falha transitória

const QUARANTINE_SELECT =
  'id,message_id,decision,threat_name,threat_level,scan_engine,media_type,mime_type,created_at,reviewed_at';

/**
 * Estados ATIVOS da janela principal (até HYDRATE_LIMIT, por created_at desc):
 * é ela que precisa enxergar até o `pending`/`deleted` mais antigo. As
 * LIBERADAS (`allowed`/`whitelisted`) NÃO disputam essa janela — uma
 * liberação em massa expulsaria o ativo antigo da hidratação. Elas chegam por
 * uma consulta à parte, restrita aos `message_id` já cacheados (R2-API-066).
 */
const ACTIVE_DECISIONS = ['pending', 'deleted'];
const RELEASED_DECISIONS = ['allowed', 'whitelisted'];

/**
 * Busca TODAS as liberações (`allowed`/`whitelisted`) dos ids já cacheados,
 * PAGINANDO por `offset` até esgotar o resultado.
 *
 * Um único `limit: 500` deixava de fora justamente o que importa: ordenada por
 * `created_at` crescente, a 1ª página traz as liberações MAIS ANTIGAS — a
 * versão mais recente de um id e as liberações dos demais ids caíam fora da
 * janela e a decisão antiga permanecia no cache para sempre (t_e062f638).
 */
async function fetchAllReleases(
  cachedIds: string[],
  isCancelled: () => boolean,
): Promise<QuarantineRecord[]> {
  const all: QuarantineRecord[] = [];
  for (let page = 0; page < RELEASES_MAX_PAGES; page += 1) {
    const res = await queryExternalProxy<QuarantineRecord>({
      table: 'media_quarantine',
      select: QUARANTINE_SELECT,
      filters: [
        { column: 'decision', operator: 'in', value: RELEASED_DECISIONS },
        { column: 'message_id', operator: 'in', value: cachedIds },
      ],
      order: { column: 'created_at', ascending: true },
      limit: RELEASES_PAGE_SIZE,
      offset: all.length,
      countMode: 'exact',
    });
    if (isCancelled()) return all;

    const pageRows = Array.isArray(res.data) ? res.data : [];
    all.push(...pageRows);

    // Página incompleta = fim do resultado. Com `count`, para quando alcança o
    // total; sem `count`, segue enquanto vierem páginas cheias (trava acima).
    if (pageRows.length < RELEASES_PAGE_SIZE) break;
    if (typeof res.count === 'number' && all.length >= res.count) break;
  }
  return all;
}

/**
 * Chave de versão de um registro, para decidir qual linha de um mesmo
 * `message_id` é a MAIS RECENTE: quando o admin decidiu (`reviewed_at`), quando
 * a linha nasceu (`created_at`) e, por fim, o id — comparação lexicográfica de
 * ISO 8601 (o separador mantém a ordem dos campos).
 */
function releaseVersionKey(r: QuarantineRecord): string {
  return `${r.reviewed_at ?? ''}|${r.created_at ?? ''}|${r.id ?? ''}`;
}

/**
 * Reduz as liberações a UMA linha por `message_id` — a efetivamente mais
 * recente. Com versões repetidas do mesmo id, a ordem de chegada do servidor
 * não basta: comparamos a versão explicitamente (t_e062f638).
 */
function latestReleasePerMessageId(rows: QuarantineRecord[]): QuarantineRecord[] {
  const latest = new Map<string, QuarantineRecord>();
  for (const r of rows) {
    if (!r.message_id) continue;
    const prev = latest.get(r.message_id);
    if (!prev || releaseVersionKey(r) > releaseVersionKey(prev)) {
      latest.set(r.message_id, r);
    }
  }
  return [...latest.values()];
}

/**
 * Mounts a silent monitor that:
 *  1. Hydrates the global quarantine store with the current quarantine records
 *     — `pending`/`deleted` vêm da janela de ATIVOS e as liberações
 *     (`allowed`/`whitelisted`) de uma consulta à parte, restrita aos
 *     `message_id` já cacheados — so message bubbles render the 🛡️ badge on
 *     first paint and reflect the latest decision.
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
          select: QUARANTINE_SELECT,
          filters: [{ column: 'decision', operator: 'in', value: ACTIVE_DECISIONS }],
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

        // Liberações (`allowed`/`whitelisted`) só interessam para registros já
        // cacheados: a consulta à parte atualiza a decisão antiga sem competir
        // pela janela dos ativos. Cache vazio → nenhuma chamada extra.
        const cachedIds = [...quarantineStore.getSnapshot().keys()];
        let releases: QuarantineRecord[] = [];
        if (cachedIds.length > 0) {
          const allReleases = await fetchAllReleases(cachedIds, () => cancelled);
          if (cancelled) return;
          // Uma linha por `message_id` — a mais recente — vence no cache.
          releases = latestReleasePerMessageId(allReleases);
        }

        // `count` (countMode: 'exact') diz se a janela de 500 foi truncada. Só
        // reconciliamos por ausência quando ela é um retrato completo.
        const total = typeof res.count === 'number' ? res.count : records.length;
        const truncated = total > records.length;
        quarantineStore.reconcile(records, releases, { truncated });

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
