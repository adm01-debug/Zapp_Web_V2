/**
 * CONTRATO DOS ALVOS DE WEB VITALS (E34 / SL-229) — a seção `web-vitals` do
 * `performance-budget.json` declara, métrica a métrica, se o CAMPO a publica.
 *
 * Por que existe: em 03/10/2026 a coleta de campo foi ligada (E36) e a seção
 * `web-vitals` passou a ser a fonte única dos alvos (`src/lib/web-vitals.ts` lê o
 * arquivo). Em 08/10/2026 a comparação com o campo (Speed Insights) mostrou que a
 * seção NÃO batia com o que o campo publica:
 *   - `FID` tinha alvo e o campo não a publica — é métrica aposentada, e o schema
 *     (`vercel metrics schema vercel.speed_insights`) lista só cls, fcp, inp, lcp
 *     e ttfb.
 * Sem guarda, o alvo que ninguém mede e a métrica que ninguém limita voltam em
 * silêncio: o `FID` ficou meses na seção sem ninguém notar.
 *
 * A regra é uma função só (`violacoesDosAlvos`), aplicada ao arquivo REAL e a uma
 * matriz de casos sintéticos — cada defeito abaixo tem um caso que NÃO pode passar.
 * Dois pontos de atrito com o resto do repositório, resolvidos na regra:
 *   - o FCP já tinha alvo quando esta guarda entrou (SL-105, 1500 ms, mais estrito
 *     que os 1800 ms publicados): alvo de campo pode ser MAIS ESTRITO que o
 *     publicado, nunca mais frouxo — a regra compara com a tabela em vez de exigir
 *     igualdade. Métrica sem par de campo (FID) mantém o limite publicado exato.
 *   - o TTI (SL-105) é métrica de laboratório, que o campo não publica: fica
 *     declarado `field: false` com `note`, na lista curta de alvos locais aceitos.
 *
 * Tabela publicada do Web Vitals (web.dev/articles/vitals e a página de cada métrica):
 *   LCP  good <= 2500 ms  · poor > 4000 ms
 *   INP  good <=  200 ms  · poor >  500 ms
 *   CLS  good <=    0,1   · poor >    0,25
 *   TTFB good <=  800 ms  · poor > 1800 ms
 *   FCP  good <= 1800 ms  · poor > 3000 ms
 *   FID  (aposentada em favor do INP; alvo mantido só enquanto o código coletar
 *        `first-input` — hoje em `src/lib/web-vitals.ts`): 100 / 300
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = resolve(__dirname, '../..');
const BUDGET = resolve(RAIZ, 'performance-budget.json');

/** Métricas que o Speed Insights publica (schema conferido em 08/10/2026). */
const METRICAS_DE_CAMPO = ['CLS', 'FCP', 'INP', 'LCP', 'TTFB'];

/** Limites publicados de cada métrica (good / poor) — TETO, não igualdade. */
const LIMITES_OFICIAIS: Record<string, { target: number; poor: number }> = {
  LCP: { target: 2500, poor: 4000 },
  INP: { target: 200, poor: 500 },
  CLS: { target: 0.1, poor: 0.25 },
  TTFB: { target: 800, poor: 1800 },
  FCP: { target: 1800, poor: 3000 },
  FID: { target: 100, poor: 300 },
};

/** Alvos locais aceitos: métricas que o projeto mede e o campo não publica. */
const ALVOS_LOCAIS = ['TTI'];

export interface Alvo {
  target?: number;
  poor?: number;
  unit?: string;
  field?: boolean;
  note?: string;
  rating?: string;
}

/**
 * Toda violação do contrato dos alvos. Vazio = contrato cumprido.
 * É a MESMA função usada no arquivo real e nos casos sintéticos abaixo.
 */
export function violacoesDosAlvos(alvos: Record<string, Alvo>): string[] {
  const violacoes: string[] = [];

  for (const nome of Object.keys(alvos).sort()) {
    const alvo = alvos[nome];

    if (typeof alvo.field !== 'boolean') {
      violacoes.push(`${nome}: alvo sem a declaração 'field' (true = o campo publica; false = exceção com 'note')`);
      continue;
    }
    if (alvo.field === true && !METRICAS_DE_CAMPO.includes(nome)) {
      violacoes.push(`${nome}: 'field': true, mas o campo não publica essa métrica (${METRICAS_DE_CAMPO.join(', ')})`);
    }
    if (alvo.field === false && String(alvo.note ?? '').trim() === '') {
      violacoes.push(`${nome}: 'field': false exige 'note' não vazia`);
    }

    const oficial = LIMITES_OFICIAIS[nome];
    if (!oficial) {
      if (!ALVOS_LOCAIS.includes(nome)) {
        violacoes.push(`${nome}: alvo fora da tabela publicada do Web Vitals e dos alvos locais aceitos`);
      }
    } else if (alvo.field === true) {
      // Alvo de campo pode ser mais estrito que o publicado; nunca mais frouxo.
      const maisFrouxo =
        typeof alvo.target !== 'number' ||
        typeof alvo.poor !== 'number' ||
        alvo.target > oficial.target ||
        alvo.poor > oficial.poor;
      if (maisFrouxo) {
        violacoes.push(`${nome}: ${alvo.target}/${alvo.poor} mais frouxo que o publicado ${oficial.target}/${oficial.poor}`);
      }
    } else if (alvo.target !== oficial.target || alvo.poor !== oficial.poor) {
      // Sem par de campo (métrica aposentada): o limite publicado é mantido exato.
      violacoes.push(`${nome}: ${alvo.target}/${alvo.poor} divergiu do publicado ${oficial.target}/${oficial.poor}`);
    }

    if (typeof alvo.target !== 'number' || typeof alvo.poor !== 'number' || !(alvo.target < alvo.poor)) {
      violacoes.push(`${nome}: target precisa ser numérico e menor que poor`);
    }
    if (alvo.unit !== 'ms' && alvo.unit !== 'score') {
      violacoes.push(`${nome}: unidade '${String(alvo.unit)}' fora de ms/score`);
    }
  }

  for (const nome of METRICAS_DE_CAMPO) {
    if (!(nome in alvos)) violacoes.push(`${nome}: sem alvo (o campo publica essa métrica)`);
  }

  return violacoes;
}

