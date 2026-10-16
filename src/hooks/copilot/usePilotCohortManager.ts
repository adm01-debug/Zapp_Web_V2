import { useState, useCallback } from 'react';

export interface PilotCohort {
  cohortId: string;
  name: string;
  vendorIds: string[];
  teamId: string;
  startDate: string;
  endDate: string;
  featureFlags: string[];
  status: 'planned' | 'active' | 'paused' | 'completed';
}

export interface UsePilotCohortManagerOptions {
  initialCohorts?: PilotCohort[];
  onCohortActivated?: (cohort: PilotCohort) => void;
  onCohortCompleted?: (cohort: PilotCohort) => void;
}

export interface PilotCohortManagerResult {
  cohorts: PilotCohort[];
  activeCohorts: PilotCohort[];
  getCohortForVendor: (vendorId: string) => PilotCohort | null;
  addCohort: (cohort: PilotCohort) => void;
  updateCohortStatus: (cohortId: string, status: PilotCohort['status']) => void;
  addVendorToCohort: (cohortId: string, vendorId: string) => void;
  removeVendorFromCohort: (cohortId: string, vendorId: string) => void;
  isVendorInPilot: (vendorId: string) => boolean;
}

/**
 * CV-144 — Gerenciamento de coortes do piloto.
 * Manages pilot cohorts: which vendors participate, which features are active,
 * and the cohort lifecycle (planned → active → paused → completed).
 */
export function usePilotCohortManager({
  initialCohorts = [],
  onCohortActivated,
  onCohortCompleted,
}: UsePilotCohortManagerOptions = {}): PilotCohortManagerResult {
  const [cohorts, setCohorts] = useState<PilotCohort[]>(initialCohorts);

  const activeCohorts = cohorts.filter(c => c.status === 'active');

  const getCohortForVendor = useCallback(
    (vendorId: string): PilotCohort | null =>
      cohorts.find(c => c.vendorIds.includes(vendorId) && c.status === 'active') ?? null,
    [cohorts],
  );

  const addCohort = useCallback((cohort: PilotCohort) => {
    setCohorts(prev => [...prev, cohort]);
  }, []);

  const updateCohortStatus = useCallback(
    (cohortId: string, status: PilotCohort['status']) => {
      setCohorts(prev =>
        prev.map(c => {
          if (c.cohortId !== cohortId) return c;
          const updated = { ...c, status };
          if (status === 'active') onCohortActivated?.(updated);
          if (status === 'completed') onCohortCompleted?.(updated);
          return updated;
        }),
      );
    },
    [onCohortActivated, onCohortCompleted],
  );

  const addVendorToCohort = useCallback((cohortId: string, vendorId: string) => {
    setCohorts(prev =>
      prev.map(c =>
        c.cohortId === cohortId && !c.vendorIds.includes(vendorId)
          ? { ...c, vendorIds: [...c.vendorIds, vendorId] }
          : c,
      ),
    );
  }, []);

  const removeVendorFromCohort = useCallback((cohortId: string, vendorId: string) => {
    setCohorts(prev =>
      prev.map(c =>
        c.cohortId === cohortId
          ? { ...c, vendorIds: c.vendorIds.filter(id => id !== vendorId) }
          : c,
      ),
    );
  }, []);

  const isVendorInPilot = useCallback(
    (vendorId: string) =>
      cohorts.some(c => c.vendorIds.includes(vendorId) && c.status === 'active'),
    [cohorts],
  );

  return {
    cohorts,
    activeCohorts,
    getCohortForVendor,
    addCohort,
    updateCohortStatus,
    addVendorToCohort,
    removeVendorFromCohort,
    isVendorInPilot,
  };
}
