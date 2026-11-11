// C110 / PD-79: `handleSendMessage` (evento send.message) lê `manually_resolved_at`
// para não sobrescrever a resolução manual do operador. Antes da migration
// 20261111160000 a coluna não existe e o PostgREST devolve 42703: sem o fallback
// as duas consultas falhavam e NENHUMA mensagem pendente era confirmada.
import { handleSendMessage } from "../evolution-webhook-msg-handlers.ts";

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
      // deno-lint-ignore no-explicit-any
      const chain: any = {
        select: (cols: string) => { referenced.push(cols); return chain; },
        eq: (col: string) => { if (col === "external_id") byExternalId = true; referenced.push(col); return chain; },
        is: (col: string) => { referenced.push(col); return chain; },
        in: () => chain, gte: () => chain, order: () => chain, limit: () => chain,
        update: (p: unknown) => { isUpdate = true; patch = p; return chain; },
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
          if (isUpdate) {
            if (!opts.columnExists && referenced.includes("manually_resolved_at")) {
              return Promise.resolve({ data: null, error: { code: "42703" } }).then(res, rej);
            }
            updates.push({ patch, filters: [...referenced] });
          }
          return Promise.resolve({ data: null, error: null }).then(res, rej);
        },
        maybeSingle: async () => {
          if (table === "whatsapp_connections") return { data: { id: "conn-1" }, error: null };
          if (table === "contacts") return { data: { id: "contact-1" }, error: null };
          if (table !== "messages") return { data: null, error: null };
          if (!opts.columnExists && referenced.some((r) => r.includes("manually_resolved_at"))) {
            return { data: null, error: { code: "42703", message: "column messages.manually_resolved_at does not exist" } };
          }
          return { data: (byExternalId ? opts.existing : opts.pending) ?? null, error: null };
        },
      };
      return chain;
    },
  };
  return { db, updates };
}

const EVENT = { key: { id: "EXT-1", remoteJid: "5511999999999@s.whatsapp.net", fromMe: true }, message: { conversation: "oi" } };
let seq = 0;
const instance = () => `inst-compat-${++seq}`;

Deno.test("pré-DDL: send.message confirma a mensagem PENDENTE (fallback 42703 sem manually_resolved_at)", async () => {
  const { db, updates } = makeDb({ columnExists: false, existing: null, pending: { id: "pending-1" } });
  // deno-lint-ignore no-explicit-any
  await handleSendMessage(db as any, instance(), EVENT, {});
  assertEquals(updates.length, 1, "uma atualização da pendente");
  assertEquals((updates[0].patch as Row).status, "sent", "status sent");
  assertEquals(updates[0].filters.includes("manually_resolved_at"), false, "sem filtro de coluna inexistente");
});

Deno.test("pré-DDL: send.message promove a linha JÁ casada por external_id (fallback 42703 no dup-check)", async () => {
  const { db, updates } = makeDb({ columnExists: false, existing: { id: "msg-1", status: "sending" } });
  // deno-lint-ignore no-explicit-any
  await handleSendMessage(db as any, instance(), EVENT, {});
  assertEquals(updates.length, 1, "uma atualização");
  assertEquals((updates[0].patch as Row).status, "sent", "status sent");
});

Deno.test("pós-DDL: send.message NÃO sobrescreve resolução manual e protege o UPDATE com o predicado", async () => {
  const resolved = makeDb({ columnExists: true, existing: { id: "msg-1", status: "failed", manually_resolved_at: "2026-11-11T00:00:00Z" } });
  // deno-lint-ignore no-explicit-any
  await handleSendMessage(resolved.db as any, instance(), EVENT, {});
  assertEquals(resolved.updates.length, 0, "resolução manual preservada");

  const pending = makeDb({ columnExists: true, existing: null, pending: { id: "pending-1", manually_resolved_at: null } });
  // deno-lint-ignore no-explicit-any
  await handleSendMessage(pending.db as any, instance(), EVENT, {});
  assertEquals(pending.updates.length, 1, "pendente atualizada");
  assertEquals(pending.updates[0].filters.includes("manually_resolved_at"), true, "UPDATE com .is(manually_resolved_at, null)");
});
