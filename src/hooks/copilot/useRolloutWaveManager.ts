import { useState, useCallback } from 'react';

export type WaveStatus = 'pending' | 'active' | 'completed' | 'blocked';

export interface RolloutWave {
  waveId: string;
  waveNumber: number;
  name: string;
  teamIds: string[];
  targetVendorCount: number;
  actualVendorCount: number;
  featureSetVersion: string;
  plannedStartDate: string;
  actualStartDate?: string;
  completedDate?: string;
  status: WaveStatus;
  goNoGoApproved: boolean;
  blockerReason?: string;
}

export interface UseRolloutWaveManagerOptions {
  waves?: RolloutWave[];
  onWaveActivated?: (wave: RolloutWave) => void;
  onWaveBlocked?: (wave: RolloutWave, reason: string) => void;
}

export interface RolloutWaveManagerResult {
  waves: RolloutWave[];
  activeWave: RolloutWave | null;
  nextWave: RolloutWave | null;
  totalVendorsCovered: number;
  progressPct: number;
  activateWave: (waveId: string) => void;
  blockWave: (waveId: string, reason: string) => void;
  approveGoNoGo: (waveId: string) => void;
  completeWave: (waveId: string) => void;
}

/**
 * CV-147 — Gerenciamento de ondas de rollout gradual.
 * Tracks the staged rollout of RADAR across teams in sequential waves.
 * Each wave requires go/no-go approval before activation.
 */
export function useRolloutWaveManager({
  waves: initialWaves = [],
  onWaveActivated,
  onWaveBlocked,
}: UseRolloutWaveManagerOptions = {}): RolloutWaveManagerResult {
  const [waves, setWaves] = useState<RolloutWave[]>(initialWaves);

  const activeWave = waves.find(w => w.status === 'active') ?? null;
  const nextWave =
    waves
      .filter(w => w.status === 'pending')
      .sort((a, b) => a.waveNumber - b.waveNumber)[0] ?? null;

  const totalVendorsCovered = waves
    .filter(w => w.status === 'completed' || w.status === 'active')
    .reduce((s, w) => s + w.actualVendorCount, 0);

  const totalTarget = waves.reduce((s, w) => s + w.targetVendorCount, 0);
  const progressPct = totalTarget > 0 ? totalVendorsCovered / totalTarget : 0;

  const activateWave = useCallback(
    (waveId: string) => {
      setWaves(prev =>
        prev.map(w => {
          if (w.waveId !== waveId) return w;
          const updated: RolloutWave = {
            ...w,
            status: 'active',
            actualStartDate: new Date().toISOString(),
          };
          onWaveActivated?.(updated);
          return updated;
        }),
      );
    },
    [onWaveActivated],
  );

  const blockWave = useCallback(
    (waveId: string, reason: string) => {
      setWaves(prev =>
        prev.map(w => {
          if (w.waveId !== waveId) return w;
          const updated: RolloutWave = { ...w, status: 'blocked', blockerReason: reason };
          onWaveBlocked?.(updated, reason);
          return updated;
        }),
      );
    },
    [onWaveBlocked],
  );

  const approveGoNoGo = useCallback((waveId: string) => {
    setWaves(prev =>
      prev.map(w => (w.waveId === waveId ? { ...w, goNoGoApproved: true } : w)),
    );
  }, []);

  const completeWave = useCallback((waveId: string) => {
    setWaves(prev =>
      prev.map(w =>
        w.waveId === waveId
          ? { ...w, status: 'completed', completedDate: new Date().toISOString() }
          : w,
      ),
    );
  }, []);

  return {
    waves,
    activeWave,
    nextWave,
    totalVendorsCovered,
    progressPct,
    activateWave,
    blockWave,
    approveGoNoGo,
    completeWave,
  };
}
