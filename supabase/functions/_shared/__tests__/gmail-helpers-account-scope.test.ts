import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { syncMessages } from "../gmail-helpers.ts";
import { Logger } from "../validation.ts";

type Chamada = { tabela: string; ops: Array<[string, unknown[]]> };

function fakeSupabase(chamadas: Chamada[]) {
  return {
    from(tabela: string) {
      const chamada: Chamada = { tabela, ops: [] };
      chamadas.push(chamada);
      const builder: Record<string, unknown> = {};
      for (const op of ["select", "eq", "in", "upsert", "update", "delete", "ilike", "single", "maybeSingle", "order"]) {
        builder[op] = (...args: unknown[]) => {
          chamada.ops.push([op, args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => unknown) => {
        const nomes = chamada.ops.map(([op]) => op);
        let data: unknown = null;
        if (tabela === "gmail_accounts" && nomes.includes("single")) data = { email_address: "conta-a@exemplo.com" };
        else if (tabela === "email_threads" && nomes.includes("upsert")) data = { id: "thread-uuid-a", contact_id: "c1" };
        else if (tabela === "email_messages" && nomes.includes("upsert")) data = { id: "msg-uuid-a" };
        else if (tabela === "email_messages" && nomes.includes("order")) {
          data = [{
            from_name: "Cliente",
            from_address: "cliente@exemplo.com",
            subject: "Assunto",
            snippet: "oi",
            internal_date: "2023-11-14T22:13:20.000Z",
            label_ids: ["INBOX", "UNREAD"],
            is_read: false,
            is_starred: false,
          }];
        }
        return Promise.resolve(resolve({ data, error: null, count: 1 }));
      };
      return builder;
    },
  };
}

Deno.test("syncMessages reconcilia is_unread só nas threads da conta sincronizada", async () => {
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input);
    const corpo = url.includes("/messages?")
      ? { messages: [{ id: "m1" }] }
      : {
        id: "m1",
        threadId: "T1",
        labelIds: ["UNREAD"],
        snippet: "oi",
        historyId: "1",
        internalDate: "1700000000000",
        payload: { mimeType: "text/plain", headers: [{ name: "From", value: "Cliente <cliente@exemplo.com>" }], body: { data: "b2k", size: 2 } },
      };
    return Promise.resolve(new Response(JSON.stringify(corpo), { status: 200 }));
  }) as typeof fetch;

  try {
    const chamadas: Chamada[] = [];
    const r = await syncMessages(
      fakeSupabase(chamadas) as unknown as Parameters<typeof syncMessages>[0],
      "conta-a",
      "token",
      new Logger("test"),
    );
    assertEquals(r.synced, 1);

    const leitura = chamadas.find((c) => c.tabela === "email_messages" && c.ops.some(([op]) => op === "order"));
    assertEquals(leitura?.ops.filter(([op]) => op === "eq"), [
      ["eq", ["gmail_account_id", "conta-a"]],
      ["eq", ["thread_id", "thread-uuid-a"]],
    ]);

    const reconciliacao = chamadas.find((c) => c.tabela === "email_threads" && c.ops.some(([op]) => op === "update"));
    assertEquals(reconciliacao?.ops.filter(([op]) => op === "eq"), [
      ["eq", ["gmail_account_id", "conta-a"]],
      ["eq", ["id", "thread-uuid-a"]],
    ]);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});
