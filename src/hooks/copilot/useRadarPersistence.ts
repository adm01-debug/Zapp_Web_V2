/**
 * CV-149–150: useRadarPersistence — persists RADAR panel state across reloads.
 * Uses localStorage key `radar-state-{conversationId}`.
 */
import { useState, useCallback } from 'react';

export interface RadarPersistentState {
  panelMode: 'mini' | 'normal' | 'focus';
  isOpen: boolean;
  collapsedCards: string[];
  ghostTextEnabled: boolean;
}

const DEFAULT_STATE: RadarPersistentState = {
  panelMode: 'normal',
  isOpen: false,
  collapsedCards: [],
  ghostTextEnabled: true,
};

function readStorage(key: string): RadarPersistentState {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return DEFAULT_STATE;
  }
}

function writeStorage(key: string, state: RadarPersistentState): void {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Private mode or storage full — ignore silently
  }
}

export interface UseRadarPersistenceReturn {
  state: RadarPersistentState;
  update: (partial: Partial<RadarPersistentState>) => void;
}

export function useRadarPersistence(conversationId: string): UseRadarPersistenceReturn {
  const storageKey = `radar-state-${conversationId}`;

  const [state, setState] = useState<RadarPersistentState>(() => readStorage(storageKey));

  const update = useCallback(
    (partial: Partial<RadarPersistentState>) => {
      setState((prev) => {
        const next = { ...prev, ...partial };
        writeStorage(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  return { state, update };
}
