import { useState, useCallback, useEffect } from 'react';

const PREFIX = 'team-chat-draft:';

export function useTeamDraft(conversationId: string | null) {
  const storageKey = conversationId ? `${PREFIX}${conversationId}` : null;

  const [draft, setDraftState] = useState<string>(() => {
    if (!storageKey) return '';
    try {
      return localStorage.getItem(storageKey) ?? '';
    } catch {
      return '';
    }
  });

  // Re-read when conversationId changes
  useEffect(() => {
    if (!storageKey) { setDraftState(''); return; }
    try {
      setDraftState(localStorage.getItem(storageKey) ?? '');
    } catch {
      setDraftState('');
    }
  }, [storageKey]);

  const setDraft = useCallback(
    (value: string) => {
      setDraftState(value);
      if (!storageKey) return;
      try {
        if (value) {
          localStorage.setItem(storageKey, value);
        } else {
          localStorage.removeItem(storageKey);
        }
      } catch {
        // localStorage indisponível (modo privado, espaço cheio)
      }
    },
    [storageKey],
  );

  const clearDraft = useCallback(() => { setDraft(''); }, [setDraft]);

  return { draft, setDraft, clearDraft };
}
