/**
 * Revisao do Devin e do Codex na PR #3215: uma mensagem apagada entre o history
 * e a leitura devolve 404, e tratar isso como falha PRENDE o cursor para sempre
 * -- nem o webhook nem o cron de 1 minuto veem os e-mails seguintes enquanto o
 * history continuar valido.
 *
 * Aqui esta a separacao: 404 e ausencia DEFINITIVA e nao entra em `failed`
 * (quem chama usa `failed > 0` para preservar o cursor); 429 e 5xx continuam
 * entrando, porque reler PODE recuperar.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { GmailHttpError, isGmailMessageGone, syncMessageIds } from "../gmail-helpers.ts";
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
        if (tabela === "gmail_accounts" && nomes.includes("single")) data = { email_address: "conta@exemplo.com" };
        else if (tabela === "email_threads" && nomes.includes("upsert")) data = { id: "thread-uuid-1", contact_id: "c1" };
        else if (tabela === "email_messages" && nomes.includes("upsert")) data = { id: "msg-uuid-1" };
        else if (tabela === "email_messages" && nomes.includes("order")) data = [];
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

/** Rotea por id da mensagem: o valor e o status HTTP que o Gmail devolveria. */
function comFetchPorStatus(statusPorId: Record<string, number>) {
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input);
    const id = url.split("/messages/")[1]?.split("?")[0] ?? "";
    const status = statusPorId[id] ?? 200;
    if (status !== 200) {
      return Promise.resolve(new Response(JSON.stringify({ error: { code: status, message: "nope" } }), { status }));
    }
    return Promise.resolve(new Response(JSON.stringify(mensagemFake(id)), { status: 200 }));
  }) as typeof fetch;
  return { restore: () => { globalThis.fetch = fetchOriginal; } };
}

const supabaseArg = (chamadas: Chamada[]) =>
  fakeSupabase(chamadas) as unknown as Parameters<typeof syncMessageIds>[0];

Deno.test("isGmailMessageGone separa 404 de falha recuperavel", () => {
  assert(isGmailMessageGone(new GmailHttpError(404, "Gmail API error (404): not found")));
  assert(!isGmailMessageGone(new GmailHttpError(500, "Gmail API error (500): boom")));
  assert(!isGmailMessageGone(new GmailHttpError(429, "Gmail API error (429): rate")));
  assert(!isGmailMessageGone(new Error("AbortError: timeout")));
  assert(!isGmailMessageGone(undefined));
});

Deno.test("mensagem apagada (404) nao entra em failed: o cursor pode avancar", async () => {
  const { restore } = comFetchPorStatus({ apagada: 404, viva: 200 });
  const chamadas: Chamada[] = [];
  try {
    const r = await syncMessageIds(supabaseArg(chamadas), "conta-1", "token", new Logger("teste"), ["apagada", "viva"]);
    assertEquals(r.failed, 0, "404 nao pode contar como falha -- travaria o cursor para sempre");
    assertEquals(r.ausentes, 1);
    assertEquals(r.synced, 1, "a mensagem viva continua sendo persistida");
  } finally {
    restore();
  }
});

Deno.test("falha recuperavel (500) continua em failed: o cursor fica parado", async () => {
  const { restore } = comFetchPorStatus({ instavel: 500, viva: 200 });
  const chamadas: Chamada[] = [];
  try {
    const r = await syncMessageIds(supabaseArg(chamadas), "conta-1", "token", new Logger("teste"), ["instavel", "viva"]);
    assertEquals(r.failed, 1, "5xx e recuperavel: reler pode trazer a mensagem");
    assertEquals(r.ausentes, 0);
    assertEquals(r.failures[0].id, "instavel");
  } finally {
    restore();
  }
});

Deno.test("429 tambem fica em failed, e nao como ausente", async () => {
  const { restore } = comFetchPorStatus({ limitada: 429 });
  const chamadas: Chamada[] = [];
  try {
    const r = await syncMessageIds(supabaseArg(chamadas), "conta-1", "token", new Logger("teste"), ["limitada"]);
    assertEquals(r.failed, 1);
    assertEquals(r.ausentes, 0);
  } finally {
    restore();
  }
});

Deno.test("so mensagens apagadas: nada falhou, nada sincronizou, cursor livre", async () => {
  const { restore } = comFetchPorStatus({ a: 404, b: 404 });
  const chamadas: Chamada[] = [];
  try {
    const r = await syncMessageIds(supabaseArg(chamadas), "conta-1", "token", new Logger("teste"), ["a", "b"]);
    assertEquals(r.failed, 0);
    assertEquals(r.ausentes, 2);
    assertEquals(r.synced, 0);
  } finally {
    restore();
  }
});
