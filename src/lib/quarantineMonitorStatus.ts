/**
 * Estado de atualização OBSERVÁVEL do monitor de quarentena (R2-API-066).
 *
 * O `QuarantineMonitorProvider` publica aqui o resultado de cada tick para que a
 * UI (ou um teste) consiga distinguir três situações que antes eram invisíveis:
 *  - `ok`        — a última consulta funcionou;
 *  - `error`     — a última consulta falhou de forma TRANSITÓRIA (haverá retry);
 *  - `disabled`  — o proxy externo não está configurado (VPS ausente): parou de propósito.
 *
 * Módulo próprio (e não dentro do provider) para não misturar componentes com
 * valores no mesmo arquivo — o ESLint `react-refresh/only-export-components`
 * trata isso como dívida nova.
 */
import { useSyncExternalStore } from 'react';

export type QuarantineMonitorStatus = 'idle' | 'ok' | 'error' | 'disabled';

export interface QuarantineMonitorSnapshot {
  status: QuarantineMonitorStatus;
  lastUpdatedAt: number | null;
  consecutiveFailures: number;
}

const IDLE: QuarantineMonitorSnapshot = {
  status: 'idle',
  lastUpdatedAt: null,
  consecutiveFailures: 0,
};

let state: QuarantineMonitorSnapshot = IDLE;
const listeners = new Set<() => void>();

/** Publica um novo estado (usado pelo provider). */
export function setQuarantineMonitorStatus(patch: Partial<QuarantineMonitorSnapshot>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

/** Volta ao estado inicial (logout / troca de identidade). */
export function resetQuarantineMonitorStatus() {
  setQuarantineMonitorStatus(IDLE);
}

export const quarantineMonitorStatus = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): QuarantineMonitorSnapshot {
    return state;
  },
};

/** Hook reativo — re-renderiza quando o estado do monitor muda. */
export function useQuarantineMonitorStatus(): QuarantineMonitorSnapshot {
  return useSyncExternalStore(
    quarantineMonitorStatus.subscribe,
    quarantineMonitorStatus.getSnapshot,
    quarantineMonitorStatus.getSnapshot,
  );
}
