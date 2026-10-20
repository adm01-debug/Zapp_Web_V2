// N-118 (refazer 2, ponto 3) — o bloqueio por DIAS DA SEMANA / DND só dispara
// se o motor ENXERGAR `send_weekdays` (e `respect_dnd`): na releitura por
// destinatário (talkx-send/index.ts) e na rechecagem imediatamente antes do
// envio (talkx-send/process-recipient.ts). O banco FAKE abaixo devolve SÓ as
// colunas pedidas no `select` — exatamente como o PostgREST faz. É isso que
// separa o certo do errado: com o select sem as colunas, o dia proibido some e
// a campanha ENVIA (vermelho); com as colunas, ela pausa (verde).
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleTalkxSend } from "./index.ts";
import {
  processRecipient,
  type ProcessRecipientDeps,
  type ProcessRecipientRow,
} from "./process-recipient.ts";
import { Logger } from "../_shared/validation.ts";
import { deliveryWindowStatus } from "../_shared/talkx-window.ts";
import {
  CAMPAIGN_ID,
  installFakeClock,
  makeCampaign,
  makeContinueDeps,
  makeContinueRecipients,
  makePost,
  mockProviderRecording,
  setDispatchEnv,
  TEST_CRON_SECRET,
  thenableQB,
} from "./_test-utils.ts";

const TZ = "America/Sao_Paulo";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** dow (0=domingo) de agora no fuso da campanha — o MESMO cálculo do helper. */
function weekdayNow(timeZone = TZ): number {
  const short = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone }).format(new Date());
  return WEEKDAYS.indexOf(short);
}

const messagePosts = (posts: Array<{ url: string }>) => posts.filter((p) => p.url.includes("/message/"));

/**
 * `from("talkx_campaigns")`: monta o builder PostgREST e devolve a linha
 * FILTRADA pelas colunas que o `select` pediu. `select("*")` devolve tudo.
 */
function makeColumnsAwareCampaignQB(
  rowProvider: () => Record<string, unknown> | null,
  requested: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  let cols = "*";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {};
  b.select = (c: string) => { cols = c; return b; };
  b.eq = () => b;
  const result = () => {
    requested.push(cols);
    const row = rowProvider();
    if (!row) return { data: null, error: null };
    if (cols.trim() === "*") return { data: { ...row }, error: null };
    const wanted = cols.split(",").map((s) => s.trim());
    const out: Record<string, unknown> = {};
    for (const key of wanted) if (key in row) out[key] = row[key];
    return { data: out, error: null };
  };
  b.single = () => Promise.resolve(result());
  b.maybeSingle = () => Promise.resolve(result());
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result()).then(res, rej);
  b.catch = (fn: (e: unknown) => unknown) => Promise.resolve(result()).catch(fn);
  return b;
}

Deno.test("N-118: rechecagem antes do envio enxerga send_weekdays e pausa o dia proibido", async () => {
  setDispatchEnv();
  const today = weekdayNow();
  const forbiddenDay = (today + 3) % 7;
  const requested: string[] = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const campaignRow = {
    ...makeCampaign({
      schedule_timezone: TZ,
      typing_delay_min: 0,
      typing_delay_max: 0,
      respect_dnd: false,
      send_weekdays: [forbiddenDay],
    }),
    status: "sending",
  };

  const supabase = {
    from(table: string) {
      if (table === "talkx_campaigns") return makeColumnsAwareCampaignQB(() => campaignRow, requested);
      if (table === "whatsapp_connections") {
        return thenableQB({ data: { status: "connected", instance_id: "PRINCIPAL" }, error: null });
      }
      return thenableQB({ data: null, error: null });
    },
    rpc(name: string, args: Record<string, unknown> = {}) {
      rpcCalls.push({ name, args });
      if (name === "claim_talkx_recipient") return Promise.resolve({ data: [{ claim_token: "claim-1" }], error: null });
      if (name === "release_talkx_recipient_claim") return Promise.resolve({ data: true, error: null });
      if (name === "transition_talkx_campaign") return Promise.resolve({ data: [{ current_status: "paused" }], error: null });
      return Promise.resolve({ data: null, error: null });
    },
  } as unknown as SupabaseClient;

  const recipient = {
    id: "rec-n118-1",
    campaign_id: CAMPAIGN_ID,
    contact_id: "contact-n118-1",
    status: "pending",
    attempt_count: 0,
    retry_after: null,
    message_snapshot_at: "2026-01-01T00:00:00Z",
    personalized_message: "Ola",
    media_url_snapshot: null,
    media_type_snapshot: null,
    variant_id: null,
    contacts: { name: "Ana", phone: "+5511999990000" },
  } as unknown as ProcessRecipientRow;

  const deps: ProcessRecipientDeps = {
    supabase,
    campaignId: CAMPAIGN_ID,
    campaign: campaignRow as Record<string, unknown>,
    businessHours: null,
    dndSetting: null,
    initialInstanceId: "PRINCIPAL",
    instanceToken: "tok-test",
    evolutionUrl: Deno.env.get("EVOLUTION_API_URL") ?? "",
    evolutionKey: Deno.env.get("EVOLUTION_API_KEY") ?? "",
    supabaseUrl: "https://supabase-test.example",
    workerId: "worker-n118",
    trackingUrlFor: () => undefined,
    linksByLabelFor: () => ({}),
    customFieldsByContact: new Map(),
    log: new Logger("talkx-send"),
    correlationId: "corr-n118",
    isRecipientSuppressed: () => Promise.resolve(false),
    mediaForSend: () => Promise.resolve(""),
  };

  const provider = mockProviderRecording();
  try {
    const result = await processRecipient(deps, recipient);
    assert(result.kind === "stopped", `esperado stopped (dia fora de send_weekdays), veio ${result.kind}`);
    assert(
      requested.some((cols) => cols.includes("send_weekdays")),
      "o select do beforeSend precisa pedir send_weekdays (senão o dia proibido some)",
    );
    assert(
      messagePosts(provider.posts).length === 0,
      "nenhum POST de mensagem pode sair num dia fora de send_weekdays",
    );
    assert(
      rpcCalls.some((c) => c.name === "transition_talkx_campaign" && c.args.p_action === "pause"),
      "a campanha devia ser pausada ao bater o dia proibido",
    );
  } finally {
    provider.restore();
  }
});

