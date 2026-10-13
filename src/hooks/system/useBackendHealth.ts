/**
 * Saude do BACKEND (cartao "avisos globais de conexao degradada e de servidor
 * fora do ar / restaurado").
 *
 * Ate aqui a V2 so sabia detectar falta de internet do NAVEGADOR
 * (`src/components/ui/offline-indicator.tsx`: `navigator.onLine`) e o
 * `useNetworkStatus` (mesma fonte). Com o backend fora do ar a tela ficava muda:
 * `navigator.onLine` continua `true` e nenhum aviso aparece.
 *
 * A checagem e uma consulta minima de REDE a um endpoint que JA existe: o
 * `/auth/v1/health` do proprio Supabase (Kong -> GoTrue), a mesma rota que o
 * provedor usa para health check. Nao precisa de sessao nem de apikey, nao le
 * tabela nenhuma e nao esbarra em RLS — serve para qualquer papel logado.
 *
 * Regras da checagem:
 *   - cadencia normal: 30 s;
 *   - falha: recuo exponencial 30 s -> 60 s -> 120 s -> 240 s (teto);
 *   - aba oculta (`document.visibilityState === 'hidden'`): a checagem PAUSA de
 *     verdade (sem timer de fundo) e retoma com um check imediato ao voltar.
 *
 * "Falha" e nao ter resposta: erro de transporte (fetch rejeita) ou HTTP 5xx.
 * Resposta 4xx significa que o servidor RESPONDEU (rota protegida, versao
 * diferente etc.) — servico de pe, nao e queda.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { SUPABASE_URL } from '@/config/supabase';
import { getLogger } from '@/lib/logger';

const log = getLogger('BackendHealth');

export const BACKEND_HEALTH_PATH = '/auth/v1/health';
/** Cadencia normal entre checagens. */
export const BASE_INTERVAL_MS = 30_000;
/** Teto do recuo exponencial. */
export const MAX_INTERVAL_MS = 240_000;
/** Quanto tempo o aviso "Conexao restaurada" fica na tela. */
export const RESTORED_NOTICE_MS = 6_000;

export type BackendStatus = 'unknown' | 'up' | 'down';

export interface BackendHealthState {
  /** 'unknown' ate a primeira resposta — nenhum aviso antes disso. */
  status: BackendStatus;
  /** Falhas consecutivas; volta a 0 na primeira resposta boa. */
  failures: number;
  /** Ha checagem em andamento agora. */
  checking: boolean;
  error: string | null;
  lastCheckedAt: number | null;
  /** Instante em que o servidor voltou (null = sem aviso de recuperacao). */
  restoredAt: number | null;
}

export type BackendCheck = () => Promise<void>;

/**
 * Consulta minima a um endpoint que ja existe. `fetchImpl` injetavel para o
 * teste provar a regra de 4xx/5xx sem tocar em rede.
 */
export async function checkSupabaseReachable(fetchImpl: typeof fetch = fetch): Promise<void> {
  const response = await fetchImpl(`${SUPABASE_URL}${BACKEND_HEALTH_PATH}`, {
    method: 'GET',
    cache: 'no-store',
  });
  // 4xx = o servidor respondeu. So 5xx (e o erro de transporte, que rejeita a
  // promise) contam como indisponivel.
  if (!response.ok && response.status >= 500) {
    throw new Error(`HTTP ${response.status}`);
  }
}

function defaultIsHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

function defaultOnVisibilityChange(listener: () => void): () => void {
  if (typeof document === 'undefined') return () => {};
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
}

export interface BackendHealthDeps {
  check?: BackendCheck;
  now?: () => number;
  baseIntervalMs?: number;
  maxIntervalMs?: number;
  restoredNoticeMs?: number;
  /** Aba oculta? (default: `document.visibilityState === 'hidden'`). */
  isHidden?: () => boolean;
  /** Assina a visibilidade da aba e devolve o cancelamento. */
  onVisibilityChange?: (listener: () => void) => () => void;
}

