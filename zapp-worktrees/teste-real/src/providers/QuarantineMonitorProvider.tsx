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
/** Linhas por página na consulta de liberações (mesmo teto do proxy). */
const RELEASES_PAGE_SIZE = 500;
/** Quantos `message_id` cabem num pedido `in (...)` sem deixar a URL longa demais. */
const RELEASES_ID_CHUNK = 100;
/** Trava de segurança da paginação — não é laço infinito. */
const RELEASES_MAX_PAGES = 200;
const POLL_INTERVAL_MS = 30_000; // 30s — quarantine is rarely time-critical
/** Teto do backoff de falha transitória (30s → 5min). */
const TRANSIENT_BACKOFF_MAX_MS = 5 * 60_000;

const QUARANTINE_SELECT =
  'id,message_id,decision,threat_name,threat_level,scan_engine,media_type,mime_type,created_at,reviewed_at';

/**
 * Estados ATIVOS da janela principal (até HYDRATE_LIMIT, por created_at desc):
 * é ela que precisa enxergar até o `pending`/`deleted` mais antigo. As
 * LIBERADAS (`allowed`/`whitelisted`) não disputam essa janela — uma liberação
 * em massa expulsaria o ativo antigo da hidratação. Elas chegam à parte,
 * restritas aos `message_id` já cacheados (R2-API-066).
 */
const ACTIVE_DECISIONS = ['pending', 'deleted'];
const RELEASED_DECISIONS = ['allowed', 'whitelisted'];

/**
 * Busca as liberações (`allowed`/`whitelisted`) dos `message_id` já cacheados.
 *
 * Duas razões para não ser um pedido único:
 *  - um filtro `in (...)` com centenas de ids numa URL única é frágil (a borda
 *    do PostgREST tem limite de tamanho de requisição), então os ids vão em
 *    lotes de RELEASES_ID_CHUNK;
 *  - um `limit` fixo devolveria só as primeiras linhas de cada lote (a versão
 *    mais recente de um id e os demais ids ficariam de fora para sempre), então
 *    cada lote é paginado por `offset` até esgotar o resultado.
 */
async function fetchReleasedForIds(
  cachedIds: string[],
  isCancelled: () => boolean,
): Promise<QuarantineRecord[]> {
  const all: QuarantineRecord[] = [];
  for (let start = 0; start < cachedIds.length; start += RELEASES_ID_CHUNK) {
    const batch = cachedIds.slice(start, start + RELEASES_ID_CHUNK);
    let collected = 0;
    for (let page = 0; page < RELEASES_MAX_PAGES; page += 1) {
      const res = await queryExternalProxy<QuarantineRecord>({
        table: 'media_quarantine',
        select: QUARANTINE_SELECT,
        filters: [
          { column: 'decision', operator: 'in', value: RELEASED_DECISIONS },
          { column: 'message_id', operator: 'in', value: batch },
        ],
        order: { column: 'created_at', ascending: true },
        limit: RELEASES_PAGE_SIZE,
        offset: collected,
        countMode: 'exact',
      });
      if (isCancelled()) return all;

      const rows = Array.isArray(res.data) ? res.data : [];
      all.push(...rows);
      collected += rows.length;

      // Página incompleta = fim do lote; com `count`, para ao alcançar o total.
      if (rows.length < RELEASES_PAGE_SIZE) break;
      if (typeof res.count === 'number' && collected >= res.count) break;
    }
  }
  return all;
}

/**
 * Mounts a silent monitor that:
 *  1. Hydrates the global quarantine store with the CURRENT quarantine records
 *     — `pending`/`deleted` vêm da janela de ativos e as liberações
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
          return;
        }

        const records = Array.isArray(res.data) ? res.data : [];

        // Liberação só interessa para quem já está no cache: consulta à parte,
        // por lote de ids, sem competir pela janela dos ativos. Cache vazio →
        // nenhuma chamada extra.
        const cachedIds = [...quarantineStore.getSnapshot().keys()];
        const released =
          cachedIds.length > 0 ? await fetchReleasedForIds(cachedIds, () => cancelled) : [];
        if (cancelled) return;

        // `count` (countMode: 'exact') diz se a janela de 500 foi truncada: só
        // reconciliamos por ausência quando ela é um retrato completo.
        const total = typeof res.count === 'number' ? res.count : records.length;
        quarantineStore.reconcile(records, released, { truncated: total > records.length });

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
      } catch (err) {
        // `notConfigured` chega como dado, nunca como exceção: o que cai aqui é
        // falha TRANSITÓRIA (500/502 do relay, rede). Em vez de desligar o
        // monitor pelo resto da sessão (R2-API-066), aumenta o intervalo e
        // tenta de novo.
        failuresRef.current += 1;
        nextDelay = Math.min(
          POLL_INTERVAL_MS * 2 ** (failuresRef.current - 1),
          TRANSIENT_BACKOFF_MAX_MS,
        );
        log.debug('Quarantine poll transient error (will retry)', nextDelay, err);
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
