// Prova o que o cron faz quando a conta PRECISA de ação humana — o ponto que o
// app depende para não mentir na tela de contas do Gmail:
//  (1) execução mista: a conta devida sincroniza e a `reauth_required` fica de
//      fora do `results` — o cron não lê os tokens dela, não bate no Google e
//      não escreve nada nela (uma execução real nunca é só de conta parada);
//  (2) token revogado na renovação (`invalid_grant`) vira `sync_status =
//      'reauth_required'` SEM `next_attempt_at`/`error_count`: não é espera
//      transitória, é reconexão manual — e o `last_error` não carrega token nem
//      e-mail.
//
// Rodar: deno test --config scripts/ci/deno.json --allow-env \
//   supabase/functions/gmail-cron-sync/index.test.ts
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleGmailCronSync } from "./index.ts";

const SUPABASE_URL = "https://projeto-de-teste.invalid";
const SERVICE_KEY = "service-role-key-teste";
const CRON_SECRET = "segredo-do-cron-teste";

const AGORA = Date.now();
const PASSADO = new Date(AGORA - 60 * 60 * 1000).toISOString();
const FUTURO = new Date(AGORA + 60 * 60 * 1000).toISOString();

const USER = "00000000-0000-4000-8000-000000000001";
const CONTA_DEVida = "00000000-0000-4000-8000-0000000000cc";
const CONTA_REAUTH = "00000000-0000-4000-8000-0000000000aa";

interface Captura { method: string; url: string; body: unknown }
interface Estado {
  contas: Array<Record<string, unknown>>;
  capturas: Captura[];
  /** Corpo da resposta do Google à renovação do token. */
  respostaDoToken: () => Response;
}

function resposta(body: unknown, status = 200): Response {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function roteador(estado: Estado): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input as RequestInfo, init);
    const url = new URL(req.url);
    const metodo = req.method.toUpperCase();
    let corpo: unknown;
    try { corpo = await req.clone().json(); } catch { corpo = undefined; }
    estado.capturas.push({ method: metodo, url: req.url, body: corpo });

    if (url.hostname === "oauth2.googleapis.com") return estado.respostaDoToken();
    if (url.hostname === "gmail.googleapis.com") {
      // Execução limpa: o histórico não traz mensagem nova, só o cursor adiante.
      return resposta({ history: [], historyId: "400" });
    }
    if (url.pathname.endsWith("/rest/v1/gmail_accounts") && metodo === "GET") return resposta(estado.contas);
    if (url.pathname.endsWith("/rest/v1/gmail_accounts") && metodo === "PATCH") return resposta([{ id: "ok" }]);
    if (url.pathname.endsWith("/rest/v1/rpc/get_gmail_tokens")) {
      return resposta([{ access_token: "access-antigo", refresh_token: "refresh-1" }]);
    }
    if (url.pathname.endsWith("/rest/v1/rpc/store_gmail_tokens")) return resposta(null, 204);
    throw new Error(`fetch não roteado no teste: ${metodo} ${req.url}`);
  }) as typeof fetch;
}

async function comAmbiente(estado: Estado, corpo: () => Promise<void>): Promise<void> {
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = roteador(estado);
  Deno.env.set("SUPABASE_URL", SUPABASE_URL);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY);
  Deno.env.set("GOOGLE_CLIENT_ID", "client-id-teste");
  Deno.env.set("GOOGLE_CLIENT_SECRET", "client-secret-teste");
  Deno.env.set("CRON_SECRET", CRON_SECRET);
  try {
    await corpo();
  } finally {
    globalThis.fetch = fetchOriginal;
    for (const chave of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "CRON_SECRET"]) {
      Deno.env.delete(chave);
    }
  }
}

function requisicaoCron(): Request {
  return new Request(`${SUPABASE_URL}/functions/v1/gmail-cron-sync`, {
    method: "POST",
    headers: { "x-cron-secret": CRON_SECRET },
  });
}

function contaDevida(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: CONTA_DEVida, user_id: USER, token_expires_at: FUTURO, history_id: "300",
    is_active: true, sync_status: "synced", error_count: 0, next_attempt_at: null, ...overrides,
  };
}

function contaRevogada(): Record<string, unknown> {
  return {
    id: CONTA_REAUTH, user_id: USER, token_expires_at: PASSADO, history_id: "100",
    is_active: true, sync_status: "reauth_required", error_count: 3, next_attempt_at: null,
  };
}

