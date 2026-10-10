/**
 * F43 — prova de CORRELAÇÃO sem conteúdo no `talkx-send`.
 *
 * A metade "correlation_id gerado por request e propagado ao log, logger sem
 * conteúdo" do F43 é um contrato, não um comentário: o handler gera UM
 * `newCorrelationId()` por request e o leva a TODAS as linhas estruturadas; e
 * nenhuma linha pode carregar dado de cliente (telefone, nome) nem conteúdo de
 * mensagem (texto). Este teste roda o handler REAL duas vezes (ação `continue`)
 * e lê o console — a única superfície de rastreio do edge. Sem isso, "provar
 * correlação sem conteúdo" era só leitura de código.
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

const CHAVES_PROIBIDAS = new Set([
  "phone", "contact_phone", "personalized_message", "text", "message", "nome", "name", "telefone",
]);

function jsonDaLinha(linha: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(linha) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function caminhosComChaveProibida(valor: unknown, caminho = "$", achados: string[] = []): string[] {
  if (Array.isArray(valor)) {
    valor.forEach((item, index) => caminhosComChaveProibida(item, `${caminho}[${index}]`, achados));
    return achados;
  }
  if (valor !== null && typeof valor === "object") {
    for (const [chave, filho] of Object.entries(valor as Record<string, unknown>)) {
      const proximo = `${caminho}.${chave}`;
      if (CHAVES_PROIBIDAS.has(chave.toLowerCase())) achados.push(proximo);
      caminhosComChaveProibida(filho, proximo, achados);
    }
  }
  return achados;
}

function correlationIdUnicoDoRequest(linhas: string[], rotulo: string): string {
  const estruturadas = linhas.map(jsonDaLinha).filter((linha): linha is Record<string, unknown> => linha !== null);
  const ids = estruturadas.map((linha) => linha.correlationId);
  const idsValidos = ids.filter((id): id is string => typeof id === "string" && id.length > 0);

  assert(idsValidos.length >= 1, `${rotulo}: esperava ao menos 1 linha com correlationId, veio ${idsValidos.length}`);
  assert(
    idsValidos.length === estruturadas.length,
    `${rotulo}: toda linha estruturada precisa carregar correlationId: ${JSON.stringify(linhas)}`,
  );
  const unicos = new Set(idsValidos);
  assert(unicos.size === 1, `${rotulo}: correlationId variou dentro do mesmo request: ${JSON.stringify(idsValidos)}`);
  return idsValidos[0];
}

function assertSemConteudo(linhas: string[], valoresProibidos: string[], rotulo: string): void {
  for (const linha of linhas) {
    for (const valor of valoresProibidos) {
      assert(!linha.includes(valor), `${rotulo}: log carregou valor proibido '${valor}': ${linha}`);
    }
    const evento = jsonDaLinha(linha);
    if (evento === null) continue;
    const caminhos = caminhosComChaveProibida(evento);
    assert(caminhos.length === 0, `${rotulo}: log carregou chave proibida em ${caminhos.join(", ")}: ${linha}`);
  }
}

async function capturarLogsDoRequest(run: () => Promise<void>): Promise<string[]> {
  const linhas: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const capturar = (...args: unknown[]) => {
    linhas.push(args.map((arg) => String(arg)).join(" "));
  };
  console.log = capturar as typeof console.log;
  console.warn = capturar as typeof console.warn;
  console.error = capturar as typeof console.error;
  try {
    await run();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
  return linhas;
}

function stubProviderSemId(): { restore: () => void } {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_input: URL | RequestInfo, _init?: RequestInit) => {
    return Promise.resolve(new Response(JSON.stringify({ key: {} }), { status: 200 }));
  }) as typeof globalThis.fetch;
  return { restore: () => { globalThis.fetch = originalFetch; } };
}

Deno.test("F43: talkx-send propaga um correlationId por request e não loga conteúdo", async () => {
  setEnv();
  const clock = installFakeClock(1_700_000_000_000);
  const logsPorRequest: string[][] = [];

  try {
    for (let passada = 0; passada < 2; passada++) {
      const provider = stubProviderSemId();
      try {
        const { deps } = makeContinueDeps({
          recipients: makeContinueRecipients(1),
          clock,
          cronSecret: TEST_CRON_SECRET,
        });
        const linhas = await capturarLogsDoRequest(async () => {
          const res = await handleTalkxSend(
            makePost({ cronSecret: TEST_CRON_SECRET, body: { action: "continue", campaignId: CAMPAIGN_ID } }),
            deps,
          );
          assert(res.status === 200, `passada ${passada}: esperado 200, recebido ${res.status}`);
        });
        logsPorRequest.push(linhas);
      } finally {
        provider.restore();
      }
    }
  } finally {
    clock.restore();
  }

  assert(logsPorRequest.length === 2, `esperava 2 requests capturados, veio ${logsPorRequest.length}`);
  assert(
    logsPorRequest.some((linhas) => linhas.filter((linha) => jsonDaLinha(linha) !== null).length > 1),
    `ao menos um request precisa gerar mais de uma linha estruturada: ${JSON.stringify(logsPorRequest)}`,
  );

  const idRequest1 = correlationIdUnicoDoRequest(logsPorRequest[0], "request 1");
  const idRequest2 = correlationIdUnicoDoRequest(logsPorRequest[1], "request 2");
  assert(idRequest1 !== idRequest2, `correlationId repetido entre requests: ${idRequest1}`);

  for (const [index, linhas] of logsPorRequest.entries()) {
    assertSemConteudo(linhas, ["5511900000000", "Ola Contato, tudo bem?", "Contato 0"], `request ${index + 1}`);
  }
});
