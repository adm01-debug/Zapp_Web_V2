// R2-API (P2) — a ação `trash` do gmail-send tem de PERSISTIR localmente.
//
// Defeito: o `case "trash"` descartava a mensagem no Gmail e devolvia
// `{ success: true }` sem tocar o banco local. A mensagem continuava com
// `label_ids` contendo INBOX e a thread dona continuava `status = 'open'`,
// então ela seguia aparecendo na caixa de entrada após o descarte (só saía no
// próximo sync). O `modify-thread-labels` já fazia esse trabalho; o `trash`
// não — daí a helper `persistGmailMessageLabels` (mesmos campos) e o teste.
//
// O que este teste trava:
//   1. A mensagem recebe os `labelIds` devolvidos pelo Gmail (sem INBOX, com
//      TRASH) e `is_read`/`is_starred` são recalculados a partir deles.
//   2. A thread dona é recalculada com `label_ids` agregado de TODAS as
//      mensagens locais e `status = 'archived'` quando ninguém mais tem INBOX.
//   3. Borda: outra mensagem da thread ainda na INBOX mantém `status = 'open'`.
//   4. Toda escrita é escopada por `gmail_account_id` (mensagem e thread).
//   5. Falha local não derruba a ação: devolve `false` (o handler responde
//      `local_persistence_failed`) em vez de lançar.
//
// Sem rede: `SupabaseClient` é substituído por um fake com o mesmo encadeamento.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env supabase/functions/gmail-send/trash-persistencia.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { persistGmailMessageLabels } from "../_shared/gmail-helpers.ts";

type Chamada = { tabela: string; ops: Array<[string, unknown[]]> };

type Estado = {
  messageUpdateError?: { message: string } | null;
  threadUpdateError?: { message: string } | null;
  readError?: { message: string } | null;
  threadRows?: Array<{ label_ids: string[]; is_read: boolean; is_starred: boolean }>;
};

