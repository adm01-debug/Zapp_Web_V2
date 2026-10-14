// t_97dde6f3 — escopo Entrada+Enviados e incremental que acompanha o que foi
// feito no Gmail (exclusão e mudança de rótulo), nos DOIS caminhos de sync:
//   - gmail-sync      → `runGmailIncrementalSync` (chamada manual/sob demanda)
//   - gmail-cron-sync → `runGmailCronIncrementalSync` (cron de 5 min)
// Prova também o teto de páginas por rodada com o cursor persistido, que é o
// que respeita o limite de tempo da Edge numa caixa grande.
import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { GMAIL_HISTORY_MAX_PAGES_PER_RUN, GMAIL_SYNC_SCOPE_QUERY, runGmailFullSync } from "../gmail-helpers.ts";
import { runGmailIncrementalSync } from "../../gmail-sync/index.ts";
import { runGmailCronIncrementalSync } from "../../gmail-cron-sync/index.ts";
import { Logger } from "../validation.ts";

const EMAIL = "conta@exemplo.com";

type Chamada = { tabela: string; ops: Array<[string, unknown[]]> };
type Cenario = { archivedMessageId?: string; archivedThreadId?: string; cursorRows?: number };

function fakeSupabase(chamadas: Chamada[], cenario: Cenario = {}) {
  return {
    from(tabela: string) {
      const chamada: Chamada = { tabela, ops: [] };
      chamadas.push(chamada);
      const builder: Record<string, unknown> = {};
      for (const op of ["select", "eq", "in", "upsert", "update", "delete", "ilike", "single", "maybeSingle", "order"]) {
        builder[op] = (...args: unknown[]) => { chamada.ops.push([op, args]); return builder; };
      }
      builder.then = (resolve: (v: unknown) => unknown) => {
        const nomes = chamada.ops.map(([op]) => op);
        const payload = (op: string) => chamada.ops.find(([nome]) => nome === op)?.[1][0] as Record<string, unknown>;
        const filtroIn = () => chamada.ops.find(([nome]) => nome === "in")?.[1][1] as string[];
        let data: unknown = null;
        if (tabela === "gmail_accounts") {
          if (nomes.includes("single")) data = { email_address: EMAIL };
          else if (nomes.includes("update") && nomes.includes("select")) data = Array.from({ length: cenario.cursorRows ?? 1 }, (_v, i) => ({ id: `conta-${i}` }));
        } else if (tabela === "email_threads" && nomes.includes("upsert")) {
          data = { id: "thread-uuid-1", contact_id: "c1" };
        } else if (tabela === "email_messages" && nomes.includes("upsert")) {
          data = { id: `msg-${payload("upsert").gmail_message_id}` };
        } else if (tabela === "email_messages" && nomes.includes("in") && !nomes.includes("order")) {
          // resolução local das mensagens que sumiram no Gmail (pelos ids do Gmail)
          data = cenario.archivedMessageId
            ? [{ id: cenario.archivedMessageId, thread_id: cenario.archivedThreadId, gmail_message_id: filtroIn()[0] }]
            : [];
        } else if (tabela === "email_messages" && nomes.includes("order")) {
          // reconcileEmailThreads
          data = [{ from_name: "Cliente", from_address: "cliente@exemplo.com", subject: "Assunto", snippet: "oi", internal_date: "2023-11-14T22:13:20.000Z", label_ids: ["SENT"], is_read: true, is_starred: false }];
        }
        return Promise.resolve(resolve({ data, error: null, count: 1 }));
      };
      return builder;
    },
  };
}

function mensagemFake(id: string, labelIds: string[] = ["INBOX"]) {
  return {
    id, threadId: `T-${id}`, labelIds, snippet: "oi", historyId: "1", internalDate: "1700000000000",
    payload: { mimeType: "text/plain", headers: [{ name: "From", value: "Cliente <cliente@exemplo.com>" }], body: { data: "b2k", size: 2 } },
  };
}

type Rota = (url: string, n: number) => { status?: number; body: unknown };

function comFetchFake(rota: Rota) {
  const fetchOriginal = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    const resposta = rota(url, urls.length);
    return Promise.resolve(new Response(JSON.stringify(resposta.body), { status: resposta.status ?? 200 }));
  }) as typeof fetch;
  return { urls, restore: () => { globalThis.fetch = fetchOriginal; } };
}

const supabaseArg = (chamadas: Chamada[], cenario: Cenario = {}) =>
  fakeSupabase(chamadas, cenario) as unknown as Parameters<typeof runGmailIncrementalSync>[0];

