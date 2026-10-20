/**
 * t_afa5df1d — exceção num destinatário NÃO pode perder o evento agregado
 * `skipped_suppressed` da passada.
 *
 * Defeito (antes): o motor conta os pulos por supressão da passada em
 * `state.blacklisted - blacklistedBeforeBatch` e grava 1 linha agregada em
 * `talkx_campaign_events` DEPOIS do laço, fora de qualquer `finally`. Se
 * `runRecipient` lança num destinatário (ex.: claim indisponível), a exceção
 * sobe antes da gravação e a timeline da campanha perde os pulos por supressão
 * já contados naquela passada — mesma classe do R3-DELTA-011 (#127), que
 * corrigiu só a perda do lote de `talkx_delivery_log`.
 *
 * Aceite: numa passada com 1 destinatário suprimido (contabilizado) e o
 * destinatário seguinte lançando no claim, a linha agregada `skipped_suppressed`
 * com a contagem 1 tem de estar em `talkx_campaign_events` mesmo assim; a
 * resposta continua sendo o 500 do erro original (a timeline é best-effort e
 * nunca mascara a falha).
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

Deno.test("t_afa5df1d: exceção no 2º destinatário preserva o evento agregado skipped_suppressed da passada", async () => {
  setEnv();
  const clock = installFakeClock(1_700_000_000_000);
  const recipients = makeContinueRecipients(3);
  const { deps, ctx } = makeContinueDeps({ recipients, clock, cronSecret: TEST_CRON_SECRET });

  // 1º destinatário: o claim volta, mas a supressão (opt-out) responde TRUE →
  // contabilizado em `state.blacklisted` e pulado dentro da passada.
  const suppressedContactId = recipients[0].contact_id;
  // 2º destinatário: o claim FALHA e `processRecipient` lança
  // `talkx_recipient_claim_failed` (já há 1 pulo por supressão contado na passada).
  const failingRecipientId = recipients[1].recipient_id;
  const originalRpc = deps.supabase.rpc;
  deps.supabase.rpc = (name: string, args: Record<string, unknown> = {}) => {
    if (name === "talkx_recipient_is_suppressed" && args.p_contact_id === suppressedContactId) {
      return Promise.resolve({ data: true, error: null });
    }
    if (name === "claim_talkx_recipient" && args.p_recipient_id === failingRecipientId) {
      return Promise.resolve({ data: null, error: { message: "claim indisponível (prova t_afa5df1d)" } });
    }
    return originalRpc(name, args);
  };

  const provider = mockProviderRecording();
  try {
    const res = await handleTalkxSend(
      makePost({ cronSecret: TEST_CRON_SECRET, body: { action: "continue", campaignId: CAMPAIGN_ID } }),
      deps,
    );
    // A falha continua sendo reportada: a timeline é best-effort e não a mascara.
    assert(res.status === 500, `esperado 500 (erro original propagado), recebido ${res.status}`);
  } finally {
    provider.restore();
    clock.restore();
  }

  // Prova central: o evento agregado da passada sobreviveu à exceção.
  const suppressed = ctx.events.filter((e) => e.event_type === "skipped_suppressed");
  assert(
    suppressed.length === 1,
    `evento agregado skipped_suppressed perdido na exceção: gravados=${suppressed.length} ` +
      `eventos=${JSON.stringify(ctx.events)}`,
  );
  assert(
    String(suppressed[0].message).includes("1"),
    `a mensagem deve agregar a contagem da passada: ${JSON.stringify(suppressed[0])}`,
  );
});
