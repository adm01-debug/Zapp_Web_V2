// Prova a rota real do descarte: `trash` (mensagem) e `trash-thread` (conversa)
// em supabase/functions/gmail-send/index.ts — o que o app espera depois que o
// Google aceita a lixeira:
//  (1) a mensagem da conta é descartada no Gmail E o descarte é persistido no
//      banco local (label_ids/is_read/is_starred da mensagem e o estado da
//      thread dona), senão a mensagem continua aparecendo na caixa de entrada;
//  (2) mensagem que EXISTE mas é de outra conta devolve 404 e NÃO chega ao
//      Gmail — o 404 é de posse, não de existência (o controle com a mesma
//      mensagem na conta dona descarta de verdade);
//  (3) quando o Gmail responde sem os labelIds novos, a resposta é 200 com
//      `warning: local_persistence_failed` e nada é gravado no local.
//
// Rodar: deno test --config scripts/ci/deno.json --allow-env \
//   supabase/functions/gmail-send/index.test.ts
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleGmailSend } from "./index.ts";

const SUPABASE_URL = "https://projeto-de-teste.invalid";
const SERVICE_KEY = "service-role-key-teste";
const ANON_KEY = "anon-key-teste";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const CONTA_ID = "00000000-0000-4000-8000-0000000000aa";
const OUTRA_CONTA_ID = "00000000-0000-4000-8000-0000000000bb";
const TOKEN_VALIDO = "Bearer token-do-usuario-teste";

const MSG_DA_CONTA = "msg-da-conta";
const MSG_DE_OUTRA_CONTA = "msg-de-outra-conta";
const MSG_SEM_LABELS = "msg-sem-labels";
const THREAD_LOCAL = "thread-local-1";

const FUTURO = new Date(Date.now() + 60 * 60 * 1000).toISOString();

interface Captura { method: string; url: string; body: unknown }

interface Mensagem {
  id: string;
  gmail_message_id: string;
  gmail_account_id: string;
  thread_id: string | null;
  label_ids: string[];
  is_read: boolean;
  is_starred: boolean;
}

interface Estado {
  mensagens: Mensagem[];
  capturas: Captura[];
  /** Quando true, o Gmail responde o trash sem `labelIds`. */
  gmailSemLabels: boolean;
}

function resposta(body: unknown, status = 200): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function paramsDa(url: URL): (chave: string) => string | null {
  return (chave: string) => {
    const valor = url.searchParams.get(chave);
    return valor?.startsWith("eq.") ? valor.slice(3) : valor;
  };
}

