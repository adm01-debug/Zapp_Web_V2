// Prova o contrato do cron do Gmail depois da classificação de falha:
//  (1) conta com token revogado (sync_status='reauth_required') e conta ainda
//      cumprindo a espera crescente NÃO são tentadas de novo — o cron não bate
//      no endpoint de token do Google nem lê os tokens delas;
//  (2) falha transitória conta a espera crescente (error_count + 1) e agenda
//      next_attempt_at, com last_error sem token nem e-mail.
//
// Rodar: deno test --config scripts/ci/deno.json --allow-env \
//   supabase/functions/gmail-cron-sync/reauth-e-backoff.test.ts
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleGmailCronSync } from "./index.ts";

const SUPABASE_URL = "https://projeto-de-teste.invalid";
const SERVICE_KEY = "service-role-key-teste";
const CRON_SECRET = "segredo-do-cron-teste";

const AGORA = Date.now();
const PASSADO = new Date(AGORA - 60 * 60 * 1000).toISOString();
const FUTURO = new Date(AGORA + 60 * 60 * 1000).toISOString();

const USER = "00000000-0000-4000-8000-000000000001";
const CONTA_REAUTH = "00000000-0000-4000-8000-0000000000aa";
const CONTA_ESPERA = "00000000-0000-4000-8000-0000000000bb";
const CONTA_DEVida = "00000000-0000-4000-8000-0000000000cc";

interface Captura { method: string; url: string; body: unknown }
interface Estado { contas: Array<Record<string, unknown>>; capturas: Captura[] }

function resposta(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function roteador(estado: Estado): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input as RequestInfo, init);
    const url = new URL(req.url);
    const metodo = req.method.toUpperCase();
    let corpo: unknown;
    try { corpo = await req.clone().json(); } catch { corpo = undefined; }
    estado.capturas.push({ method: metodo, url: req.url, body: corpo });

    if (url.hostname === "oauth2.googleapis.com") {
      // Falha TRANSITÓRIA (não é invalid_grant) — não pode virar reauth_required.
      return resposta({ error: "temporarily_unavailable", error_description: "backend down" }, 503);
    }
    if (url.pathname.endsWith("/rest/v1/gmail_accounts") && metodo === "GET") {
      return resposta(estado.contas);
    }
    if (url.pathname.endsWith("/rest/v1/gmail_accounts") && metodo === "PATCH") {
      const accountId = url.searchParams.get("id")?.replace(/^eq\./, "");
      const account = estado.contas.find((row) => row.id === accountId);
      const matches = account && [...url.searchParams.entries()].every(([column, filter]) => {
        if (column === "select" || column === "id") return true;
        const expected = filter.startsWith("eq.") ? filter.slice(3) : filter === "is.null" ? null : undefined;
        return expected === undefined || String(account[column] ?? "") === String(expected ?? "");
      });
      if (!matches || !account || !corpo || typeof corpo !== "object") return resposta([]);
      Object.assign(account, corpo, { updated_at: new Date(Date.now() + estado.capturas.length).toISOString() });
      return resposta([{ id: "ok", updated_at: account.updated_at }]);
    }
    if (url.pathname.endsWith("/rest/v1/rpc/get_gmail_tokens")) {
      return resposta([{ access_token: "access-antigo", refresh_token: "refresh-1" }]);
    }
    if (url.hostname === "gmail.googleapis.com") {
      return resposta({ historyId: "301", history: [] });
    }
    throw new Error(`fetch não roteado no teste: ${metodo} ${req.url}`);
  }) as typeof fetch;
}

function chamadoPara(estado: Estado, hostname: string): Captura[] {
  return estado.capturas.filter((c) => new URL(c.url).hostname === hostname);
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
  return new Request("https://projeto-de-teste.invalid/functions/v1/gmail-cron-sync", {
    method: "POST",
    headers: { "x-cron-secret": CRON_SECRET },
  });
}

Deno.test("cron não bate no Google para conta revogada nem para conta em espera", async () => {
  const estado: Estado = {
    contas: [
      { id: CONTA_REAUTH, user_id: USER, token_expires_at: PASSADO, history_id: "100", is_active: true, sync_status: "reauth_required", error_count: 3, next_attempt_at: null, updated_at: PASSADO },
      { id: CONTA_ESPERA, user_id: USER, token_expires_at: PASSADO, history_id: "200", is_active: true, sync_status: "error", error_count: 2, next_attempt_at: FUTURO, updated_at: PASSADO },
    ],
    capturas: [],
  };

  await comAmbiente(estado, async () => {
    const res = await handleGmailCronSync(requisicaoCron());
    const body = await res.json();
    assertEquals(res.status, 200);
    assertEquals(body.skipped, 2);
    assertEquals(body.synced, 0);
    assertEquals(chamadoPara(estado, "oauth2.googleapis.com").length, 0, "não pode chamar o endpoint de token do Google");
    assertEquals(estado.capturas.filter((c) => c.url.includes("/rpc/get_gmail_tokens")).length, 0, "não deve nem ler os tokens de conta não devida");
    assertEquals(chamadoPara(estado, "gmail.googleapis.com").length, 0);
  });
});