Deno.test("N-118: releitura por destinatário reflete send_weekdays mudado no banco e pausa", async () => {
  setDispatchEnv();
  const today = weekdayNow();
  const forbiddenDay = (today + 3) % 7;
  const clock = installFakeClock(Date.now());
  const starRow = {
    ...makeCampaign({
      schedule_timezone: TZ,
      typing_delay_min: 0,
      typing_delay_max: 0,
      respect_dnd: false,
      send_weekdays: [today],
    }),
    status: "sending",
  };
  // O operador passou a proibir o dia DEPOIS do primeiro carregamento: só a
  // releitura por destinatário (com as colunas certas) enxerga isso.
  const midRow = { ...starRow, send_weekdays: [forbiddenDay] };

  const { deps, ctx } = makeContinueDeps({
    recipients: makeContinueRecipients(1),
    clock,
    cronSecret: TEST_CRON_SECRET,
    campaign: starRow as Record<string, unknown>,
  });

  const requested: string[] = [];
  let reads = 0;
  const origFrom = deps.supabase.from.bind(deps.supabase);
  deps.supabase.from = (table: string) => {
    if (table !== "talkx_campaigns") return origFrom(table);
    const index = reads++;
    return makeColumnsAwareCampaignQB(() => (index === 0 ? starRow : midRow), requested);
  };

  const provider = mockProviderRecording();
  try {
    const res = await handleTalkxSend(
      makePost({ cronSecret: TEST_CRON_SECRET, body: { action: "continue", campaignId: CAMPAIGN_ID } }),
      deps,
    );
    assert(res.status === 200, `esperado 200, veio ${res.status}`);
    const body = await res.json();
    assert(
      requested.some((cols) => cols.includes("send_weekdays")),
      "a releitura por destinatário precisa pedir send_weekdays",
    );
    assert(
      messagePosts(provider.posts).length === 0,
      "não pode enviar no dia fora de send_weekdays lido na releitura",
    );
    assert(
      ctx.rpcCalls.some(
        (c) => c.name === "transition_talkx_campaign" && c.args.p_pause_reason === "outside_weekdays",
      ),
      "a pausa devia ter motivo outside_weekdays",
    );
    assert(body.sent === 0, `esperado sent:0, veio ${JSON.stringify(body)}`);
  } finally {
    provider.restore();
    clock.restore();
  }
});
// ---- Ponto 1 da recusa (N-118, DND): os dois testes acima usam
// respect_dnd:false + dndSetting:null e NÃO pegariam a falta de fiação do DND
// no caminho de envio. Estes provam o DND com respect_dnd ausente/true e um
// feriado = hoje (determinístico: cobre "agora" em qualquer horário). ----

