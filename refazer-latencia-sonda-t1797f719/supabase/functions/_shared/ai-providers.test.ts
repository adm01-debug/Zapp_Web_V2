// IA-TIMEOUT-001 — o prazo do provedor tem de cobrir a leitura do corpo.
//
// Defeito original: o timer do AbortController era desarmado no `finally`
// logo que o `fetch` resolvia — ou seja, quando chegavam os HEADERS. Um corpo
// travado depois de headers rápidos pendurava a chamada para sempre (a sonda
// .tmp/sonda-abort-corpo.ts mediu na prática: abortar depois dos headers
// derruba a leitura do corpo — `res.text()` rejeitou no instante do abort).
//
// Estes testes fixam o aceite:
//   (a) headers imediatos + corpo que NUNCA termina → AbortError dentro do
//       orçamento (provado nos 3 provedores);
//   (b) sem `timeoutMs`: nenhum `signal` chega ao fetch e os bytes do corpo
//       passam idênticos;
//   (c) corpo que termina dentro do orçamento: bytes idênticos e o timer é
//       desarmado no fim da leitura.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env \
//   --allow-read --allow-net=127.0.0.1 \
//   supabase/functions/_shared/ai-providers.test.ts

import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  callCustomWebhook,
  callLovableAI,
  callOpenAICompatible,
} from "./ai-providers.ts";

// ---------------------------------------------------------------------------
// (a) o corpo travado tem de estourar o orçamento
// ---------------------------------------------------------------------------

/**
 * Fetch falso que devolve headers imediatos e um corpo que NUNCA fecha.
 * Replica a semântica medida na sonda: quando o `signal` aborta, a leitura do
 * corpo rejeita. Sem o fix, o timer desarma nos headers e nada aborta — o
 * teste cai no "NAO_TERMINOU" do race.
 */
function stubFetchCorpoTravado(): { restaurar: () => void } {
  const original = globalThis.fetch;
  globalThis.fetch = ((_input: unknown, init?: RequestInit) => {
    const sinal = init?.signal;
    const corpo = new ReadableStream<Uint8Array>({
      start(controlador) {
        sinal?.addEventListener("abort", () => {
          try {
            controlador.error(new DOMException("The operation was aborted.", "AbortError"));
          } catch { /* stream já encerrado */ }
        });
      },
    });
    return Promise.resolve(
      new Response(corpo, { status: 200, headers: { "content-type": "application/json" } }),
    );
  }) as typeof fetch;
  return { restaurar: () => { globalThis.fetch = original; } };
}

async function corpoTravadoDeveAbortar(
  rotulo: string,
  chamar: (options: { timeoutMs?: number }) => Promise<Response>,
): Promise<void> {
  const { restaurar } = stubFetchCorpoTravado();
  let resposta: Response | null = null;
  try {
    resposta = await chamar({ timeoutMs: 40 });
    // Race contra um timer grande: no estado quebrado a leitura nunca
    // resolve e o teste falha rápido (sem esperar o processo travar).
    const desfecho = await Promise.race([
      resposta.text().then(
        () => "LEU_TUDO" as const,
        (erro: unknown) => erro,
      ),
      new Promise<"NAO_TERMINOU">((resolve) => setTimeout(() => resolve("NAO_TERMINOU"), 1000)),
    ]);
    assertNotEquals(
      desfecho,
      "NAO_TERMINOU",
      `${rotulo}: corpo travado depois dos headers não foi abortado — o prazo parou nos headers`,
    );
    assertNotEquals(
      desfecho,
      "LEU_TUDO",
      `${rotulo}: o corpo nunca fecha e a leitura terminou?`,
    );
    assertEquals(
      (desfecho as { name?: string }).name,
      "AbortError",
      `${rotulo}: o estouro de prazo tem de virar AbortError`,
    );
  } finally {
    try { await resposta?.body?.cancel(); } catch { /* já encerrado */ }
    restaurar();
  }
}

