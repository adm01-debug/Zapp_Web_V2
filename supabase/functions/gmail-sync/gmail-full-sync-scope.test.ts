/**
 * Teste do full sync ampliado (caixa de entrada + enviados, 12 meses) da
 * `gmail-sync`.
 *
 * Cobre, sem banco nem rede de verdade:
 *   - a consulta padrão do full sync vai à API do Gmail com `in:inbox OR
 *     in:sent` e a janela de 12 meses, e o handler devolve o cursor quando o
 *     orçamento de páginas da invocação acaba (`has_more`/`next_page_token`);
 *   - a invocação seguinte retoma pelo `page_token` recebido;
 *   - consulta que pede conteúdo de Spam, Lixeira ou Rascunhos é recusada no
 *     schema (400) SEM chamar o Gmail.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { GmailSyncActionSchema, gmailQueryTermosForaDeEscopo, handleGmailSync } from "./index.ts";
import { gmailFullSyncQuery, GMAIL_FULL_SYNC_MAX_PAGES_PER_RUN } from "../_shared/gmail-helpers.ts";

const CONTA = "11111111-1111-4111-8111-111111111111";
const DONO = "22222222-2222-4222-8222-222222222222";

Deno.test("schema recusa consulta que traria conteudo de Spam, Lixeira ou Rascunhos", () => {
  for (const query of ["in:spam", "in:inbox OR in:trash", "is:draft", "in:anywhere", "label:spam", "label:trash"]) {
    const r = GmailSyncActionSchema.safeParse({ action: "sync-inbox", account_id: CONTA, query });
    assertEquals(r.success, false, `deveria recusar: ${query}`);
    if (!r.success) assertEquals(r.error.issues.some(i => i.message.includes("fora do escopo")), true, query);
  }
  // O escopo aprovado (o padrão do handler) passa e nada é marcado como fora.
  assertEquals(gmailQueryTermosForaDeEscopo("in:inbox OR in:sent after:1760659200"), []);
  assertEquals(GmailSyncActionSchema.safeParse({
    action: "sync-inbox", account_id: CONTA, query: "in:inbox OR in:sent after:1760659200",
  }).success, true);
  // Cursor de continuação: alfabeto seguro passa, lixo de controle não.
  assertEquals(GmailSyncActionSchema.safeParse({
    action: "sync-inbox", account_id: CONTA, page_token: "tok-1.abc_==+-/XYZ",
  }).success, true);
  assertEquals(GmailSyncActionSchema.safeParse({
    action: "sync-inbox", account_id: CONTA, page_token: "tok 1\n",
  }).success, false);
});

/** Supabase falso em HTTP: responde conta/tokens e registra os pedidos. */
function servidorFalso() {
  const pedidos: string[] = [];
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, (req) => {
    const u = new URL(req.url);
    pedidos.push(`${req.method} ${u.pathname}${u.search}`);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (u.pathname === "/auth/v1/user") {
      return json({ id: DONO, aud: "authenticated", role: "authenticated", email: "sintetico@example.invalid" });
    }
    if (u.pathname === "/rest/v1/rpc/get_gmail_tokens") {
      return json([{ access_token: "token-gmail", refresh_token: "refresh-gmail" }]);
    }
    if (u.pathname === "/rest/v1/gmail_accounts") {
      if (req.method !== "GET") return new Response(null, { status: 204 });
      return json({
        id: CONTA, user_id: DONO, email_address: "sintetico@example.invalid", is_active: true,
        sync_status: "idle", token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        history_id: null,
      });
    }
    if (req.method !== "GET") return new Response(null, { status: 204 });
    return json([]);
  });
  const addr = server.addr;
  if (addr.transport !== "tcp") throw new Error("duplo: esperado listener TCP");
  return { url: `http://127.0.0.1:${addr.port}`, pedidos, fechar: () => server.shutdown() };
}

/** Gmail falso: devolve uma página vazia com `nextPageToken` e registra as URLs. */
function comGmailFalso() {
  const urls: string[] = [];
  const anterior = globalThis.fetch;
  let pagina = 0;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    // Só a API do Gmail é falsa; o resto (Supabase falso, em HTTP) passa reto.
    if (!url.includes("gmail.googleapis.com")) return anterior(input, init);
    urls.push(url);
    const body = url.includes("/messages?")
      ? { messages: [], nextPageToken: `tok-${++pagina}` }
      : { historyId: "777" };
    return Promise.resolve(new Response(JSON.stringify(body), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
  }) as typeof fetch;
  return { urls, restore: () => { globalThis.fetch = anterior; } };
}

