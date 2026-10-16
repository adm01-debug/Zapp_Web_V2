import { useCallback } from 'react';

export interface UseEmergencyStopOptions {
  flagEnabled: boolean;
  onStop?: () => void;
}

export interface EmergencyStopResult {
  isStopped: boolean;
  triggerStop: () => void;
}

/**
 * CV-119 — Interruptor de emergência.
 * DELEGADA a IA-009, IA-050: thin wrapper around the master copilot flag.
 * When isStopped is true, no RADAR processing should occur.
 * Supervisor calls triggerStop() which fires the provided callback
 * (expected to toggle the flag off via the feature-flags API).
 */
export function useEmergencyStop({ flagEnabled, onStop }: UseEmergencyStopOptions): EmergencyStopResult {
  const isStopped = !flagEnabled;

  const triggerStop = useCallback(() => {
    onStop?.();
  }, [onStop]);

  return { isStopped, triggerStop };
}
