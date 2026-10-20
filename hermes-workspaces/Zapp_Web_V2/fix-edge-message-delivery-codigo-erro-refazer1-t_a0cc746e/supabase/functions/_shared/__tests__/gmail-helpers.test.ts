import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { decodeBase64Url, extractAttachments, extractBody, parseGmailAddressList, runGmailFullSync, syncMessages, type GmailMessage } from "../gmail-helpers.ts";
import { Logger } from "../validation.ts";

function base64Url(value: string): string {
  return btoa(unescape(encodeURIComponent(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

type Chamada = { tabela: string; ops: Array<[string, unknown[]]> };

function fakeSupabase(chamadas: Chamada[], eventos?: string[]) {
  return {
    from(tabela: string) {
      const chamada: Chamada = { tabela, ops: [] };
      chamadas.push(chamada);
      const builder: Record<string, unknown> = {};
      for (const op of ["select", "eq", "in", "upsert", "update", "delete", "ilike", "single", "maybeSingle", "order"]) {
        builder[op] = (...args: unknown[]) => {
          chamada.ops.push([op, args]);
          if (op === "update" && tabela === "gmail_accounts") {
            eventos?.push(`update:gmail_accounts:${Object.keys(args[0] as Record<string, unknown>).sort().join(",")}`);
          }
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => unknown) => {
        const nomes = chamada.ops.map(([op]) => op);
        let data: unknown = null;
        if (tabela === "gmail_accounts" && nomes.includes("single")) data = { email_address: "conta@exemplo.com" };
        else if (tabela === "email_threads" && nomes.includes("upsert")) data = { id: "thread-uuid-1", contact_id: "c1" };
        else if (tabela === "email_messages" && nomes.includes("upsert")) data = { id: "msg-uuid-1" };
        else if (tabela === "email_messages" && nomes.includes("order")) {
          data = [{
            from_name: "Cliente", from_address: "cliente@exemplo.com", subject: "Assunto", snippet: "oi",
            internal_date: "2023-11-14T22:13:20.000Z", label_ids: ["INBOX"], is_read: true, is_starred: false,
          }];
        }
        return Promise.resolve(resolve({ data, error: null, count: 1 }));
      };
      return builder;
    },
  };
}

function mensagemFake(id: string) {
  return {
    id, threadId: `T-${id}`, labelIds: ["INBOX"], snippet: "oi", historyId: "1", internalDate: "1700000000000",
    payload: { mimeType: "text/plain", headers: [{ name: "From", value: "Cliente <cliente@exemplo.com>" }], body: { data: "b2k", size: 2 } },
  };
}

function comFetchFake(rota: (url: string) => { status?: number; body: unknown }, eventos?: string[]) {
  const fetchOriginal = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    const tag = url.includes("/messages?") ? "list" : url.includes("/profile") ? "profile" : "msg";
    eventos?.push(`fetch:${tag}`);
    const resposta = rota(url);
    return Promise.resolve(new Response(JSON.stringify(resposta.body), { status: resposta.status ?? 200 }));
  }) as typeof fetch;
  return { urls, restore: () => { globalThis.fetch = fetchOriginal; } };
}

function updatesDaConta(chamadas: Chamada[]): Array<Record<string, unknown>> {
  return chamadas
    .filter(c => c.tabela === "gmail_accounts")
    .flatMap(c => c.ops.filter(([op]) => op === "update").map(([, args]) => args[0] as Record<string, unknown>));
}

const supabaseArg = (chamadas: Chamada[], eventos?: string[]) =>
  fakeSupabase(chamadas, eventos) as unknown as Parameters<typeof syncMessages>[0];

Deno.test("syncMessages consome todas as paginas e envia pageToken na continuacao", async () => {
  const { urls, restore } = comFetchFake((url) => {
    if (url.includes("/messages?")) {
      return url.includes("pageToken=tok-p2")
        ? { body: { messages: [{ id: "m2" }, { id: "m3" }] } }
        : { body: { messages: [{ id: "m1" }], nextPageToken: "tok-p2" } };
    }
    return { body: mensagemFake(url.split("/messages/")[1].split("?")[0]) };
  });
  const chamadas: Chamada[] = [];
  try {
    const r = await syncMessages(supabaseArg(chamadas), "conta-a", "token", new Logger("test"), "in:inbox", 50);
    assertEquals(r.synced, 3);
    assertEquals(r.failed, 0);
    assertEquals(r.pages, 2);
    const listagens = urls.filter(u => u.includes("/messages?"));
    assertEquals(listagens.length, 2);
    assertEquals(listagens[1].includes("pageToken=tok-p2"), true);
    for (const id of ["m1", "m2", "m3"]) {
      assertEquals(urls.some(u => u.includes(`/messages/${id}?`)), true);
    }
  } finally { restore(); }
});

Deno.test("syncMessages agrega falhas de mensagem sem abortar as paginas seguintes", async () => {
  const { restore } = comFetchFake((url) => {
    if (url.includes("/messages?")) {
      return url.includes("pageToken=tok-p2")
        ? { body: { messages: [{ id: "m2" }, { id: "m3" }] } }
        : { body: { messages: [{ id: "m1" }], nextPageToken: "tok-p2" } };
    }
    if (url.includes("/messages/m2?")) return { status: 500, body: { error: "boom" } };
    return { body: mensagemFake(url.split("/messages/")[1].split("?")[0]) };
  });
  const chamadas: Chamada[] = [];
  try {
    const r = await syncMessages(supabaseArg(chamadas), "conta-a", "token", new Logger("test"));
    assertEquals(r.synced, 2);
    assertEquals(r.failed, 1);
    assertEquals(r.failures, [{ id: "m2", error: "Gmail API error (500): {\"error\":\"boom\"}" }]);
  } finally { restore(); }
});

Deno.test("syncMessages aborta com erro quando o Gmail repete nextPageToken", async () => {
  const { urls, restore } = comFetchFake((url) => {
    if (url.includes("/messages?")) return { body: { messages: [{ id: "m1" }], nextPageToken: "tok-loop" } };
    return { body: mensagemFake("m1") };
  });
  const chamadas: Chamada[] = [];
  try {
    await assertRejects(
      () => syncMessages(supabaseArg(chamadas), "conta-a", "token", new Logger("test")),
      Error, "repeated page token",
    );
    assertEquals(urls.filter(u => u.includes("/messages?")).length <= 2, true);
  } finally { restore(); }
});

Deno.test("syncMessages aborta ao ultrapassar o limite de 100 paginas", async () => {
  const { urls, restore } = comFetchFake((url) => {
    if (url.includes("/messages?")) {
      const pagina = urls.filter(u => u.includes("/messages?")).length;
      return { body: { messages: [], nextPageToken: `tok-${pagina}` } };
    }
    return { body: {} };
  });
  const chamadas: Chamada[] = [];
  try {
    await assertRejects(
      () => syncMessages(supabaseArg(chamadas), "conta-a", "token", new Logger("test")),
      Error, "pagination limit",
    );
    assertEquals(urls.filter(u => u.includes("/messages?")).length, 100);
  } finally { restore(); }
});

Deno.test("syncMessages propaga falha ao listar a pagina seguinte", async () => {
  const { restore } = comFetchFake((url) => {
    if (url.includes("/messages?")) {
      return url.includes("pageToken=tok-p2")
        ? { status: 500, body: { error: "boom" } }
        : { body: { messages: [{ id: "m1" }], nextPageToken: "tok-p2" } };
    }
    return { body: mensagemFake("m1") };
  });
  const chamadas: Chamada[] = [];
  try {
    await assertRejects(
      () => syncMessages(supabaseArg(chamadas), "conta-a", "token", new Logger("test")),
      Error, "Gmail API error (500)",
    );
  } finally { restore(); }
});

Deno.test("runGmailFullSync grava history_id somente depois de consumir todas as paginas", async () => {
  const eventos: string[] = [];
  const { restore } = comFetchFake((url) => {
    if (url.includes("/messages?")) {
      return url.includes("pageToken=tok-p2")
        ? { body: { messages: [{ id: "m2" }] } }
        : { body: { messages: [{ id: "m1" }], nextPageToken: "tok-p2" } };
    }
    if (url.includes("/profile")) return { body: { historyId: "h-99" } };
    return { body: mensagemFake(url.split("/messages/")[1].split("?")[0]) };
  }, eventos);
  const chamadas: Chamada[] = [];
  try {
    const r = await runGmailFullSync(supabaseArg(chamadas, eventos), "conta-a", "token", new Logger("test"));
    assertEquals(r.synced, 2);
    assertEquals(r.failed, 0);
    const idxCursor = eventos.findIndex(e => e.startsWith("update:gmail_accounts:") && e.includes("history_id"));
    const ultimasFetch = eventos.map((e, i) => e.startsWith("fetch:") ? i : -1).filter(i => i >= 0);
    assertEquals(idxCursor > (ultimasFetch.at(-1) ?? -1), true);
    const final = updatesDaConta(chamadas).find(u => "history_id" in u);
    assertEquals(final?.history_id, "h-99");
    assertEquals(final?.sync_status, "synced");
  } finally { restore(); }
});

Deno.test("runGmailFullSync nao grava history_id quando uma mensagem falha", async () => {
  const eventos: string[] = [];
  const { restore } = comFetchFake((url) => {
    if (url.includes("/messages?")) return { body: { messages: [{ id: "m1" }, { id: "m2" }] } };
    if (url.includes("/messages/m2?")) return { status: 500, body: { error: "boom" } };
    if (url.includes("/profile")) return { body: { historyId: "h-99" } };
    return { body: mensagemFake("m1") };
  }, eventos);
  const chamadas: Chamada[] = [];
  try {
    const r = await runGmailFullSync(supabaseArg(chamadas, eventos), "conta-a", "token", new Logger("test"));
    assertEquals(r.failed, 1);
    const updates = updatesDaConta(chamadas);
    assertEquals(updates.some(u => "history_id" in u), false);
    assertEquals(updates.some(u => u.sync_status === "synced"), false);
    assertEquals(updates.some(u => u.sync_status === "error"), true);
    assertEquals(eventos.includes("fetch:profile"), false);
  } finally { restore(); }
});

Deno.test("runGmailFullSync propaga falha de listagem sem gravar cursor nem estado concluido", async () => {
  const { restore } = comFetchFake((url) => {
    if (url.includes("/messages?")) {
      return url.includes("pageToken=tok-p2")
        ? { status: 500, body: { error: "boom" } }
        : { body: { messages: [{ id: "m1" }], nextPageToken: "tok-p2" } };
    }
    return { body: mensagemFake("m1") };
  });
  const chamadas: Chamada[] = [];
  try {
    await assertRejects(
      () => runGmailFullSync(supabaseArg(chamadas), "conta-a", "token", new Logger("test")),
      Error, "Gmail API error (500)",
    );
    const updates = updatesDaConta(chamadas);
    assertEquals(updates.some(u => "history_id" in u), false);
    assertEquals(updates.some(u => u.sync_status === "synced"), false);
  } finally { restore(); }
});

Deno.test('parseGmailAddressList preserva nome Unicode com virgula entre aspas', () => {
  assertEquals(parseGmailAddressList('"Silva, João" <Joao+vip@example.com>, maria@example.com'), [
    { name: 'Silva, João', address: 'joao+vip@example.com' },
    { name: '', address: 'maria@example.com' },
  ]);
});

Deno.test('decodeBase64Url decodifica UTF-8 sem perder acentos', () => {
  assertEquals(decodeBase64Url(base64Url('Cotação — válida')), 'Cotação — válida');
});

Deno.test('extractBody e extractAttachments percorrem MIME aninhado', () => {
  const payload: GmailMessage['payload'] = {
    mimeType: 'multipart/mixed', headers: [],
    parts: [{
      mimeType: 'multipart/alternative', body: { size: 0 }, parts: [
        { mimeType: 'text/plain', body: { size: 5, data: base64Url('texto') } },
        { mimeType: 'text/html', body: { size: 12, data: base64Url('<b>texto</b>') } },
      ],
    }, {
      mimeType: 'application/pdf', filename: 'arquivo.pdf', body: { size: 123, attachmentId: 'att-1' },
    }],
  };
  assertEquals(extractBody(payload), { text: 'texto', html: '<b>texto</b>' });
  assertEquals(extractAttachments(payload), [{ filename: 'arquivo.pdf', mimeType: 'application/pdf', attachmentId: 'att-1', size: 123 }]);
});
