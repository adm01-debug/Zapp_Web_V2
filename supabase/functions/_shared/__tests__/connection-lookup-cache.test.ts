/**
 * #188 / R2-API-004 — lookup de conexão: ERRO não é AUSÊNCIA CONFIRMADA.
 *
 * O defeito auditado (probe P03): `getConnectionByInstance` ignorava `error` e
 * gravava `data = null` no cache por 5 min. Como `handleSendMessage`,
 * `handleMessagesUpdate` e `handleMessagesDelete` só aplicavam
 * `eq(whatsapp_connection_id)` quando a conexão existia, uma falha transitória
 * de banco derrubava o isolamento do tenant: o delete/update saía GLOBAL por
 * external_id, e o `null` continuava em cache na chamada seguinte.
 *
 * O que este arquivo trava:
 *   T1: erro de consulta LANÇA (connection_lookup_failed) — não devolve null;
 *   T2: erro NÃO entra no cache — a chamada seguinte refaz a consulta;
 *   T3: ausência confirmada (data:null, error:null) É cacheada — é o que
 *       diferencia "não existe" de "falhou";
 *   T4/T5/T6: sem conexão válida, delete/update/send fazem ZERO mutação em
 *       messages (nem com filtro de conexão, nem sem — P03);
 *   T7: regressão — com conexão, os três handlers mutam de novo e a query que
 *       escopa a operação carrega `whatsapp_connection_id`.
 *
 * O cache é module-level: cada teste usa instância distinta e chama
 * invalidateConnectionCache() antes.
 */
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getConnectionByInstance, invalidateConnectionCache } from "../evolution-helpers.ts";
import {
  handleMessagesDelete,
  handleMessagesUpdate,
  handleSendMessage,
} from "../evolution-webhook-msg-handlers.ts";
import type { EvolutionDbClient, EvolutionQueryResult } from "../evolution-types.ts";

type Op = { metodo: string; args: unknown[] };
type Query = { tabela: string; ops: Op[] };

interface DbFalso {
  client: EvolutionDbClient;
  queries: Query[];
  rpcChamadas: { nome: string; args: Record<string, unknown> }[];
}

const MUTACOES = new Set(["update", "insert", "upsert", "delete"]);

/**
 * Client falso chainable no molde de talkx-webhook-receipts.test.ts, com duas
 * extensões: cada `from()` abre um ctx novo que REGISTRA os métodos chamados
 * (para contar consultas e mutações por tabela) e `conexao` aceita uma
 * SEQUÊNCIA de resultados (para simular o banco caindo e voltando).
 * O chain é thenable: `await from('messages').update(...).eq(...).select('id')`
 * resolve `mensagens.lista` (PostgREST devolve {data:[...]} nesse ponto).
 */
function fakeDb(opts: {
  conexao: EvolutionQueryResult[];
  mensagens?: { maybeSingle?: EvolutionQueryResult; lista?: EvolutionQueryResult };
  rpcRetorno?: Record<string, unknown>;
}): DbFalso {
  const queries: Query[] = [];
  const rpcChamadas: { nome: string; args: Record<string, unknown> }[] = [];
  let proximaConexao = 0;
  const resultadoConexao = () =>
    opts.conexao[Math.min(proximaConexao++, opts.conexao.length - 1)];

  const metodos = [
    "select", "eq", "in", "is", "not", "gte", "order", "limit",
    "update", "insert", "upsert", "delete", "neq", "lte", "match", "filter", "like",
  ];

  const client = {
    from(tabela: string) {
      const ctx: Query = { tabela, ops: [] };
      queries.push(ctx);
      const chain: Record<string, unknown> = {};
      for (const m of metodos) {
        chain[m] = (...args: unknown[]) => {
          ctx.ops.push({ metodo: m, args });
          return chain;
        };
      }
      chain.maybeSingle = async () => {
        ctx.ops.push({ metodo: "maybeSingle", args: [] });
        if (tabela === "whatsapp_connections") return resultadoConexao();
        if (tabela === "messages") return opts.mensagens?.maybeSingle ?? { data: null, error: null };
        return { data: null, error: null };
      };
      chain.single = chain.maybeSingle;
      chain.then = (
        resolve: (v: unknown) => unknown,
        reject: (e: unknown) => unknown,
      ) =>
        Promise.resolve(
          tabela === "messages"
            ? (opts.mensagens?.lista ?? { data: [], error: null })
            : { data: null, error: null },
        ).then(resolve, reject);
      return chain;
    },
    async rpc(nome: string, args: Record<string, unknown>) {
      rpcChamadas.push({ nome, args });
      return { data: opts.rpcRetorno?.[nome] ?? false, error: null };
    },
  } as unknown as EvolutionDbClient;

  return { client, queries, rpcChamadas };
}

