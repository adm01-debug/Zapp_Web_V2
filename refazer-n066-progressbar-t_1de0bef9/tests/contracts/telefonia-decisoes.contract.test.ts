import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PLANO = 'docs/design/PLANO_TELEFONIA_FINALIZACAO_100_ETAPAS_2026-09-29.md';

/**
 * Contrato da seção 10 (Decisões) do plano da Telefonia — aceite do T98:
 * "seção 10 completa".
 *
 * A seção 10 é a fonte de verdade das decisões do módulo (T02). O T98 exige que
 * D1–D7 estejam ali como decisões FINAIS, com data e quem decidiu, e que os
 * limites assumidos — o que NÃO está prometido — fiquem registrados. O contrato
 * trava isso: cada linha de D1–D7 precisa de valor, data ISO e autor
 * preenchidos, o fechamento precisa ser datado, e a lista de limites precisa
 * citar os quatro itens que o T98 nomeia. Nada aqui exige mudança no corpo
 * histórico: só a seção 10 é inspecionada.
 */

/** Seção 10 = do cabeçalho "## 10. Decisões" até a próxima seção de nível 2. */
function secao10(): string {
  const md = readFileSync(PLANO, 'utf8');
  const linhas = md.split('\n');
  const inicio = linhas.findIndex((linha) => linha.startsWith('## 10. Decisões'));
  expect(inicio, 'a seção "## 10. Decisões" precisa existir no plano').toBeGreaterThan(-1);
  const fim = linhas.findIndex((linha, i) => i > inicio && linha.startsWith('## '));
  return linhas.slice(inicio, fim === -1 ? linhas.length : fim).join('\n');
}

/** Células da linha da tabela de decisões: ['', id, Decisão, Valor, Data, Quem, '']. */
function linhaDe(id: string): string[] {
  const linha = secao10()
    .split('\n')
    .find((l) => l.startsWith(`| ${id} |`));
  expect(linha, `a linha ${id} precisa existir na tabela da seção 10`).toBeDefined();
  return (linha as string).split('|').map((celula) => celula.trim());
}

describe('seção 10 — decisões finais da Telefonia (T98)', () => {
  const decisoes = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'];

  for (const id of decisoes) {
    it(`${id} tem valor, data ISO e quem decidiu`, () => {
      const celulas = linhaDe(id);
      expect(celulas, `${id}: a linha precisa ter 5 colunas`).toHaveLength(7);
      const [, , decisao, valor, data, quem] = celulas;
      expect(decisao.length, `${id}: falta o nome da decisão`).toBeGreaterThan(0);
      expect(valor.length, `${id}: falta o valor decidido`).toBeGreaterThan(0);
      expect(data, `${id}: a data precisa estar no formato ISO`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(quem.length, `${id}: falta quem decidiu`).toBeGreaterThan(0);
    });
  }

  it('declara o fechamento do T98, datado', () => {
    const secao = secao10();
    expect(secao, 'o fechamento do T98 precisa estar na seção 10').toMatch(/Fechamento do T98/);
    expect(secao, 'o fechamento do T98 precisa ser datado').toMatch(
      /Fechamento do T98[^\n]{0,60}\d{2}\/\d{2}\/\d{4}/,
    );
  });

  it('lista o que NÃO está prometido, com os quatro itens do T98', () => {
    const secao = secao10();
    expect(secao, 'a lista do que não está prometido precisa estar na seção 10').toMatch(
      /n[ãa]o\*{0,2}\s*est[áa]\*{0,2}\s*prometid/i,
    );
    const itens: [string, RegExp][] = [
      ['saída por WhatsApp', /sa[íi]da por whatsapp/i],
      ['gravação', /grava[çc][ãa]o de chamada/i],
      ['ramal por agente', /ramal por agente/i],
      ['seleção de dispositivo de áudio', /dispositivo de [áa]udio/i],
    ];
    for (const [nome, regex] of itens) {
      expect(secao, `falta o item "${nome}" na lista do que não está prometido`).toMatch(regex);
    }
  });

  it('não deixa decisão em aberto (a decidir / TBD / pendente)', () => {
    expect(secao10()).not.toMatch(/\ba decidir\b|\bTBD\b|pendente de decis[ãa]o/i);
  });
});
