/**
 * SL-054 (inventário 021–023) — backoff de DLQ COMPARTILHADO (fonte única).
 *
 * Defeito: a tabela de backoff do dead letter (30 s / 2 min / 10 min) existia
 * em TRÊS lugares — o kernel `_shared/messaging/errors.ts` (`BACKOFF_CEILING_MS`)
 * e uma cópia local em CADA motor de envio:
 *   - `supabase/functions/multiplix-send/index.ts`  -> `RETRY_BACKOFF_MS`
 *   - `supabase/functions/talkx-send/process-recipient.ts` -> `backoffMs` inline
 * É exatamente o padrão que já motivou o `_shared/messaging/timing.ts`
 * ("`randomBetween` e `sleep` nasceram DUPLICADOS ... para existir UMA definição
 * só: ... não pode divergir em silêncio entre os dois edges na próxima
 * correção"). Com a política copiada, corrigir um motor deixaria o outro para
 * trás sem que nada falhasse.
 *
 * O teste é o RED antes e o GREEN depois da correção; prova duas coisas:
 *   1. a sequência de retries é reproduzível e vem do kernel (valores canônicos
 *      — a troca da cópia local pelo compartilhado NÃO muda o comportamento);
 *   2. nenhum motor mantém a própria cópia da política: os dois leem a MESMA
 *      definição.
 *
 * O item (2) é varredura de fonte (`Deno.readTextFile`) de propósito: o defeito
 * é a DUPLICAÇÃO da política, e ela não aparece em nenhuma chamada de função —
 * os números são idênticos antes e depois da correção. Só o texto de quem
 * DECLARA a tabela distingue os dois estados. A varredura usa caminho relativo
 * a este arquivo, nunca `/tmp` nem caminho de máquina.
 */
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  BACKOFF_CEILING_MS,
  MAX_ATTEMPTS,
  backoffDelayForAttempts,
  planRetry,
  providerErrorInfo,
} from "../messaging/errors.ts";

/** Os dois motores que reenviam mensagem e mantinham a cópia local. */
const MOTORES = [
  new URL("../../multiplix-send/index.ts", import.meta.url),
  new URL("../../talkx-send/process-recipient.ts", import.meta.url),
];

/** `[30_000, 120_000, 600_000]` em qualquer espaçamento/estilo de escrita. */
const TABELA_LITERAL = /30_000\s*,\s*120_000\s*,\s*600_000/;

/** Lê o fonte de um motor (erro explícito se o caminho mudar de lugar). */
async function fonte(url: URL): Promise<string> {
  try {
    return await Deno.readTextFile(url);
  } catch (err) {
    throw new Error(`nao consegui ler ${url.pathname}: ${err instanceof Error ? err.message : err}`);
  }
}

Deno.test("SL-054: a sequencia de retries e reproduzivel e vem do kernel (30s/2min/10min)", () => {
  // Valores canônicos do DLQ — a troca da cópia local pelo kernel tem de
  // preservá-los; se alguém mexer no teto, é aqui que aparece.
  assertEquals([...BACKOFF_CEILING_MS], [30_000, 120_000, 600_000]);
  // A 4ª falha aposenta o item (dead letter) — o mesmo teto de tentativas.
  assertEquals(MAX_ATTEMPTS, 4);
  // Reproduzível: a mesma leitura devolve a mesma sequência, sempre.
  assertEquals([...BACKOFF_CEILING_MS], [...BACKOFF_CEILING_MS]);
});

Deno.test("SL-054: a sequencia de retries do DLQ vem da tabela compartilhada (planRetry REAL)", () => {
  // `planRetry` e a funcao REAL que o multiplix-send usa para decidir o retry
  // (e a mesma familia que o talkx-send segue): aqui ela e chamada com o status
  // real de rate limit. Cada degrau tem de sair de BACKOFF_CEILING_MS — a
  // unica definicao — e a 4a falha tem de aposentar o item (dead letter, sem
  // retryAfter). `nowMs = 0` deixa a sequencia reproduzivel.
  const info429 = providerErrorInfo(429, { message: "too many requests" });
  assertEquals(info429.class, "transient", "429 tem de ser transitorio para reentrar");
  for (let i = 0; i < BACKOFF_CEILING_MS.length; i++) {
    const d = planRetry(info429, i + 1, 0);
    assertEquals(d.action, "retry", `tentativa ${i + 1} tem de reentrar`);
    assertEquals(
      d.delayMs,
      BACKOFF_CEILING_MS[i],
      `degrau ${i + 1} tinha de ser BACKOFF_CEILING_MS[${i}]`,
    );
  }
  const d4 = planRetry(info429, MAX_ATTEMPTS, 0);
  assertEquals(d4.action, "dead_letter", "4a falha aposenta o item");
  assertEquals(d4.retryAfter, undefined, "dead letter nao agenda retry");

  // Caminho PRE-DISPATCH (o dos dois motores): a conta REAL que eles chamam.
  const pre = [0, 1, 2, 3, 99, -1, Number.NaN].map((n) => backoffDelayForAttempts(n));
  assertEquals(
    pre,
    [30_000, 120_000, 600_000, 600_000, 600_000, 30_000, 30_000],
    "degrau pre-dispatch tem de seguir a tabela compartilhada, com teto no ultimo e entrada invalida no primeiro",
  );
});

Deno.test("SL-054: nenhum motor declara a propria tabela de backoff (fonte unica)", async () => {
  for (const url of MOTORES) {
    const src = await fonte(url);
    assert(
      !TABELA_LITERAL.test(src),
      `${url.pathname} ainda declara a tabela de backoff 30s/2min/10min — a politica tem de vir do kernel (BACKOFF_CEILING_MS)`,
    );
  }
});

Deno.test("SL-054: os dois motores usam a MESMA conta de backoff do kernel", async () => {
  for (const url of MOTORES) {
    const src = await fonte(url);
    assert(
      /\bbackoffDelayForAttempts\b/.test(src),
      `${url.pathname} nao usa backoffDelayForAttempts — o backoff do DLQ tem de ser o compartilhado`,
    );
  }
});
