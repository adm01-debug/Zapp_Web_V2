/**
 * C121/IP1 — limite de envio do provedor numa campanha Talk X pausa a instancia.
 *
 * O talkx-send e o quarto caminho de entrega do sistema: chama o provedor direto
 * por `evoFetch`, sem passar pelo proxy da evolution-api, pelo message-delivery
 * nem pelo multiplix-send. Sem a pausa aqui, o limite atingido por uma campanha
 * deixava a mesma instancia liberada para os demais destinatarios e para o inbox.
 *
 * Seguro porque a campanha sempre tem conexao fixa e o talkx-scheduler retoma
 * campanha pausada por instancia (`instance_paused` esta em AUTO_RESUME_REASONS,
 * `_shared/talkx-resume-policy.ts`), mantendo-a pausada so enquanto
 * `is_instance_paused` responder true.
 */
import { handleTalkxSend } from "./index.ts";
import {
  CAMPAIGN_ID, installFakeClock, makeContinueDeps, makeContinueRecipients, makePost, TEST_CRON_SECRET,
} from "./_test-utils.ts";
import { AUTO_PAUSE_MINUTES } from "../_shared/instance-pause-actions.ts";

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

/** Provedor recusando por limite de envio, com o status que o motor le. */
function mockProvedorNoLimite(status: number): { restore: () => void } {
  const orig = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response(
      JSON.stringify({ error: "too many requests", message: "rate limit" }),
      { status, headers: { "Content-Type": "application/json" } },
    ))) as typeof fetch;
  return { restore: () => { globalThis.fetch = orig; } };
}

async function rodar(status: number) {
  setEnv();
  const clock = installFakeClock(1_700_000_000_000);
  const { deps, ctx } = makeContinueDeps({
    recipients: makeContinueRecipients(1), clock, cronSecret: TEST_CRON_SECRET,
  });
  const provedor = mockProvedorNoLimite(status);
  try {
    await handleTalkxSend(
      makePost({ cronSecret: TEST_CRON_SECRET, body: { action: "continue", campaignId: CAMPAIGN_ID } }),
      deps,
    );
  } finally {
    provedor.restore();
  }
  return ctx.rpcCalls.filter((call) => call.name === "auto_pause_instance");
}

Deno.test("C121/IP1: limite de envio do provedor na campanha pausa a instancia", async () => {
  const pausas = await rodar(429);
  assert(pausas.length === 1, `esperava 1 pausa automatica, houve ${pausas.length}`);
  assert(
    pausas[0].args.p_minutes === AUTO_PAUSE_MINUTES,
    `a pausa automatica e de ${AUTO_PAUSE_MINUTES} min, veio ${String(pausas[0].args.p_minutes)}`,
  );
});

// So o limite de envio pausa: recusa por conteudo nao pode tirar a instancia do ar.
Deno.test("C121/IP1: recusa 400 do provedor na campanha NAO pausa a instancia", async () => {
  const pausas = await rodar(400);
  assert(pausas.length === 0, `recusa definitiva nao pode pausar, houve ${pausas.length}`);
});
