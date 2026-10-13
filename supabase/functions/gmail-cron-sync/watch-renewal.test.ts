// Renovação automática do watch de push do Gmail (gmail-cron-sync).
//
// Defeito coberto: `setup-watch` (gmail-sync) existia, mas só era chamado à mão
// e o watch do Gmail expira sozinho — quando ele caía, o push parava e ninguém
// era avisado (o polling do cron mascarava a perda). Agora o cron renova o watch
// de cada conta ativa antes de ele expirar e registra o novo vencimento.
//
// O que este teste trava, contra o cliente Supabase REAL (createClient) e a Gmail
// API em `globalThis.fetch` roteado:
//   (a) watch vencendo em <24h → POST /watch com o tópico configurado e o token
//       da conta, e PATCH em gmail_accounts gravando o NOVO vencimento;
//   (b) watch ainda válido (6 dias) → nenhuma chamada à Gmail, nenhuma escrita
//       (é o que torna a renovação idempotente entre execuções do cron);
//   (c) watch já vencido → renova igual;
//   (d) sem tópico configurado → `skipped_no_topic`, sem chamada e sem escrita
//       (o motivo é devolvido para não expirar em silêncio);
//   (e) Gmail responde 403 → `status: "error"`, sem escrita e SEM lançar (o sync
//       do dia continua; o polling cobre o push);
//   (f) o cron de ponta a ponta renova o watch E mantém o avanço do cursor
//       incremental na mesma execução;
//   (g) o cron de ponta a ponta NÃO chama /watch quando o watch está válido.
//
// Sem rede real: toda URL não roteada cai no fetch real e o teste falha alto.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/gmail-cron-sync/watch-renewal.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { Logger } from "../_shared/validation.ts";
import { GMAIL_WATCH_RENEWAL_WINDOW_MS, handleGmailCronSync, renewGmailWatchIfNeeded } from "./index.ts";

const TOPIC_ENV = "GMAIL_PUBSUB_TOPIC";
const TOPIC = "projects/zapp-web/topics/gmail-push";
const ACCOUNT_ID = "4a000000-0000-4000-8000-0000000000a1";
const ACCOUNT_EMAIL = "watch@example.invalid";
const GMAIL_WATCH_PATH = "/gmail/v1/users/me/watch";
const GMAIL_HISTORY_PATH = "/gmail/v1/users/me/history";
const ACCOUNTS_PATH = "/rest/v1/gmail_accounts";

const DIA = 24 * 60 * 60 * 1000;

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const anteriores = new Map<string, string | undefined>();
  for (const [chave, valor] of Object.entries(vars)) {
    anteriores.set(chave, Deno.env.get(chave));
    if (valor === undefined) Deno.env.delete(chave); else Deno.env.set(chave, valor);
  }
  return fn().finally(() => {
    for (const [chave, valor] of anteriores) {
      if (valor === undefined) Deno.env.delete(chave); else Deno.env.set(chave, valor);
    }
  });
}

type Row = Record<string, unknown>;
type Route = {
  method: string;
  path: string;
  status?: number;
  body?: unknown;
  handler?: (url: URL, body: unknown) => { status?: number; body: unknown };
};
type Call = { method: string; url: string; path: string; body: unknown; headers: Record<string, string> };

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
      try { body = JSON.parse(init.body); } catch { body = init.body; }
    }
    const headers: Record<string, string> = {};
    if (init?.headers) {
      if (init.headers instanceof Headers) init.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
      else if (Array.isArray(init.headers)) for (const [k, v] of init.headers) headers[k.toLowerCase()] = v;
      else for (const [k, v] of Object.entries(init.headers as Record<string, string>)) headers[k.toLowerCase()] = v;
    }
    calls.push({ method, url: alvo.toString(), path: alvo.pathname, body, headers });
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

