/**
 * X033 — log por destinatário do motor e contexto do Logger.
 *
 * Aceite: "Deno: lote de 3 destinatários grava ao menos 3 linhas de log, nenhuma
 * com telefone" — cada linha de `talkx_delivery_log` traz campaign_id/recipient_id/
 * attempt/stage/outcome/worker_id/duration_ms e NENHUM telefone.
 *
 * Segunda prova: o `Logger.child` (X033) anexa campaign_id/recipient_id/attempt a
 * toda entrada — o Logger da edge deixa de gravar só fn/rid/ms.
 */
import { handleTalkxSend } from "./index.ts";
import { Logger } from "../_shared/validation.ts";
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

Deno.test("X033 continue: lote de 3 destinatários grava >= 3 linhas de log, nenhuma com telefone", async () => {
  setEnv();
  const clock = installFakeClock(1_700_000_000_000);
  const recipients = makeContinueRecipients(3);
  const { deps, ctx } = makeContinueDeps({ recipients, clock, cronSecret: TEST_CRON_SECRET });
  const provider = mockProviderRecording();
  try {
    const res = await handleTalkxSend(
      makePost({ cronSecret: TEST_CRON_SECRET, body: { action: "continue", campaignId: CAMPAIGN_ID } }),
      deps,
    );
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const body = await res.json();
    assert(body.sent === 3, `esperado 3 envios, recebido ${body.sent}`);
    assert(
      ctx.deliveryLogs.length >= 3,
      `esperado ao menos 3 linhas de talkx_delivery_log, recebido ${ctx.deliveryLogs.length}`,
    );

    const phones = new Set(recipients.map((r) => r.contact_phone));
    const recipientIds = new Set<string>();
    for (const entry of ctx.deliveryLogs) {
      const serialized = JSON.stringify(entry);
      for (const phone of phones) {
        assert(!serialized.includes(phone), `linha de log vazou telefone: ${serialized}`);
      }
      // Nenhuma chave de texto/telefone pode existir no payload.
      for (const forbidden of ["phone", "contact_phone", "personalized_message", "text", "message"]) {
        assert(!(forbidden in entry), `linha de log com campo proibido '${forbidden}': ${serialized}`);
      }
      assert(entry.campaign_id === CAMPAIGN_ID, `campaign_id ausente/errado: ${serialized}`);
      assert(typeof entry.recipient_id === "string" && entry.recipient_id.length > 0, `recipient_id ausente: ${serialized}`);
      assert(typeof entry.attempt === "number" && entry.attempt >= 1, `attempt inválido: ${serialized}`);
      assert(entry.stage === "dispatch", `stage inesperado: ${entry.stage}`);
      assert(entry.outcome === "sent", `outcome inesperado: ${entry.outcome}`);
      assert(typeof entry.worker_id === "string" && entry.worker_id.startsWith("talkx-send:"), `worker_id ausente: ${serialized}`);
      assert(typeof entry.duration_ms === "number" && entry.duration_ms >= 0, `duration_ms ausente: ${serialized}`);
      recipientIds.add(String(entry.recipient_id));
    }
    assert(recipientIds.size === 3, `esperado 3 recipient_ids distintos, recebido: ${[...recipientIds].join(",")}`);
    assert(ctx.deliveryLogs[0].attempt === 1, `primeira tentativa deveria ser 1, recebido ${ctx.deliveryLogs[0].attempt}`);
  } finally {
    provider.restore();
    clock.restore();
  }
});

Deno.test("X033 Logger.child: anexa campaign_id/recipient_id/attempt a toda entrada", () => {
  const captured: string[] = [];
  const originalLog = console.log;
  console.log = ((msg?: unknown) => { captured.push(String(msg)); }) as typeof console.log;
  try {
    const log = new Logger("talkx-send").child({ campaign_id: "camp-1", recipient_id: "rec-1", attempt: 2 });
    log.info("processando destinatário");
    log.done(200);
  } finally {
    console.log = originalLog;
  }

  assert(captured.length === 2, `esperado 2 entradas de log, recebido ${captured.length}`);
  for (const line of captured) {
    const entry = JSON.parse(line) as Record<string, unknown>;
    assert(entry.fn === "talkx-send", `fn ausente: ${line}`);
    assert(typeof entry.rid === "string" && entry.rid.length > 0, `rid ausente: ${line}`);
    assert(entry.campaign_id === "camp-1", `campaign_id ausente no log: ${line}`);
    assert(entry.recipient_id === "rec-1", `recipient_id ausente no log: ${line}`);
    assert(entry.attempt === 2, `attempt ausente no log: ${line}`);
  }
});