function upsertsDe(chamadas: Chamada[]): Array<Record<string, unknown>> {
  return chamadas
    .filter(c => c.tabela === "email_messages")
    .flatMap(c => c.ops.filter(([op]) => op === "upsert").map(([, args]) => args[0] as Record<string, unknown>));
}

function cursorsGravados(chamadas: Chamada[]): Array<Record<string, unknown>> {
  return chamadas
    .filter(c => c.tabela === "gmail_accounts")
    .flatMap(c => c.ops.filter(([op]) => op === "update").map(([, args]) => args[0] as Record<string, unknown>));
}

// ── 1. Escopo de conteúdo: Entrada + Enviados, 12 meses ──────────────────────
Deno.test("full sync usa o escopo Entrada+Enviados (12 meses) e guarda o enviado do Gmail", async () => {
  const chamadas: Chamada[] = [];
  const urls: string[] = [];
  const { restore } = comFetchFake((url) => {
    urls.push(url);
    if (url.includes("/messages?")) return { body: { messages: [{ id: "s1" }] } };
    if (url.includes("/messages/s1")) return { body: mensagemFake("s1", ["SENT"]) };
    if (url.includes("/profile")) return { body: { historyId: "999" } };
    return { body: {} };
  });
  try {
    const r = await runGmailFullSync(supabaseArg(chamadas), "conta-1", "token", new Logger("test"));
    assertEquals(r.synced, 1);
    const listagem = urls.find(u => u.includes("/messages?"));
    assertEquals(new URL(listagem!).searchParams.get("q"), GMAIL_SYNC_SCOPE_QUERY);
    assertEquals(GMAIL_SYNC_SCOPE_QUERY.includes("in:sent"), true);
    assertEquals(GMAIL_SYNC_SCOPE_QUERY.includes("newer_than:365d"), true);
    assertEquals(upsertsDe(chamadas)[0].label_ids, ["SENT"]);
  } finally { restore(); }
});

// ── 2 e 3. Incremental acompanha exclusão e rótulo, nos dois caminhos ────────
type Resultado = { pages: number; truncated: boolean; cursorAdvanced: boolean; synced: number; deleted: number };

const CAMINHOS: Array<{
  nome: string;
  rodar: (sb: unknown, acc: { id: string; history_id: string }, token: string) => Promise<Resultado>;
}> = [
  {
    nome: "sync manual (gmail-sync)",
    rodar: async (sb, acc, token) => {
      const r = await runGmailIncrementalSync(sb as never, acc, token, new Logger("test"));
      const p = r.payload as Record<string, number | boolean>;
      return { pages: p.history_pages as number, truncated: p.history_truncated as boolean, cursorAdvanced: p.cursor_advanced as boolean, synced: p.synced as number, deleted: p.deleted_messages as number };
    },
  },
  {
    nome: "cron de 5 min (gmail-cron-sync)",
    rodar: async (sb, acc, token) => {
      const r = await runGmailCronIncrementalSync(sb as never, acc, token, new Logger("test"));
      return { pages: r.history_pages, truncated: r.history_truncated, cursorAdvanced: r.cursor_advanced, synced: r.synced, deleted: r.deleted };
    },
  },
];