Deno.test("IA-TIMEOUT-001 callLovableAI: corpo que não termina é abortado dentro do orçamento", async () => {
  await corpoTravadoDeveAbortar("callLovableAI", (options) =>
    callLovableAI({ messages: [], apiKey: "k", options }));
});

Deno.test("IA-TIMEOUT-001 callOpenAICompatible: corpo que não termina é abortado dentro do orçamento", async () => {
  await corpoTravadoDeveAbortar("callOpenAICompatible", (options) =>
    callOpenAICompatible({
      endpoint: "https://provedor.test/v1/chat",
      apiKey: "k",
      messages: [],
      options,
    }));
});

Deno.test("IA-TIMEOUT-001 callCustomWebhook: corpo que não termina é abortado dentro do orçamento", async () => {
  await corpoTravadoDeveAbortar("callCustomWebhook", (options) =>
    callCustomWebhook({ endpoint: "https://webhook.test/ia", messages: [], options }));
});

// ---------------------------------------------------------------------------
// (b) sem `timeoutMs` nada muda: nenhum signal, bytes idênticos
// ---------------------------------------------------------------------------

Deno.test("IA-TIMEOUT-001 sem timeoutMs: nenhum signal vai ao fetch e os bytes passam intactos", async () => {
  const bytes = new TextEncoder().encode('{"choices":[{"message":{"content":"ok"}}]}');
  const sinais: Array<AbortSignal | null | undefined> = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((_input: unknown, init?: RequestInit) => {
    sinais.push(init?.signal);
    return Promise.resolve(new Response(bytes.slice(), { status: 200 }));
  }) as typeof fetch;
  try {
    const chamadas: Array<[string, () => Promise<Response>]> = [
      ["callLovableAI", () => callLovableAI({ messages: [], apiKey: "k" })],
      ["callOpenAICompatible", () =>
        callOpenAICompatible({ endpoint: "https://provedor.test/v1/chat", apiKey: "k", messages: [] })],
      ["callCustomWebhook", () =>
        callCustomWebhook({ endpoint: "https://webhook.test/ia", messages: [] })],
    ];
    for (const [rotulo, chamar] of chamadas) {
      const resposta = await chamar();
      const recebido = new Uint8Array(await resposta.arrayBuffer());
      assertEquals(recebido, bytes, `${rotulo}: os bytes do corpo não podem mudar`);
    }
    assertEquals(sinais.length, 3, "cada provedor chama o fetch exatamente uma vez");
    for (const sinal of sinais) {
      assertEquals(sinal, undefined, "sem timeoutMs nenhum signal pode chegar ao fetch");
    }
  } finally {
    globalThis.fetch = original;
  }
});

// ---------------------------------------------------------------------------
// (c) corpo que termina no orçamento: bytes idênticos + timer desarmado no fim
// ---------------------------------------------------------------------------

Deno.test("IA-TIMEOUT-001 corpo que termina no orçamento: bytes idênticos e clearTimeout chamado no fim da leitura", async () => {
  const bytes = new TextEncoder().encode('{"ok":true}');
  const limpos: unknown[] = [];
  const originalFetch = globalThis.fetch;
  const originalClear = globalThis.clearTimeout;
  globalThis.clearTimeout = ((id?: number) => {
    limpos.push(id);
    return originalClear(id);
  }) as typeof clearTimeout;
  globalThis.fetch = (() =>
    Promise.resolve(new Response(bytes.slice(), { status: 200 }))) as typeof fetch;
  try {
    const resposta = await callLovableAI({
      messages: [],
      apiKey: "k",
      options: { timeoutMs: 5000 },
    });
    const recebido = new Uint8Array(await resposta.arrayBuffer());
    assertEquals(recebido, bytes, "o corpo tem de chegar byte a byte");
    assert(
      limpos.length >= 1,
      "o timer do prazo tem de ser desarmado quando a leitura do corpo termina",
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.clearTimeout = originalClear;
  }
});
