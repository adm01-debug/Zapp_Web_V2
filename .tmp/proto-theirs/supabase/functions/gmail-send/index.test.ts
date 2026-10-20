// R2-API (P3) — a ação `mark-read` do gmail-send marcava a thread como lida
// fazendo UMA chamada ao Gmail POR mensagem em série (thread com N não lidas =
// N chamadas numa Edge Function). O Gmail aceita `messages/batchModify` (até
// 1.000 ids) e remove o label UNREAD de todas de uma vez.
//
// O que este teste trava (roda a rota real `handleGmailSend`, fetch roteado):
//   1. Caminho normal: o lote inteiro vira UMA chamada a /messages/batchModify e
//      ZERO chamadas a /messages/{id}/modify; resposta 200 com updated_ids = todos
//      e failed_ids = [].
//   2. Estado local: is_read vira true só para os ids que o Gmail aceitou, e as
//      threads donas são recalculadas.
//   3. Checagem de dona preservada: um id que não é da conta → 404 e nenhuma
//      chamada ao Gmail.
//   4. Ramo de erro preservado (o lote é tudo-ou-nada): se o batchModify falha,
//      cai no tratamento por mensagem de antes, então `failed_ids` segue fiel
//      (as que dariam certo não se perdem) e a resposta é 207.
//
// Rodar: deno test --config scripts/ci/deno.json --allow-env \
//   supabase/functions/gmail-send/index.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleGmailSend } from "./index.ts";

const SUPABASE_URL = "https://projeto-de-teste.invalid";
const SERVICE_KEY = "service-role-key-teste";
const ANON_KEY = "anon-key-teste";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const CONTA_ID = "00000000-0000-4000-8000-0000000000aa";
const TOKEN_VALIDO = "Bearer token-do-usuario-teste";

// Token da conta ainda válido (não força refresh do Google).
const FUTURO = new Date(Date.now() + 60 * 60 * 1000).toISOString();

interface Captura { method: string; url: string; body: unknown }

function resposta(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type Cenario = {
  idOwnership: string[];       // ids que a conta possui (select dona)
  batchStatus?: number;        // status do /messages/batchModify (default 204)
  falhaPorId?: Record<string, number>; // ramo de erro: status por mensagem
  threadIds?: string[];        // threads das mensagens afetadas
  threadUnread?: string[];     // threads que seguem com mensagem não lida
};

function roteador(capturas: Captura[], cenario: Cenario): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input as RequestInfo, init);
    const url = new URL(req.url);
    const metodo = req.method.toUpperCase();
    let corpo: unknown;
    try { corpo = await req.clone().json(); } catch { corpo = undefined; }
    capturas.push({ method: metodo, url: req.url, body: corpo });

    if (url.pathname.endsWith("/auth/v1/user")) return resposta({ id: USER_ID, email: "usuario@teste.invalid" });
    if (url.pathname.endsWith("/rest/v1/gmail_accounts") && metodo === "GET") {
      return resposta({ id: CONTA_ID, email_address: "conta@teste.invalid", is_active: true, token_expires_at: FUTURO, user_id: USER_ID });
    }
    if (url.pathname.endsWith("/rest/v1/rpc/get_gmail_tokens")) {
      return resposta([{ access_token: "access-valido", refresh_token: "refresh-ok" }]);
    }
    if (url.pathname.endsWith("/rest/v1/email_messages") && metodo === "GET") {
      const select = url.searchParams.get("select") ?? "";
      if (select === "gmail_message_id") {
        return resposta(cenario.idOwnership.map((id) => ({ gmail_message_id: id })));
      }
      // select=thread_id
      if (url.searchParams.get("is_read") === "eq.false") {
        return resposta((cenario.threadUnread ?? []).map((id) => ({ thread_id: id })));
      }
      return resposta((cenario.threadIds ?? []).map((id) => ({ thread_id: id })));
    }
    if (url.pathname.endsWith("/rest/v1/email_messages") && metodo === "PATCH") return new Response(null, { status: 204 });
    if (url.pathname.endsWith("/rest/v1/email_threads") && metodo === "PATCH") return new Response(null, { status: 204 });

    if (url.hostname === "gmail.googleapis.com") {
      if (url.pathname.endsWith("/messages/batchModify")) {
        const status = cenario.batchStatus ?? 204;
        return status === 204 ? new Response(null, { status: 204 }) : resposta({ error: { message: "batch falhou" } }, status);
      }
      const porId = url.pathname.match(/\/messages\/([^/]+)\/modify$/);
      if (porId) {
        const status = cenario.falhaPorId?.[porId[1]] ?? 200;
        return resposta({ id: porId[1] }, status);
      }
    }
    throw new Error(`fetch não roteado no teste: ${metodo} ${req.url}`);
  }) as typeof fetch;
}

