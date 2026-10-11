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