async function chamarSyncInbox(corpo: Record<string, unknown>) {
  const req = new Request("https://edge.local/functions/v1/gmail-sync", {
    method: "POST",
    headers: { Authorization: "Bearer token-do-chamador", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "sync-inbox", account_id: CONTA, ...corpo }),
  });
  return await handleGmailSync(req);
}

async function comAmbiente(fn: (svc: { url: string; pedidos: string[] }) => Promise<void>) {
  const svc = servidorFalso();
  const anterior = {
    url: Deno.env.get("SUPABASE_URL"),
    svc: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    anon: Deno.env.get("SUPABASE_ANON_KEY"),
  };
  Deno.env.set("SUPABASE_URL", svc.url);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-teste");
  Deno.env.set("SUPABASE_ANON_KEY", "anon-teste");
  try {
    await fn(svc);
  } finally {
    if (anterior.url === undefined) Deno.env.delete("SUPABASE_URL"); else Deno.env.set("SUPABASE_URL", anterior.url);
    if (anterior.svc === undefined) Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY"); else Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", anterior.svc);
    if (anterior.anon === undefined) Deno.env.delete("SUPABASE_ANON_KEY"); else Deno.env.set("SUPABASE_ANON_KEY", anterior.anon);
    await svc.fechar();
  }
}

Deno.test("sync-inbox usa a consulta ampliada, devolve o cursor e retoma pelo page_token", async () => {
  await comAmbiente(async (svc) => {
    const gmail = comGmailFalso();
    try {
      const res = await chamarSyncInbox({});
      assertEquals(res.status, 200, JSON.stringify(await res.clone().json()));
      const corpo = await res.json() as Record<string, unknown>;
      assertEquals(corpo.success, true);
      assertEquals(corpo.has_more, true);
      assertEquals(corpo.next_page_token, "tok-10");
      assertEquals(corpo.query, gmailFullSyncQuery());
      // A conta entra em "syncing" (varredura incompleta) e segue assim.
      assert(svc.pedidos.some(p => p.startsWith("PATCH /rest/v1/gmail_accounts")));

      // Uma invocação = no máximo o orçamento de páginas (a caixa inteira NUNCA
      // é varrida numa Edge só), e o cursor da última página volta ao chamador.
      const listagens = gmail.urls.filter(u => u.includes("/messages?"));
      assertEquals(listagens.length, GMAIL_FULL_SYNC_MAX_PAGES_PER_RUN);
      const params = new URL(listagens[0]).searchParams;
      assertEquals(params.get("q")?.startsWith("in:inbox OR in:sent after:"), true, listagens[0]);
      assertEquals(params.get("maxResults"), "50");
      assertEquals(listagens[0].includes("pageToken="), false);
      // Orçamento esgotado = varredura incompleta: nada de /profile (que só
      // avança o `history_id` quando todas as páginas foram consumidas).
      assertEquals(gmail.urls.some(u => u.includes("/profile")), false);

      // Segunda invocação: retoma exatamente da página devolvida.
      const res2 = await chamarSyncInbox({ page_token: "tok-10" });
      assertEquals(res2.status, 200);
      const listagens2 = gmail.urls.filter(u => u.includes("/messages?"));
      assertEquals(listagens2.length, GMAIL_FULL_SYNC_MAX_PAGES_PER_RUN * 2);
      assertEquals(new URL(listagens2[GMAIL_FULL_SYNC_MAX_PAGES_PER_RUN]).searchParams.get("pageToken"), "tok-10");
    } finally { gmail.restore(); }
  });
});

Deno.test("sync-inbox recusa consulta fora do escopo sem chamar o Gmail", async () => {
  await comAmbiente(async () => {
    const gmail = comGmailFalso();
    try {
      const res = await chamarSyncInbox({ query: "in:spam" });
      assertEquals(res.status, 400);
      await res.text();
      assertEquals(gmail.urls.filter(u => u.includes("gmail.googleapis.com")).length, 0);
    } finally { gmail.restore(); }
  });
});
