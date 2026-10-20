/**
 * Teste das ações de gerenciamento de marcadores do Gmail na `gmail-sync`.
 *
 * Cobre o caminho real de `runGmailLabelMutation` (a API do Gmail é um fetch
 * falso por URL; o cliente Supabase é um duplo que registra a query para provar
 * o escopo por `gmail_account_id`) e o portão de dono do handler `handleGmailSync`
 * contra um Supabase falso em HTTP (sem banco/rede de verdade):
 *   - create/update/delete chegam à API do Gmail com o método e o corpo certos
 *     e espelham `email_labels`;
 *   - marcador de sistema (INBOX, CATEGORY_*) é recusado SEM chamar o Gmail;
 *   - erro do espelho local propaga (não declaramos sucesso);
 *   - requisição de não-dono é negada (403) e a consulta é escopada por user_id.
 */
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleGmailSync, isSystemGmailLabelId, runGmailLabelMutation } from "./index.ts";

const CONTA = "11111111-1111-4111-8111-111111111111";
const DONO = "22222222-2222-4222-8222-222222222222";

type Chamada = { tabela: string; ops: Array<[string, unknown[]]> };

/** Duplo de Supabase: registra a query em `chamadas` e responde `data`/`error`. */
function fakeSupabase(chamadas: Chamada[], opts: { erro?: boolean } = {}) {
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
      builder.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(resolve({ data: null, error: opts.erro ? { message: "falha simulada" } : null, count: 0 }));
      return builder;
    },
  };
}

type Capturada = { url: string; method: string; body: unknown };

