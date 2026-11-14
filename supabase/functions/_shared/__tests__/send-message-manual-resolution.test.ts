// C110 / PD-79: `handleSendMessage` (evento send.message) não sobrescreve a
// resolução manual do operador — nem pela leitura nem por um recibo que chegue
// entre o SELECT e o UPDATE (o UPDATE leva `.is('manually_resolved_at', null)`).
import { handleSendMessage } from "../evolution-webhook-msg-handlers.ts";
import type { EvolutionDbClient } from "../evolution-types.ts";

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message} — esperado ${JSON.stringify(expected)}, recebido ${JSON.stringify(actual)}`);
  }
}

type Row = Record<string, unknown>;

/**
 * Fake do PostgREST que registra os filtros de cada UPDATE. `existing` responde ao dup-check
 * por external_id; `pending` à busca da pendente por contato.
 */
function makeDb(opts: { existing?: Row | null; pending?: Row | null }) {
  const updates: Array<{ patch: unknown; filters: string[] }> = [];
  const db = {
    from(table: string) {
      const referenced: string[] = [];
      let patch: unknown = null;
      let isUpdate = false;
      let byExternalId = false;
      const chain: Record<string, (...args: unknown[]) => unknown> = {};
      const passa = () => chain;
      chain.select = (cols) => { referenced.push(String(cols)); return chain; };
      chain.eq = (col) => { if (col === "external_id") byExternalId = true; referenced.push(String(col)); return chain; };
      chain.is = (col) => { referenced.push(String(col)); return chain; };
      chain.in = passa; chain.gte = passa; chain.order = passa; chain.limit = passa;
      chain.update = (p) => { isUpdate = true; patch = p; return chain; };
      chain.then = (res, rej) => {
        const ok = res as (v: unknown) => unknown;
        const fail = rej as ((e: unknown) => unknown) | undefined;
        if (isUpdate) {
          updates.push({ patch, filters: [...referenced] });
        }
        return Promise.resolve({ data: null, error: null }).then(ok, fail);
      };
      chain.maybeSingle = async () => {
        if (table === "whatsapp_connections") return { data: { id: "conn-1" }, error: null };
        if (table === "contacts") return { data: { id: "contact-1" }, error: null };
        if (table !== "messages") return { data: null, error: null };
        return { data: (byExternalId ? opts.existing : opts.pending) ?? null, error: null };
      };
      return chain;
    },
  };
  return { db: db as unknown as EvolutionDbClient, updates };
}

const EVENT = { key: { id: "EXT-1", remoteJid: "5511999999999@s.whatsapp.net", fromMe: true }, message: { conversation: "oi" } };
let seq = 0;
const instance = () => `inst-compat-${++seq}`;

Deno.test("send.message NÃO sobrescreve resolução manual e protege os dois UPDATEs com o predicado", async () => {
  const resolved = makeDb({ existing: { id: "msg-1", status: "failed", manually_resolved_at: "2026-11-11T00:00:00Z" } });
  await handleSendMessage(resolved.db, instance(), EVENT, {});
  assertEquals(resolved.updates.length, 0, "resolução manual preservada");

  const pending = makeDb({ existing: null, pending: { id: "pending-1", manually_resolved_at: null } });
  await handleSendMessage(pending.db, instance(), EVENT, {});
  assertEquals(pending.updates.length, 1, "pendente atualizada");
  assertEquals(pending.updates[0].filters.includes("manually_resolved_at"), true, "UPDATE com .is(manually_resolved_at, null)");

  const matched = makeDb({ existing: { id: "msg-1", status: "sending", manually_resolved_at: null } });
  await handleSendMessage(matched.db, instance(), EVENT, {});
  assertEquals(matched.updates.length, 1, "linha casada por external_id atualizada");
  assertEquals(matched.updates[0].filters.includes("manually_resolved_at"), true, "UPDATE do dup-check com o predicado");
});
