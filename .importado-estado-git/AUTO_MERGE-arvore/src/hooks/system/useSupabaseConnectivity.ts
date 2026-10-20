import { useCallback, useEffect, useRef, useState } from 'react';
import { FunctionsFetchError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { useNetworkStatus } from './useNetworkStatus';

const log = getLogger('SupabaseConnectivity');

/**
 * Sonda periódica de disponibilidade do backend Supabase.
 *
 * Complementa o `useNetworkStatus` (que só enxerga `navigator.onLine`): cobre o
 * caso em que a internet do usuário funciona mas o backend Supabase está
 * inacessível. A sonda é leve — uma chamada GET no endpoint de saúde do projeto
 * (`health`, Edge Function; paridade do `health-check` do V3) — e NÃO consulta
 * tabela de dados do usuário. O `connection-health-check` fica de fora de
 * propósito: é um job de cron/admin que chama a Evolution API e grava no banco a
 * cada execução, carga incompatível com uma sonda de navegador a cada 30 s.
 *
 * Estados:
 *  - `checking`  → primeira sonda ainda não respondeu;
 *  - `online`    → backend respondeu (latência dentro do limite);
 *  - `degraded`  → backend respondeu devagar OU falhou uma/duas vezes seguidas;
 *  - `offline`   → navegador offline (sem sondar) OU backend inacessível após
 *                  `CONNECTIVITY_FAILURES_BEFORE_OFFLINE` falhas seguidas.
 *
 * O ciclo pausa com a aba oculta (`visibilitychange`) e retoma ao voltar; cada
 * tentativa falha agenda a próxima com recuo exponencial (dobra o intervalo,
 * respeitando o mínimo de 30 s e o teto).
 *
 * Uso:
 * ```tsx
 * const { status, isDegraded, isOffline, retryNow } = useSupabaseConnectivity();
 * ```
 */

export type SupabaseConnectivityStatus = 'checking' | 'online' | 'degraded' | 'offline';

export interface UseSupabaseConnectivityResult {
  status: SupabaseConnectivityStatus;
  /** true quando o backend respondeu normalmente. */
  isOnline: boolean;
  /** true quando o backend respondeu devagar ou falhou (ainda não offline). */
  isDegraded: boolean;
  /** true quando o navegador está offline ou o backend está inacessível. */
  isOffline: boolean;
  /** true enquanto a primeira sonda do ciclo não respondeu. */
  isChecking: boolean;
  /** Timestamp da última sonda concluída (ms), ou null antes da primeira. */
  lastCheckedAt: number | null;
  /** Latência da última sonda (ms), ou null antes da primeira. */
  latencyMs: number | null;
  /** Falhas consecutivas desde o último sucesso. */
  consecutiveFailures: number;
  /** Força uma sonda imediata (botão "Tentar agora"). */
  retryNow: () => void;
}

interface ConnectivityState {
  status: SupabaseConnectivityStatus;
  lastCheckedAt: number | null;
  latencyMs: number | null;
  consecutiveFailures: number;
}

/** Intervalo mínimo entre sondas (o cartão exige pelo menos 30 s). */
export const CONNECTIVITY_BASE_INTERVAL_MS = 30_000;
/** Teto do recuo exponencial entre tentativas após falha. */
export const CONNECTIVITY_MAX_INTERVAL_MS = 300_000;
/** Timeout de cada sonda: sem resposta nesse prazo = backend inacessível. */
export const CONNECTIVITY_PROBE_TIMEOUT_MS = 6_000;
/** Latência acima disso marca `degraded` mesmo com resposta. */
export const CONNECTIVITY_DEGRADED_LATENCY_MS = 2_000;
/** Falhas consecutivas antes de declarar `offline` (backend inacessível). */
export const CONNECTIVITY_FAILURES_BEFORE_OFFLINE = 3;
/** Endpoint de saúde leve do projeto (Edge `health` — paridade do `health-check` do V3). */
export const CONNECTIVITY_HEALTH_ENDPOINT = 'health';

/** Delay da próxima tentativa: dobra por falha, limitado ao teto. */
export function nextBackoffDelay(failures: number): number {
  const safe = Math.max(1, Math.trunc(failures));
  return Math.min(CONNECTIVITY_BASE_INTERVAL_MS * 2 ** safe, CONNECTIVITY_MAX_INTERVAL_MS);
}

/**
 * Uma sonda no backend. Devolve `reachable` = o servidor respondeu algo.
 *
 * `FunctionsFetchError` é o único erro que significa "nada respondeu"
 * (rede/DNS/timeout/abort). Qualquer outra resposta — inclusive HTTP não-2xx
 * (`FunctionsHttpError`) — prova que o backend está de pé.
 */
async function probeBackend(): Promise<{ reachable: boolean; latencyMs: number }> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONNECTIVITY_PROBE_TIMEOUT_MS);
  try {
    const { error } = await supabase.functions.invoke(CONNECTIVITY_HEALTH_ENDPOINT, {
      method: 'GET',
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    if (error instanceof FunctionsFetchError) return { reachable: false, latencyMs };
    return { reachable: true, latencyMs };
  } catch {
    return { reachable: false, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timeout);
  }
}

export function useSupabaseConnectivity(): UseSupabaseConnectivityResult {
  const { isOnline: browserOnline } = useNetworkStatus();

  const [state, setState] = useState<ConnectivityState>({
    status: 'checking',
    lastCheckedAt: null,
    latencyMs: null,
    consecutiveFailures: 0,
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const browserOnlineRef = useRef(browserOnline);
  /** Geração da sonda em curso; incrementar invalida respostas obsoletas. */
  const inFlightRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const failuresRef = useRef(0);
  const runProbeRef = useRef<() => void>(() => {});

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const commit = useCallback((next: Partial<ConnectivityState>) => {
    if (!mountedRef.current) return;
    setState((prev) => ({ ...prev, ...next }));
  }, []);

  /** Agenda a próxima sonda (nada em background com a aba oculta). */
  const schedule = useCallback(
    (delay: number) => {
      clearTimer();
      if (!mountedRef.current) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      timerRef.current = setTimeout(() => {
        runProbeRef.current();
      }, delay);
    },
    [clearTimer],
  );

  const runProbe = useCallback(async () => {
    if (!mountedRef.current) return;
    if (inFlightRef.current !== null) return;
    // Aba oculta: o ciclo fica parado até o usuário voltar.
    if (typeof document !== 'undefined' && document.hidden) return;
    // Navegador offline: não sonda; aguarda o evento `online`.
    if (!browserOnlineRef.current) {
      failuresRef.current = 0;
      commit({ status: 'offline', consecutiveFailures: 0 });
      return;
    }

    const generation = ++generationRef.current;
    inFlightRef.current = generation;

    let reachable = false;
    let latencyMs = 0;
    try {
      const result = await probeBackend();
      reachable = result.reachable;
      latencyMs = result.latencyMs;
    } finally {
      if (inFlightRef.current === generation) inFlightRef.current = null;
    }

    // Resposta obsoleta (desmontou, aba oculta, offline ou retry no meio): descarta.
    if (!mountedRef.current || generation !== generationRef.current) return;

    const checkedAt = Date.now();
    if (reachable) {
      failuresRef.current = 0;
      const status: SupabaseConnectivityStatus =
        latencyMs > CONNECTIVITY_DEGRADED_LATENCY_MS ? 'degraded' : 'online';
      log.info(`Backend Supabase alcançável em ${latencyMs}ms (${status})`);
      commit({ status, latencyMs, lastCheckedAt: checkedAt, consecutiveFailures: 0 });
      schedule(CONNECTIVITY_BASE_INTERVAL_MS);
      return;
    }

    failuresRef.current += 1;
    const failures = failuresRef.current;
    const status: SupabaseConnectivityStatus =
      failures >= CONNECTIVITY_FAILURES_BEFORE_OFFLINE ? 'offline' : 'degraded';
    log.warn(`Backend Supabase inacessível (falha ${failures}, ${status})`);
    commit({ status, latencyMs, lastCheckedAt: checkedAt, consecutiveFailures: failures });
    schedule(nextBackoffDelay(failures));
  }, [commit, schedule]);

  // Mantém a referência da sonda viva para os agendamentos.
  useEffect(() => {
    runProbeRef.current = () => {
      void runProbe();
    };
  }, [runProbe]);

  // Navegador online/offline: reage sem esperar a próxima sonda agendada.
  useEffect(() => {
    browserOnlineRef.current = browserOnline;
    if (!browserOnline) {
      generationRef.current += 1; // invalida sonda em voo
      failuresRef.current = 0;
      clearTimer();
      commit({ status: 'offline', consecutiveFailures: 0 });
      return;
    }
    failuresRef.current = 0;
    runProbeRef.current();
  }, [browserOnline, clearTimer, commit]);

  // Aba oculta pausa o ciclo; ao voltar, sonda imediatamente.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleVisibility = () => {
      if (document.hidden) {
        clearTimer();
        return;
      }
      runProbeRef.current();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [clearTimer]);

  // Limpeza ao desmontar: para o timer e descarta respostas em voo.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      inFlightRef.current = null;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const retryNow = useCallback(() => {
    generationRef.current += 1; // invalida sonda em voo
    inFlightRef.current = null; // libera a nova sonda
    failuresRef.current = 0;
    clearTimer();
    runProbeRef.current();
  }, [clearTimer]);

  return {
    status: state.status,
    isOnline: state.status === 'online',
    isDegraded: state.status === 'degraded',
    isOffline: state.status === 'offline',
    isChecking: state.status === 'checking',
    lastCheckedAt: state.lastCheckedAt,
    latencyMs: state.latencyMs,
    consecutiveFailures: state.consecutiveFailures,
    retryNow,
  };
}
