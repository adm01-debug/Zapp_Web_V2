import { useState, useCallback } from 'react';

export interface UseLGPDRetentionOptions {
  contactId: string | null;
}

export interface LGPDRetentionState {
  isDeleting: boolean;
  isDeleted: boolean;
  error: string | null;
}

/**
 * CV-115 — Base legal e retenção (LGPD).
 * Exposes a deletion request for all RADAR data tied to a contact
 * (copilot_sessions, copilot_insights, copilot_feedback rows).
 * Called when a contact exercises their right to erasure (Art. 18, LGPD).
 */
export function useLGPDRetention({ contactId }: UseLGPDRetentionOptions) {
  const [state, setState] = useState<LGPDRetentionState>({
    isDeleting: false,
    isDeleted: false,
    error: null,
  });

  const requestDeletion = useCallback(async () => {
    if (!contactId) return;
    setState(s => ({ ...s, isDeleting: true, error: null }));
    try {
      const res = await fetch('/api/lgpd-delete-radar-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId }),
      });
      if (!res.ok) throw new Error(`lgpd-delete: ${res.status}`);
      setState({ isDeleting: false, isDeleted: true, error: null });
    } catch (err) {
      setState(s => ({ ...s, isDeleting: false, error: (err as Error).message }));
    }
  }, [contactId]);

  return { ...state, requestDeletion };
}