const orcamento = JSON.parse(readFileSync(BUDGET, 'utf8')) as { 'web-vitals'?: Record<string, Alvo> };
const alvosDoArquivo = orcamento['web-vitals'] ?? {};

describe('contrato dos alvos de Web Vitals (E34)', () => {
  it('o arquivo real cumpre o contrato (sem violação)', () => {
    // Âncora contra varredura vazia: a seção existe e cobre o campo de hoje.
    expect(Object.keys(alvosDoArquivo).length).toBeGreaterThanOrEqual(METRICAS_DE_CAMPO.length);
    expect(violacoesDosAlvos(alvosDoArquivo)).toEqual([]);
  });

  it('o arquivo real declara FCP (campo) e FID e TTI sem par de campo, com note', () => {
    expect(alvosDoArquivo['FCP']?.field).toBe(true);
    expect(alvosDoArquivo['FID']?.field).toBe(false);
    expect(String(alvosDoArquivo['FID']?.note ?? '').trim().length).toBeGreaterThan(0);
    expect(alvosDoArquivo['TTI']?.field).toBe(false);
    expect(String(alvosDoArquivo['TTI']?.note ?? '').trim().length).toBeGreaterThan(0);
  });

  describe('matriz de defeitos (cada caso tem de ser RECUSADO)', () => {
    const valido = (): Record<string, Alvo> => ({
      LCP: { target: 2500, poor: 4000, field: true, unit: 'ms', rating: 'good' },
      INP: { target: 200, poor: 500, field: true, unit: 'ms' },
      CLS: { target: 0.1, poor: 0.25, field: true, unit: 'score' },
      TTFB: { target: 800, poor: 1800, field: true, unit: 'ms' },
      FCP: { target: 1500, poor: 3000, field: true, unit: 'ms' },
      FID: { target: 100, poor: 300, field: false, unit: 'ms', note: 'aposentada; o campo não publica' },
      TTI: { target: 3000, poor: 5000, field: false, unit: 'ms', note: 'laboratório; o campo não publica' },
    });

    const casos: Array<{ nome: string; defeito: (a: Record<string, Alvo>) => void; esperado: string }> = [
      { nome: 'FID de volta como métrica de campo', defeito: (a) => { a.FID.field = true; }, esperado: "FID: 'field': true" },
      { nome: 'FCP sem alvo', defeito: (a) => { delete a.FCP; }, esperado: 'FCP: sem alvo' },
      { nome: 'exceção sem note', defeito: (a) => { delete a.FID.note; }, esperado: "FID: 'field': false exige 'note'" },
      { nome: 'alvo sem declaração de campo', defeito: (a) => { delete a.INP.field; }, esperado: "INP: alvo sem a declaração 'field'" },
      { nome: 'target mais frouxo que o publicado', defeito: (a) => { a.LCP.target = 3000; }, esperado: 'LCP: 3000/4000 mais frouxo que o publicado 2500/4000' },
      { nome: 'target maior que poor', defeito: (a) => { a.CLS.poor = 0.05; }, esperado: 'CLS: target precisa ser numérico e menor que poor' },
      { nome: 'métrica inventada', defeito: (a) => { a.XPTO = { target: 1, poor: 2, field: true, unit: 'ms' }; }, esperado: 'XPTO: alvo fora da tabela publicada do Web Vitals e dos alvos locais aceitos' },
      { nome: 'unidade fora de ms/score', defeito: (a) => { a.TTFB.unit = 's'; }, esperado: "TTFB: unidade 's' fora de ms/score" },
      { nome: 'seção vazia', defeito: (a) => { for (const n of Object.keys(a)) delete a[n]; }, esperado: 'LCP: sem alvo' },
    ];

    it('o caso sem defeito passa (a matriz tem de ter um verde)', () => {
      expect(violacoesDosAlvos(valido())).toEqual([]);
    });

    for (const caso of casos) {
      it(`recusa: ${caso.nome}`, () => {
        const alvos = valido();
        caso.defeito(alvos);
        const violacoes = violacoesDosAlvos(alvos);
        expect(violacoes.length, `deveria recusar "${caso.nome}"`).toBeGreaterThan(0);
        expect(violacoes.join(' | ')).toContain(caso.esperado);
      });
    }
  });
});
