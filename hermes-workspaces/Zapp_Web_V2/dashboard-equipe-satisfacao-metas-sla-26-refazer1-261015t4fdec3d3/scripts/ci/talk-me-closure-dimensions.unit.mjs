import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// TM-04 (#173): baseline/piloto/observabilidade não podem sustentar fechamento
// operacional completo. Este relatório misturava código entregue com operação
// validada (amostra de 33 itens, navegação sintética e faixa 091–100 de
// publicação). O fechamento precisa manter cada dimensão separada e explicitar
// a ausência de p95, piloto, homologação nominal e janela de observação.
const report = readFileSync(
  new URL('../../docs/design/RELATORIO_EXECUCAO_TALK_ME_2026-09-30.md', import.meta.url),
  'utf8',
);

test('relatório mantém orçamento, piloto, humano e observação como dimensões próprias', () => {
  assert.match(report, /## Dimensões de fechamento: orçamento, piloto, humano e observação/);
  for (const dimensao of ['BASELINE', 'P95', 'PILOT', 'HUMAN', 'OBSERVATION']) {
    assert.match(
      report,
      new RegExp(`\\| ${dimensao} \\|`),
      `dimensão ${dimensao} ausente na tabela de fechamento`,
    );
  }
});

test('orçamento declara condições, amostra e métrica', () => {
  assert.match(report, /\| BASELINE \| Orçamento com condições declaradas \|/);
  assert.match(report, /\| BASELINE \| Orçamento com amostra declarada \|/);
  assert.match(report, /\| BASELINE \| Orçamento com métrica declarada \|/);
});

test('p95 de leitura e claim permanece explicitamente ausente', () => {
  assert.match(report, /\| P95 \| p95 de leitura\/claim \|/);
  assert.match(report, /p95 de leitura e de claim não medidos/);
});

test('piloto permanece explicitamente ausente com público, critério e resultado', () => {
  assert.match(report, /\| PILOT \| Piloto com público declarado \|/);
  assert.match(report, /\| PILOT \| Piloto com critério declarado \|/);
  assert.match(report, /\| PILOT \| Piloto com resultado declarado \|/);
  assert.match(report, /Nenhum piloto foi executado/);
});

test('homologação nominal permanece explicitamente ausente', () => {
  assert.match(report, /\| HUMAN \| Homologação nominal \|/);
  assert.match(report, /homologação nominal não registrada/);
});

test('observação permanece explicitamente ausente sem janela registrada', () => {
  assert.match(report, /\| OBSERVATION \| Janela de observação registrada \|/);
  assert.match(report, /janela de observação não registrada/);
});

test('faixa 091–100 não volta a chamar registro de publicação de observabilidade medida', () => {
  assert.doesNotMatch(
    report,
    /\| 091–100 \| PR, flag, ordem de release, aplicação canônica, validação online, observabilidade e reversão são registrados/,
  );
  assert.match(report, /\| 091–100 \|[^\n]+não equivale a observabilidade medida[^\n]*\|/);
});
