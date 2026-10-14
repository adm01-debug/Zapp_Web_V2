// setup-watch do gmail-sync (ação manual que o cron renova sozinho).
//
// Defeito coberto: o diff deste cartão mudou o comportamento do `setup-watch`
// (fallback de tópico, 400 explícito, erro do UPDATE que antes era engolido,
// history_id preservado, vencimento validado) sem nenhum teste — e o cartão
// exige teste dos arquivos tocados. Estes testes chamam o handler REAL
// (`handleGmailSync`) com o cliente Supabase REAL (createClient) e o `fetch`
// roteado por pathname:
//
//   (a) pedido sem topic_name + GMAIL_PUBSUB_TOPIC no ambiente → o tópico do
//       ambiente vai no POST /watch e o vencimento novo é gravado;
//   (b) sem tópico no pedido nem no ambiente → 400 'Missing topic_name' SEM
//       chamar /watch;
//   (c) erro no UPDATE de gmail_accounts → 500 em vez de sucesso (antes o erro
//       era engolido e a resposta dizia success);
//   (d) Gmail sem historyId → o history_id antigo é preservado (antes era
//       sobrescrito por undefined, zerando o cursor do CAS);
//   (e) expiration ausente → erro sem gravar nada;
//   (f) expiration inválida ('nao-numero') → erro sem gravar nada.
//
// Sem rede real: URL não roteada cai no fetch real e o teste falha alto.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/gmail-sync/setup-watch.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleGmailSync } from "./index.ts";

const TOPIC_ENV = "GMAIL_PUBSUB_TOPIC";
const TOPIC = "projects/zapp-web/topics/gmail-push";
const ACCOUNT_ID = "4a000000-0000-4000-8000-0000000000a1";
const USER_ID = "4a000000-0000-4000-8000-0000000000ff";
const HISTORY_LIDO = "77";
const GMAIL_WATCH_PATH = "/gmail/v1/users/me/watch";
const ACCOUNTS_PATH = "/rest/v1/gmail_accounts";
const DIA = 24 * 60 * 60 * 1000;

const ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  TOPIC_ENV,
] as const;

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const anteriores = new Map<string, string | undefined>();
  for (const [chave, valor] of Object.entries(vars)) {
    anteriores.set(chave, Deno.env.get(chave));
    if (valor === undefined) Deno.env.delete(chave);
    else Deno.env.set(chave, valor);
  }
  return fn().finally(() => {
    for (const [chave, valor] of anteriores) {
      if (valor === undefined) Deno.env.delete(chave);
      else Deno.env.set(chave, valor);
    }
  });
}

const ambienteBase = (topic?: string) => ({
  SUPABASE_URL: "https://stub.supabase.co",
  SUPABASE_ANON_KEY: "anon-de-teste",
  SUPABASE_SERVICE_ROLE_KEY: "srk-de-teste",
  [TOPIC_ENV]: topic,
});

type Row = Record<string, unknown>;
type Route = {
  method: string;
  path: string;
  status?: number;
  body?: unknown;
  handler?: (url: URL, body: unknown) => { status?: number; body: unknown };
};
type Call = { method: string; url: string; path: string; body: unknown };

