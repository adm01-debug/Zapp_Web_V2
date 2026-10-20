/**
 * #187 — contrato executável do ESCOPO POR CONEXÃO de messages.edited e reactions.
 *
 * O que fica travado:
 *   1. `handleMessagesEdited` resolve a conexão pela `instance` do evento e o
 *      UPDATE da edição só toca a mensagem daquela conexão — o mesmo
 *      `external_id` em outra conexão não é alterado;
 *   2. `handleReactionEvent` idem: a resolução do alvo (`messages`) é filtrada
 *      por `whatsapp_connection_id`, e o delete/upsert de `message_reactions`
 *      cai na mensagem da conexão do evento (a tabela não tem coluna de
 *      conexão — o escopo vem do `message_id` resolvido);
 *   3. a mensagem B é a MAIS RECENTE de propósito: sem o filtro de conexão o
 *      `order(created_at desc).limit(1)` pegaria B — é isso que o teste prova.
 *
 * O Supabase falso é uma mini-PostgREST em memória: aplica de verdade os
 * filtros eq/in/is/gte + order + limit e o maybeSingle devolve erro com mais
 * de uma linha, como o PostgREST real.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleMessagesEdited } from "../evolution-webhook-msg-handlers.ts";
import { handleReactionEvent, invalidateConnectionCache } from "../evolution-helpers.ts";
import type { EvolutionDbClient } from "../evolution-types.ts";

// Assinatura COM a conexão do evento — o contrato exigido pelo #187. O alias
// compila mesmo antes da correção (função com menos parâmetros é atribuível a
// tipo com mais), então sem a correção o teste roda e falha na asserção:
// o handler antigo interpreta "inst-a" como `data` e não escreve nada.
const edited = handleMessagesEdited as unknown as (
  db: EvolutionDbClient,
  instance: string,
  data: unknown,
  baseData: Record<string, unknown>,
) => Promise<void>;

const reaction = handleReactionEvent as unknown as (
  db: EvolutionDbClient,
  instance: string,
  reactionMessage: Record<string, unknown>,
  actorFromMe: boolean,
) => Promise<void>;

type Row = Record<string, unknown>;
type Filtro = { op: "eq" | "in" | "is" | "gte"; col: string; val: unknown };

/** Mini-PostgREST: executa filtros/ordem/limite contra tabelas em memória. */
function fakeDb(tables: Record<string, Row[]>, filtrosUsados: Filtro[] = []) {
  function query(table: string) {
    const filters: Filtro[] = [];
    let mode: "select" | "update" | "delete" | "upsert" = "select";
    let payload: Row | Row[] | null = null;
    let onConflict = "";
    let ignoreDuplicates = false;
    let orderCol: string | null = null;
    let orderAsc = true;
    let lim: number | null = null;

    const matched = (): Row[] => {
      let rows = (tables[table] ?? []).filter((r) =>
        filters.every((f) => {
          if (f.op === "eq") return r[f.col] === f.val;
          if (f.op === "in") return Array.isArray(f.val) && f.val.includes(r[f.col]);
          if (f.op === "is") return f.val === null ? r[f.col] == null : r[f.col] === f.val;
          return String(r[f.col] ?? "") >= String(f.val); // gte
        })
      );
      if (orderCol) {
        const col = orderCol;
        rows = [...rows].sort((a, b) => {
          const cmp = String(a[col] ?? "").localeCompare(String(b[col] ?? ""));
          return orderAsc ? cmp : -cmp;
        });
      }
      if (lim !== null) rows = rows.slice(0, lim);
      return rows;
    };

    const execute = () => {
      const rows = matched();
      if (mode === "update") {
        for (const r of rows) Object.assign(r, payload);
        return { data: rows, error: null };
      }
      if (mode === "delete") {
        const alvo = new Set(rows);
        tables[table] = (tables[table] ?? []).filter((r) => !alvo.has(r));
        return { data: null, error: null };
      }
      if (mode === "upsert") {
        for (const item of Array.isArray(payload) ? payload : [payload]) {
          const cols = onConflict.split(",").map((c) => c.trim()).filter(Boolean);
          const existente = cols.length
            ? (tables[table] ?? []).find((r) => cols.every((c) => r[c] === (item as Row)[c]))
            : undefined;
          if (existente) {
            if (!ignoreDuplicates) Object.assign(existente, item);
          } else {
            (tables[table] ??= []).push({ id: `rx-${crypto.randomUUID()}`, ...(item as Row) });
          }
        }
        return { data: null, error: null };
      }
      return { data: rows, error: null };
    };

    const chain: Record<string, unknown> = {
      select: () => chain,
      update: (p: Row) => { mode = "update"; payload = p; return chain; },
      delete: () => { mode = "delete"; return chain; },
      upsert: (p: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) => {
        mode = "upsert"; payload = p;
        onConflict = opts.onConflict ?? ""; ignoreDuplicates = opts.ignoreDuplicates ?? false;
        return chain;
      },
      eq: (col: string, val: unknown) => { filters.push({ op: "eq", col, val }); filtrosUsados.push({ op: "eq", col, val }); return chain; },
      in: (col: string, val: unknown) => { filters.push({ op: "in", col, val }); return chain; },
      is: (col: string, val: unknown) => { filters.push({ op: "is", col, val }); return chain; },
      gte: (col: string, val: unknown) => { filters.push({ op: "gte", col, val }); return chain; },
      order: (col: string, opts: { ascending?: boolean } = {}) => { orderCol = col; orderAsc = opts.ascending ?? true; return chain; },
      limit: (n: number) => { lim = n; return chain; },
      maybeSingle: async () => {
        const { data } = execute();
        const rows = Array.isArray(data) ? data : [];
        if (rows.length > 1) return { data: null, error: { code: "PGRST116", message: "more than one row" } };
        return { data: rows[0] ?? null, error: null };
      },
      then: (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve(execute()).then(onFulfilled, onRejected),
    };
    chain.single = chain.maybeSingle;
    return chain;
  }

  return { from: (t: string) => query(t) } as unknown as EvolutionDbClient;
}

/** Duas conexões com o MESMO external_id; a mensagem de B é a mais recente. */
function cenario() {
  const tables: Record<string, Row[]> = {
    whatsapp_connections: [
      { id: "conn-a", instance_id: "inst-a" },
      { id: "conn-b", instance_id: "inst-b" },
    ],
    messages: [
      {
        id: "msg-b", external_id: "EXT-SHARED", whatsapp_connection_id: "conn-b",
        contact_id: "ctt-b", sender: "contact", content: "original-B",
        is_edited: false, created_at: "2026-10-06T12:00:00.000Z",
      },
      {
        id: "msg-a", external_id: "EXT-SHARED", whatsapp_connection_id: "conn-a",
        contact_id: "ctt-a", sender: "contact", content: "original-A",
        is_edited: false, created_at: "2026-10-06T11:00:00.000Z",
      },
    ],
    message_reactions: [],
  };
  const filtros: Filtro[] = [];
  return { tables, filtros, db: fakeDb(tables, filtros) };
}

const msgA = (t: Record<string, Row[]>) => t.messages.find((m) => m.id === "msg-a")!;
const msgB = (t: Record<string, Row[]>) => t.messages.find((m) => m.id === "msg-b")!;

Deno.test("#187: messages.edited da conexão A altera a mensagem de A e não a de B", async () => {
  invalidateConnectionCache();
  const { tables, filtros, db } = cenario();

  await edited(db, "inst-a", {
    messages: [{ key: { id: "EXT-SHARED" }, message: { conversation: "editado pela A" } }],
  }, {});

  assertEquals(msgA(tables).content, "editado pela A", "a edição deve gravar na mensagem da conexão do evento");
  assertEquals(msgA(tables).is_edited, true);
  assertEquals(msgB(tables).content, "original-B", "a mensagem homônima da conexão B não pode ser tocada");
  assertEquals(msgB(tables).is_edited, false);
  assertEquals(
    filtros.some((f) => f.op === "eq" && f.col === "whatsapp_connection_id" && f.val === "conn-a"),
    true,
    "a resolução do alvo deve filtrar whatsapp_connection_id da conexão do evento",
  );
});

Deno.test("#187: reaction da conexão A cai na mensagem de A, não na de B", async () => {
  invalidateConnectionCache();
  const { tables, filtros, db } = cenario();

  await reaction(db, "inst-a", {
    text: "👍",
    key: { id: "EXT-SHARED", remoteJid: "5511000000000@s.whatsapp.net", fromMe: false },
  }, false);

  assertEquals(tables.message_reactions.length, 1, "uma reação deve ser gravada");
  const rx = tables.message_reactions[0];
  assertEquals(rx.message_id, "msg-a", "a reação deve referenciar a mensagem da conexão A");
  assertEquals(rx.contact_id, "ctt-a");
  assertEquals(rx.emoji, "👍");
  assertEquals(
    tables.message_reactions.some((r) => r.message_id === "msg-b"),
    false,
    "nenhuma reação pode cair na mensagem da conexão B",
  );
  assertEquals(
    filtros.some((f) => f.op === "eq" && f.col === "whatsapp_connection_id" && f.val === "conn-a"),
    true,
    "a resolução do alvo da reação deve filtrar whatsapp_connection_id",
  );
});

Deno.test("#187: remoção de reação da conexão A apaga só a reação da mensagem de A", async () => {
  invalidateConnectionCache();
  const { tables, db } = cenario();
  tables.message_reactions.push(
    { id: "rx-a", message_id: "msg-a", contact_id: "ctt-a", emoji: "👍" },
    { id: "rx-b", message_id: "msg-b", contact_id: "ctt-b", emoji: "👍" },
  );

  await reaction(db, "inst-a", {
    text: "",
    key: { id: "EXT-SHARED", remoteJid: "5511000000000@s.whatsapp.net", fromMe: false },
  }, false);

  assertEquals(
    tables.message_reactions.map((r) => r.id),
    ["rx-b"],
    "a remoção deve apagar a reação da mensagem de A e preservar a de B",
  );
});
