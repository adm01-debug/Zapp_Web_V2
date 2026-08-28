/**
 * Global in-memory store for ClamAV media quarantine records.
 *
 * Allows any message bubble across the app to render a 🛡️ shield badge
 * when its `message_id` is found in the external `media_quarantine` table
 * (Zap Webb VPS) — without each bubble performing its own network round-trip.
 *
 * Hydrated by the `QuarantineMonitorProvider` (and refreshed by the admin
 * QuarantinePanel) via the `external-db-proxy` edge function.
 */
import type { QuarantineRecord } from '@/hooks/integrations/useQuarantineMedia';

type Listener = () => void;

const byMessageId = new Map<string, QuarantineRecord>();
const listeners = new Set<Listener>();
let snapshot: ReadonlyMap<string, QuarantineRecord> = byMessageId;

function refreshSnapshot() {
  // Replace reference so useSyncExternalStore consumers re-render.
  snapshot = new Map(byMessageId);
  listeners.forEach((l) => l());
}

export const quarantineStore = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): ReadonlyMap<string, QuarantineRecord> {
    return snapshot;
  },
  get(messageId: string | null | undefined): QuarantineRecord | undefined {
    if (!messageId) return undefined;
    return snapshot.get(messageId);
  },
  upsertMany(records: QuarantineRecord[]) {
    let changed = false;
    for (const r of records) {
      if (!r.message_id) continue;
      const prev = byMessageId.get(r.message_id);
      if (!prev || prev.decision !== r.decision || prev.id !== r.id) {
        byMessageId.set(r.message_id, r);
        changed = true;
      }
    }
    if (changed) refreshSnapshot();
  },
  remove(messageId: string) {
    if (byMessageId.delete(messageId)) refreshSnapshot();
  },
  /** Replace all records whose decision matches `decision` (used when a panel
   *  finishes a full reload of one filter bucket). */
  replaceForDecision(decision: string, records: QuarantineRecord[]) {
    let changed = false;
    for (const [mid, rec] of byMessageId) {
      if (rec.decision === decision) {
        byMessageId.delete(mid);
        changed = true;
      }
    }
    for (const r of records) {
      if (!r.message_id) continue;
      byMessageId.set(r.message_id, r);
      changed = true;
    }
    if (changed) refreshSnapshot();
  },
  clear() {
    if (byMessageId.size === 0) return;
    byMessageId.clear();
    refreshSnapshot();
  },
};