Deno.test("falha transitória conta a espera crescente e agenda next_attempt_at", async () => {
  const estado: Estado = {
    contas: [
      { id: CONTA_DEVida, user_id: USER, token_expires_at: PASSADO, history_id: "300", is_active: true, sync_status: "error", error_count: 1, next_attempt_at: null, updated_at: PASSADO },
    ],
    capturas: [],
  };

  await comAmbiente(estado, async () => {
    const inicioPrimeira = Date.now();
    const res = await handleGmailCronSync(requisicaoCron());
    const body = await res.json();
    assertEquals(res.status, 200);

    // Tenta renovar de verdade (1 chamada ao Google) e registra a falha transitória.
    assertEquals(chamadoPara(estado, "oauth2.googleapis.com").length, 1, "conta devida deve ser tentada");

    const patches = estado.capturas.filter(
      (c) => c.method === "PATCH" && new URL(c.url).pathname.endsWith("/rest/v1/gmail_accounts"),
    ).filter((c) => (c.body as Record<string, unknown>)?.sync_status !== "syncing");
    assertEquals(patches.length, 1, "deve registrar uma falha por tentativa, além do claim atômico");
    const valores = patches[0].body as Record<string, unknown>;
    assertEquals(valores.sync_status, "error");
    assertEquals(valores.error_count, 2, "espera crescente conta a partir das falhas seguidas");
    const next = new Date(String(valores.next_attempt_at)).getTime();
    assert(next - inicioPrimeira >= 120_000 && next - inicioPrimeira < 125_000, "segunda falha agenda retry em 2 minutos");
    const lastError = String(valores.last_error ?? "");
    assertFalse(/[^\s@]+@[^\s@]+/.test(lastError), "last_error não pode carregar e-mail");
    assertFalse(/(ya29\.|1\/\/)[A-Za-z0-9._-]+/.test(lastError), "last_error não pode carregar token");

    // Simula a passagem do prazo mantendo o contador persistido. A falha
    // seguinte deve avançar para a terceira janela (4 minutos).
    estado.contas[0].next_attempt_at = PASSADO;
    const inicioSegunda = Date.now();
    const segunda = await handleGmailCronSync(requisicaoCron());
    assertEquals(segunda.status, 200);
    assertEquals(chamadoPara(estado, "oauth2.googleapis.com").length, 2);
    const patchesAposSegunda = estado.capturas.filter(
      (c) => c.method === "PATCH" && new URL(c.url).pathname.endsWith("/rest/v1/gmail_accounts") && (c.body as Record<string, unknown>)?.sync_status !== "syncing",
    );
    assertEquals(patchesAposSegunda.length, 2);
    const segundaFalha = patchesAposSegunda[1].body as Record<string, unknown>;
    assertEquals(segundaFalha.error_count, 3);
    const proxima = new Date(String(segundaFalha.next_attempt_at)).getTime();
    assert(proxima - inicioSegunda >= 240_000 && proxima - inicioSegunda < 245_000, "terceira falha agenda retry em 4 minutos");
  });
});

Deno.test("sincronização incremental bem-sucedida zera a espera crescente", async () => {
  const estado: Estado = {
    contas: [
      { id: CONTA_DEVida, user_id: USER, token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), history_id: "300", is_active: true, sync_status: "error", error_count: 5, next_attempt_at: PASSADO, updated_at: PASSADO },
    ],
    capturas: [],
  };

  await comAmbiente(estado, async () => {
    const res = await handleGmailCronSync(requisicaoCron());
    assertEquals(res.status, 200);
    const patch = estado.capturas.find(
      (c) => c.method === "PATCH" && new URL(c.url).pathname.endsWith("/rest/v1/gmail_accounts") && Object.hasOwn(c.body as object, "history_id"),
    );
    assert(patch, "sucesso incremental deve persistir o cursor e o reset");
    const valores = patch!.body as Record<string, unknown>;
    assertEquals(valores.error_count, 0);
    assertEquals(valores.next_attempt_at, null);
    assertEquals(valores.last_error, null);
  });
});

Deno.test("dois cron concorrentes só fazem claim e consulta ao Gmail uma vez", async () => {
  const estado: Estado = {
    contas: [
      { id: CONTA_DEVida, user_id: USER, token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), history_id: "300", is_active: true, sync_status: "synced", error_count: 0, next_attempt_at: null, updated_at: PASSADO },
    ],
    capturas: [],
  };

  await comAmbiente(estado, async () => {
    const [primeira, segunda] = await Promise.all([
      handleGmailCronSync(requisicaoCron()),
      handleGmailCronSync(requisicaoCron()),
    ]);
    assertEquals(primeira.status, 200);
    assertEquals(segunda.status, 200);
    assertEquals(chamadoPara(estado, "gmail.googleapis.com").length, 1, "só o claim vencedor pode consultar/alterar o histórico remoto");
    const claims = estado.capturas.filter((capture) =>
      capture.method === "PATCH" && (capture.body as Record<string, unknown>)?.sync_status === "syncing"
    );
    assertEquals(claims.length, 2, "ambos tentam o CAS, mas o segundo deve receber zero linhas");
    assertEquals(estado.contas[0].sync_status, "synced", "o vencedor conclui e libera a conta");
  });
});