function withFetch(routes: Route[]) {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request).url;
    const alvo = new URL(url);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const route = routes.find((r) => r.method === method && r.path === alvo.pathname);
    if (!route) return original(input as RequestInfo, init);
    let body: unknown = null;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    calls.push({ method, url: alvo.toString(), path: alvo.pathname, body });
    const out = route.handler ? route.handler(alvo, body) : { status: route.status ?? 200, body: route.body };
    return Promise.resolve(
      new Response(out.body === undefined ? null : JSON.stringify(out.body), {
        status: out.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const contaLida = (): Row => ({
  id: ACCOUNT_ID,
  email_address: "conta@example.invalid",
  is_active: true,
  sync_status: "synced",
  token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
  history_id: HISTORY_LIDO,
  user_id: USER_ID,
});

/** Mini-armazém de UMA linha: o PATCH só atualiza se TODOS os `eq.` casarem. */
function gmailAccountsStore(seed: Row, patchStatus = 200) {
  const row = { ...seed };
  const handlePatch = (url: URL, body: unknown) => {
    if (patchStatus >= 400) return { status: patchStatus, body: { message: "falha simulada no update" } };
    const filtros = [...url.searchParams.entries()]
      .filter(([col, val]) => col !== "select" && val.startsWith("eq."));
    const casou = filtros.every(([col, val]) => String(row[col] ?? "") === val.slice(3));
    if (!casou) return { body: [] as Row[] };
    Object.assign(row, body as Row);
    return { body: [{ id: row.id }] };
  };
  return { row, handlePatch };
}

const supabaseClient = () =>
  createClient("https://stub.supabase.co", "srk-de-teste") as unknown as SupabaseClient;

/** Rotas que todo cenário precisa: auth, leitura da conta e tokens (válidos). */
function rotasBase(store: ReturnType<typeof gmailAccountsStore>, watchBody: unknown): Route[] {
  return [
    { method: "GET", path: "/auth/v1/user", body: { id: USER_ID, aud: "authenticated" } },
    { method: "GET", path: ACCOUNTS_PATH, body: contaLida() },
    {
      method: "POST",
      path: "/rest/v1/rpc/get_gmail_tokens",
      body: [{ access_token: "tok-1", refresh_token: "ref-1" }],
    },
    { method: "POST", path: GMAIL_WATCH_PATH, body: watchBody },
    { method: "PATCH", path: ACCOUNTS_PATH, handler: store.handlePatch },
  ];
}

const pedido = (corpo: unknown) =>
  new Request("https://stub.supabase.co/functions/v1/gmail-sync", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer tok-usuario" },
    body: JSON.stringify(corpo),
  });

const chamadasWatch = (calls: Call[]) =>
  calls.filter((c) => c.method === "POST" && c.path === GMAIL_WATCH_PATH);
const chamadasPatch = (calls: Call[]) =>
  calls.filter((c) => c.method === "PATCH" && c.path === ACCOUNTS_PATH);

// ---------------------------------------------------------------------------
// (a) tópico do ambiente quando o pedido não traz topic_name
// ---------------------------------------------------------------------------
Deno.test("setup-watch sem topic_name usa o GMAIL_PUBSUB_TOPIC e grava o vencimento", async () => {
  const novoVencimento = Date.now() + 7 * DIA;
  const store = gmailAccountsStore(contaLida());
  const router = withFetch(
    rotasBase(store, { expiration: String(novoVencimento), historyId: "99" }),
  );
  try {
    await withEnv(ambienteBase(TOPIC), async () => {
      const res = await handleGmailSync(
        pedido({ action: "setup-watch", account_id: ACCOUNT_ID }),
      );
      assertEquals(res.status, 200);
      const corpo = await res.json();
      assertEquals(corpo.success, true);

      const enviadas = chamadasWatch(router.calls);
      assertEquals(enviadas.length, 1, "uma única chamada a /watch");
      assertEquals(
        (enviadas[0].body as Record<string, unknown>).topicName,
        TOPIC,
        "o tópico do ambiente vai para o Gmail",
      );
      assertEquals(chamadasPatch(router.calls).length, 1);
      assertEquals(
        store.row.watch_expiration,
        new Date(novoVencimento).toISOString(),
        "o vencimento novo foi registrado",
      );
      assertEquals(store.row.history_id, "99");
    });
  } finally {
    router.restore();
  }
});

// ---------------------------------------------------------------------------
// (b) sem tópico em lugar nenhum → 400 sem chamar /watch
// ---------------------------------------------------------------------------
Deno.test("setup-watch sem tópico no pedido nem no ambiente: 400 sem chamar /watch", async () => {
  const store = gmailAccountsStore(contaLida());
  const router = withFetch(
    rotasBase(store, { expiration: String(Date.now() + 7 * DIA), historyId: "99" }),
  );
  try {
    await withEnv(ambienteBase(undefined), async () => {
      const res = await handleGmailSync(
        pedido({ action: "setup-watch", account_id: ACCOUNT_ID }),
      );
      assertEquals(res.status, 400);
      const corpo = await res.json();
      assert(
        String(corpo.error ?? "").includes("Missing topic_name"),
        `o motivo tem de dizer Missing topic_name: ${JSON.stringify(corpo)}`,
      );
      assertEquals(chamadasWatch(router.calls).length, 0, "sem destino não chama /watch");
      assertEquals(chamadasPatch(router.calls).length, 0, "sem destino não escreve nada");
    });
  } finally {
    router.restore();
  }
});

// ---------------------------------------------------------------------------
// (c) erro no UPDATE vira 500 em vez de sucesso
// ---------------------------------------------------------------------------
Deno.test("setup-watch com erro no UPDATE: 500 em vez de success", async () => {
  const store = gmailAccountsStore(contaLida(), 500);
  const router = withFetch(
    rotasBase(store, { expiration: String(Date.now() + 7 * DIA), historyId: "99" }),
  );
  try {
    await withEnv(ambienteBase(TOPIC), async () => {
      const res = await handleGmailSync(
        pedido({ action: "setup-watch", account_id: ACCOUNT_ID, topic_name: TOPIC }),
      );
      assertEquals(res.status, 500, "falha ao persistir não pode responder sucesso");
      const corpo = await res.json();
      assertEquals(corpo.success, undefined, "resposta de erro não traz success:true");
      assertEquals(chamadasWatch(router.calls).length, 1, "o /watch foi chamado antes do UPDATE");
      assertEquals(chamadasPatch(router.calls).length, 1, "o UPDATE foi tentado");
    });
  } finally {
    router.restore();
  }
});

// ---------------------------------------------------------------------------
// (d) Gmail sem historyId → history_id antigo preservado
// ---------------------------------------------------------------------------
Deno.test("setup-watch sem historyId no retorno: preserva o history_id lido", async () => {
  const novoVencimento = Date.now() + 7 * DIA;
  const store = gmailAccountsStore(contaLida());
  // historyId nulo explícito: o código antigo copiava o nulo para a coluna e
  // zerava o cursor do CAS; o novo mantém o valor lido.
  const router = withFetch(
    rotasBase(store, { expiration: String(novoVencimento), historyId: null }),
  );
  try {
    await withEnv(ambienteBase(undefined), async () => {
      const res = await handleGmailSync(
        pedido({ action: "setup-watch", account_id: ACCOUNT_ID, topic_name: TOPIC }),
      );
      assertEquals(res.status, 200);
      assertEquals(
        store.row.history_id,
        HISTORY_LIDO,
        "sem historyId novo o cursor do CAS não pode ser zerado",
      );
      assertEquals(
        store.row.watch_expiration,
        new Date(novoVencimento).toISOString(),
        "o vencimento continua sendo registrado",
      );
    });
  } finally {
    router.restore();
  }
});

// ---------------------------------------------------------------------------
// (e) expiration ausente → erro sem gravar
// ---------------------------------------------------------------------------
Deno.test("setup-watch sem expiration no retorno: erro sem gravar", async () => {
  const store = gmailAccountsStore(contaLida());
  const router = withFetch(rotasBase(store, { historyId: "99" }));
  try {
    await withEnv(ambienteBase(undefined), async () => {
      const res = await handleGmailSync(
        pedido({ action: "setup-watch", account_id: ACCOUNT_ID, topic_name: TOPIC }),
      );
      assertEquals(res.status, 500, "vencimento ausente não pode virar success");
      assertEquals(chamadasPatch(router.calls).length, 0, "vencimento ausente não grava nada");
      assertEquals(store.row.watch_expiration, undefined);
      assertEquals(store.row.history_id, HISTORY_LIDO);
    });
  } finally {
    router.restore();
  }
});

// ---------------------------------------------------------------------------
// (f) expiration inválida → erro sem gravar
// ---------------------------------------------------------------------------
Deno.test("setup-watch com expiration inválida: erro sem gravar", async () => {
  const store = gmailAccountsStore(contaLida());
  const router = withFetch(rotasBase(store, { expiration: "nao-numero", historyId: "99" }));
  try {
    await withEnv(ambienteBase(undefined), async () => {
      const res = await handleGmailSync(
        pedido({ action: "setup-watch", account_id: ACCOUNT_ID, topic_name: TOPIC }),
      );
      assertEquals(res.status, 500, "vencimento inválido não pode virar success");
      assertEquals(chamadasPatch(router.calls).length, 0, "vencimento inválido não grava nada");
      assertEquals(store.row.watch_expiration, undefined);
      assertEquals(store.row.history_id, HISTORY_LIDO);
    });
  } finally {
    router.restore();
  }
});
