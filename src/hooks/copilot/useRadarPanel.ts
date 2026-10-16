/**
 * CV-051–058 — Estado do painel RADAR flutuante.
 * Gerencia modo de exibição, collapsed, DND, posição e cards recolhíveis.
 * Persiste por vendedor em localStorage.
 */
import { useState, useCallback, useEffect } from 'react';

export type RadarMode = 'mini' | 'normal' | 'focus';

export const RADAR_CARD_IDS = [
  'stage',
  'brinde',
  'suggestions',
  'next_step',
  'alerts',
  'products',
  'decision_maker',
] as const;
export type RadarCardId = (typeof RADAR_CARD_IDS)[number];

interface RadarPanelState {
  mode: RadarMode;
  collapsed: boolean;
  cardOrder: RadarCardId[];
  collapsedCards: RadarCardId[];
  dndConversationId: string | null;
  dndUntil: number | null; // timestamp ms
}

const DEFAULT_STATE: RadarPanelState = {
  mode: 'normal',
  collapsed: false,
  cardOrder: [...RADAR_CARD_IDS],
  collapsedCards: [],
  dndConversationId: null,
  dndUntil: null,
};

function loadState(userId: string): RadarPanelState {
  try {
    const raw = localStorage.getItem(`radar-panel:${userId}`);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(userId: string, state: RadarPanelState) {
  try {
    localStorage.setItem(`radar-panel:${userId}`, JSON.stringify(state));
  } catch {
    // silencioso se localStorage indisponível
  }
}

export interface UseRadarPanelResult {
  mode: RadarMode;
  collapsed: boolean;
  cardOrder: RadarCardId[];
  collapsedCards: RadarCardId[];
  isDnd: boolean;
  setMode: (mode: RadarMode) => void;
  toggleCollapsed: () => void;
  toggleCard: (id: RadarCardId) => void;
  enableDnd: (conversationId?: string) => void;
  clearDnd: () => void;
}

export function useRadarPanel(userId: string | undefined, conversationId?: string): UseRadarPanelResult {
  const [state, setState] = useState<RadarPanelState>(() =>
    userId ? loadState(userId) : DEFAULT_STATE,
  );

  useEffect(() => {
    if (userId) setState(loadState(userId));
  }, [userId]);

  const update = useCallback(
    (patch: Partial<RadarPanelState>) => {
      setState((prev) => {
        const next = { ...prev, ...patch };
        if (userId) saveState(userId, next);
        return next;
      });
    },
    [userId],
  );

  const setMode = useCallback((mode: RadarMode) => update({ mode }), [update]);
  const toggleCollapsed = useCallback(() => update({ collapsed: !state.collapsed }), [update, state.collapsed]);

  const toggleCard = useCallback(
    (id: RadarCardId) => {
      const current = state.collapsedCards;
      const next = current.includes(id) ? current.filter((c) => c !== id) : [...current, id];
      update({ collapsedCards: next });
    },
    [update, state.collapsedCards],
  );

  const enableDnd = useCallback(
    (convId?: string) => {
      if (convId) {
        update({ dndConversationId: convId, dndUntil: null });
      } else {
        update({ dndConversationId: null, dndUntil: Date.now() + 30 * 60 * 1000 });
      }
    },
    [update],
  );

  const clearDnd = useCallback(() => update({ dndConversationId: null, dndUntil: null }), [update]);

  const isDnd =
    (state.dndConversationId !== null && state.dndConversationId === conversationId) ||
    (state.dndUntil !== null && Date.now() < state.dndUntil);

  return {
    mode: state.mode,
    collapsed: state.collapsed,
    cardOrder: state.cardOrder,
    collapsedCards: state.collapsedCards,
    isDnd,
    setMode,
    toggleCollapsed,
    toggleCard,
    enableDnd,
    clearDnd,
  };
}