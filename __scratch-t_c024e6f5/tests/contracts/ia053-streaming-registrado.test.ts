/**
 * IA-053 — o caminho de streaming precisa DEIXAR REGISTRO.
 *
 * Defeito medido antes desta correção (`ai-proxy/index.ts`): o ramo de streaming
 * devolvia `new Response(response.body, ...)` e retornava ANTES de qualquer
 * gravação — a chamada paga não gerava linha nenhuma em `ai_usage_logs`. E o
 * registrador gravava os tokens com `|| 0`, o que transformava "não medido" em
 * consumo ZERO nos relatórios. O aceite da etapa proíbe exatamente as duas
 * coisas: ficar ausente dos relatórios, ou receber custo zero por falta de dado.
 *
 * Este contrato é de FIAÇÃO: as propriedades do medidor (bytes intactos,
 * cancelamento, ausência declarada) são provadas por comportamento em
 * `supabase/functions/_shared/ai-usage.test.ts`. Aqui a pergunta é outra: o
 * `ai-proxy` realmente usa o medidor, e o registrador realmente parou de
 * inventar zero?
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');

function ler(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

/** Trecho do fonte entre `inicio` e o primeiro `fim` posterior. */
function bloco(fonte: string, inicio: string, fim: string): string {
  const i = fonte.indexOf(inicio);
  expect(i, 'não achei o trecho de abertura: ' + inicio).toBeGreaterThanOrEqual(0);
  const j = fonte.indexOf(fim, i);
  expect(j, 'não achei o fechamento do trecho: ' + fim).toBeGreaterThanOrEqual(0);
  return fonte.slice(i, j + fim.length);
}

/** O ramo `if (streamRequested) { ... }` do ai-proxy, isolado do resto. */
function ramoDeStream(): string {
  return bloco(ler('supabase/functions/ai-proxy/index.ts'), 'if (streamRequested) {', '\n    }');
}

describe('IA-053 — streaming registrado no consumo', () => {
  it('o ramo de streaming passa o corpo pelo medidor', () => {
    expect(
      ramoDeStream(),
      'o corpo do provedor tem de passar pelo medidor — sem ele não há desfecho para registrar',
    ).toContain('medirStream(response.body');
  });

  it('o desfecho do stream vira linha em ai_usage_logs', () => {
    expect(
      ramoDeStream(),
      'o desfecho tem de ser entregue ao registrador (com EdgeRuntime.waitUntil)',
    ).toContain('logAiUsageDetached({');
  });

  it('devolver o corpo cru sem medir continua sendo reprovado', () => {
    expect(
      ramoDeStream(),
      'devolver `response.body` sem medir é o defeito original: a chamada paga some do relatório',
    ).not.toContain('new Response(response.body,');
  });

  it('sem uso declarado pelo provedor, o consumo é marcado como DESCONHECIDO', () => {
    expect(
      ramoDeStream(),
      'sem `usage` no stream, a linha precisa declarar o desconhecido em vez de gravar zero',
    ).toContain('usageUnknown: desfecho.usage === null');
  });

  it('o registro carrega o lastro medido do desfecho', () => {
    const ramo = ramoDeStream();
    for (const chave of ['stream_cancelled', 'stream_completed', 'stream_bytes', 'stream_chunks']) {
      expect(ramo, 'o registro perdeu o fato medido: ' + chave).toContain(chave + ': desfecho.');
    }
    expect(ramo, 'cancelamento (saída parcial) tem de ser distinguível de sucesso').toContain(
      "'cancelled'",
    );
    expect(ramo, 'falha no meio do stream tem de ser registrada como erro').toContain("'error'");
  });

  it('o registrador grava os tokens não medidos como NULL, nunca como zero por omissão', () => {
    const fonte = ler('supabase/functions/_shared/ai-usage.ts');
    expect(
      fonte,
      'tokens não medidos têm de virar NULL — zero significa "mediu e deu zero"',
    ).toContain('entry.usageUnknown === true ? null : (entry.inputTokens ?? 0)');
    expect(fonte).toContain('entry.usageUnknown === true ? null : (entry.outputTokens ?? 0)');
    expect(
      /input_tokens:\s*entry\.inputTokens\s*\|\|/.test(fonte),
      'a coerção `|| 0` volta a transformar ausência de medição em consumo zero',
    ).toBe(false);
    expect(
      fonte,
      'a linha precisa DECLARAR que o consumo é desconhecido',
    ).toContain('rota.usage_unknown = true');
  });
});