/** Quantas queries foram abertas em whatsapp_connections (1 por lookup real). */
const consultasConexao = (db: DbFalso) =>
  db.queries.filter((q) => q.tabela === "whatsapp_connections").length;

/** Queries da tabela que contêm ao menos uma mutação (update/insert/upsert/delete). */
const mutacoes = (db: DbFalso, tabela: string) =>
  db.queries.filter((q) => q.tabela === tabela && q.ops.some((op) => MUTACOES.has(op.metodo)));

/** Queries da tabela que filtraram por whatsapp_connection_id = connId. */
const queriesComFiltroConexao = (db: DbFalso, tabela: string, connId: string) =>
  db.queries.filter((q) =>
    q.tabela === tabela &&
    q.ops.some((op) => op.metodo === "eq" && op.args[0] === "whatsapp_connection_id" && op.args[1] === connId)
  );

// ── Lookup: erro ≠ ausência ──────────────────────────────────────────────────

Deno.test("T1: erro no lookup LANÇA connection_lookup_failed (não devolve null)", async () => {
  invalidateConnectionCache();
  const db = fakeDb({ conexao: [{ data: null, error: { message: "db indisponível" } }] });

  const erro = await assertRejects(
    () => getConnectionByInstance(db.client, "inst-t1"),
    Error,
    "connection_lookup_failed",
  );
  assertEquals(erro.name, "ConnectionLookupError");
});

Deno.test("T2: erro NÃO entra no cache — a chamada seguinte refaz a consulta", async () => {
  invalidateConnectionCache();
  const db = fakeDb({
    conexao: [
      { data: null, error: { message: "db indisponível" } },
      { data: { id: "conn-1" }, error: null },
    ],
  });

  await assertRejects(
    () => getConnectionByInstance(db.client, "inst-t2"),
    Error,
    "connection_lookup_failed",
  );
  const conn = await getConnectionByInstance(db.client, "inst-t2");

  assertEquals(conn, { id: "conn-1" });
  assertEquals(
    consultasConexao(db),
    2,
    "o erro não pode ser servido do cache: a 2ª chamada precisa ir ao banco",
  );
});

Deno.test("T3: ausência confirmada (data:null, error:null) É cacheada por 5min", async () => {
  invalidateConnectionCache();
  const db = fakeDb({ conexao: [{ data: null, error: null }] });

  assertEquals(await getConnectionByInstance(db.client, "inst-t3"), null);
  assertEquals(await getConnectionByInstance(db.client, "inst-t3"), null);
  assertEquals(
    consultasConexao(db),
    1,
    "ausência confirmada é cacheável — a 2ª chamada sai do cache, sem nova consulta",
  );
});

// ── Handlers: sem conexão válida, nenhuma mutação global ────────────────────

Deno.test("T4: messages.delete sem conexão faz ZERO mutação em messages (probe P03)", async () => {
  invalidateConnectionCache();
  const db = fakeDb({
    conexao: [{ data: null, error: null }],
    mensagens: { lista: { data: [], error: null } },
  });

  await handleMessagesDelete(db.client, "inst-t4", { keys: [{ id: "3EB0DEL04" }] }, {});

  assertEquals(
    mutacoes(db, "messages").length,
    0,
    "sem conexão válida nenhum update/upsert pode sair em messages — nem com filtro, nem sem",
  );
});