/** Responde a API do Gmail por um fetch falso e captura método/URL/corpo. */
async function comGmailFalso<T>(
  resposta: { status: number; body?: unknown },
  fn: () => Promise<T>,
): Promise<{ capturadas: Capturada[]; valor: T }> {
  const capturadas: Capturada[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("https://gmail.googleapis.com/")) return original(input, init);
    capturadas.push({
      url,
      method: (init?.method as string) ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const corpo = resposta.status === 204 ? null : JSON.stringify(resposta.body ?? {});
    return new Response(corpo, { status: resposta.status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    return { capturadas, valor: await fn() };
  } finally {
    globalThis.fetch = original;
  }
}

function eqs(chamada: Chamada | undefined): Array<[string, unknown]> {
  return (chamada?.ops ?? []).filter(([op]) => op === "eq").map(([, args]) => [args[0] as string, args[1]]);
}

Deno.test("create-label: POST /labels e espelha email_labels (escopo por conta)", async () => {
  const chamadas: Chamada[] = [];
  const fake = fakeSupabase(chamadas);
  const { capturadas, valor } = await comGmailFalso(
    { status: 200, body: { id: "Label_77", name: "Clientes", type: "user", color: { backgroundColor: "#42d692" }, messagesTotal: 0, messagesUnread: 0 } },
    () =>
      runGmailLabelMutation(fake as unknown as SupabaseClient, CONTA, "token-teste", "create-label", {
        name: "Clientes",
        color: { backgroundColor: "#42d692", textColor: "#ffffff" },
      }),
  );

  assertEquals(valor.status, 201);
  assertEquals(capturadas.length, 1);
  assertEquals(capturadas[0].method, "POST");
  assert(capturadas[0].url.endsWith("/labels"), capturadas[0].url);
  assertEquals(capturadas[0].body, { name: "Clientes", color: { backgroundColor: "#42d692", textColor: "#ffffff" } });

  const upsert = chamadas.find((c) => c.tabela === "email_labels" && c.ops.some(([op]) => op === "upsert"));
  assert(upsert, "espelhou o marcador em email_labels");
  const linha = upsert!.ops.find(([op]) => op === "upsert")![1][0] as Record<string, unknown>;
  assertEquals(linha.gmail_account_id, CONTA);
  assertEquals(linha.gmail_label_id, "Label_77");
  assertEquals(linha.label_type, "user");
  assertEquals(linha.name, "Clientes");
});

Deno.test("update-label: PATCH /labels/<id> e atualiza email_labels escopado por conta", async () => {
  const chamadas: Chamada[] = [];
  const fake = fakeSupabase(chamadas);
  const { capturadas, valor } = await comGmailFalso(
    { status: 200, body: { id: "Label_42", name: "Novo nome", type: "user" } },
    () =>
      runGmailLabelMutation(fake as unknown as SupabaseClient, CONTA, "token-teste", "update-label", {
        label_id: "Label_42",
        name: "Novo nome",
      }),
  );

  assertEquals(valor.status, 200);
  assertEquals(capturadas.length, 1);
  assertEquals(capturadas[0].method, "PATCH");
  assert(capturadas[0].url.endsWith("/labels/Label_42"), capturadas[0].url);
  assertEquals(capturadas[0].body, { id: "Label_42", name: "Novo nome" });

  const update = chamadas.find((c) => c.tabela === "email_labels" && c.ops.some(([op]) => op === "update"));
  assertEquals(eqs(update), [["gmail_account_id", CONTA], ["gmail_label_id", "Label_42"]]);
});

Deno.test("delete-label: DELETE /labels/<id> e remove a linha local escopada por conta", async () => {
  const chamadas: Chamada[] = [];
  const fake = fakeSupabase(chamadas);
  const { capturadas, valor } = await comGmailFalso(
    { status: 204 },
    () => runGmailLabelMutation(fake as unknown as SupabaseClient, CONTA, "token-teste", "delete-label", { label_id: "Label_42" }),
  );

  assertEquals(valor.status, 200);
  assertEquals(valor.payload.deleted, true);
  assertEquals(capturadas.length, 1);
  assertEquals(capturadas[0].method, "DELETE");
  assert(capturadas[0].url.endsWith("/labels/Label_42"), capturadas[0].url);

  const del = chamadas.find((c) => c.tabela === "email_labels" && c.ops.some(([op]) => op === "delete"));
  assertEquals(eqs(del), [["gmail_account_id", CONTA], ["gmail_label_id", "Label_42"]]);
});

Deno.test("delete-label: marcador de sistema é recusado sem chamar o Gmail", async () => {
  assertEquals(isSystemGmailLabelId("INBOX"), true);
  assertEquals(isSystemGmailLabelId("CATEGORY_PERSONAL"), true);
  assertEquals(isSystemGmailLabelId("Label_42"), false);

  for (const id of ["INBOX", "CATEGORY_PERSONAL"]) {
    const chamadas: Chamada[] = [];
    const fake = fakeSupabase(chamadas);
    const { capturadas, valor } = await comGmailFalso(
      { status: 204 },
      () => runGmailLabelMutation(fake as unknown as SupabaseClient, CONTA, "token-teste", "delete-label", { label_id: id }),
    );
    assertEquals(valor.status, 400);
    assertEquals(capturadas.length, 0, "nenhuma chamada ao Gmail para marcador de sistema");
    assertEquals(chamadas.length, 0, "nenhuma escrita local para marcador de sistema");
  }
});

Deno.test("create-label: erro do espelho local propaga (não declara sucesso)", async () => {
  const chamadas: Chamada[] = [];
  const fake = fakeSupabase(chamadas, { erro: true });
  await comGmailFalso(
    { status: 200, body: { id: "Label_78", name: "X", type: "user" } },
    () =>
      assertRejects(
        () => runGmailLabelMutation(fake as unknown as SupabaseClient, CONTA, "token-teste", "create-label", { name: "X" }),
        Error,
        "Failed to persist Gmail label locally",
      ),
  );
});

// ─── portão de dono do handler (Supabase falso em HTTP, sem banco) ───────────
function servidorFalso(opts: { userId: string; conta: unknown | null }) {
  const pedidos: string[] = [];
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, (req) => {
    const u = new URL(req.url);
    pedidos.push(`${req.method} ${u.pathname}${u.search}`);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (u.pathname === "/auth/v1/user") {
      return json({ id: opts.userId, aud: "authenticated", role: "authenticated", email: "sintetico@example.invalid" });
    }
    if (u.pathname === "/rest/v1/gmail_accounts") {
      if (!opts.conta) return json({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }, 406);
      return json(opts.conta);
    }
    return json({ message: "rota não suportada no duplo" }, 404);
  });
  const addr = server.addr;
  if (addr.transport !== "tcp") throw new Error("duplo: esperado listener TCP");
  return { url: `http://127.0.0.1:${addr.port}`, pedidos, fechar: () => server.shutdown() };
}

Deno.test("gmail-sync: requisição de não-dono é negada (403) e a consulta é escopada por user_id", async () => {
  const svc = servidorFalso({ userId: DONO, conta: null });
  const anterior = {
    url: Deno.env.get("SUPABASE_URL"),
    svc: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    anon: Deno.env.get("SUPABASE_ANON_KEY"),
  };
  Deno.env.set("SUPABASE_URL", svc.url);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-teste");
  Deno.env.set("SUPABASE_ANON_KEY", "anon-teste");
  try {
    const req = new Request("https://edge.local/functions/v1/gmail-sync", {
      method: "POST",
      headers: { Authorization: "Bearer token-do-chamador", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-label", account_id: CONTA, label_id: "Label_123" }),
    });
    const res = await handleGmailSync(req);
    assertEquals(res.status, 403);
    assertEquals(await res.json(), { error: "Gmail account not found or inactive" });

    const consulta = svc.pedidos.find((p) => p.includes("/rest/v1/gmail_accounts"));
    assert(consulta, "o handler consultou gmail_accounts");
    assert(consulta!.includes(`user_id=eq.${DONO}`), `consulta escopada por user_id: ${consulta}`);
    assert(consulta!.includes(`id=eq.${CONTA}`), `consulta escopada pela conta pedida: ${consulta}`);
    assert(!svc.pedidos.some((p) => p.includes("gmail.googleapis.com")), "nenhuma chamada ao Gmail");
  } finally {
    if (anterior.url === undefined) Deno.env.delete("SUPABASE_URL"); else Deno.env.set("SUPABASE_URL", anterior.url);
    if (anterior.svc === undefined) Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY"); else Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", anterior.svc);
    if (anterior.anon === undefined) Deno.env.delete("SUPABASE_ANON_KEY"); else Deno.env.set("SUPABASE_ANON_KEY", anterior.anon);
    await svc.fechar();
  }
});
