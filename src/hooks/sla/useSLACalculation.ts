import { useState, useEffect, useCallback } from 'react';

export type SLAStatus = 'ok' | 'warning' | 'breached';

export interface SLATimerState {
  firstResponse: {
    status: SLAStatus;
    remainingMs: number;
    breached: boolean;
  };
  resolution: {
    status: SLAStatus;
    remainingMs: number;
    breached: boolean;
  };
  worstStatus: SLAStatus;
}

interface UseSLACalculationParams {
  firstMessageAt: Date;
  firstResponseAt?: Date | null;
  resolvedAt?: Date | null;
  firstResponseMinutes: number;
  resolutionMinutes: number;
}

function calculateStatus(
  remainingMs: number,
  totalMs: number,
  completed: boolean,
  completedAt?: Date | null,
  deadline?: Date
): { status: SLAStatus; remainingMs: number; breached: boolean } {
  if (completed && completedAt && deadline) {
    const breached = completedAt > deadline;
    return { status: breached ? 'breached' : 'ok', remainingMs: 0, breached };
  }

  const warningThreshold = totalMs * 0.3;
  if (remainingMs <= 0) {
    return { status: 'breached', remainingMs, breached: true };
  }
  if (remainingMs <= warningThreshold) {
    return { status: 'warning', remainingMs, breached: false };
  }
  return { status: 'ok', remainingMs, breached: false };
}

function compute(params: UseSLACalculationParams): SLATimerState {
  const now = new Date();
  const frDeadline = new Date(params.firstMessageAt.getTime() + params.firstResponseMinutes * 60_000);
  const resDeadline = new Date(params.firstMessageAt.getTime() + params.resolutionMinutes * 60_000);

  const firstResponse = calculateStatus(
    frDeadline.getTime() - now.getTime(),
    params.firstResponseMinutes * 60_000,
    !!params.firstResponseAt,
    params.firstResponseAt,
    frDeadline
  );

  const resolution = calculateStatus(
    resDeadline.getTime() - now.getTime(),
    params.resolutionMinutes * 60_000,
    !!params.resolvedAt,
    params.resolvedAt,
    resDeadline
  );

  const worstStatus: SLAStatus =
    firstResponse.status === 'breached' || resolution.status === 'breached'
      ? 'breached'
      : firstResponse.status === 'warning' || resolution.status === 'warning'
        ? 'warning'
        : 'ok';

  return { firstResponse, resolution, worstStatus };
}

export function formatTimeRemaining(ms: number): string {
  const absMs = Math.abs(ms);
  const totalSeconds = Math.floor(absMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0) return `${hours}h ${remainingMinutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function useSLACalculation(params: UseSLACalculationParams): SLATimerState {
  const [state, setState] = useState<SLATimerState>(() => compute(params));

  const recompute = useCallback(() => setState(compute(params)), [
    params.firstMessageAt,
    params.firstResponseAt,
    params.resolvedAt,
    params.firstResponseMinutes,
    params.resolutionMinutes,
  ]);

  useEffect(() => {
    recompute();
    if (params.firstResponseAt && params.resolvedAt) return;
    const interval = setInterval(recompute, 1000);
    return () => clearInterval(interval);
  }, [recompute, params.firstResponseAt, params.resolvedAt]);

  return state;
}