function fakeSupabase(chamadas: Chamada[], estado: Estado) {
  return {
    from(tabela: string) {
      const chamada: Chamada = { tabela, ops: [] };
      chamadas.push(chamada);
      const builder: Record<string, unknown> = {};
      for (const op of ["select", "eq", "in", "update", "delete", "order", "maybeSingle", "single"]) {
        builder[op] = (...args: unknown[]) => {
          chamada.ops.push([op, args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => unknown) => {
        const nomes = chamada.ops.map(([op]) => op);
        let data: unknown = null;
        let error: unknown = null;
        if (tabela === "email_messages" && nomes.includes("update")) {
          error = estado.messageUpdateError ?? null;
        } else if (tabela === "email_messages" && nomes.includes("select")) {
          data = estado.threadRows ?? [];
          error = estado.readError ?? null;
        } else if (tabela === "email_threads" && nomes.includes("update")) {
          error = estado.threadUpdateError ?? null;
        }
        return resolve({ data, error, count: 1 });
      };
      return builder;
    },
  };
}

const comoCliente = (fake: ReturnType<typeof fakeSupabase>) =>
  fake as unknown as Parameters<typeof persistGmailMessageLabels>[0];

const filtros = (chamada?: Chamada) => chamada?.ops.filter(([op]) => op === "eq") ?? [];
const payload = (chamada?: Chamada) =>
  chamada?.ops.find(([op]) => op === "update")?.[1][0] as Record<string, unknown> | undefined;

Deno.test("trash: labelIds do Gmail atualizam a mensagem e arquivam a thread dona", async () => {
  const chamadas: Chamada[] = [];
  const ok = await persistGmailMessageLabels(
    comoCliente(fakeSupabase(chamadas, {
      threadRows: [
        { label_ids: ["TRASH"], is_read: true, is_starred: false },
        { label_ids: ["SENT"], is_read: true, is_starred: true },
      ],
    })),
    "conta-a",
    "m1",
    ["TRASH"],
    "thread-local-1",
  );

  assertEquals(ok, true);

  const msg = chamadas.find((c) => c.tabela === "email_messages" && c.ops.some(([op]) => op === "update"));
  assertEquals(payload(msg), { label_ids: ["TRASH"], is_read: true, is_starred: false });
  assertEquals(filtros(msg), [
    ["eq", ["gmail_message_id", "m1"]],
    ["eq", ["gmail_account_id", "conta-a"]],
  ]);

  const thread = chamadas.find((c) => c.tabela === "email_threads" && c.ops.some(([op]) => op === "update"));
  assertEquals(payload(thread), {
    label_ids: ["TRASH", "SENT"],
    is_unread: false,
    is_starred: true,
    status: "archived",
  });
  assertEquals(filtros(thread), [
    ["eq", ["id", "thread-local-1"]],
    ["eq", ["gmail_account_id", "conta-a"]],
  ]);
});

Deno.test("trash: mensagem não lida mantém is_read=false pelo label UNREAD", async () => {
  const chamadas: Chamada[] = [];
  await persistGmailMessageLabels(
    comoCliente(fakeSupabase(chamadas, { threadRows: [{ label_ids: ["TRASH", "UNREAD"], is_read: false, is_starred: false }] })),
    "conta-a",
    "m1",
    ["TRASH", "UNREAD"],
    "thread-local-1",
  );

  const msg = chamadas.find((c) => c.tabela === "email_messages" && c.ops.some(([op]) => op === "update"));
  assertEquals(payload(msg), { label_ids: ["TRASH", "UNREAD"], is_read: false, is_starred: false });
  const thread = chamadas.find((c) => c.tabela === "email_threads" && c.ops.some(([op]) => op === "update"));
  assertEquals(payload(thread)?.is_unread, true);
});

Deno.test("trash: thread com outra mensagem ainda na INBOX continua open", async () => {
  const chamadas: Chamada[] = [];
  const ok = await persistGmailMessageLabels(
    comoCliente(fakeSupabase(chamadas, {
      threadRows: [
        { label_ids: ["TRASH"], is_read: true, is_starred: false },
        { label_ids: ["INBOX", "SENT", "UNREAD"], is_read: false, is_starred: false },
      ],
    })),
    "conta-a",
    "m1",
    ["TRASH"],
    "thread-local-1",
  );

  assertEquals(ok, true);
  const thread = chamadas.find((c) => c.tabela === "email_threads" && c.ops.some(([op]) => op === "update"));
  assertEquals(payload(thread), {
    label_ids: ["TRASH", "INBOX", "SENT", "UNREAD"],
    is_unread: true,
    is_starred: false,
    status: "open",
  });
});

Deno.test("trash: sem thread local só a mensagem é atualizada", async () => {
  const chamadas: Chamada[] = [];
  const ok = await persistGmailMessageLabels(
    comoCliente(fakeSupabase(chamadas, {})),
    "conta-a",
    "m1",
    ["TRASH"],
    null,
  );

  assertEquals(ok, true);
  assertEquals(chamadas.filter((c) => c.tabela === "email_threads").length, 0);
  assertEquals(chamadas.length, 1);
});

Deno.test("trash: falha na escrita local devolve false sem lançar", async () => {
  const chamadasMsg: Chamada[] = [];
  const okMsg = await persistGmailMessageLabels(
    comoCliente(fakeSupabase(chamadasMsg, { messageUpdateError: { message: "boom" } })),
    "conta-a",
    "m1",
    ["TRASH"],
    "thread-local-1",
  );
  assertEquals(okMsg, false);
  assertEquals(chamadasMsg.filter((c) => c.tabela === "email_threads").length, 0);

  const chamadasLeitura: Chamada[] = [];
  const okLeitura = await persistGmailMessageLabels(
    comoCliente(fakeSupabase(chamadasLeitura, { readError: { message: "boom" } })),
    "conta-a",
    "m1",
    ["TRASH"],
    "thread-local-1",
  );
  assertEquals(okLeitura, false);

  const chamadasThread: Chamada[] = [];
  const okThread = await persistGmailMessageLabels(
    comoCliente(fakeSupabase(chamadasThread, { threadUpdateError: { message: "boom" } })),
    "conta-a",
    "m1",
    ["TRASH"],
    "thread-local-1",
  );
  assertEquals(okThread, false);
});