Deno.test("T5: messages.update sem conexão faz ZERO mutação em messages", async () => {
  invalidateConnectionCache();
  const db = fakeDb({
    conexao: [{ data: null, error: null }],
    // linha que CASA com o recibo: se o handler seguir adiante, o update sai
    mensagens: { maybeSingle: { data: { id: "msg-t5", status: "sent" }, error: null } },
  });

  await handleMessagesUpdate(
    db.client,
    "inst-t5",
    { updates: [{ key: { id: "3EB0UPD05", fromMe: true }, status: "DELIVERY_ACK" }] },
    {},
  );

  assertEquals(mutacoes(db, "messages").length, 0, "sem conexão válida o recibo não pode mutar messages");
});

Deno.test("T6: send.message sem conexão faz ZERO mutação em messages", async () => {
  invalidateConnectionCache();
  const db = fakeDb({
    conexao: [{ data: null, error: null }],
    // stub pendente que CASA com o eco: se o handler seguir adiante, o update sai
    mensagens: { maybeSingle: { data: { id: "msg-t6", status: "sending" }, error: null } },
  });

  await handleSendMessage(
    db.client,
    "inst-t6",
    { key: { id: "3EB0SEND06", fromMe: true, remoteJid: "5511999990000@s.whatsapp.net" } },
    {},
  );

  assertEquals(mutacoes(db, "messages").length, 0, "sem conexão válida o eco de envio não pode mutar messages");
});

// ── Regressão: com conexão, muta de novo e com o filtro de isolamento ───────

Deno.test("T7a: send.message com conexão confirma a mensagem escopada por whatsapp_connection_id", async () => {
  invalidateConnectionCache();
  const db = fakeDb({
    conexao: [{ data: { id: "conn-1" }, error: null }],
    mensagens: { maybeSingle: { data: { id: "msg-t7s", status: "sending" }, error: null } },
  });

  await handleSendMessage(
    db.client,
    "inst-t7s",
    { key: { id: "3EB0SEND07", fromMe: true, remoteJid: "5511999990001@s.whatsapp.net" } },
    {},
  );

  assertEquals(mutacoes(db, "messages").length, 1, "com conexão o eco do envio confirma a mensagem local");
  assert(
    queriesComFiltroConexao(db, "messages", "conn-1").length >= 1,
    "o dup-check que escopa a mutação precisa filtrar whatsapp_connection_id",
  );
});

Deno.test("T7b: messages.update com conexão aplica o recibo escopado por whatsapp_connection_id", async () => {
  invalidateConnectionCache();
  const db = fakeDb({
    conexao: [{ data: { id: "conn-1" }, error: null }],
    mensagens: { maybeSingle: { data: { id: "msg-t7u", status: "sent" }, error: null } },
    rpcRetorno: { record_talkx_recipient_receipt: true },
  });

  await handleMessagesUpdate(
    db.client,
    "inst-t7u",
    { updates: [{ key: { id: "3EB0UPD07", fromMe: true }, status: "DELIVERY_ACK" }] },
    {},
  );

  assertEquals(mutacoes(db, "messages").length, 1, "com conexão o recibo atualiza o status da mensagem");
  assert(
    queriesComFiltroConexao(db, "messages", "conn-1").length >= 1,
    "a query que localiza a mensagem precisa filtrar whatsapp_connection_id",
  );
  const recibos = db.rpcChamadas.filter((c) => c.nome === "record_talkx_recipient_receipt");
  assertEquals(recibos.length, 1);
  assertEquals(recibos[0].args.p_connection_id, "conn-1");
});

Deno.test("T7c: messages.delete com conexão muta E o update carrega whatsapp_connection_id", async () => {
  invalidateConnectionCache();
  const db = fakeDb({
    conexao: [{ data: { id: "conn-1" }, error: null }],
    // update().eq(...).select('id') devolve a linha afetada → sem tombstone
    mensagens: { lista: { data: [{ id: "msg-t7d" }], error: null } },
  });

  await handleMessagesDelete(db.client, "inst-t7d", { keys: [{ id: "3EB0DEL07" }] }, {});

  const muts = mutacoes(db, "messages");
  assertEquals(muts.length, 1, "com conexão o delete marca a mensagem");
  const mutacaoEscopada = muts.some((q) =>
    q.ops.some((op) => op.metodo === "eq" && op.args[0] === "whatsapp_connection_id" && op.args[1] === "conn-1")
  );
  assert(
    mutacaoEscopada,
    "a própria query de mutação precisa carregar o filtro whatsapp_connection_id (não pode sair global)",
  );
});
