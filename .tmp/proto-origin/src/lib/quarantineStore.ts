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

/**
 * Chave de versão de um registro: o instante em que a decisão ATUAL passou a
 * valer. `reviewed_at` é gravado junto com toda decisão tomada (é o que o
 * painel/update do proxy escreve) e `created_at` é o nascimento da linha,
 * usado enquanto não houve decisão (`pending`). O `id` fecha o desempate.
 *
 * O coalesce (`reviewed_at ?? created_at`) é o que impede uma liberação ANTIGA
 * de vencer uma re-quarentena NOVA do mesmo `message_id`: a linha nova ainda
 * não teve decisão, e uma chave que juntasse os dois campos deixaria o prefixo
 * dela vazio — menor que qualquer data.
 */
function versionKey(record: QuarantineRecord): string {
  return `${record.reviewed_at ?? record.created_at ?? ''}|${record.id ?? ''}`;
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
   * Reconcilia o cache contra o retrato devolvido pelo monitor: `active` são as
   * linhas da janela de ativos (`pending`/`deleted`) e `released` as liberações
   * (`allowed`/`whitelisted`) dos ids já cacheados.
   *
   *  - por `message_id` vale a linha de MAIOR versão entre as duas listas: a
   *    liberação observada por valor substitui a decisão antiga, e uma
   *    re-quarentena mais nova sobrevive a uma liberação antiga;
   *  - quando a janela de ativos NÃO foi truncada (`truncated: false`), registro
   *    do cache que não voltou em nenhuma das listas foi removido na origem e
   *    sai do cache; truncada, a ausência é ambígua e nada é removido por ela.
   */
  reconcile(active: QuarantineRecord[], released: QuarantineRecord[], opts: { truncated: boolean }) {
    const seen = new Set<string>();
    const winners = new Map<string, QuarantineRecord>();
    for (const record of [...active, ...released]) {
      if (!record.message_id) continue;
      seen.add(record.message_id);
      const current = winners.get(record.message_id);
      if (!current || versionKey(record) > versionKey(current)) {
        winners.set(record.message_id, record);
      }
    }

    let changed = false;
    for (const [messageId, record] of winners) {
      const previous = byMessageId.get(messageId);
      if (!previous || versionKey(record) > versionKey(previous)) {
        byMessageId.set(messageId, record);
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