/** Mini-armazém de UMA linha: o PATCH só atualiza se TODOS os `eq.` casarem. */
function gmailAccountsStore(seed: Row) {
  const row = { ...seed };
  const handlePatch = (url: URL, body: unknown) => {
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

const iso = (ms: number) => new Date(ms).toISOString();

const watchRoute = (expirationMs: number, historyId = "9"): Route => ({
  method: "POST",
  path: GMAIL_WATCH_PATH,
  body: { expiration: String(expirationMs), historyId },
});

const patchRoute = (store: ReturnType<typeof gmailAccountsStore>): Route => ({
  method: "PATCH", path: ACCOUNTS_PATH, handler: store.handlePatch,
});

const chamadasWatch = (calls: Call[]) => calls.filter((c) => c.method === "POST" && c.path === GMAIL_WATCH_PATH);
const chamadasPatch = (calls: Call[]) => calls.filter((c) => c.method === "PATCH" && c.path === ACCOUNTS_PATH);

// ---------------------------------------------------------------------------
// (a) renovação
// ---------------------------------------------------------------------------
Deno.test("watch vencendo em <24h: renova, envia o tópico e grava o novo vencimento", async () => {
  const novoVencimento = Date.now() + 7 * DIA;
  const vencimentoAntigo = iso(Date.now() + 1 * 3600_000);
  const store = gmailAccountsStore({ id: ACCOUNT_ID, watch_expiration: vencimentoAntigo });
  const router = withFetch([watchRoute(novoVencimento), patchRoute(store)]);
  try {
    await withEnv({ [TOPIC_ENV]: TOPIC }, async () => {
      const resultado = await renewGmailWatchIfNeeded(
        supabaseClient(),
        { id: ACCOUNT_ID, watch_expiration: vencimentoAntigo },
        "tok-1",
        new Logger("watch-renewal"),
      );
      assertEquals(resultado.status, "renewed");
      assertEquals(resultado.expiration, iso(novoVencimento));

      const enviadas = chamadasWatch(router.calls);
      assertEquals(enviadas.length, 1, "uma única chamada a /watch");
      const corpo = enviadas[0].body as Record<string, unknown>;
      assertEquals(corpo.topicName, TOPIC, "o tópico do ambiente vai para o Gmail");
      assertEquals(corpo.labelIds, ["INBOX"]);
      assertEquals(enviadas[0].headers["authorization"], "Bearer tok-1");

      assertEquals(chamadasPatch(router.calls).length, 1);
      assertEquals(store.row.watch_expiration, iso(novoVencimento), "o vencimento novo foi registrado");
    });
  } finally {
    router.restore();
  }
});

// ---------------------------------------------------------------------------
// (b) válido → não renova (idempotência entre execuções do cron)
// ---------------------------------------------------------------------------
Deno.test("watch válido por 6 dias: não chama /watch e não escreve nada", async () => {
  const vencimento = iso(Date.now() + 6 * DIA);
  const store = gmailAccountsStore({ id: ACCOUNT_ID, watch_expiration: vencimento });
  const router = withFetch([watchRoute(Date.now() + 7 * DIA), patchRoute(store)]);
  try {
    await withEnv({ [TOPIC_ENV]: TOPIC }, async () => {
      const resultado = await renewGmailWatchIfNeeded(
        supabaseClient(),
        { id: ACCOUNT_ID, watch_expiration: vencimento },
        "tok-1",
        new Logger("watch-renewal"),
      );
      assertEquals(resultado.status, "still_valid");
      assertEquals(resultado.expiration, vencimento);
      assertEquals(chamadasWatch(router.calls).length, 0, "watch válido não consome a API");
      assertEquals(chamadasPatch(router.calls).length, 0, "watch válido não reescreve a linha");
      assertEquals(store.row.watch_expiration, vencimento);
    });
  } finally {
    router.restore();
  }
});

// ---------------------------------------------------------------------------
// (c) já vencido → renova
// ---------------------------------------------------------------------------
Deno.test("watch já vencido (no passado): renova e atualiza o vencimento", async () => {
  const novoVencimento = Date.now() + 7 * DIA;
  const store = gmailAccountsStore({ id: ACCOUNT_ID, watch_expiration: iso(Date.now() - 2 * DIA) });
  const router = withFetch([watchRoute(novoVencimento), patchRoute(store)]);
  try {
    await withEnv({ [TOPIC_ENV]: TOPIC }, async () => {
      const resultado = await renewGmailWatchIfNeeded(
        supabaseClient(),
        { id: ACCOUNT_ID, watch_expiration: iso(Date.now() - 2 * DIA) },
        "tok-1",
        new Logger("watch-renewal"),
      );
      assertEquals(resultado.status, "renewed");
      assertEquals(chamadasWatch(router.calls).length, 1);
      assertEquals(store.row.watch_expiration, iso(novoVencimento));
    });
  } finally {
    router.restore();
  }
});

// ---------------------------------------------------------------------------
// (d) sem tópico → skip visível, sem chamada e sem escrita
// ---------------------------------------------------------------------------
Deno.test("sem tópico configurado: skipped_no_topic, sem chamada ao Gmail e sem escrita", async () => {
  const store = gmailAccountsStore({ id: ACCOUNT_ID, watch_expiration: null });
  const router = withFetch([watchRoute(Date.now() + 7 * DIA), patchRoute(store)]);
  try {
    await withEnv({ [TOPIC_ENV]: undefined }, async () => {
      const resultado = await renewGmailWatchIfNeeded(
        supabaseClient(),
        { id: ACCOUNT_ID, watch_expiration: null },
        "tok-1",
        new Logger("watch-renewal"),
      );
      assertEquals(resultado.status, "skipped_no_topic");
      assertEquals(chamadasWatch(router.calls).length, 0, "sem destino não inventa um tópico");
      assertEquals(chamadasPatch(router.calls).length, 0);
      assertEquals(store.row.watch_expiration, null);
    });
  } finally {
    router.restore();
  }
});

// ---------------------------------------------------------------------------
// (e) Gmail 403 → erro registrado, sem escrita, sem lançar
// ---------------------------------------------------------------------------
Deno.test("Gmail recusa a renovação (403): status error, sem escrita e sem lançar", async () => {
  const store = gmailAccountsStore({ id: ACCOUNT_ID, watch_expiration: null });
  const router = withFetch([
    { method: "POST", path: GMAIL_WATCH_PATH, status: 403, body: { error: { code: 403 } } },
    patchRoute(store),
  ]);
  try {
    await withEnv({ [TOPIC_ENV]: TOPIC }, async () => {
      const resultado = await renewGmailWatchIfNeeded(
        supabaseClient(),
        { id: ACCOUNT_ID, watch_expiration: null },
        "tok-1",
        new Logger("watch-renewal"),
      );
      assertEquals(resultado.status, "error");
      assertEquals(resultado.error?.includes("403"), true, "o status da recusa vai no motivo");
      assertEquals(chamadasPatch(router.calls).length, 0, "recusa não grava vencimento");
      assertEquals(store.row.watch_expiration, null);
    });
  } finally {
    router.restore();
  }
});

// ---------------------------------------------------------------------------
// (f)/(g) cron de ponta a ponta
// ---------------------------------------------------------------------------
function contaAtiva(watchExpiration: string): Row {
  return {
    id: ACCOUNT_ID,
    user_id: "4a000000-0000-4000-8000-0000000000ff",
    email_address: ACCOUNT_EMAIL,
    is_active: true,
    sync_status: "synced",
    token_expires_at: iso(Date.now() + 3600_000),
    history_id: "1",
    watch_expiration: watchExpiration,
  };
}

const cronRequest = () =>
  new Request("http://localhost/functions/v1/gmail-cron-sync", {
    method: "POST",
    headers: { "x-cron-secret": "segredo-do-cron" },
  });

const ambienteCron = (jwksNaoUsado?: string) => ({
  CRON_SECRET: "segredo-do-cron",
  SUPABASE_URL: "https://stub.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "srk-de-teste",
  [TOPIC_ENV]: TOPIC,
  __jwks: jwksNaoUsado,
});

function rotasCron(store: ReturnType<typeof gmailAccountsStore>, seed: Row, novoVencimento: number): Route[] {
  return [
    { method: "POST", path: "/rest/v1/rpc/get_gmail_tokens", body: [{ access_token: "tok-1", refresh_token: "ref-1" }] },
    { method: "GET", path: ACCOUNTS_PATH, body: [seed] },
    patchRoute(store),
    { method: "GET", path: GMAIL_HISTORY_PATH, body: { history: [], historyId: "2" } },
    watchRoute(novoVencimento),
  ];
}

Deno.test("cron: renova o watch vencendo e mantém o avanço do cursor incremental", async () => {
  const seed = contaAtiva(iso(Date.now() + 1 * 3600_000));
  const novoVencimento = Date.now() + 7 * DIA;
  const store = gmailAccountsStore({ ...seed });
  const router = withFetch(rotasCron(store, seed, novoVencimento));
  try {
    await withEnv(ambienteCron(), async () => {
      const res = await handleGmailCronSync(cronRequest());
      assertEquals(res.status, 200);
      const corpo = await res.json();
      assertEquals(corpo.success, true);
      assertEquals(corpo.results[0].id, ACCOUNT_ID);
      assertEquals(corpo.results[0].cursor_advanced, true, "o cursor incremental avançou na mesma execução");
      assertEquals(corpo.results[0].watch.status, "renewed", "a renovação aparece no resultado do cron");

      assertEquals(chamadasWatch(router.calls).length, 1);
      assertEquals(store.row.watch_expiration, iso(novoVencimento), "vencimento registrado pelo cron");
      const patchCursor = chamadasPatch(router.calls).find((c) => new URL(c.url).searchParams.get("history_id") === "eq.1");
      assert(patchCursor, "o PATCH do cursor continua protegido pelo history_id lido");
      assertEquals(store.row.history_id, "2");
    });
  } finally {
    router.restore();
  }
});

Deno.test("cron: watch válido não gera chamada a /watch (sem churn de API)", async () => {
  const seed = contaAtiva(iso(Date.now() + 6 * DIA));
  const store = gmailAccountsStore({ ...seed });
  const router = withFetch(rotasCron(store, seed, Date.now() + 7 * DIA));
  try {
    await withEnv(ambienteCron(), async () => {
      const res = await handleGmailCronSync(cronRequest());
      assertEquals(res.status, 200);
      const corpo = await res.json();
      assertEquals(corpo.results[0].watch.status, "still_valid");
      assertEquals(chamadasWatch(router.calls).length, 0, "watch válido não consome a API");
      assertEquals(store.row.watch_expiration, seed.watch_expiration);
      assertEquals(store.row.history_id, "2", "o sync incremental continua acontecendo");
    });
  } finally {
    router.restore();
  }
});

// A janela é a promessa do título: renovar ANTES de expirar. 24 h cobrem o cron
// diário com folga (o Gmail expira a assinatura em poucos dias).
Deno.test("janela de renovação é de 24h", () => {
  assertEquals(GMAIL_WATCH_RENEWAL_WINDOW_MS, 24 * 60 * 60 * 1000);
});