/** "hoje" (YYYY-MM-DD) no fuso da campanha — o mesmo cálculo do helper. */
function todayIsoIn(timeZone = TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

/** DND válido cujo único gatilho é o feriado de hoje. */
function dndWithTodayHoliday() {
  return { start: "08:00", end: "18:00", sundays: false, holidays: [todayIsoIn()] };
}

Deno.test("N-118: beforeSend com respect_dnd ausente e feriado hoje barra sem POST e pausa dnd", async () => {
  setDispatchEnv();
  const requested: string[] = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const campaignRow = {
    ...makeCampaign({
      schedule_timezone: TZ,
      typing_delay_min: 0,
      typing_delay_max: 0,
      // respect_dnd e send_weekdays AUSENTES de propósito: DND é opt-out
      // (default ligado) e dia é irrestrito — só o DND pode barrar aqui.
    }),
    status: "sending",
  };

  const supabase = {
    from(table: string) {
      if (table === "talkx_campaigns") return makeColumnsAwareCampaignQB(() => campaignRow, requested);
      if (table === "whatsapp_connections") {
        return thenableQB({ data: { status: "connected", instance_id: "PRINCIPAL" }, error: null });
      }
      return thenableQB({ data: null, error: null });
    },
    rpc(name: string, args: Record<string, unknown> = {}) {
      rpcCalls.push({ name, args });
      if (name === "claim_talkx_recipient") return Promise.resolve({ data: [{ claim_token: "claim-1" }], error: null });
      if (name === "release_talkx_recipient_claim") return Promise.resolve({ data: true, error: null });
      if (name === "transition_talkx_campaign") return Promise.resolve({ data: [{ current_status: "paused" }], error: null });
      return Promise.resolve({ data: null, error: null });
    },
  } as unknown as SupabaseClient;

  const recipient = {
    id: "rec-n118-dnd",
    campaign_id: CAMPAIGN_ID,
    contact_id: "contact-n118-dnd",
    status: "pending",
    attempt_count: 0,
    retry_after: null,
    message_snapshot_at: "2026-01-01T00:00:00Z",
    personalized_message: "Ola",
    media_url_snapshot: null,
    media_type_snapshot: null,
    variant_id: null,
    contacts: { name: "Bia", phone: "+551****0001" },
  } as unknown as ProcessRecipientRow;

  const deps: ProcessRecipientDeps = {
    supabase,
    campaignId: CAMPAIGN_ID,
    campaign: campaignRow as Record<string, unknown>,
    businessHours: null,
    dndSetting: dndWithTodayHoliday(),
    initialInstanceId: "PRINCIPAL",
    instanceToken: "tok-test",
    evolutionUrl: Deno.env.get("EVOLUTION_API_URL") ?? "",
    evolutionKey: Deno.env.get("EVOLUTION_API_KEY") ?? "",
    supabaseUrl: "https://supabase-test.example",
    workerId: "worker-n118-dnd",
    trackingUrlFor: () => undefined,
    linksByLabelFor: () => ({}),
    customFieldsByContact: new Map(),
    log: new Logger("talkx-send"),
    correlationId: "corr-n118-dnd",
    isRecipientSuppressed: () => Promise.resolve(false),
    mediaForSend: () => Promise.resolve(""),
  };

  const provider = mockProviderRecording();
  try {
    const result = await processRecipient(deps, recipient);
    assert(result.kind === "stopped", `esperado stopped (DND com respect_dnd ausente), veio ${result.kind}`);
    assert(
      requested.some((cols) => cols.includes("respect_dnd")),
      "o select do beforeSend precisa pedir respect_dnd (senão o default opt-out some)",
    );
    assert(
      messagePosts(provider.posts).length === 0,
      "nenhum POST de mensagem pode sair em feriado de DND",
    );
    assert(
      rpcCalls.some((c) => c.name === "transition_talkx_campaign" && c.args.p_pause_reason === "dnd"),
      "a pausa devia ter motivo dnd (não o do dono/manual)",
    );
  } finally {
    provider.restore();
  }
});

Deno.test("N-118: releitura por destinatário com respect_dnd true e feriado hoje pausa dnd", async () => {
  setDispatchEnv();
  const clock = installFakeClock(Date.now());
  const starRow = {
    ...makeCampaign({
      schedule_timezone: TZ,
      typing_delay_min: 0,
      typing_delay_max: 0,
      respect_dnd: true,
      send_weekdays: [weekdayNow()],
    }),
    status: "sending",
  };

  const { deps, ctx } = makeContinueDeps({
    recipients: makeContinueRecipients(1),
    clock,
    cronSecret: TEST_CRON_SECRET,
    campaign: starRow as Record<string, unknown>,
  });

  const requested: string[] = [];
  const origFrom = deps.supabase.from.bind(deps.supabase);
  deps.supabase.from = (table: string) => {
    if (table === "talkx_settings") {
      return thenableQB({
        data: [{ key: "dnd_hours", value: dndWithTodayHoliday() }],
        error: null,
      });
    }
    if (table !== "talkx_campaigns") return origFrom(table);
    return makeColumnsAwareCampaignQB(() => starRow, requested);
  };

  const provider = mockProviderRecording();
  try {
    const res = await handleTalkxSend(
      makePost({ cronSecret: TEST_CRON_SECRET, body: { action: "continue", campaignId: CAMPAIGN_ID } }),
      deps,
    );
    assert(res.status === 200, `esperado 200, veio ${res.status}`);
    const body = await res.json();
    assert(
      requested.some((cols) => cols.includes("respect_dnd")),
      "a releitura por destinatário precisa pedir respect_dnd",
    );
    assert(
      requested.some((cols) => cols.includes("send_weekdays")),
      "a releitura por destinatário precisa pedir send_weekdays",
    );
    assert(
      messagePosts(provider.posts).length === 0,
      "não pode enviar em feriado de DND lido na releitura",
    );
    assert(
      ctx.rpcCalls.some(
        (c) => c.name === "transition_talkx_campaign" && c.args.p_pause_reason === "dnd",
      ),
      "a pausa devia ter motivo dnd",
    );
    assert(body.sent === 0, `esperado sent:0, veio ${JSON.stringify(body)}`);
  } finally {
    provider.restore();
    clock.restore();
  }
});

// ---- Ponto 2 da recusa: send_weekdays fora do contrato fecha ----
Deno.test("N-118: send_weekdays fora do contrato fecha com outside_weekdays", () => {
  const base = { schedule_timezone: TZ, business_hours_only: false, respect_dnd: false };
  const bad: unknown[] = [[7], ["seg"], [1, 9], [1.5], [-1]];
  for (const sendWeekdays of bad) {
    const st = deliveryWindowStatus({ ...base, send_weekdays: sendWeekdays as number[] });
    assert(
      !st.allowed && st.reason === "outside_weekdays",
      `send_weekdays=${JSON.stringify(sendWeekdays)} devia fechar com outside_weekdays, veio ${JSON.stringify(st)}`,
    );
  }
  const empty = deliveryWindowStatus({ ...base, send_weekdays: [] });
  assert(empty.allowed, `[] é irrestrito, veio ${JSON.stringify(empty)}`);
  const absent = deliveryWindowStatus({ ...base });
  assert(absent.allowed, `ausente é irrestrito, veio ${JSON.stringify(absent)}`);
});

// ---- Ponto 3 da recusa: talkx_settings indisponível avisa e segue sem DND ----
Deno.test("N-118: talkx_settings indisponível registra warn e segue sem DND", async () => {
  setDispatchEnv();
  const clock = installFakeClock(Date.now());
  const warns: Array<{ msg: string; ctx: unknown }> = [];
  const proto = Logger.prototype as unknown as { warn: (...a: unknown[]) => void };
  const origWarn = proto.warn;
  proto.warn = (msg: unknown, ctx: unknown) => {
    warns.push({ msg: String(msg), ctx });
  };

  const { deps } = makeContinueDeps({
    recipients: makeContinueRecipients(1),
    clock,
    cronSecret: TEST_CRON_SECRET,
  });
  const origFrom = deps.supabase.from.bind(deps.supabase);
  deps.supabase.from = (table: string) => {
    if (table === "talkx_settings") {
      return thenableQB({ data: null, error: { message: "settings-boom" } });
    }
    return origFrom(table);
  };

  const provider = mockProviderRecording();
  try {
    const res = await handleTalkxSend(
      makePost({ cronSecret: TEST_CRON_SECRET, body: { action: "continue", campaignId: CAMPAIGN_ID } }),
      deps,
    );
    assert(res.status === 200, `esperado 200, veio ${res.status}`);
    const body = await res.json();
    assert(
      warns.some((w) => w.msg.includes("talkx_settings")),
      `esperado warn sobre talkx_settings, recebido ${JSON.stringify(warns.map((w) => w.msg))}`,
    );
    // Fail-open documentado: sem as configs o envio segue (DND ignorado).
    assert(body.sent === 1, `esperado sent:1 (segue sem DND), veio ${JSON.stringify(body)}`);
    assert(messagePosts(provider.posts).length === 1, "esperado 1 POST de mensagem");
  } finally {
    provider.restore();
    clock.restore();
    proto.warn = origWarn;
  }
});
