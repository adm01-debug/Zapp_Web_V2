import { useSyncExternalStore } from 'react';
import { quarantineStore } from '@/lib/quarantineStore';
import type { QuarantineRecord } from '@/hooks/integrations/useQuarantineMedia';

/**
 * Returns the quarantine record for the given WhatsApp message id, or undefined.
 * Reactive: re-renders when the global quarantine store changes.
 */
export function useQuarantineForMessage(messageId: string | null | undefined): QuarantineRecord | undefined {
  const snap = useSyncExternalStore(
    quarantineStore.subscribe,
    quarantineStore.getSnapshot,
    quarantineStore.getSnapshot,
  );
  if (!messageId) return undefined;
  return snap.get(messageId);
}
