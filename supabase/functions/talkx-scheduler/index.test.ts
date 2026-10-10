/**
 * X015 — contrato executável do talkx-scheduler.
 *
 * Trava o que a etapa promete:
 *   1. sem credencial → 401; com x-cron-secret do Vault (ou service key) → passa;
 *   2. pausada À MÃO não é retomada; pausadas por janela e por conexão
 *      restabelecida são (o total de POSTs start precisa bater);
 *   3. um talkx-send mudo não impede as demais chamadas (AbortController);
 *   4. no máximo MAX_CAMPAIGNS_PER_TICK campanhas por tick.
 *
 * Roda sem rede, sem banco e sem env: tudo entra por `_injected`.
 * Comando do CI: deno test --config scripts/ci/deno.json --frozen --allow-env <este arquivo>
 */
import { handleTalkxScheduler, MAX_CAMPAIGNS_PER_TICK, TALKX_SEND_TIMEOUT_MS } from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const TEST_SERVICE_KEY = "eyJtest.servicekey.forauth";
const TEST_CRON_SECRET = "cron-secret-talkx-test-64chars-for-timing-safe-comparison-xxxxxx";
const NOW = new Date("2026-10-02T12:00:00.000Z");

interface CampaignRow { [key: string]: unknown }

interface ClientOpts {
  due?: CampaignRow[];
  paused?: CampaignRow[];
  /** R2-INF-016: erro sintetico no select de campanhas agendadas (`schedErr`). */
  dueError?: string;
  connections?: Array<{ id: string; status: string | null }>;
  /** #121A: linha(s) de `talkx_settings` — `business_hours` chega como JSONB (objeto). */
  settings?: Array<{ key: string; value: unknown }>;
}

interface ClientCtx {
  dueQueries: number;
  pausedQueries: number;
  events: Array<Record<string, unknown>>;
}

/**
 * Client falso mínimo: responde `scheduled`/`paused` conforme o `.eq('status', ...)`
 * capturado, devolve conexões e grava inserts de eventos. Fiel à cadeia do PostgREST
 * (thenable), sem tocar banco nenhum.
 */
function makeClient(opts: ClientOpts): { client: unknown; ctx: ClientCtx } {
  const ctx: ClientCtx = { dueQueries: 0, pausedQueries: 0, events: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function from(table: string): any {
    let status: string | null = null;
    const resolveRows = () => {
      if (table === "talkx_campaigns") {
        if (status === "scheduled") {
          ctx.dueQueries += 1;
          return { data: opts.due ?? [], error: opts.dueError ? { message: opts.dueError } : null };
        }
        if (status === "paused") {
          ctx.pausedQueries += 1;
          return { data: opts.paused ?? [], error: null };
        }
        return { data: [], error: null };
      }
      if (table === "whatsapp_connections") return { data: opts.connections ?? [], error: null };
      // #121A: o scheduler lê talkx_settings.business_hours (JSONB) antes de retomar
      if (table === "talkx_settings") return { data: opts.settings ?? [], error: null };
      if (table === "talkx_campaign_events") return { data: null, error: null };
      return { data: null, error: null };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: Record<string, any> = {};
    const chain = () => b;
    b.select = chain; b.not = chain; b.is = chain; b.lte = chain;
    b.in = chain; b.limit = chain; b.order = chain;
    b.eq = (col: string, val: unknown) => {
      if (col === "status") status = String(val);
      return b;
    };
    b.insert = (row: Record<string, unknown>) => {
      ctx.events.push(row);
      return Promise.resolve({ data: null, error: null });
    };
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(resolveRows()).then(res, rej);
    b.catch = (rej: (e: unknown) => unknown) => Promise.resolve(resolveRows()).catch(rej);
    return b;
  }
  return { client: { rpc: () => Promise.resolve({ data: null, error: null }), from }, ctx };
}

interface FetchOpts {
  /** índice (base 0) da chamada que nunca responde, se houver */
  hangAt?: number;
}

/**
 * fetch falso: grava URL+corpo de cada POST e responde `{success:true}`. A chamada
 * em `hangAt` fica pendente até o AbortController do handler disparar — é assim que
 * o timeout é exercitado sem esperar 10 s reais (o teste injeta `timeoutMs` curto).
 */
function makeFetch(opts: FetchOpts = {}): { posts: Array<{ url: string; body: Record<string, unknown> }>; impl: typeof fetch } {
  const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
  let index = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const impl = (input: any, init?: any): Promise<Response> => {
    const current = index++;
    let body: Record<string, unknown> = {};
    try {
      body = init?.body ? JSON.parse(String(init.body)) : {};
    } catch {
      body = {};
    }
    posts.push({ url: String(input), body });
    if (opts.hangAt !== undefined && current === opts.hangAt) {
      const signal = init?.signal as AbortSignal | undefined;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")));
      });
    }
    return Promise.resolve(
      new Response(JSON.stringify({ success: true, accepted: true, status: "sending" }), { status: 200 }),
    );
  };
  return { posts, impl: impl as unknown as typeof fetch };
}

