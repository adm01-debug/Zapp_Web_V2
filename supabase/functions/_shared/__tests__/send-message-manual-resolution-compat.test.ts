// C110 / PD-79: `handleSendMessage` (evento send.message) lê `manually_resolved_at`
// para não sobrescrever a resolução manual do operador. Antes da migration
// 20261111160000 a coluna não existe e o PostgREST devolve 42703: sem o fallback
// as duas consultas falhavam e NENHUMA mensagem pendente era confirmada.
import { handleSendMessage } from "../evolution-webhook-msg-handlers.ts";
import type { EvolutionDbClient } from "../evolution-types.ts";

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message} — esperado ${JSON.stringify(expected)}, recebido ${JSON.stringify(actual)}`);
  }
}

type Row = Record<string, unknown>;

/**
 * Fake do PostgREST com schema configurável. `existing` responde ao dup-check
 * por external_id; `pending` à busca da pendente por contato.
 */
function makeDb(opts: { columnExists: boolean; existing?: Row | null; pending?: Row | null }) {
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
          if (!opts.columnExists && referenced.includes("manually_resolved_at")) {
            return Promise.resolve({ data: null, error: { code: "42703" } }).then(ok, fail);
          }
          updates.push({ patch, filters: [...referenced] });
        }
        return Promise.resolve({ data: null, error: null }).then(ok, fail);
      };
      chain.maybeSingle = async () => {
        if (table === "whatsapp_connections") return { data: { id: "conn-1" }, error: null };
        if (table === "contacts") return { data: { id: "contact-1" }, error: null };
        if (table !== "messages") return { data: null, error: null };
        if (!opts.columnExists && referenced.some((r) => r.includes("manually_resolved_at"))) {
          return { data: null, error: { code: "42703", message: "column messages.manually_resolved_at does not exist" } };
        }
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

Deno.test("pré-DDL: send.message confirma a mensagem PENDENTE (fallback 42703 sem manually_resolved_at)", async () => {
  const { db, updates } = makeDb({ columnExists: false, existing: null, pending: { id: "pending-1" } });
  await handleSendMessage(db, instance(), EVENT, {});
  assertEquals(updates.length, 1, "uma atualização da pendente");
  assertEquals((updates[0].patch as Row).status, "sent", "status sent");
  assertEquals(updates[0].filters.includes("manually_resolved_at"), false, "sem filtro de coluna inexistente");
});

Deno.test("pré-DDL: send.message promove a linha JÁ casada por external_id (fallback 42703 no dup-check)", async () => {
  const { db, updates } = makeDb({ columnExists: false, existing: { id: "msg-1", status: "sending" } });
  await handleSendMessage(db, instance(), EVENT, {});
  assertEquals(updates.length, 1, "uma atualização");
  assertEquals((updates[0].patch as Row).status, "sent", "status sent");
});

Deno.test("pós-DDL: send.message NÃO sobrescreve resolução manual e protege o UPDATE com o predicado", async () => {
  const resolved = makeDb({ columnExists: true, existing: { id: "msg-1", status: "failed", manually_resolved_at: "2026-11-11T00:00:00Z" } });
  await handleSendMessage(resolved.db, instance(), EVENT, {});
  assertEquals(resolved.updates.length, 0, "resolução manual preservada");

  const pending = makeDb({ columnExists: true, existing: null, pending: { id: "pending-1", manually_resolved_at: null } });
  await handleSendMessage(pending.db, instance(), EVENT, {});
  assertEquals(pending.updates.length, 1, "pendente atualizada");
  assertEquals(pending.updates[0].filters.includes("manually_resolved_at"), true, "UPDATE com .is(manually_resolved_at, null)");
});
