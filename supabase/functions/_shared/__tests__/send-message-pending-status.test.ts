// C110 / PD-79: a busca da "pendente" (linha do agente ainda sem external_id) nos
// eventos send.message e FROM_ME só pode casar linha em status 'sending'. Sem o
// filtro, uma linha mais antiga do mesmo contato já 'failed' — ou resolvida à mão,
// que também fica com external_id NULL — ganhava o external_id da mensagem nova
// (ou absorvia o evento), e a linha nova ficava sem confirmação.
import { handleSendMessage } from "../evolution-webhook-msg-handlers.ts";
import { handleOutgoingWhatsAppMessage } from "../evolution-webhook-messages.ts";
import type { EvolutionDbClient } from "../evolution-types.ts";

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message} — esperado ${JSON.stringify(expected)}, recebido ${JSON.stringify(actual)}`);
  }
}

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

/** Fake do PostgREST que AVALIA eq/is/gte/order sobre as linhas de `messages`. */
function makeDb(messages: Row[]) {
  const updates: Array<{ id: unknown; patch: Row }> = [];
  const inserts: Row[] = [];
  const db = {
    from(table: string) {
      const filters: Filter[] = [];
      let orderCol: string | null = null;
      let ascending = true;
      let patch: Row | null = null;
      const chain: Record<string, (...args: unknown[]) => unknown> = {};
      chain.select = () => chain;
      chain.eq = (col, val) => { filters.push((r) => r[col as string] === val); return chain; };
      chain.is = (col, val) => { filters.push((r) => (r[col as string] ?? null) === val); return chain; };
      chain.gte = (col, val) => { filters.push((r) => String(r[col as string]) >= String(val)); return chain; };
      chain.in = () => chain;
      chain.limit = () => chain;
      chain.order = (col, opts) => {
        orderCol = col as string;
        ascending = (opts as { ascending?: boolean } | undefined)?.ascending !== false;
        return chain;
      };
      chain.update = (p) => { patch = p as Row; return chain; };
      chain.upsert = (row) => { inserts.push(row as Row); return Promise.resolve({ data: null, error: null }); };
      const match = () => {
        const rows = messages.filter((r) => filters.every((f) => f(r)));
        if (orderCol) {
          const c = orderCol;
          rows.sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : 1) * (ascending ? 1 : -1));
        }
        return rows;
      };
      chain.then = (res, rej) => {
        if (patch && table === "messages") {
          for (const row of match()) {
            Object.assign(row, patch);
            updates.push({ id: row.id, patch });
          }
        }
        return Promise.resolve({ data: null, error: null }).then(
          res as (v: unknown) => unknown,
          rej as ((e: unknown) => unknown) | undefined,
        );
      };
      chain.maybeSingle = async () => {
        if (table === "whatsapp_connections") return { data: { id: "conn-1" }, error: null };
        if (table === "contacts") return { data: { id: "contact-1", assigned_to: null }, error: null };
        if (table !== "messages") return { data: null, error: null };
        return { data: match()[0] ?? null, error: null };
      };
      return chain;
    },
  };
  return { db: db as unknown as EvolutionDbClient, updates, inserts };
}

const agora = Date.now();
const iso = (msAtras: number) => new Date(agora - msAtras).toISOString();
const base = { contact_id: "contact-1", sender: "agent", message_type: "text", external_id: null };

/** Linha nova (a que de fato saiu) em 'sending' + linha mais antiga do mesmo contato. */
function cenario(antiga: Row): Row[] {
  return [
    { ...base, id: "antiga", created_at: iso(30_000), ...antiga },
    { ...base, id: "nova", created_at: iso(5_000), status: "sending", manually_resolved_at: null },
  ];
}

const VARIANTES: Array<[string, Row]> = [
  ["linha antiga 'failed' (recusa definitiva)", { status: "failed", manually_resolved_at: null }],
  ["linha antiga resolvida à mão (external_id NULL)", { status: "sent", manually_resolved_at: iso(20_000) }],
];

let seq = 0;
const instance = () => `inst-pending-status-${++seq}`;
const KEY = { id: "EXT-NOVA", remoteJid: "5511999999999@s.whatsapp.net", fromMe: true };

for (const [nome, antiga] of VARIANTES) {
  Deno.test(`send.message casa só a pendente em 'sending' — ${nome}`, async () => {
    const rows = cenario(antiga);
    const { db, updates } = makeDb(rows);
    await handleSendMessage(db, instance(), { key: KEY, message: { conversation: "oi" } }, {});
    assertEquals(updates.map((u) => u.id), ["nova"], "só a linha nova recebe o external_id");
    assertEquals(rows[0].external_id, null, "linha antiga intacta");
    assertEquals(rows[1].external_id, "EXT-NOVA", "linha nova confirmada");
  });

  Deno.test(`FROM_ME casa só a pendente em 'sending' — ${nome}`, async () => {
    const rows = cenario(antiga);
    const { db, updates, inserts } = makeDb(rows);
    await handleOutgoingWhatsAppMessage(
      db,
      instance(),
      { key: KEY, message: { conversation: "oi" }, messageTimestamp: Math.floor(agora / 1000) },
      KEY,
    );
    assertEquals(updates.map((u) => u.id), ["nova"], "só a linha nova recebe o external_id");
    assertEquals(inserts.length, 0, "sem linha duplicada");
    assertEquals(rows[0].external_id, null, "linha antiga intacta");
    assertEquals(rows[1].external_id, "EXT-NOVA", "linha nova confirmada");
  });
}