async function executar(cenario: Cenario, messageIds: string[]): Promise<{ status: number; body: Record<string, unknown>; capturas: Captura[] }> {
  const capturas: Captura[] = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = roteador(capturas, cenario);
  Deno.env.set("SUPABASE_URL", SUPABASE_URL);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY);
  Deno.env.set("SUPABASE_ANON_KEY", ANON_KEY);
  Deno.env.set("GOOGLE_CLIENT_ID", "client-id-teste");
  Deno.env.set("GOOGLE_CLIENT_SECRET", "client-secret-teste");
  try {
    const res = await handleGmailSend(new Request(`${SUPABASE_URL}/functions/v1/gmail-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: TOKEN_VALIDO },
      body: JSON.stringify({ action: "mark-read", account_id: CONTA_ID, message_ids: messageIds }),
    }));
    return { status: res.status, body: await res.json(), capturas };
  } finally {
    globalThis.fetch = fetchOriginal;
    for (const chave of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]) {
      Deno.env.delete(chave);
    }
  }
}

const chamadasGmail = (capturas: Captura[]) => capturas.filter((c) => c.url.includes("gmail.googleapis.com"));
const batchCalls = (capturas: Captura[]) => chamadasGmail(capturas).filter((c) => c.url.includes("/messages/batchModify"));
const modifyPorMensagem = (capturas: Captura[]) => chamadasGmail(capturas).filter((c) => /\/messages\/[^/]+\/modify$/.test(new URL(c.url).pathname));

Deno.test("mark-read: lote inteiro vira UMA chamada batchModify e atualiza todos", async () => {
  const ids = ["m1", "m2", "m3", "m4", "m5"];
  const { status, body, capturas } = await executar(
    { idOwnership: ids, threadIds: ["t1", "t2"] },
    ids,
  );

  assertEquals(status, 200);
  assertEquals(body.success, true);
  assertEquals(body.updated_ids, ids);
  assertEquals(body.failed_ids, []);

  // A prova do ganho: 1 chamada ao Gmail, nenhuma por mensagem.
  assertEquals(batchCalls(capturas).length, 1);
  assertEquals(modifyPorMensagem(capturas).length, 0);

  const batch = batchCalls(capturas)[0];
  assertEquals((batch.body as Record<string, unknown>).ids, ids);
  assertEquals((batch.body as Record<string, unknown>).removeLabelIds, ["UNREAD"]);

  // Estado local escopado pela conta, só nos ids aceitos.
  const patchMsg = capturas.find((c) => c.method === "PATCH" && new URL(c.url).pathname.endsWith("/rest/v1/email_messages"));
  assertEquals((patchMsg?.body as Record<string, unknown>)?.is_read, true);
  assertEquals(new URL(patchMsg!.url).searchParams.get("gmail_message_id"), `in.(${ids.join(",")})`);
  assertEquals(new URL(patchMsg!.url).searchParams.get("gmail_account_id"), `eq.${CONTA_ID}`);

  const patchThreads = capturas.filter((c) => c.method === "PATCH" && new URL(c.url).pathname.endsWith("/rest/v1/email_threads"));
  assertEquals(patchThreads.length, 2);
});

Deno.test("mark-read: id de outra conta devolve 404 e não chama o Gmail", async () => {
  const { status, capturas } = await executar(
    { idOwnership: ["m1", "m2"] }, // m3 não pertence à conta
    ["m1", "m2", "m3"],
  );

  assertEquals(status, 404);
  assertEquals(chamadasGmail(capturas).length, 0);
});

Deno.test("mark-read: batchModify falho preserva failed_ids fiel (207) via ramo por mensagem", async () => {
  const ids = ["m1", "m2", "m3"];
  const { status, body, capturas } = await executar(
    { idOwnership: ids, batchStatus: 500, falhaPorId: { m2: 404 }, threadIds: ["t1"] },
    ids,
  );

  assertEquals(status, 207);
  assertEquals(body.success, false);
  assertEquals(body.updated_ids, ["m1", "m3"]);
  assertEquals(body.failed_ids, ["m2"]);

  // O lote falho cai no tratamento por mensagem só neste ramo de erro.
  assertEquals(batchCalls(capturas).length, 1);
  assertEquals(modifyPorMensagem(capturas).length, 3);

  // Só os ids aceitos entram na escrita local.
  const patchMsg = capturas.find((c) => c.method === "PATCH" && new URL(c.url).pathname.endsWith("/rest/v1/email_messages"));
  assertEquals(new URL(patchMsg!.url).searchParams.get("gmail_message_id"), "in.(m1,m3)");
});
