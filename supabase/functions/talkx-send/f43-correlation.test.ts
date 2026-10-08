/**
 * F43 — prova de CORRELAÇÃO sem conteúdo no `talkx-send`.
 *
 * A metade "correlation_id gerado por request e propagado ao log, logger sem
 * conteúdo" do F43 é um contrato, não um comentário: o handler gera UM
 * `newCorrelationId()` por request e o leva a TODAS as linhas estruturadas; e
 * nenhuma linha pode carregar dado de cliente (telefone, nome) nem conteúdo de
 * mensagem (texto). Este teste roda o handler REAL duas vezes (ação `continue`,
 * uma linha por passada) e lê o console — a única superfície de rastreio do
 * edge. Sem isso, "provar correlação sem conteúdo" era só leitura de código.
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

Deno.test("F43: talkx-send gera um correlationId por request (ids distintos) e não loga conteúdo", async () => {
  setEnv();
  const clock = installFakeClock(1_700_000_000_000);
  const provider = mockProviderRecording();

  const linhas: string[] = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  const capturar = (...args: unknown[]) => {
    linhas.push(args.map((arg) => String(arg)).join(" "));
  };
  console.log = capturar as typeof console.log;
  console.warn = capturar as typeof console.warn;
  console.error = capturar as typeof console.error;

  try {
    // Duas REQUISIÇÕES distintas (cada uma com o próprio deps/fila): o id tem de
    // ser novo a cada request, nunca reaproveitado de uma passada para a outra.
    for (let passada = 0; passada < 2; passada++) {
      const { deps } = makeContinueDeps({
        recipients: makeContinueRecipients(1),
        clock,
        cronSecret: TEST_CRON_SECRET,
      });
      const res = await handleTalkxSend(
        makePost({ cronSecret: TEST_CRON_SECRET, body: { action: "continue", campaignId: CAMPAIGN_ID } }),
        deps,
      );
      assert(res.status === 200, `passada ${passada}: esperado 200, recebido ${res.status}`);
    }
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
    provider.restore();
    clock.restore();
  }

  const ids = linhas
    .map((linha) => {
      try {
        return (JSON.parse(linha) as { correlationId?: unknown }).correlationId;
      } catch {
        return undefined;
      }
    })
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  assert(ids.length >= 2, `esperava ao menos 2 linhas com correlationId, veio ${ids.length}`);
  assert(new Set(ids).size === ids.length, `correlationId reutilizado entre requests: ${JSON.stringify(ids)}`);

  const proibidas = ["phone", "contact_phone", "personalized_message", "text", "message", "nome", "name", "telefone"];
  for (const linha of linhas) {
    const evento = (() => {
      try {
        return JSON.parse(linha) as Record<string, unknown>;
      } catch {
        return null;
      }
    })();
    if (evento === null) continue;
    for (const chave of proibidas) {
      assert(!(chave in evento), `log carregou campo de conteúdo '${chave}': ${linha}`);
    }
  }
});