export function createBackendHealthMonitor(deps: BackendHealthDeps = {}) {
  const check = deps.check ?? checkSupabaseReachable;
  const now = deps.now ?? (() => Date.now());
  const baseIntervalMs = deps.baseIntervalMs ?? BASE_INTERVAL_MS;
  const maxIntervalMs = deps.maxIntervalMs ?? MAX_INTERVAL_MS;
  const restoredNoticeMs = deps.restoredNoticeMs ?? RESTORED_NOTICE_MS;
  const isHidden = deps.isHidden ?? defaultIsHidden;
  const onVisibilityChange = deps.onVisibilityChange ?? defaultOnVisibilityChange;

  let state: BackendHealthState = {
    status: 'unknown',
    failures: 0,
    checking: false,
    error: null,
    lastCheckedAt: null,
    restoredAt: null,
  };
  let timer: ReturnType<typeof setTimeout> | null = null;
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;
  let unsubscribeVisibility: (() => void) | null = null;
  const listeners = new Set<() => void>();

  function emit(partial: Partial<BackendHealthState>) {
    state = { ...state, ...partial };
    listeners.forEach((listener) => listener());
  }

  /** 30 s de cadencia normal; na falha, 60 -> 120 -> 240 (teto). */
  function nextDelay(): number {
    if (state.failures === 0) return baseIntervalMs;
    return Math.min(baseIntervalMs * 2 ** (state.failures - 1), maxIntervalMs);
  }

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function schedule() {
    clearTimer();
    // Aba oculta: pausa de verdade (sem tick de fundo). Ao voltar visivel,
    // `handleVisibility` chama um check imediato.
    if (isHidden()) return;
    timer = setTimeout(() => {
      void run();
    }, nextDelay());
  }

  function showRestoredNotice() {
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      noticeTimer = null;
      emit({ restoredAt: null });
    }, restoredNoticeMs);
  }

  async function run(): Promise<void> {
    clearTimer();
    // Checagem ja em andamento (clique em "Tentar agora" durante o tick): nao
    // dispara uma segunda requisicao nem reagenda em cima.
    if (state.checking) return;

    emit({ checking: true });
    try {
      await check();
      const recovered = state.failures > 0;
      emit({
        status: 'up',
        failures: 0,
        checking: false,
        error: null,
        lastCheckedAt: now(),
        restoredAt: recovered ? now() : state.restoredAt,
      });
      if (recovered) showRestoredNotice();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn('backend indisponivel', message);
      emit({
        status: 'down',
        failures: state.failures + 1,
        checking: false,
        error: message,
        lastCheckedAt: now(),
      });
    }
    schedule();
  }

  function handleVisibility() {
    if (isHidden()) {
      clearTimer();
      return;
    }
    void run();
  }

  function start() {
    if (unsubscribeVisibility) return;
    unsubscribeVisibility = onVisibilityChange(handleVisibility);
    // Aba oculta desde o inicio: sem check e sem timer (pausa de verdade).
    if (isHidden()) return;
    void run();
  }

  function stop() {
    clearTimer();
    if (noticeTimer) {
      clearTimeout(noticeTimer);
      noticeTimer = null;
    }
    unsubscribeVisibility?.();
    unsubscribeVisibility = null;
  }

  function subscribe(listener: () => void): () => void {
    const wasEmpty = listeners.size === 0;
    listeners.add(listener);
    if (wasEmpty) start();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) stop();
    };
  }

  return {
    subscribe,
    getSnapshot: () => state,
    /** Botao "Tentar agora": checa na hora, sem esperar o proximo tick. */
    checkNow: () => run(),
    start,
    stop,
  };
}

export type BackendHealthMonitor = ReturnType<typeof createBackendHealthMonitor>;

/** Instancia global — todo consumidor de `useBackendHealth` compartilha. */
export const backendHealthMonitor = createBackendHealthMonitor();

export interface BackendHealthData extends BackendHealthState {
  /** Aviso "Conexao restaurada" visivel. */
  restored: boolean;
  checkNow: () => Promise<void>;
}

export function useBackendHealth(
  monitor: BackendHealthMonitor = backendHealthMonitor,
): BackendHealthData {
  const state = useSyncExternalStore(monitor.subscribe, monitor.getSnapshot, monitor.getSnapshot);

  return useMemo(
    () => ({
      ...state,
      restored: state.restoredAt !== null,
      checkNow: monitor.checkNow,
    }),
    [state, monitor],
  );
}