function roteador(estado: Estado): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input as RequestInfo, init);
    const url = new URL(req.url);
    const metodo = req.method.toUpperCase();
    let corpo: unknown;
    try { corpo = await req.clone().json(); } catch { corpo = undefined; }
    estado.capturas.push({ method: metodo, url: req.url, body: corpo });

    if (url.pathname.endsWith("/auth/v1/user")) return resposta({ id: USER_ID, email: "usuario@teste.invalid" });

    if (url.pathname.endsWith("/rest/v1/gmail_accounts") && metodo === "GET") {
      return resposta({
        id: CONTA_ID, email_address: "conta@teste.invalid", is_active: true,
        token_expires_at: FUTURO, user_id: USER_ID,
      });
    }
    if (url.pathname.endsWith("/rest/v1/rpc/get_gmail_tokens")) {
      return resposta([{ access_token: "access-valido", refresh_token: "refresh-1" }]);
    }

    if (url.pathname.endsWith("/rest/v1/email_messages")) {
      const eq = paramsDa(url);
      if (metodo === "GET") {
        const id = eq("gmail_message_id");
        const threadId = eq("thread_id");
        let linhas = estado.mensagens;
        if (id) linhas = linhas.filter((m) => m.gmail_message_id === id);
        if (threadId) linhas = linhas.filter((m) => m.thread_id === threadId);
        const conta = eq("gmail_account_id");
        if (conta) linhas = linhas.filter((m) => m.gmail_account_id === conta);
        // `.maybeSingle()` (canônico da checagem de posse): objeto ou vazio, nunca lista.
        if ((req.headers.get("accept") ?? "").includes("vnd.pgrst.object")) return resposta(linhas[0] ?? null);
        return resposta(linhas);
      }
      if (metodo === "PATCH") {
        const filtros = paramsDa(url);
        const id = filtros("gmail_message_id");
        const conta = filtros("gmail_account_id");
        const valores = (corpo ?? {}) as Partial<Mensagem>;
        for (const mensagem of estado.mensagens) {
          if (id && mensagem.gmail_message_id !== id) continue;
          if (conta && mensagem.gmail_account_id !== conta) continue;
          if (Array.isArray(valores.label_ids)) mensagem.label_ids = valores.label_ids;
          if (typeof valores.is_read === "boolean") mensagem.is_read = valores.is_read;
          if (typeof valores.is_starred === "boolean") mensagem.is_starred = valores.is_starred;
        }
        return resposta(undefined, 204);
      }
    }

    if (url.pathname.endsWith("/rest/v1/email_threads")) {
      const filtros = paramsDa(url);
      if (metodo === "GET") {
        if (filtros("gmail_thread_id")) return resposta({ id: THREAD_LOCAL });
        return resposta(estado.mensagens.filter((m) => m.thread_id === filtros("thread_id")));
      }
      if (metodo === "PATCH") return resposta(undefined, 204);
    }

    if (url.pathname.endsWith("/rest/v1/gmail_accounts") && metodo === "PATCH") return resposta([{ id: CONTA_ID }]);

    if (url.hostname === "gmail.googleapis.com") {
      if (/\/messages\/[^/]+\/trash$/.test(url.pathname)) {
        const alvo = url.pathname.split("/")[3];
        if (estado.gmailSemLabels) return resposta({ id: alvo });
        return resposta({ id: alvo, threadId: "gmail-thread-1", labelIds: ["TRASH"] });
      }
      if (/\/threads\/[^/]+\/trash$/.test(url.pathname)) {
        return resposta({ id: "gmail-thread-1", labelIds: ["TRASH"] });
      }
    }
    throw new Error(`fetch não roteado no teste: ${metodo} ${req.url}`);
  }) as typeof fetch;
}

function mensagemBase(overrides: Partial<Mensagem>): Mensagem {
  return {
    id: "local-1", gmail_message_id: MSG_DA_CONTA, gmail_account_id: CONTA_ID,
    thread_id: THREAD_LOCAL, label_ids: ["INBOX", "UNREAD"], is_read: false, is_starred: false,
    ...overrides,
  };
}

async function comAmbiente(estado: Estado, corpo: () => Promise<void>): Promise<void> {
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = roteador(estado);
  Deno.env.set("SUPABASE_URL", SUPABASE_URL);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY);
  Deno.env.set("SUPABASE_ANON_KEY", ANON_KEY);
  Deno.env.set("GOOGLE_CLIENT_ID", "client-id-teste");
  Deno.env.set("GOOGLE_CLIENT_SECRET", "client-secret-teste");
  try {
    await corpo();
  } finally {
    globalThis.fetch = fetchOriginal;
    for (const chave of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]) {
      Deno.env.delete(chave);
    }
  }
}