function patchesDeConta(estado: Estado): Captura[] {
  return estado.capturas.filter((c) => c.method === "PATCH" && new URL(c.url).pathname.endsWith("/rest/v1/gmail_accounts"));
}

Deno.test("execução mista: só a conta devida é sincronizada; a revogada não é tocada", async () => {
  const estado: Estado = {
    contas: [contaDevida(), contaRevogada()],
    capturas: [],
    respostaDoToken: () => resposta({ error: "invalid_grant" }, 400),
  };

  await comAmbiente(estado, async () => {
    const res = await handleGmailCronSync(requisicaoCron());
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body.success, true);
    assertEquals(body.results.length, 1, "a conta revogada não entra no results do cron");
    assertEquals(body.results[0].id, CONTA_DEVida);
    assertEquals(body.results[0].sync_status, undefined);

    // Nem token da revogada, nem Google para ela: o rpc de tokens foi chamado
    // uma única vez, e só para a conta devida.
    const leiturasDeToken = estado.capturas.filter((c) => c.url.includes("/rpc/get_gmail_tokens"));
    assertEquals(leiturasDeToken.length, 1);
    assertEquals((leiturasDeToken[0].body as { p_account_id?: string }).p_account_id, CONTA_DEVida);
    assertEquals(
      estado.capturas.filter((c) => new URL(c.url).hostname === "oauth2.googleapis.com").length,
      0,
      "token válido não pode disparar renovação",
    );
    const historico = estado.capturas.filter((c) => c.url.includes("/gmail/v1/users/me/history"));
    assertEquals(historico.length, 1);
    assert(historico[0].url.includes("startHistoryId=300"));

    // Nenhuma escrita na conta revogada (não zera espera, não mexe em last_error).
    const patches = patchesDeConta(estado);
    assert(patches.length > 0, "a conta devida deve ter o cursor avançado");
    assertEquals(patches.filter((c) => c.url.includes(CONTA_REAUTH)).length, 0);

    // O avanço do cursor vai com o CAS (history_id conhecido) e o novo cursor.
    const cas = patches.find((c) => (c.body as Record<string, unknown>)?.history_id === "400");
    assert(cas, "o cursor do histórico precisa ser gravado");
    assert(cas!.url.includes(`id=eq.${CONTA_DEVida}`));
    assert(cas!.url.includes("history_id=eq.300"), "CAS: só grava se o cursor lido ainda for o da conta");
    assertEquals((cas!.body as Record<string, unknown>).error_count, 0);
    assertEquals((cas!.body as Record<string, unknown>).next_attempt_at, null);
  });
});

Deno.test("token revogado na renovação vira reauth_required, sem espera e sem insistir no histórico", async () => {
  const estado: Estado = {
    contas: [contaDevida({ token_expires_at: PASSADO, error_count: 3 })],
    capturas: [],
    respostaDoToken: () => resposta({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400),
  };

  await comAmbiente(estado, async () => {
    const res = await handleGmailCronSync(requisicaoCron());
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body.results.length, 1);
    assertEquals(body.results[0].id, CONTA_DEVida);
    assert(String(body.results[0].error ?? "").length > 0, "a conta precisa sair com o erro no results");

    // Falhou na renovação: nem chega a pedir o histórico do Gmail.
    assertEquals(estado.capturas.filter((c) => c.url.includes("/history")).length, 0);

    const patches = patchesDeConta(estado);
    assertEquals(patches.length, 1, "uma única escrita de estado");
    const valores = patches[0].body as Record<string, unknown>;
    assertEquals(valores.sync_status, "reauth_required");
    assertFalse(
      Object.prototype.hasOwnProperty.call(valores, "next_attempt_at"),
      "reauth_required não é espera transitória: a conta só volta reconectando",
    );
    assertFalse(
      Object.prototype.hasOwnProperty.call(valores, "error_count"),
      "token revogado não conta como tentativa da espera crescente",
    );
    const lastError = String(valores.last_error ?? "");
    assert(lastError.includes("reconecte"), `last_error deve mandar reconectar: ${lastError}`);
    assertFalse(/[^\s@]+@[^\s@]+/.test(lastError), "last_error não pode carregar e-mail");
    assertFalse(/(ya29\.|1\/\/)[A-Za-z0-9._-]+/.test(lastError), "last_error não pode carregar token");
  });
});
