/**
 * R3-DELTA-012 (#475) — o aviso de quarentena do motor NÃO pode sobrescrever o
 * `attempt` do logger filho (X033).
 *
 * Defeito (antes): `Logger.child({campaign_id, recipient_id, attempt})` existe
 * para amarrar a identidade do destinatário a TODA entrada de log, mas
 * `Logger.log()` montava a entrada com `...this.bound` ANTES de `...ctx` — o
 * contexto da chamada ganhava. No caminho de quarentena
 * (`process-recipient.ts`, `providerPostAttempted === true`), a linha de
 * `outcome_unknown` repete `attempt` com o valor do BANCO (`attempt_count`,
 * a tentativa anterior, 0 na primeira passada), então a quarentena registrava
 * `attempt: 0` enquanto o logger filho daquela passada carregava `attempt: 1`:
 * a mesma linha do MESMO destinatário saía com uma tentativa diferente das
 * demais (prova na auditoria: validation.ts:45, 58-59).
 *
 * Este teste roda o handler REAL, força o provedor a responder 500 no POST de
 * envio (ambiguidade → quarentena) e lê a linha que o motor imprime.
 */
import { handleTalkxSend } from "./index.ts";
import {
  CAMPAIGN_ID, makePost, TEST_CRON_SECRET, installFakeClock,
  makeContinueRecipients, makeContinueDeps,
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

Deno.test("R3-DELTA-012: log de quarentena mantém o attempt do logger filho (e não o do contexto da chamada)", async () => {
  setEnv();
  const clock = installFakeClock(1_700_000_000_000);
  const recipients = makeContinueRecipients(1);
  const { deps } = makeContinueDeps({ recipients, clock, cronSecret: TEST_CRON_SECRET });

  // Provedor: o POST de envio responde 500 → `talkx_provider_outcome_unknown`
  // DEPOIS do dispatch marcado → ramo de quarentena (a mensagem pode ter sido
  // aceita; não se reenvia).
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = (input: unknown) => {
    const url = typeof input === "string" ? input : String((input as { url?: unknown })?.url ?? input);
    requested.push(url);
    if (url.includes("/message/sendText/")) {
      return Promise.resolve(new Response("{}", { status: 500 }));
    }
    return Promise.resolve(new Response(JSON.stringify({ key: { id: "presence-ok" } }), { status: 200 }));
  };

  const warns: string[] = [];
  const originalWarn = console.warn;
  console.warn = ((msg?: unknown) => { warns.push(String(msg)); }) as typeof console.warn;
  let body: Record<string, unknown>;
  try {
    const res = await handleTalkxSend(
      makePost({ cronSecret: TEST_CRON_SECRET, body: { action: "continue", campaignId: CAMPAIGN_ID } }),
      deps,
    );
    body = await res.json();
  } finally {
    console.warn = originalWarn;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = originalFetch;
    clock.restore();
  }

  assert(
    requested.some((u) => u.includes("/message/sendText/")),
    `nenhum POST de envio chegou ao provedor: ${requested.join(", ")}`,
  );
  assert(body.outcome_unknown === 1, `esperado 1 outcome_unknown, recebido ${JSON.stringify(body)}`);

  const quarantineLine = warns
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .find((entry) => String(entry.msg).includes("quarentena"));
  assert(quarantineLine !== undefined, `nenhuma linha de quarentena impressa: ${warns.join(" | ")}`);

  // Prova central: `attempt` é o ordinal da passada (attempt_count 0 + 1), o do
  // logger filho — antes da correção saía 0, o valor do contexto da chamada.
  assert(
    quarantineLine.attempt === 1,
    `contexto de quarentena sobrescreveu o attempt do logger filho: esperado 1, recebido ${quarantineLine.attempt}`,
  );
  assert(
    quarantineLine.recipient_id === recipients[0].recipient_id,
    `recipient_id do logger filho perdido: ${JSON.stringify(quarantineLine)}`,
  );
  assert(
    quarantineLine.campaign_id === CAMPAIGN_ID,
    `campaign_id do logger filho perdido: ${JSON.stringify(quarantineLine)}`,
  );
  // O contexto da chamada continua entrando na linha.
  assert(
    typeof quarantineLine.correlationId === "string" && quarantineLine.correlationId.length > 0,
    `correlationId do chamador ausente: ${JSON.stringify(quarantineLine)}`,
  );
});
