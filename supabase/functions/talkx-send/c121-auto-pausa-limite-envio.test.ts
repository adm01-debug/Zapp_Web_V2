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

/**
 * Provedor recusando com o status que o motor le. `corpo` cobre as tres formas que
 * um provedor usa de verdade: JSON, texto puro e vazio. As duas ultimas fazem a
 * leitura JSON do motor lancar, e por isso a pausa precisa vir ANTES dela.
 */
function mockProvedorNoLimite(status: number, corpo: "json" | "texto" | "vazio" = "json"): { restore: () => void } {
  const orig = globalThis.fetch;
  const resposta = () => {
    if (corpo === "texto") return new Response("Too Many Requests", { status });
    if (corpo === "vazio") return new Response(null, { status });
    return new Response(
      JSON.stringify({ error: "too many requests", message: "rate limit" }),
      { status, headers: { "Content-Type": "application/json" } },
    );
  };
  globalThis.fetch = (() => Promise.resolve(resposta())) as typeof fetch;
  return { restore: () => { globalThis.fetch = orig; } };
}

async function rodar(status: number, corpo: "json" | "texto" | "vazio" = "json") {
  setEnv();
  const clock = installFakeClock(1_700_000_000_000);
  const { deps, ctx } = makeContinueDeps({
    recipients: makeContinueRecipients(1), clock, cronSecret: TEST_CRON_SECRET,
  });
  const provedor = mockProvedorNoLimite(status, corpo);
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

// Achado do Devin na #3144: o provedor pode devolver o limite com corpo em texto ou
// vazio. A leitura JSON do motor lanca nesses dois casos e manda o destinatario para
// quarentena; se a pausa dependesse do corpo, a instancia ficava liberada.
for (const corpo of ["texto", "vazio"] as const) {
  Deno.test(`C121/IP1: limite de envio com corpo ${corpo} ainda pausa a instancia`, async () => {
    const pausas = await rodar(429, corpo);
    assert(pausas.length === 1, `esperava 1 pausa automatica com corpo ${corpo}, houve ${pausas.length}`);
  });
}

// So o limite de envio pausa: recusa por conteudo nao pode tirar a instancia do ar.
Deno.test("C121/IP1: recusa 400 do provedor na campanha NAO pausa a instancia", async () => {
  const pausas = await rodar(400);
  assert(pausas.length === 0, `recusa definitiva nao pode pausar, houve ${pausas.length}`);
});
