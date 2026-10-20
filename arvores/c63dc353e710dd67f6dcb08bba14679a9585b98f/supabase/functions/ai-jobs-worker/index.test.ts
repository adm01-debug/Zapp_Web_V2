// IA-051 — a correlação tem de sobreviver aos DOIS saltos que ligam a fila ao log.
//
// Por que este arquivo existe: os testes do registrador (`_shared/ai-usage.test.ts`)
// provam que o canal grava `request_id`/`job_id`/`attempt` e recusa dado pessoal.
// Eles NÃO veem o que acontece no meio do caminho — quem preenche esses campos é
// (a) o handler `ai.generate` do worker, que tem o job arrendado na mão, e (b) o
// roteador `generateWithRouting`, que repassa para o registrador central.
// Se qualquer um dos dois saltos perder os campos, a correlação morre EM SILÊNCIO:
// o log continua sendo gravado, só deixa de responder "de onde veio este gasto".
//
// LIMITE DECLARADO (não é prova de comportamento): isto é uma **guarda de origem** —
// lê o código e falha se a fiação sumir, no mesmo estilo da guarda do ponto de
// chamada do `ai-proxy` em `_shared/ai-usage.test.ts`. A prova de RUNTIME de um job
// da fila até o log exigiria provedor real e a flag `AI_JOBS_ENABLE_AI_GENERATE`
// ligada, além de credencial de banco que este ambiente não tem: está declarada como
// limitação no corpo do PR, não maquiada aqui.
//
// NOTA para o ratchet `tests/contracts/_adv_edge_legacy_producers.test.ts`: este
// arquivo conta como +1 `.ts` em `supabase/functions` (sem produtor de vocabulário
// legado). Não usa o "regex antigo" — o fatiamento é por `indexOf`, de propósito.
//
// Run with: deno test --allow-read supabase/functions/ai-jobs-worker/index.test.ts

import { assert } from "https://deno.land/std@0.224.0/testing/asserts.ts";

const WORKER = new URL("./index.ts", import.meta.url);
const ROTEADOR = new URL("../_shared/ai-generate.ts", import.meta.url);

/** Trecho do fonte entre `inicio` e o primeiro `fim` depois dele (vazio se não achar). */
function trecho(fonte: string, inicio: string, fim: string): string {
  const i = fonte.indexOf(inicio);
  if (i < 0) return "";
  const j = fonte.indexOf(fim, i + inicio.length);
  return j < 0 ? fonte.slice(i) : fonte.slice(i, j + fim.length);
}

Deno.test("IA-051: o handler `ai.generate` liga a chamada ao job e à tentativa arrendados", async () => {
  const fonte = await Deno.readTextFile(WORKER);

  const chamada = trecho(fonte, "generateWithRouting({", "});");
  assert(
    chamada.length > 0,
    "não encontrei a chamada de `generateWithRouting` no worker (o código mudou?)",
  );

  assert(
    /jobId:\s*input\.job\.id\b/.test(chamada),
    "o handler `ai.generate` não passa `jobId: input.job.id`: o consumo da fila deixa de ser rastreável até o job",
  );
  assert(
    /attempt:\s*input\.job\.attemptCount\b/.test(chamada),
    "o handler `ai.generate` não passa `attempt: input.job.attemptCount`: a tentativa se perde e a IA-054 não reconcilia",
  );

  // A fiação tem de estar DENTRO da chamada do roteador, não solta no arquivo:
  // um `jobId` computado e nunca usado seria a mesma perda, com aparência de feita.
  assert(
    /input\.job\.id/.test(chamada) && /input\.job\.attemptCount/.test(chamada),
    "os campos de correlação existem no arquivo mas ficaram FORA da chamada do roteador",
  );
});

Deno.test("IA-051: o roteador repassa requestId/jobId/attempt ao registrador central", async () => {
  const fonte = await Deno.readTextFile(ROTEADOR);

  // (1) o contrato aceita os três campos.
  for (const campo of ["requestId", "jobId", "attempt"]) {
    assert(
      new RegExp(`${campo}\\?:\\s*(string|number) \\| null`).test(fonte),
      `GenerateParams não declara \`${campo}\` — o caller não tem como informar a correlação`,
    );
  }

  // (2) o registrador central recebe os três (é o único ponto de log do roteador).
  const insert = trecho(fonte, "logAiUsage({", "});");
  assert(insert.length > 0, "não encontrei a chamada de `logAiUsage` no roteador (o código mudou?)");
  for (const campo of ["requestId", "jobId", "attempt"]) {
    assert(
      new RegExp(`\\n\\s*${campo},`).test(insert),
      `o roteador não repassa \`${campo}\` ao log: a correlação é recebida e descartada`,
    );
  }

  // (3) e são lidos dos params (não hardcoded).
  for (const campo of ["requestId", "jobId", "attempt"]) {
    assert(
      new RegExp(`params\\.${campo}\\b`).test(fonte),
      `\`${campo}\` não é lido de \`params\` — valor fixo não correlaciona nada`,
    );
  }
});

Deno.test("IA-051: o worker continua sem registrar dado pessoal como identificador", async () => {
  const fonte = await Deno.readTextFile(WORKER);
  const chamada = trecho(fonte, "generateWithRouting({", "});");
  assert(chamada.length > 0, "não encontrei a chamada de `generateWithRouting` no worker");

  // A tentação num worker é usar `payload` (que carrega conteúdo de conversa) como
  // identificador. A correlação tem de usar o ID do job, nunca o payload.
  assert(
    !/jobId:\s*input\.payload/.test(chamada),
    "o worker usa o payload como identificador de log — payload carrega conteúdo, não id",
  );
  assert(
    !/attempt:\s*input\.payload/.test(chamada),
    "o worker usa o payload como número de tentativa",
  );
});
