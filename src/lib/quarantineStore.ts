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
  /**
   * Reconcilia o cache contra a janela autoritativa do poll do monitor:
   * `records` traz os estados ATIVOS (`pending`/`deleted`) e `releases` as
   * liberações (`allowed`/`whitelisted`) observadas para ids já cacheados.
   * Diferente de `upsertMany`, que só acrescenta/atualiza o que chega, aqui o
   * resultado é tratado como retrato do estado atual:
   *
   *  - todo registro devolvido (ativo ou liberação) é gravado por message_id,
   *    com a decisão e a versão (`reviewed_at`) atuais — é o que faz uma
   *    liberação (`pending`→`allowed`/`whitelisted`) sobrescrever a decisão
   *    antiga;
   *  - quando a janela de ativos NÃO foi truncada (`truncated: false`), um
   *    registro do cache que não voltou nem como ativo nem como liberação foi
   *    removido na origem e é descartado;
   *  - quando a janela FOI truncada pelo limite de linhas, a ausência é
   *    ambígua (o registro pode só ter saído da janela), então NADA é removido
   *    apenas por ausência — nunca inferimos liberação desse jeito.
   */
  reconcile(
    records: QuarantineRecord[],
    releases: QuarantineRecord[],
    opts: { truncated: boolean },
  ) {
    const seen = new Set<string>();
    let changed = false;
    for (const r of [...records, ...releases]) {
      if (!r.message_id) continue;
      seen.add(r.message_id);
      const prev = byMessageId.get(r.message_id);
      if (
        !prev ||
        prev.id !== r.id ||
        prev.decision !== r.decision ||
        prev.reviewed_at !== r.reviewed_at
      ) {
        byMessageId.set(r.message_id, r);
        changed = true;
      }
    }
    if (!opts.truncated) {
      for (const messageId of [...byMessageId.keys()]) {
        if (!seen.has(messageId)) {
          byMessageId.delete(messageId);
          changed = true;
        }
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
