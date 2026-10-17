// t_2e6675ea — prova de que o caminho de sync incremental MANUAL
// (`gmail-sync` → `runGmailIncrementalSync`, a chamada sob demanda / botão
// "Sincronizar") acompanha o que foi feito no Gmail: mensagem excluída some do
// local e mudança de rótulo re-sincroniza a mensagem, junto com as mensagens
// novas. Exercita o código REAL com o cliente Supabase e a API do Gmail
// trocados por duplos em memória (sem rede).
//
// Confirmação pedida pelo cartão ("qual dos dois caminhos perde exclusões"): o
// caminho manual JÁ pede os quatro `historyTypes` e trata `messageDeleted`,
// `labelAdded` e `labelRemoved`; quem perdia exclusões era o cron
// (`runGmailCronIncrementalSync`, só `messageAdded`), tratado em t_f4041bd2.
import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { runGmailIncrementalSync } from "../../gmail-sync/index.ts";
import { Logger } from "../validation.ts";

const EMAIL = "conta@exemplo.com";

type Chamada = { tabela: string; ops: Array<[string, unknown[]]> };
type Cenario = { archivedMessageId?: string; archivedThreadId?: string };

// Duplo do cliente Supabase: registra cada operação por tabela e devolve as
// linhas que os fluxos esperam. Nenhum mock de supabase-js: `from()` é o único
// ponto de contato usado pelo código sob teste.
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
          else if (nomes.includes("update") && nomes.includes("select")) data = [{ id: "conta-1" }];
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

type Rota = (url: string) => { status?: number; body: unknown };

function comFetchFake(rota: Rota) {
  const fetchOriginal = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    const resposta = rota(url);
    return Promise.resolve(new Response(JSON.stringify(resposta.body), { status: resposta.status ?? 200 }));
  }) as typeof fetch;
  return { urls, restore: () => { globalThis.fetch = fetchOriginal; } };
}

const supabaseArg = (chamadas: Chamada[], cenario: Cenario = {}) =>
  fakeSupabase(chamadas, cenario) as unknown as Parameters<typeof runGmailIncrementalSync>[0];

const rodar = (chamadas: Chamada[], cenario: Cenario = {}) =>
  runGmailIncrementalSync(supabaseArg(chamadas, cenario), { id: "conta-1", history_id: "100" }, "token", new Logger("test"));

function upsertsDe(chamadas: Chamada[]): Array<Record<string, unknown>> {
  return chamadas.filter(c => c.tabela === "email_messages")
    .flatMap(c => c.ops.filter(([op]) => op === "upsert").map(([, args]) => args[0] as Record<string, unknown>));
}

function deletesDe(chamadas: Chamada[]): Chamada[] {
  return chamadas.filter(c => c.tabela === "email_messages" && c.ops.some(([op]) => op === "delete"));
}

function updatesDe(chamadas: Chamada[]): Array<Record<string, unknown>> {
  return chamadas.filter(c => c.tabela === "gmail_accounts")
    .flatMap(c => c.ops.filter(([op]) => op === "update").map(([, args]) => args[0] as Record<string, unknown>));
}

Deno.test("gmail-sync incremental manual: pede os quatro historyTypes do histórico do Gmail", async () => {
  const chamadas: Chamada[] = [];
  const { urls, restore } = comFetchFake(() => ({ body: { historyId: "150", history: [] } }));
  try {
    await rodar(chamadas);
  } finally { restore(); }
  const hist = urls.find(u => u.includes("/history?"));
  assertEquals(hist !== undefined, true, "deveria consultar /history");
  const params = new URL(hist!).searchParams;
  assertEquals(params.getAll("historyTypes").sort(), ["labelAdded", "labelRemoved", "messageAdded", "messageDeleted"]);
  assertEquals(params.get("startHistoryId"), "100");
});