function makeRequest(opts: { cronSecret?: string; bearer?: string } = {}): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.cronSecret !== undefined) headers["x-cron-secret"] = opts.cronSecret;
  if (opts.bearer !== undefined) headers["Authorization"] = `Bearer ${opts.bearer}`;
  return new Request("https://edge.test/talkx-scheduler", { method: "POST", headers, body: "{}" });
}

function makeDeps(o: {
  client: unknown;
  fetch?: typeof fetch;
  cronSecretValue?: string | null;
  timeoutMs?: number;
}): {
  supabase: unknown;
  serviceKey: string;
  env: (key: string) => string | undefined;
  now: Date;
  fetch?: typeof fetch;
  getCronSecret: () => Promise<string | null>;
  timeoutMs?: number;
} {
  return {
    supabase: o.client,
    serviceKey: TEST_SERVICE_KEY,
    env: (key: string) => (key === "SUPABASE_URL" ? "https://supabase-test.example" : undefined),
    now: NOW,
    fetch: o.fetch,
    getCronSecret: () => Promise.resolve(o.cronSecretValue ?? null),
    timeoutMs: o.timeoutMs,
  };
}

function dueRow(id: string): CampaignRow {
  return { id, name: id, scheduled_at: "2026-10-01T00:00:00.000Z", status: "scheduled" };
}