for (const caminho of CAMINHOS) {
  Deno.test(`incremental ${caminho.nome}: exclusão e mudança de rótulo feitas no Gmail chegam ao local`, async () => {
    const chamadas: Chamada[] = [];
    const urls: string[] = [];
    const { restore } = comFetchFake((url) => {
      urls.push(url);
      if (url.includes("/history?")) {
        return {
          body: {
            historyId: "150",
            history: [{
              messagesAdded: [{ message: { id: "s1" } }],
              labelsAdded: [{ message: { id: "m-rot" } }],
              labelsRemoved: [{ message: { id: "m-sem" } }],
              messagesDeleted: [{ message: { id: "m-del" } }],
            }],
          },
        };
      }
      if (url.includes("/messages/s1")) return { body: mensagemFake("s1", ["SENT"]) };
      return { body: mensagemFake(url.split("/messages/")[1].split("?")[0]) };
    });
    try {
      const r = await caminho.rodar(
        supabaseArg(chamadas, { archivedMessageId: "local-m-del", archivedThreadId: "thread-del" }),
        { id: "conta-1", history_id: "100" },
        "token",
      );

      // rótulo adicionado/removido e mensagem nova são re-sincronizados (o local
      // passa a refletir a pasta do Gmail); o enviado novo entra com label SENT
      for (const id of ["s1", "m-rot", "m-sem"]) {
        assertEquals(urls.some(u => u.includes(`/messages/${id}?`)), true, `${id} deveria ser re-buscado`);
      }
      assertEquals(upsertsDe(chamadas).find(m => m.gmail_message_id === "s1")?.label_ids, ["SENT"]);
      assertEquals(r.synced, 3);

      // mensagem excluída no Gmail NÃO é re-buscada; é apagada do local
      assertEquals(urls.some(u => u.includes("/messages/m-del?")), false);
      const apagados = chamadas
        .filter(c => c.tabela === "email_messages")
        .flatMap(c => c.ops.filter(([op]) => op === "delete"))
        .length;
      assertEquals(apagados, 1);
      assertEquals(r.deleted, 1);

      // cursor avança só no fim e via CAS
      assertEquals(r.cursorAdvanced, true);
      assertEquals(cursorsGravados(chamadas)[cursorsGravados(chamadas).length - 1]?.history_id, "150");
    } finally { restore(); }
  });

  Deno.test(`incremental ${caminho.nome}: histórico de tamanho exato ao teto NÃO trunca (borda do limite de páginas)`, async () => {
    const chamadas: Chamada[] = [];
    const { urls, restore } = comFetchFake((_url, n) => ({
      body: { historyId: `h-${n}`, history: [], ...(n < GMAIL_HISTORY_MAX_PAGES_PER_RUN ? { nextPageToken: `tok-${n + 1}` } : {}) },
    }));
    let r: Resultado;
    try {
      r = await caminho.rodar(supabaseArg(chamadas), { id: "conta-1", history_id: "h-0" }, "token");
    } finally { restore(); }
    assertEquals(urls.filter(u => u.includes("/history?")).length, GMAIL_HISTORY_MAX_PAGES_PER_RUN);
    assertEquals(r.pages, GMAIL_HISTORY_MAX_PAGES_PER_RUN);
    assertEquals(r.truncated, false);
    assertEquals(cursorsGravados(chamadas)[cursorsGravados(chamadas).length - 1]?.history_id, `h-${GMAIL_HISTORY_MAX_PAGES_PER_RUN}`);
  });

  Deno.test(`incremental ${caminho.nome}: caixa grande para no teto de páginas e o cursor persistido continua a rodada seguinte`, async () => {
    // rodada 1: o Gmail devolve páginas sem fim; a rodada precisa parar no teto
    const chamadas1: Chamada[] = [];
    const urls1: string[] = [];
    const f1 = comFetchFake((_url, n) => {
      urls1.push(_url);
      return { body: { historyId: `h-${n}`, history: [], nextPageToken: `tok-${n + 1}` } };
    });
    let r1: Resultado;
    try {
      r1 = await caminho.rodar(supabaseArg(chamadas1), { id: "conta-1", history_id: "h-0" }, "token");
    } finally { f1.restore(); }

    assertEquals(r1.pages, GMAIL_HISTORY_MAX_PAGES_PER_RUN);
    assertEquals(r1.truncated, true);
    assertEquals(r1.cursorAdvanced, true);
    assertEquals(urls1.filter(u => u.includes("/history?")).length, GMAIL_HISTORY_MAX_PAGES_PER_RUN);
    // cursor persistido = historyId da ÚLTIMA página processada (não a última do Gmail)
    const cursor1 = cursorsGravados(chamadas1)[cursorsGravados(chamadas1).length - 1]?.history_id as string;
    assertEquals(cursor1, `h-${GMAIL_HISTORY_MAX_PAGES_PER_RUN}`);

    // rodada 2: parte do cursor persistido (continua de onde parou, sem pular)
    const chamadas2: Chamada[] = [];
    const urls2: string[] = [];
    const f2 = comFetchFake((_url, n) => {
      urls2.push(_url);
      return { body: { historyId: `k-${n}`, history: [], nextPageToken: `tok-${n + 1}` } };
    });
    let r2: Resultado;
    try {
      r2 = await caminho.rodar(supabaseArg(chamadas2), { id: "conta-1", history_id: cursor1 }, "token");
    } finally { f2.restore(); }

    const primeira = urls2.find(u => u.includes("/history?"));
    assertEquals(new URL(primeira!).searchParams.get("startHistoryId"), cursor1);
    assertEquals(r2.pages, GMAIL_HISTORY_MAX_PAGES_PER_RUN);
    assertEquals(r2.truncated, true);
  });
}
