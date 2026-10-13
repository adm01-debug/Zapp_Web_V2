/**
 * Dead-letter de webhook: a prova do que vai para `webhook_failures` e de como o
 * erro é classificado em transitório/permanente.
 *
 * Run with: deno test --config scripts/ci/deno.json --frozen supabase/functions/_shared/__tests__/webhook-dead-letter.test.ts
 */

import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";

import type { EvolutionDbClient } from "../evolution-types.ts";
import {
  buildDeadLetterSnapshot,
  classifyIngestFailure,
  maskPhoneLike,
  payloadSha256,
  recordWebhookFailure,
  type DeadLetterInput,
} from "../webhook-dead-letter.ts";

const TELEFONE = "5511988887777";

function entradaMinima(over: Partial<DeadLetterInput> = {}): DeadLetterInput {
  return {
    externalId: "MSG-1",
    eventType: "messages.upsert",
    instance: "INST-1",
    errorMessage: "timeout ao falar com o contato",
    errorCode: "08006",
    snapshot: buildDeadLetterSnapshot({ messageId: "MSG-1", messageType: "text" }),
    replayArgs: {
      p_connection_id: "c1",
      p_phone: TELEFONE,
      p_push_name: null,
      p_content: "oi",
      p_message_type: "text",
      p_media_url: null,
      p_external_id: "MSG-1",
      p_created_at: "2026-10-12T00:00:00.000Z",
    },
    ...over,
  };
}

Deno.test("classifyIngestFailure: 22/23/42/P0 são permanentes; resto é transitório", () => {
  // Payload inválido / integridade / objeto inexistente: reenviar não muda nada.
  assertEquals(classifyIngestFailure("22001"), "permanent");
  assertEquals(classifyIngestFailure("23502"), "permanent");
  assertEquals(classifyIngestFailure("42P01"), "permanent");
  assertEquals(classifyIngestFailure("P0001"), "permanent");
  // Conexão, timeout, cancelamento ou ausência de código: pode ser transitório.
  assertEquals(classifyIngestFailure("08006"), "transient");
  assertEquals(classifyIngestFailure("57014"), "transient");
  assertEquals(classifyIngestFailure(null), "transient");
  assertEquals(classifyIngestFailure(undefined), "transient");
});

Deno.test("buildDeadLetterSnapshot: lista FECHADA de campos, sem telefone/JID/conteúdo", () => {
  const snapshot = buildDeadLetterSnapshot({
    event: "messages.upsert",
    instance: "INST-1",
    messageId: "MSG-1",
    fromMe: false,
    messageType: "text",
    messageTimestamp: 1730000000,
  });
  assertEquals(
    Object.keys(snapshot).sort(),
    ["event", "fromMe", "instance", "messageId", "messageTimestamp", "messageType"],
  );
  const serializado = JSON.stringify(snapshot);
  assert(!serializado.includes(TELEFONE), "telefone não pode ir para o snapshot");
  assert(!serializado.includes("@s.whatsapp.net"), "JID não pode ir para o snapshot");
});

Deno.test("buildDeadLetterSnapshot: texto longo é truncado e valor estranho vira null", () => {
  const snapshot = buildDeadLetterSnapshot({ event: "x".repeat(500), fromMe: "sim" });
  const cortado = String(snapshot.event);
  assertEquals(cortado.slice(0, 120), "x".repeat(120));
  assert(cortado.length < 200, "texto longo precisa ser truncado");
  assert(cortado.endsWith("..."));
  assertEquals(snapshot.fromMe, null);
});

Deno.test("maskPhoneLike: telefone não sobra inteiro em log/coluna", () => {
  const mascarado = maskPhoneLike(`falha ao ingerir ${TELEFONE}`);
  assert(!mascarado.includes(TELEFONE));
  assertMatch(mascarado, /^falha ao ingerir 5511\*\*\*77$/);
  assertEquals(maskPhoneLike("erro sem numero nenhum"), "erro sem numero nenhum");
});

Deno.test("payloadSha256: determinístico, 64 hex, independente da ordem das chaves", async () => {
  const a = await payloadSha256({ b: 1, a: 2 });
  const b = await payloadSha256({ a: 2, b: 1 });
  assertEquals(a, b);
  assertMatch(a, /^[0-9a-f]{64}$/);
  assert(a !== await payloadSha256({ a: 2, b: 2 }));
});

Deno.test("recordWebhookFailure: grava as colunas do replay, sem telefone no diagnóstico", async () => {
  const inseridos: Record<string, unknown>[] = [];
  const client = {
    from: (tabela: string) => ({
      insert: (linha: Record<string, unknown>) => {
        inseridos.push({ tabela, ...linha });
        return Promise.resolve({ error: null });
      },
    }),
  } as unknown as EvolutionDbClient;

  const ok = await recordWebhookFailure(client, entradaMinima({
    errorMessage: `timeout ao falar com ${TELEFONE}`,
  }));

  assertEquals(ok, true);
  assertEquals(inseridos.length, 1);
  const linha = inseridos[0];
  assertEquals(linha.tabela, "webhook_failures");
  assertEquals(linha.endpoint, "evolution-webhook");
  assertEquals(linha.external_id, "MSG-1");
  assertEquals(linha.event_type, "messages.upsert");
  assertEquals(linha.instance, "INST-1");
  assertMatch(String(linha.payload_sha256), /^[0-9a-f]{64}$/);
  assert(!String(linha.payload_truncated).includes(TELEFONE));
  assert(!String(linha.error_message).includes(TELEFONE));
  assertMatch(String(linha.error_message), /code 08006/);
  // O replay precisa dos argumentos do ingest — inclusive o telefone, que é o
  // que permite reingressar a mensagem. Fica só nesta coluna (ACL service_role).
  assertEquals((linha.replay_payload as Record<string, unknown>).p_external_id, "MSG-1");
});

Deno.test("recordWebhookFailure: erro do insert é engolido (não mascara a falha original)", async () => {
  const client = {
    from: () => ({
      insert: () => Promise.resolve({ error: { code: "42P01", message: "relation does not exist" } }),
    }),
  } as unknown as EvolutionDbClient;
  assertEquals(await recordWebhookFailure(client, entradaMinima()), false);
});

Deno.test("recordWebhookFailure: exceção do client também é engolida", async () => {
  const client = {
    from: () => {
      throw new Error("client morto");
    },
  } as unknown as EvolutionDbClient;
  assertEquals(await recordWebhookFailure(client, entradaMinima()), false);
});