function pausedRow(id: string, overrides: CampaignRow = {}): CampaignRow {
  return {
    id,
    name: id,
    pause_reason: "send_window",
    whatsapp_connection_id: null,
    schedule_timezone: "UTC",
    send_window_start: "00:00",
    send_window_end: "23:59",
    business_hours_only: false,
    paused_at: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

// --------------------------------------------------------------------------- auth

Deno.test("X015 auth: sem x-cron-secret e sem Authorization → 401", async () => {
  const { client } = makeClient({});
  const res = await handleTalkxScheduler(makeRequest(), makeDeps({ client, cronSecretValue: TEST_CRON_SECRET }));
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Unauthorized", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("X015 auth: x-cron-secret errado → 401", async () => {
  const { client } = makeClient({});
  const res = await handleTalkxScheduler(
    makeRequest({ cronSecret: "segredo-errado" }),
    makeDeps({ client, cronSecretValue: TEST_CRON_SECRET }),
  );
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
});

Deno.test("X015 auth: x-cron-secret correto → passa e o tick sem campanhas fecha 200", async () => {
  const { client } = makeClient({});
  const res = await handleTalkxScheduler(
    makeRequest({ cronSecret: TEST_CRON_SECRET }),
    makeDeps({ client, cronSecretValue: TEST_CRON_SECRET }),
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();
  assert(body.success === true, `body inesperado: ${JSON.stringify(body)}`);
  assert(body.message === "No campaigns due or resumable", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("X015 auth: Authorization Bearer com a service key → passa (não é 401)", async () => {
  const { client } = makeClient({});
  const res = await handleTalkxScheduler(
    makeRequest({ bearer: TEST_SERVICE_KEY }),
    makeDeps({ client, cronSecretValue: TEST_CRON_SECRET }),
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
});

// --------------------------------------------------------------------------- retomada

Deno.test("X015 resume: 3 pausadas (manual, janela, conexão restabelecida) → exatamente 2 POSTs start", async () => {
  const paused = [
    pausedRow("c-manual", { pause_reason: "manual" }),
    pausedRow("c-window", { pause_reason: "send_window" }),
    pausedRow("c-conn", {
      pause_reason: "connection_lost",
      whatsapp_connection_id: "conn-1",
      send_window_start: null,
      send_window_end: null,
    }),
  ];
  const { client } = makeClient({ paused, connections: [{ id: "conn-1", status: "connected" }] });
  const fake = makeFetch();
  const res = await handleTalkxScheduler(
    makeRequest({ cronSecret: TEST_CRON_SECRET }),
    makeDeps({ client, fetch: fake.impl, cronSecretValue: TEST_CRON_SECRET }),
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();
  assert(fake.posts.length === 2, `esperado 2 POSTs start, recebido ${fake.posts.length}`);
  assert(fake.posts.every((p) => p.body.action === "start"), "todo POST ao talkx-send deve ser action=start");
  const ids = fake.posts.map((p) => String(p.body.campaignId)).sort().join(",");
  assert(ids === "c-conn,c-window", `só janela e conexão retomam; vieram: ${ids}`);
  assert(body.resumed === 2, `esperado resumed:2, recebido ${body.resumed}`);
  assert(body.started === 0, `esperado started:0, recebido ${body.started}`);
});

Deno.test("X015 resume: no máximo 1 retomada por conexão no mesmo tick", async () => {
  const paused = [
    pausedRow("c-conn-1", { pause_reason: "connection_lost", whatsapp_connection_id: "conn-1", send_window_start: null, send_window_end: null }),
    pausedRow("c-conn-2", { pause_reason: "connection_lost", whatsapp_connection_id: "conn-1", send_window_start: null, send_window_end: null }),
  ];
  const { client } = makeClient({ paused, connections: [{ id: "conn-1", status: "connected" }] });
  const fake = makeFetch();
  const res = await handleTalkxScheduler(
    makeRequest({ cronSecret: TEST_CRON_SECRET }),
    makeDeps({ client, fetch: fake.impl, cronSecretValue: TEST_CRON_SECRET }),
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  assert(fake.posts.length === 1, `esperado 1 POST (1 por conexão), recebido ${fake.posts.length}`);
});

// --------------------------------------------------------------------------- timeout

Deno.test("X015 timeout: talkx-send mudo não impede as demais chamadas", async () => {
  const { client } = makeClient({ due: [dueRow("due-hang"), dueRow("due-ok")] });
  const fake = makeFetch({ hangAt: 0 });
  const res = await handleTalkxScheduler(
    makeRequest({ cronSecret: TEST_CRON_SECRET }),
    // timeout curto no lugar dos 10 s reais (o valor de produção é pinado abaixo).
    makeDeps({ client, fetch: fake.impl, cronSecretValue: TEST_CRON_SECRET, timeoutMs: 25 }),
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();
  assert(fake.posts.length === 2, `as duas campanhas devem ser tentadas, foram ${fake.posts.length}`);
  assert(body.started === 1, `esperado started:1 (a segunda passou), recebido ${body.started}`);
  assert(body.failed === 1, `esperado failed:1 (a muda abortou), recebido ${body.failed}`);
  assert(body.details.some((d: { error?: string }) => d.error?.includes("aborted")), `detalhe do aborto ausente: ${JSON.stringify(body.details)}`);
});

// --------------------------------------------------------------------------- teto do tick

Deno.test(`X015 teto: ${MAX_CAMPAIGNS_PER_TICK + 2} vencidas → ${MAX_CAMPAIGNS_PER_TICK} chamadas`, async () => {
  const due = Array.from({ length: MAX_CAMPAIGNS_PER_TICK + 2 }, (_, i) => dueRow(`due-${String(i).padStart(2, "0")}`));
  const { client } = makeClient({ due });
  const fake = makeFetch();
  const res = await handleTalkxScheduler(
    makeRequest({ cronSecret: TEST_CRON_SECRET }),
    makeDeps({ client, fetch: fake.impl, cronSecretValue: TEST_CRON_SECRET }),
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();
  assert(fake.posts.length === MAX_CAMPAIGNS_PER_TICK, `esperado ${MAX_CAMPAIGNS_PER_TICK} POSTs, recebido ${fake.posts.length}`);
  assert(body.started === MAX_CAMPAIGNS_PER_TICK, `esperado started:${MAX_CAMPAIGNS_PER_TICK}, recebido ${body.started}`);
});

// ---------------------------------------------------------------------- limites pinados

Deno.test("X015 limites: timeout de produção é 10 s e o teto do tick é 10", () => {
  assert(TALKX_SEND_TIMEOUT_MS === 10_000, `timeout de produção deveria ser 10 s, é ${TALKX_SEND_TIMEOUT_MS}`);
  assert(MAX_CAMPAIGNS_PER_TICK === 10, `teto do tick deveria ser 10, é ${MAX_CAMPAIGNS_PER_TICK}`);
});

// --------------------------------------------------------------------------- X025

Deno.test("X025: retomada automática NÃO grava evento próprio (a transição grava)", async () => {
  const paused = [
    pausedRow("c-conn", {
      pause_reason: "connection_lost",
      whatsapp_connection_id: "conn-1",
      send_window_start: null,
      send_window_end: null,
    }),
  ];
  const { client, ctx } = makeClient({ paused, connections: [{ id: "conn-1", status: "connected" }] });
  const fake = makeFetch();
  const res = await handleTalkxScheduler(
    makeRequest({ cronSecret: TEST_CRON_SECRET }),
    makeDeps({ client, fetch: fake.impl, cronSecretValue: TEST_CRON_SECRET }),
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  assert(fake.posts.length === 1, `esperado 1 POST de retomada, recebido ${fake.posts.length}`);
  const body = await res.json();
  assert(body.resumed === 1, `esperado resumed:1, recebido ${body.resumed}`);
  assert(ctx.events.length === 0, `o scheduler não pode gravar evento (gravou ${ctx.events.length})`);
});

// ── #121A: o scheduler lê talkx_settings.business_hours antes de retomar ─────

Deno.test("[#121A] retomada respeita o business_hours salvo (não usa o default às cegas)", async () => {
  // NOW = sexta 2026-10-02 12:00 UTC; a campanha só tem horário comercial.
  const paused = [
    pausedRow("c-bh", {
      pause_reason: "business_hours",
      business_hours_only: true,
      send_window_start: null,
      send_window_end: null,
    }),
  ];

  // 15:00–17:00 em UTC → 12:00 está FORA → não retoma. Antes o scheduler ignorava
  // a configuração, caía no default 08:00–18:00 e retomava a campanha.
  const fora = makeClient({
    paused,
    settings: [{ key: "business_hours", value: { start: "15:00", end: "17:00", tz: "UTC", days: [1, 2, 3, 4, 5] } }],
  });
  const fetchFora = makeFetch();
  const resFora = await handleTalkxScheduler(
    makeRequest({ cronSecret: TEST_CRON_SECRET }),
    makeDeps({ client: fora.client, fetch: fetchFora.impl, cronSecretValue: TEST_CRON_SECRET }),
  );
  assert(resFora.status === 200, `esperado 200, recebido ${resFora.status}`);
  const bodyFora = await resFora.json();
  assert(
    fetchFora.posts.length === 0,
    `fora do horário salvo não pode retomar (houve ${fetchFora.posts.length} POST)`,
  );
  // Sem nenhuma retomada o handler responde o resumo "nada devido" (sem `resumed`);
  // o que importa aqui é não ter havido POST: a campanha NÃO foi retomada.
  assert(bodyFora.success === true, `esperado success:true, recebido ${JSON.stringify(bodyFora)}`);

  // 08:00–18:00 em UTC → 12:00 está DENTRO → retoma (prova que leu a configuração)
  const dentro = makeClient({
    paused,
    settings: [{ key: "business_hours", value: { start: "08:00", end: "18:00", tz: "UTC", days: [1, 2, 3, 4, 5] } }],
  });
  const fetchDentro = makeFetch();
  const resDentro = await handleTalkxScheduler(
    makeRequest({ cronSecret: TEST_CRON_SECRET }),
    makeDeps({ client: dentro.client, fetch: fetchDentro.impl, cronSecretValue: TEST_CRON_SECRET }),
  );
  assert(resDentro.status === 200, `esperado 200, recebido ${resDentro.status}`);
  assert(fetchDentro.posts.length === 1, `dentro do horário salvo deve retomar (${fetchDentro.posts.length} POST)`);
});

// --------------------------------------------------------------------------- R2-INF-016

Deno.test("R2-INF-016: falha ao ler as campanhas agendadas → 500 sanitizado (sem detalhe do banco)", async () => {
  const SEGREDO = "relation talkx_campaigns does not exist (sintetico)";
  const linhas: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => { linhas.push(args.map((a) => String(a)).join(" ")); };
  try {
    const { client } = makeClient({ dueError: SEGREDO });
    const res = await handleTalkxScheduler(
      makeRequest({ cronSecret: TEST_CRON_SECRET }),
      makeDeps({ client, cronSecretValue: TEST_CRON_SECRET }),
    );
    assert(res.status === 500, `esperado 500, recebido ${res.status}`);
    const texto = await res.text();
    assert(!texto.includes(SEGREDO), `o corpo nao pode trazer o detalhe interno: ${texto}`);
    assert(JSON.parse(texto).error === "Internal server error", `corpo inesperado: ${texto}`);
    assert(
      linhas.some((l) => l.includes(SEGREDO)),
      `o detalhe interno precisa constar no log do servidor; capturado:\n${linhas.join("\n")}`,
    );
  } finally {
    console.error = originalError;
  }
});