Deno.test("gmail-sync incremental manual: exclusão e mudança de rótulo feitas no Gmail chegam ao local", async () => {
  const chamadas: Chamada[] = [];
  const { urls, restore } = comFetchFake((url) => {
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
  let r: Awaited<ReturnType<typeof rodar>>;
  try {
    r = await rodar(chamadas, { archivedMessageId: "local-m-del", archivedThreadId: "thread-del" });
  } finally { restore(); }
  const p = r.payload as Record<string, number | boolean>;

  // mensagem nova e rótulos adicionado/removido são re-sincronizados (o local
  // passa a refletir a pasta do Gmail); o enviado novo entra com label SENT
  for (const id of ["s1", "m-rot", "m-sem"]) {
    assertEquals(urls.some(u => u.includes(`/messages/${id}?`)), true, `${id} deveria ser re-buscado`);
  }
  assertEquals(upsertsDe(chamadas).find(m => m.gmail_message_id === "s1")?.label_ids, ["SENT"]);
  assertEquals(p.changed_messages, 3);
  assertEquals(p.synced, 3);

  // mensagem excluída no Gmail NÃO é re-buscada; é apagada do local, escopada na conta
  assertEquals(urls.some(u => u.includes("/messages/m-del?")), false);
  const apagados = deletesDe(chamadas);
  assertEquals(apagados.length, 1, "deveria haver exatamente um delete de email_messages");
  assertEquals(apagados[0].ops.find(([op]) => op === "eq")?.[1], ["gmail_account_id", "conta-1"]);
  assertEquals(apagados[0].ops.find(([op]) => op === "in")?.[1], ["id", ["local-m-del"]]);
  assertEquals(p.deleted_messages, 1);

  // cursor avança só no fim e via CAS sobre o cursor lido no início
  const cursor = updatesDe(chamadas)[updatesDe(chamadas).length - 1];
  assertEquals(cursor.history_id, "150");
  assertEquals(cursor.sync_status, "synced");
  assertEquals(p.cursor_advanced, true);
  assertEquals(r.status, 200);
});

Deno.test("gmail-sync incremental manual: id excluído não é re-buscado nem re-inserido na mesma rodada", async () => {
  const chamadas: Chamada[] = [];
  const { urls, restore } = comFetchFake((url) => {
    if (url.includes("/history?")) {
      return {
        body: {
          historyId: "150",
          history: [{ messagesAdded: [{ message: { id: "m-x" } }], messagesDeleted: [{ message: { id: "m-x" } }] }],
        },
      };
    }
    return { body: mensagemFake("m-x") };
  });
  let r: Awaited<ReturnType<typeof rodar>>;
  try {
    r = await rodar(chamadas, { archivedMessageId: "local-m-x", archivedThreadId: "thread-x" });
  } finally { restore(); }
  const p = r.payload as Record<string, number | boolean>;
  assertEquals(urls.some(u => u.includes("/messages/m-x?")), false, "mensagem apagada não deve ser re-buscada");
  assertEquals(upsertsDe(chamadas).length, 0, "mensagem apagada não deve ser re-inserida");
  assertEquals(deletesDe(chamadas).length, 1);
  assertEquals(p.deleted_messages, 1);
  assertEquals(p.changed_messages, 0);
});

Deno.test("gmail-sync incremental manual: exclusão sem cópia local não apaga nada e não falha", async () => {
  const chamadas: Chamada[] = [];
  const { restore } = comFetchFake((url) => {
    if (url.includes("/history?")) {
      return { body: { historyId: "150", history: [{ messagesDeleted: [{ message: { id: "m-sumiu" } }] }] } };
    }
    return { body: {} };
  });
  let r: Awaited<ReturnType<typeof rodar>>;
  try {
    r = await rodar(chamadas); // sem cópia local (cenário default: select devolve [])
  } finally { restore(); }
  const p = r.payload as Record<string, number | boolean>;
  assertEquals(deletesDe(chamadas).length, 0, "nada local para apagar");
  assertEquals(p.deleted_messages, 1);
  assertEquals(p.cursor_advanced, true);
  assertEquals(r.status, 200);
});

Deno.test("gmail-sync incremental manual: falha ao re-sincronizar rótulo preserva o cursor e não aplica exclusão parcial", async () => {
  const chamadas: Chamada[] = [];
  const { restore } = comFetchFake((url) => {
    if (url.includes("/history?")) {
      return {
        body: {
          historyId: "150",
          history: [{ labelsAdded: [{ message: { id: "m-rot" } }], messagesDeleted: [{ message: { id: "m-del" } }] }],
        },
      };
    }
    if (url.includes("/messages/m-rot")) return { status: 500, body: { error: { message: "boom" } } };
    return { body: mensagemFake("m-del") };
  });
  let r: Awaited<ReturnType<typeof rodar>>;
  try {
    r = await rodar(chamadas, { archivedMessageId: "local-m-del", archivedThreadId: "thread-del" });
  } finally { restore(); }
  const p = r.payload as Record<string, unknown>;
  assertEquals(r.status, 207);
  assertEquals(p.cursor_advanced, false);
  assertEquals(deletesDe(chamadas).length, 0, "com falha o fluxo não aplica exclusão parcial");
  const status = updatesDe(chamadas).find(u => u.sync_status !== undefined);
  assertEquals(status?.sync_status, "error");
});