function requisicao(action: string, accountId: string, extra: Record<string, unknown> = {}): Request {
  return new Request(`${SUPABASE_URL}/functions/v1/gmail-send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: TOKEN_VALIDO },
    body: JSON.stringify({ action, account_id: accountId, ...extra }),
  });
}

function patchDe(estado: Estado, tabela: string): Captura | undefined {
  return [...estado.capturas].reverse().find((c) => c.method === "PATCH" && new URL(c.url).pathname.endsWith(`/rest/v1/${tabela}`));
}

function trashNoGmail(estado: Estado): Captura[] {
  return estado.capturas.filter((c) => c.method === "POST" && /\/messages\/[^/]+\/trash$/.test(new URL(c.url).pathname));
}

Deno.test("trash: descarta no Gmail e persiste os rótulos novos na mensagem e na thread", async () => {
  const estado: Estado = { mensagens: [mensagemBase({})], capturas: [], gmailSemLabels: false };

  await comAmbiente(estado, async () => {
    const res = await handleGmailSend(requisicao("trash", CONTA_ID, { message_id: MSG_DA_CONTA }));
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body.success, true);
    assertEquals(body.warning, undefined, "descarte aplicado não pode voltar com aviso de persistência");

    // Foi até o Gmail na rota certa, com o id da mensagem.
    const chamadas = trashNoGmail(estado);
    assertEquals(chamadas.length, 1);
    assert(chamadas[0].url.includes(`/messages/${MSG_DA_CONTA}/trash`));

    // Persistiu na mensagem: TRASH entra, UNREAD sai (is_read passa a true).
    const patch = patchDe(estado, "email_messages");
    assert(patch, "precisa gravar os rótulos da mensagem descartada no banco local");
    const valores = patch!.body as Record<string, unknown>;
    assertEquals(valores.label_ids, ["TRASH"]);
    assertEquals(valores.is_read, true);

    // E na thread dona: sem INBOX, o estado vira 'archived'.
    const patchThread = patchDe(estado, "email_threads");
    assert(patchThread, "precisa recalcular a thread dona");
    const valoresThread = patchThread!.body as Record<string, unknown>;
    assertEquals(valoresThread.status, "archived");
    assertEquals(valoresThread.label_ids, ["TRASH"]);
    assertEquals(estado.mensagens[0].label_ids, ["TRASH"]);
  });
});

Deno.test("trash-thread: descarta a conversa no Gmail e arquiva a thread local", async () => {
  const estado: Estado = {
    mensagens: [mensagemBase({ gmail_message_id: MSG_DA_CONTA })],
    capturas: [],
    gmailSemLabels: false,
  };

  await comAmbiente(estado, async () => {
    const res = await handleGmailSend(requisicao("trash-thread", CONTA_ID, { thread_id: "gmail-thread-1" }));
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body.success, true);
    const chamadas = estado.capturas.filter((c) => new URL(c.url).pathname.includes("/threads/gmail-thread-1/trash"));
    assertEquals(chamadas.length, 1);
    const patchThread = patchDe(estado, "email_threads");
    assert(patchThread, "precisa marcar a thread local como descartada");
    assertEquals((patchThread!.body as Record<string, unknown>).label_ids, ["TRASH"]);
  });
});

Deno.test("trash: mensagem de OUTRA conta devolve 404 sem chegar ao Gmail (o 404 é de posse, não de existência)", async () => {
  // A mensagem EXISTE no banco (é o controle desta prova): pertence a outra conta.
  const estado: Estado = {
    mensagens: [mensagemBase({ gmail_message_id: MSG_DE_OUTRA_CONTA, gmail_account_id: OUTRA_CONTA_ID })],
    capturas: [],
    gmailSemLabels: false,
  };

  await comAmbiente(estado, async () => {
    const res = await handleGmailSend(requisicao("trash", CONTA_ID, { message_id: MSG_DE_OUTRA_CONTA }));
    const body = await res.json();

    assertEquals(res.status, 404);
    assertEquals(body.error, "Message not found for this account");
    assertEquals(trashNoGmail(estado).length, 0, "mensagem de outra conta não pode ser descartada no Gmail");
    assertEquals(patchDe(estado, "email_messages"), undefined, "não pode gravar nada da mensagem de outra conta");

    // Controle: a MESMA mensagem, agora na conta dona, é descartada de verdade.
    estado.mensagens[0].gmail_account_id = CONTA_ID;
    const proprio = await handleGmailSend(requisicao("trash", CONTA_ID, { message_id: MSG_DE_OUTRA_CONTA }));
    assertEquals(proprio.status, 200);
    assertEquals((await proprio.json()).success, true);
    assertEquals(trashNoGmail(estado).length, 1, "com a posse correta, o descarte chega ao Gmail");
  });
});

Deno.test("trash: Gmail sem labelIds devolve 200 com local_persistence_failed e não grava nada", async () => {
  const estado: Estado = { mensagens: [mensagemBase({})], capturas: [], gmailSemLabels: true };

  await comAmbiente(estado, async () => {
    const res = await handleGmailSend(requisicao("trash", CONTA_ID, { message_id: MSG_DA_CONTA }));
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body.success, true);
    assertEquals(body.warning, "local_persistence_failed");
    assertEquals(patchDe(estado, "email_messages"), undefined);
    assertEquals(estado.mensagens[0].label_ids, ["INBOX", "UNREAD"], "sem rótulo do Gmail, o local fica como estava");
    assertFalse(String(body.error ?? "").length > 0);
  });
});
