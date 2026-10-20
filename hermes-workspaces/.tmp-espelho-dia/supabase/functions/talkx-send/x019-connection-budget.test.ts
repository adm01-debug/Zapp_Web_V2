// X019 — envio pela conexão escolhida (token da instância) e limites de ritmo
// por minuto/dia via talkx_connection_send_budget (X018).
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleTalkxSend } from "./index.ts";
import {
  CAMPAIGN_ID, TEST_CRON_SECRET, makeConnection, makePost, installFakeClock,
  makeContinueDeps, makeContinueRecipients, mockProviderRecording, setDispatchEnvGo,
} from "./_test-utils.ts";

const messagePosts = (posts: Array<{ url: string; body: Record<string, unknown> }>) =>
  posts.filter((p) => p.url.includes("/message/"));

// (1) Token da instância: campanha na conexão B envia com apikey = token de B
// (não o global). O GO flavor usa o header `apikey` para autenticar a instância.
Deno.test("X019: conexão B envia com apikey = token de B (get_instance_token)", async () => {
  setDispatchEnvGo();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const origFetch = (globalThis as any).fetch;
  const apikeys: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = (_url: unknown, init?: any): Promise<Response> => {
    try {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      apikeys.push(headers.apikey ?? "");
    } catch { apikeys.push(""); }
    return Promise.resolve(new Response(JSON.stringify({ data: { Info: { ID: "go-msg-001" } } }), { status: 200 }));
  };
  try {
    const clock = installFakeClock(1_700_000_000_000);
    const { deps } = makeContinueDeps({
      recipients: makeContinueRecipients(1),
      clock,
      cronSecret: TEST_CRON_SECRET,
      connection: makeConnection({ instance_id: "B", status: "connected" }),
      instanceToken: "token-da-conexao-b",
    });
    const res = await handleTalkxSend(
      makePost({ cronSecret: TEST_CRON_SECRET, body: { action: "continue", campaignId: CAMPAIGN_ID } }),
      deps,
    );
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const body = await res.json();
    assert(body.sent === 1, `esperado sent:1, recebido ${JSON.stringify(body)}`);
    assert(apikeys.length > 0, "esperado ao menos um POST ao provedor");
    assert(apikeys.every((k) => k === "token-da-conexao-b"), `apikey deveria ser o token da conexão B, recebido: ${JSON.stringify(apikeys)}`);
    clock.restore();
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = origFetch;
  }
});

// (2) Limite diário 3 → o 4º não é enviado e a campanha fica paused daily_limit.
Deno.test("X019: day_remaining=0 → pausa daily_limit (sem envio extra)", async () => {
  const clock = installFakeClock(1_700_000_000_000);
  const pauseReasons: string[] = [];
  const { deps } = makeContinueDeps({
    recipients: makeContinueRecipients(2),
    clock,
    cronSecret: TEST_CRON_SECRET,
    budget: () => ({
      minute_limit: 6, minute_sent: 0, minute_remaining: 6,
      day_limit: 3, day_sent: 3, day_remaining: 0, next_day_at: null,
    }),
  });
  // Sobrescreve transition para gravar o motivo de pausa (espelha a V20).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const origRpc = (deps as any).supabase.rpc;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (deps as any).supabase.rpc = (name: string, args: Record<string, unknown> = {}) => {
    if (name === "transition_talkx_campaign") {
      pauseReasons.push(String(args.p_pause_reason ?? ""));
      return Promise.resolve({ data: [{ current_status: "paused" }], error: null });
    }
    return origRpc(name, args);
  };
  const provider = mockProviderRecording();
  try {
    const res = await handleTalkxSend(
      makePost({ cronSecret: TEST_CRON_SECRET, body: { action: "continue", campaignId: CAMPAIGN_ID } }),
      deps,
    );
    const body = await res.json();
    assert(messagePosts(provider.posts).length === 0, `não pode haver envio com day_remaining=0, houve ${messagePosts(provider.posts).length}`);
    assert(pauseReasons.includes("daily_limit"), `esperado daily_limit, recebido ${JSON.stringify(pauseReasons)}`);
    assert(body.sent === 0, `esperado sent:0, recebido ${JSON.stringify(body)}`);
    clock.restore();
  } finally {
    provider.restore();
  }
});

// (3) Limite por minuto 2 (relógio falso) → o 3º só sai após a virada; no
// orçamento de tempo desta invocação ele fica de fora e o lote encerra.
Deno.test("X019: minute_limit=2 → o 3º destinatário não sai no mesmo minuto", async () => {
  const clock = installFakeClock(1_700_000_000_000);
  const { deps } = makeContinueDeps({
    recipients: makeContinueRecipients(3),
    clock,
    cronSecret: TEST_CRON_SECRET,
    budget: (sent) => ({
      minute_limit: 2,
      minute_sent: Math.min(sent, 2),
      minute_remaining: Math.max(0, 2 - sent),
      day_limit: 500, day_sent: 0, day_remaining: 500, next_day_at: null,
    }),
  });
  const provider = mockProviderRecording();
  try {
    const res = await handleTalkxSend(
      makePost({ cronSecret: TEST_CRON_SECRET, body: { action: "continue", campaignId: CAMPAIGN_ID } }),
      deps,
    );
    const body = await res.json();
    assert(messagePosts(provider.posts).length === 2, `esperado 2 POSTs (minute_limit=2), recebido ${messagePosts(provider.posts).length}`);
    assert(body.sent === 2, `esperado sent:2, recebido ${JSON.stringify(body)}`);
    clock.restore();
  } finally {
    provider.restore();
  }
});
