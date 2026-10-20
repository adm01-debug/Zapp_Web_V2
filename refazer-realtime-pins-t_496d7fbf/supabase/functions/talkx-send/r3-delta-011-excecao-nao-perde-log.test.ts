/**
 * R3-DELTA-011 (#127) — exceção num destinatário NÃO pode perder os logs já
 * acumulados no lote.
 *
 * Defeito (antes): o motor acumula uma linha de `talkx_delivery_log` por
 * destinatário em `state.deliveryLogs` e só grava o lote em
 * `flushDeliveryLogs(state)` DEPOIS do laço da passada. Se `processRecipient`
 * lança em um destinatário (ex.: claim indisponível), a exceção sobe pelo laço,
 * `flushDeliveryLogs` é pulado e o log de TODOS os destinatários já processados
 * naquela passada se perde — o `finally` externo só solta o lease.
 *
 * Aceite: com 3 destinatários na passada e o 2º lançando, o log do 1º (enviado
 * com sucesso) tem de estar em `talkx_delivery_log` mesmo assim; a resposta
 * continua sendo o 500 do erro original (o log é best-effort e nunca mascara a
 * falha).
 */
import { handleTalkxSend } from "./index.ts";
import {
  CAMPAIGN_ID, makePost, TEST_CRON_SECRET, installFakeClock,
  makeContinueRecipients, makeContinueDeps, mockProviderRecording,
} from "./_test-utils.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function setEnv(): void {
  Deno.env.set("SUPABASE_URL", "https://supabase-test.example");
  Deno.env.set("EVOLUTION_API_URL", "https://evolution-test.example");
  Deno.env.set("EVOLUTION_API_KEY", "test-evolution-api-key");
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  Deno.env.set("EVOLUTION_INSTANCE_TOKEN", "test-instance-token");
  Deno.env.set("EVOLUTION_INSTANCE_NAME", "PRINCIPAL");
}

Deno.test("R3-DELTA-011: exceção no 2º destinatário preserva o log do 1º já acumulado", async () => {
  setEnv();
  const clock = installFakeClock(1_700_000_000_000);
  const recipients = makeContinueRecipients(3);
  const { deps, ctx } = makeContinueDeps({ recipients, clock, cronSecret: TEST_CRON_SECRET });

  // Injeta a exceção no SEGUNDO destinatário: o claim dele falha e
  // `processRecipient` lança `talkx_recipient_claim_failed` (o 1º já foi
  // processado e já deixou a linha de log acumulada na passada).
  const failingRecipientId = recipients[1].recipient_id;
  const originalRpc = deps.supabase.rpc;
  deps.supabase.rpc = (name: string, args: Record<string, unknown> = {}) => {
    if (name === "claim_talkx_recipient" && args.p_recipient_id === failingRecipientId) {
      return Promise.resolve({ data: null, error: { message: "claim indisponível (prova R3-DELTA-011)" } });
    }
    return originalRpc(name, args);
  };

  const provider = mockProviderRecording();
  try {
    const res = await handleTalkxSend(
      makePost({ cronSecret: TEST_CRON_SECRET, body: { action: "continue", campaignId: CAMPAIGN_ID } }),
      deps,
    );
    // A falha continua sendo reportada: o log é best-effort e não a mascara.
    assert(res.status === 500, `esperado 500 (erro original propagado), recebido ${res.status}`);
  } finally {
    provider.restore();
    clock.restore();
  }

  // Prova central: o log do 1º destinatário (enviado) sobreviveu à exceção.
  const first = ctx.deliveryLogs.find((e) => e.recipient_id === recipients[0].recipient_id);
  assert(
    first !== undefined,
    `log do 1º destinatário perdido na exceção: gravados=${ctx.deliveryLogs.length} ` +
      `ids=${ctx.deliveryLogs.map((e) => String(e.recipient_id)).join(",")}`,
  );
  assert(first?.outcome === "sent" && first?.stage === "dispatch", `linha inesperada: ${JSON.stringify(first)}`);
  // Nenhuma linha com telefone (regra X033 mantida).
  const phones = recipients.map((r) => r.contact_phone);
  for (const entry of ctx.deliveryLogs) {
    const serialized = JSON.stringify(entry);
    for (const phone of phones) {
      assert(!serialized.includes(phone), `linha de log vazou telefone: ${serialized}`);
    }
  }
});
