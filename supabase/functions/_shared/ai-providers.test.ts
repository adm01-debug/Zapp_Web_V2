// IA-TIMEOUT-001 — o prazo da chamada de IA tem de cobrir o TRABALHO TODO,
// não só a fase em que o fetch resolve os headers.
//
// Defeito provado aqui: nas chamadas com `withRetry`, uma resposta transitória
// (5xx/408/429) tem o corpo consumido com `response.text()` SEM limite antes da
// próxima tentativa. Um corpo que nunca termina pendura a operação para sempre
// — o `budgetMs`/deadline só era conferido DEPOIS do consumo.
//
// Critério de aceite do achado: "Mock com headers imediatos e corpo que não
// termina é abortado no orçamento." Os testes abaixo fixam isso nos dois pontos
// de consumo: o dreno de corpo dentro do `withRetry` e a leitura de JSON sob o
// mesmo deadline absoluto (`readJsonWithinDeadline`).
//
// Run with: deno test --allow-env --allow-read \
//   supabase/functions/_shared/ai-providers.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import * as providers from "./ai-providers.ts";
import { withRetry } from "./ai-providers.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Corpo que resolve os HEADERS na hora mas NUNCA entrega um byte. */
function respostaComCorpoInfinito(
  status: number,
): { resposta: Response; liberar: () => void } {
  let ctrl: ReadableStreamDefaultController<Uint8Array> | null = null;
  const corpo = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
    },
  });
  const resposta = new Response(corpo, {
    status,
    headers: { "content-type": "application/json" },
  });
  return {
    resposta,
    liberar: () => {
      try {
        ctrl?.error(new Error("fim do teste"));
      } catch {
        // já cancelado/encerrado pelo código sob teste
      }
    },
  };
}

Deno.test("withRetry: corpo de resposta transitória que não termina é abortado no orçamento", async () => {
  // Resposta 500 com headers imediatos e corpo que NUNCA termina: sem limite no
  // consumo, o `await response.text()` dentro do retry pendura para sempre.
  const { resposta, liberar } = respostaComCorpoInfinito(500);
  const fn = () => Promise.resolve(resposta);

  const inicio = Date.now();
  const limite = inicio + 250;
  const chamada = withRetry(fn, 2, 20, { deadlineAtMs: limite } as unknown as providers.WithRetryOptions);
  const resultado = await Promise.race([
    chamada,
    sleep(2_000).then(() => "EXCEDEU" as const),
  ]);
  liberar();

  assert(
    resultado !== "EXCEDEU",
    `o consumo do corpo pendurou além do orçamento (${Date.now() - inicio}ms decorridos)`,
  );
  assert(
    resultado instanceof Response,
    "com o orçamento esgotado, a última resposta devia voltar como chegou",
  );
});

Deno.test("readJsonWithinDeadline: corpo que não termina é abortado no deadline e o stream é cancelado", async () => {
  const mod = providers as {
    readJsonWithinDeadline?: (r: Response, deadlineAt: number) => Promise<Record<string, unknown>>;
  };
  assert(
    typeof mod.readJsonWithinDeadline === "function",
    "não existe leitura de corpo sob o deadline único (readJsonWithinDeadline)",
  );

  let cancelado = false;
  const corpo = new ReadableStream<Uint8Array>({
    start() {},
    cancel() {
      cancelado = true;
    },
  });
  const resposta = new Response(corpo, {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  const inicio = Date.now();
  const leitura = mod.readJsonWithinDeadline(resposta, inicio + 250);
  const resultado = await Promise.race([
    leitura.then(() => "resolveu" as const).catch((err) => err as Error),
    sleep(2_000).then(() => "EXCEDEU" as const),
  ]);

  assert(resultado !== "EXCEDEU", "a leitura do corpo pendurou além do deadline");
  assert(resultado instanceof Error, "o estouro do deadline tinha de rejeitar com erro");
  assertEquals(
    (resultado as Error).name,
    "TimeoutError",
    "o estouro tem de ser classificável como timeout (mesma via do abort do fetch)",
  );
  assert(cancelado, "o corpo travado tinha de ser CANCELADO, não abandonado aberto");
});

Deno.test("readJsonWithinDeadline: deadline já esgotado falha na hora (não inicia leitura)", async () => {
  const mod = providers as {
    readJsonWithinDeadline?: (r: Response, deadlineAt: number) => Promise<Record<string, unknown>>;
  };
  assert(typeof mod.readJsonWithinDeadline === "function", "readJsonWithinDeadline ausente");

  let cancelado = false;
  const resposta = new Response(
    new ReadableStream<Uint8Array>({
      start() {},
      cancel() {
        cancelado = true;
      },
    }),
    { status: 200 },
  );

  const resultado = await mod
    .readJsonWithinDeadline(resposta, Date.now() - 1)
    .then(() => "resolveu" as const)
    .catch((err) => err as Error);

  assert(resultado instanceof Error, "deadline no passado tinha de rejeitar");
  assertEquals((resultado as Error).name, "TimeoutError");
  assert(cancelado, "o corpo tinha de ser liberado mesmo sem tentar ler");
});

Deno.test("readJsonWithinDeadline: corpo JSON rápido resolve normalmente", async () => {
  const mod = providers as {
    readJsonWithinDeadline?: (r: Response, deadlineAt: number) => Promise<Record<string, unknown>>;
  };
  assert(typeof mod.readJsonWithinDeadline === "function", "readJsonWithinDeadline ausente");

  const resposta = new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  const data = await mod.readJsonWithinDeadline(resposta, Date.now() + 5_000);
  assertEquals((data as { choices?: unknown[] }).choices?.length, 1);
});
