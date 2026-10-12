/**
 * Indicador FIXO da saúde das conexões do WhatsApp na barra lateral (GL2).
 *
 * Antes: a V2 só tinha o `EvolutionDisconnectBanner`, que podia ser dispensado e
 * reconectava uma instância por vez — depois de dispensado ninguém mais via o
 * estado das instâncias. Aqui o indicador fica no topo da barra, fora da área de
 * rolagem, sempre à vista.
 *
 * Os dados vêm SÓ do store global do GL1 (`useConnectionsHealth`): uma assinatura
 * de realtime e uma busca para todos os consumidores. Este componente não fala com
 * o Supabase nem abre assinatura própria — por isso nenhum import de
 * `@/integrations/supabase/client` aqui.
 *
 * Papéis: o STAFF (admin/supervisor, via `useUserRole`) vê as AÇÕES (reconectar
 * uma, reconectar todas, limpar o histórico); o agente vê apenas o ESTADO
 * (o ponto, a contagem, a lista e as últimas quedas).
 *
 * Movimento: só `transform`/`opacity`, molas curtas e o ponto pulsa apenas em
 * estado degradado/desconectado — com `prefers-reduced-motion: reduce` não há
 * pulso nem deslocamento, só opacidade e cor.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { History, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ShimmerSkeleton } from '@/components/inbox/chat/motion';
import { zappPopoverVariants, zappTransition } from '@/lib/motion';
import {
  useConnectionsHealth,
  type ConnectionHealth,
} from '@/hooks/connections/useConnectionsHealth';
import { useUserRole } from '@/hooks/system/useUserRole';

/** Estados do ponto do indicador. `loading`/`empty` são estados de leitura. */
type Tone = 'ok' | 'warn' | 'down' | 'empty' | 'loading';

/** Linhas do histórico desenhadas por vez (o resto é resumido). */
const HISTORY_VISIBLE = 4;

/**
 * Escalonamento de entrada dos itens da lista: 40 ms por item, teto de 8.
 * Não usa `zappStaggerDelaySeconds` de `@/lib/motion` de propósito: a regra do
 * kit do chat é 60 ms por item e o cartão desta tela limita o escalonamento a
 * 40 ms. Nada de tempo solto além desta constante.
 */
const LIST_STAGGER_SECONDS = 0.04;
const LIST_STAGGER_MAX = 8;

const FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'connected', label: 'Conectadas' },
  { key: 'disconnected', label: 'Offline' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

const DOT_TONE: Record<Tone, string> = {
  ok: 'bg-success',
  warn: 'bg-warning',
  down: 'bg-destructive',
  empty: 'bg-muted-foreground',
  loading: 'bg-muted-foreground',
};

const TRIGGER_TONE: Record<Tone, string> = {
  ok: 'border-success/30 bg-success/10 hover:bg-success/15',
  warn: 'border-warning/40 bg-warning/10 hover:bg-warning/15',
  down: 'border-destructive/30 bg-destructive/10 hover:bg-destructive/15',
  empty: 'border-border bg-muted/20 hover:bg-muted/40',
  loading: 'border-border bg-muted/20',
};

const TONE_LABEL: Record<Tone, string> = {
  ok: 'Conexões ativas',
  warn: 'Offline',
  down: 'Todas as conexões offline',
  empty: 'Nenhuma conexão',
  loading: 'Lendo conexões…',
};

function connectionLabel(connection: ConnectionHealth): string {
  return connection.name || connection.phoneNumber || connection.id;
}

/** Tempo relativo curto para as últimas quedas (sem dependência externa). */
function formatRelative(at: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - at);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

interface ConnectionsHealthIndicatorProps {
  /** Espelha o estado da barra lateral: recolhida = só o ponto. */
  collapsed?: boolean;
}

export function ConnectionsHealthIndicator({
  collapsed = false,
}: ConnectionsHealthIndicatorProps) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const { isSupervisor } = useUserRole();
  const {
    connections,
    loading,
    error,
    history,
    reconnecting,
    reconnectingAll,
    disconnected,
    total,
    connectedCount,
    hasIssue,
    reconnect,
    reconnectAll,
    clearHistory,
  } = useConnectionsHealth();

  // Estado PRÓPRIO deste recurso (não reaproveita o de outro): popover, filtro e
  // aviso da última ação.
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [notice, setNotice] = useState<string | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const mountedRef = useRef(true);

  // Sem canal/intervalo aqui: nada de timer para limpar. A guarda cobre só o
  // `setNotice` de uma ação assíncrona que resolver depois de desmontar.
  const setNoticeIfMounted = useCallback((value: string | null) => {
    if (mountedRef.current) setNotice(value);
  }, []);

  const tone: Tone = useMemo(() => {
    if (loading) return 'loading';
    if (error) return 'down';
    if (total === 0) return 'empty';
    if (!hasIssue) return 'ok';
    return connectedCount === 0 ? 'down' : 'warn';
  }, [loading, error, total, hasIssue, connectedCount]);

  const triggerLabel = useMemo(() => {
    if (tone === 'loading') return 'Conexões WhatsApp — lendo…';
    if (tone === 'empty') return 'Conexões WhatsApp — nenhuma conexão';
    if (error) return `Conexões WhatsApp — indisponível: ${error}`;
    if (tone === 'down') {
      return `Conexões WhatsApp — todas as ${total} offline`;
    }
    if (tone === 'warn') {
      return `Conexões WhatsApp — ${disconnected.length} de ${total} offline`;
    }
    return `Conexões WhatsApp — ${connectedCount} de ${total} conectadas`;
  }, [tone, error, total, disconnected.length, connectedCount]);

  const pulse = tone === 'warn' || tone === 'down';
  const hydrated = !loading && total > 0;

  const counts: Record<FilterKey, number> = useMemo(
    () => ({
      all: total,
      connected: connectedCount,
      disconnected: disconnected.length,
    }),
    [total, connectedCount, disconnected.length],
  );

  const filtered = useMemo(() => {
    if (filter === 'connected') return connections.filter((c) => c.healthy);
    if (filter === 'disconnected') return connections.filter((c) => !c.healthy);
    return connections;
  }, [connections, filter]);

  const onFilterKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const current = FILTERS.findIndex((item) => item.key === filter);
      const step = event.key === 'ArrowRight' ? 1 : -1;
      const next = (current + step + FILTERS.length) % FILTERS.length;
      setFilter(FILTERS[next].key);
      tabRefs.current[next]?.focus();
    },
    [filter],
  );

  // Aviso só DEPOIS da resposta: nunca anuncia sucesso antes da confirmação.
  const handleReconnect = useCallback(
    async (connection: ConnectionHealth) => {
      setNoticeIfMounted(null);
      const result = await reconnect(connection.id);
      if (result.skipped) return;
      setNoticeIfMounted(
        result.ok
          ? `${connectionLabel(connection)} reconectada.`
          : `Falha ao reconectar ${connectionLabel(connection)}${result.error ? `: ${result.error}` : '.'}`,
      );
    },
    [reconnect, setNoticeIfMounted],
  );

  const handleReconnectAll = useCallback(async () => {
    setNoticeIfMounted(null);
    const summary = await reconnectAll();
    const parts = [
      `${summary.ok} de ${summary.total} reconectada${summary.total === 1 ? '' : 's'}`,
    ];
    if (summary.failed > 0) parts.push(`${summary.failed} com falha`);
    if (summary.skipped > 0) parts.push(`${summary.skipped} já em andamento`);
    setNoticeIfMounted(parts.join(' · '));
  }, [reconnectAll, setNoticeIfMounted]);

  const handleClearHistory = useCallback(() => {
    clearHistory();
    setNoticeIfMounted(null);
  }, [clearHistory, setNoticeIfMounted]);

  const trigger = loading ? (
    <button
      type="button"
      disabled
      aria-label={triggerLabel}
      aria-busy="true"
      data-testid="conexoes-indicador"
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3',
        'min-h-[40px]',
        collapsed ? 'w-[40px] justify-center' : 'w-full',
        TRIGGER_TONE.loading,
      )}
    >
      <ShimmerSkeleton className={cn('h-2 w-2 rounded-full', collapsed && 'mx-auto')} />
      {!collapsed && <ShimmerSkeleton className="h-3 w-24" />}
    </button>
  ) : (
    <button
      type="button"
      aria-label={triggerLabel}
      data-testid="conexoes-indicador"
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 transition-colors',
        'min-h-[40px] outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        collapsed ? 'w-[40px] justify-center' : 'w-full',
        TRIGGER_TONE[tone],
      )}
    >
      <motion.span
        aria-hidden="true"
        data-testid="conexoes-ponto"
        data-tone={tone}
        data-motion={prefersReducedMotion ? 'reduced' : 'full'}
        className={cn('h-2 w-2 shrink-0 rounded-full', DOT_TONE[tone])}
        animate={
          pulse && !prefersReducedMotion
            ? { opacity: [1, 0.4, 1], scale: [1, 1.3, 1] }
            : { opacity: 1, scale: 1 }
        }
        transition={
          pulse && !prefersReducedMotion
            ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
            : zappTransition.fast
        }
      />
      {!collapsed && (
        <span className="truncate text-xs font-medium text-foreground">{TONE_LABEL[tone]}</span>
      )}
      {!collapsed && hydrated && (
        <span className="ml-auto shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">
          {connectedCount}/{total}
        </span>
      )}
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          {loading ? trigger : <PopoverTrigger asChild>{trigger}</PopoverTrigger>}
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8} className="text-xs">
          {triggerLabel}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-80 border-border bg-popover p-0 shadow-lg"
      >
        <motion.div
          variants={zappPopoverVariants}
          initial={prefersReducedMotion ? false : 'hidden'}
          animate="visible"
        >
          {/* Cabeçalho + ação "Reconectar todas" (staff) */}
          <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">WhatsApp — Conexões</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {connectedCount} de {total} conectada{total === 1 ? '' : 's'}
              </p>
            </div>
            {isSupervisor && disconnected.length > 1 && (
              <button
                type="button"
                onClick={handleReconnectAll}
                disabled={reconnectingAll || reconnecting !== null}
                aria-label={`Reconectar todas as ${disconnected.length} conexões offline`}
                className="inline-flex min-h-[40px] shrink-0 items-center gap-1 rounded border border-destructive/30 bg-destructive/10 px-2 text-[10px] font-semibold text-foreground hover:bg-destructive/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={cn('h-3 w-3', reconnectingAll && 'motion-safe:animate-spin')}
                />
                Reconectar todas ({disconnected.length})
              </button>
            )}
          </div>

          {/* Filtro por status — setas navegam entre as abas */}
          <div
            role="tablist"
            aria-label="Filtrar conexões por status"
            onKeyDown={onFilterKeyDown}
            className="flex items-center gap-1 border-b border-border px-3 py-1.5"
          >
            {FILTERS.map(({ key, label }, index) => {
              const active = filter === key;
              return (
                <button
                  key={key}
                  ref={(element) => {
                    tabRefs.current[index] = element;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setFilter(key)}
                  className={cn(
                    'inline-flex min-h-[40px] flex-1 items-center justify-center gap-1 rounded px-2 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                    active
                      ? 'border border-primary/30 bg-primary/10 text-foreground'
                      : 'border border-transparent text-muted-foreground hover:bg-muted/60',
                  )}
                >
                  {label}
                  <span className="text-[9px] tabular-nums">({counts[key]})</span>
                </button>
              );
            })}
          </div>

          {error && (
            <p role="status" className="border-b border-border px-3 py-2 text-[11px] text-foreground">
              Não foi possível ler as conexões: {error}
            </p>
          )}

          {/* Lista animada — AnimatePresence com os itens condicionais DENTRO */}
          <ul role="list" className="max-h-72 overflow-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-[11px] text-muted-foreground">
                {filter === 'connected'
                  ? 'Nenhuma conexão conectada.'
                  : filter === 'disconnected'
                    ? 'Nenhuma conexão offline — tudo em ordem.'
                    : 'Nenhuma conexão cadastrada ainda.'}
              </li>
            ) : (
              <AnimatePresence initial={false}>
                {filtered.map((connection, index) => (
                  <motion.li
                    key={connection.id}
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={
                      prefersReducedMotion
                        ? { duration: 0 }
                        : {
                            ...zappTransition.panel,
                            delay: Math.min(index, LIST_STAGGER_MAX - 1) * LIST_STAGGER_SECONDS,
                          }
                    }
                    className="flex items-center justify-between gap-2 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'h-1.5 w-1.5 shrink-0 rounded-full',
                          connection.healthy ? 'bg-success' : 'bg-destructive',
                        )}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-foreground">
                          {connectionLabel(connection)}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {connection.phoneNumber ||
                            (connection.healthy ? 'Online' : 'Desconectada')}
                        </p>
                      </div>
                    </div>
                    {isSupervisor && !connection.healthy && (
                      <button
                        type="button"
                        onClick={() => handleReconnect(connection)}
                        disabled={reconnecting === connection.id || reconnectingAll}
                        aria-label={`Reconectar ${connectionLabel(connection)}`}
                        className={cn(
                          'inline-flex min-h-[40px] shrink-0 items-center gap-1 rounded border border-border px-2 text-[10px] font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                          reconnecting === connection.id && 'opacity-70',
                        )}
                      >
                        <RefreshCw
                          aria-hidden="true"
                          className={cn(
                            'h-3 w-3',
                            reconnecting === connection.id && 'motion-safe:animate-spin',
                          )}
                        />
                        Reconectar
                      </button>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            )}
          </ul>

          {/* Últimas quedas (histórico da sessão) */}
          {history.length > 0 && (
            <div className="border-t border-border px-3 py-2">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <History aria-hidden="true" className="h-3 w-3" />
                  Últimas quedas
                </div>
                {isSupervisor && (
                  <button
                    type="button"
                    onClick={handleClearHistory}
                    aria-label="Limpar histórico de quedas"
                    className="inline-flex min-h-[40px] items-center rounded px-1 text-[10px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    Limpar
                  </button>
                )}
              </div>
              <ul role="list" className="space-y-0.5">
                {history.slice(0, HISTORY_VISIBLE).map((event, index) => (
                  <li
                    key={`${event.connectionId}-${event.at}-${index}`}
                    className="flex items-center justify-between gap-2 text-[11px]"
                  >
                    <span className="truncate text-foreground/80">
                      {event.name || event.instanceId || 'Conexão'}
                    </span>
                    <span
                      className="shrink-0 text-[10px] tabular-nums text-muted-foreground"
                      title={new Date(event.at).toLocaleString()}
                    >
                      {formatRelative(event.at)}
                    </span>
                  </li>
                ))}
              </ul>
              {history.length > HISTORY_VISIBLE && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  +{history.length - HISTORY_VISIBLE} eventos anteriores
                </p>
              )}
            </div>
          )}

          {notice && (
            <p
              role="status"
              aria-live="polite"
              data-testid="conexoes-aviso"
              className="border-t border-border px-3 py-2 text-[11px] text-foreground"
            >
              {notice}
            </p>
          )}
        </motion.div>
      </PopoverContent>
    </Popover>
  );
}
