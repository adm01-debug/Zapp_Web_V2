import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import * as appVocabulary from '../../src/lib/ai-vocabulary';
import * as edgeVocabulary from '../../supabase/functions/_shared/ai-vocabulary';

/**
 * Contrato de paridade das duas cópias do vocabulário canônico de IA
 * (IA-021/IA-022): a cópia da Edge (Deno) e a do app (Vite) precisam ter os
 * MESMOS conjuntos, os MESMOS mapeamentos de legado e o MESMO comportamento.
 *
 * Divergência front/edge é exatamente o defeito que este contrato impede
 * (achados B11/B12: o mesmo sentimento/urgência significando coisas diferentes
 * dependendo de quem lê). Os literais são extraídos do FONTE dos dois arquivos
 * — não do import — então editar uma única cópia quebra o teste.
 */

const EDGE_PATH = 'supabase/functions/_shared/ai-vocabulary.ts';
const APP_PATH = 'src/lib/ai-vocabulary.ts';

const read = (path: string) => readFileSync(path, 'utf8');

/** Comentários de linha fora antes de extrair literais (evita casar texto solto). */
const stripLineComments = (source: string) => source.replace(/\/\/[^\n]*/g, '');

const edgeSource = stripLineComments(read(EDGE_PATH));
const appSource = stripLineComments(read(APP_PATH));

/** Extrai os literais de um `export const NAME = ['a', 'b'] as const`. */
function extractStringArray(source: string, name: string): string[] {
  const match = source.match(new RegExp(`export const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!match) throw new Error(`array exportado não encontrado: ${name}`);
  return [...match[1].matchAll(/'([^']*)'/g)].map((entry) => entry[1]);
}

/** Extrai os pares `chave: 'valor'` de uma tabela de legado. */
function extractMapping(source: string, name: string): Array<[string, string]> {
  const declaration = source.indexOf(`const ${name}`);
  if (declaration < 0) throw new Error(`tabela de legado não encontrada: ${name}`);
  const open = source.indexOf('{', declaration);
  const close = open < 0 ? -1 : source.indexOf('}', open);
  if (open < 0 || close < 0) throw new Error(`tabela malformada: ${name}`);
  const body = source.slice(open + 1, close);
  return [...body.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:\s*'([^']*)'/g)].map((entry) => [
    entry[1],
    entry[2],
  ]);
}

const sortEntries = (entries: Array<[string, string]>) =>
  [...entries].sort((a, b) => a[0].localeCompare(b[0]));

const ARRAYS = ['SENTIMENT_VALUES', 'URGENCY_VALUES', 'OPERATIONAL_PRIORITY_VALUES'];
const MAPPINGS = [
  'SENTIMENT_ALIASES',
  'URGENCY_ALIASES',
  'OPERATIONAL_PRIORITY_ALIASES',
  'URGENCY_TO_OPERATIONAL',
];

describe('vocabulário canônico de IA — paridade edge × front (IA-021/IA-022)', () => {
  it('as duas cópias do arquivo são idênticas', () => {
    expect(read(APP_PATH)).toBe(read(EDGE_PATH));
  });

  describe('conjuntos canônicos', () => {
    for (const name of ARRAYS) {
      it(`${name}: edge e front têm o mesmo conjunto`, () => {
        expect(extractStringArray(appSource, name)).toEqual(extractStringArray(edgeSource, name));
      });
    }

    it('os conjuntos são exatamente os da spec', () => {
      expect(extractStringArray(edgeSource, 'SENTIMENT_VALUES')).toEqual([
        'positivo',
        'neutro',
        'negativo',
        'critico',
      ]);
      expect(extractStringArray(edgeSource, 'URGENCY_VALUES')).toEqual([
        'baixa',
        'media',
        'alta',
        'critica',
      ]);
      expect(extractStringArray(edgeSource, 'OPERATIONAL_PRIORITY_VALUES')).toEqual([
        'low',
        'medium',
        'high',
        'urgent',
      ]);
    });
  });

  describe('mapeamentos de legado', () => {
    for (const name of MAPPINGS) {
      it(`${name}: edge e front têm o mesmo mapeamento`, () => {
        expect(sortEntries(extractMapping(appSource, name))).toEqual(
          sortEntries(extractMapping(edgeSource, name)),
        );
      });
    }

    it('os mapeamentos são exatamente os da spec (sem legado inventado)', () => {
      expect(sortEntries(extractMapping(edgeSource, 'SENTIMENT_ALIASES'))).toEqual(
        sortEntries([
          ['positive', 'positivo'],
          ['neutral', 'neutro'],
          ['negative', 'negativo'],
          ['critical', 'critico'],
        ]),
      );
      expect(sortEntries(extractMapping(edgeSource, 'URGENCY_ALIASES'))).toEqual(
        sortEntries([
          ['low', 'baixa'],
          ['medium', 'media'],
          ['high', 'alta'],
          ['critical', 'critica'],
          ['urgent', 'critica'],
        ]),
      );
      expect(sortEntries(extractMapping(edgeSource, 'OPERATIONAL_PRIORITY_ALIASES'))).toEqual(
        sortEntries([
          ['normal', 'medium'],
          ['baixa', 'low'],
          ['media', 'medium'],
          ['alta', 'high'],
          ['critica', 'urgent'],
        ]),
      );
      expect(sortEntries(extractMapping(edgeSource, 'URGENCY_TO_OPERATIONAL'))).toEqual(
        sortEntries([
          ['baixa', 'low'],
          ['media', 'medium'],
          ['alta', 'high'],
          ['critica', 'urgent'],
        ]),
      );
    });
  });

  describe('comportamento em runtime', () => {
    const INPUTS: unknown[] = [
      // ausência e tipo errado
      null,
      undefined,
      '',
      '   ',
      0,
      42,
      Number.NaN,
      {},
      [],
      ['positivo'],
      true,
      // valor inventado
      'purple',
      'very_positive',
      'very_negative',
      // canônico pt-BR, legado EN, case e espaços
      'positivo',
      'POSITIVO',
      ' Positivo ',
      'neutro',
      'negativo',
      'critico',
      'positive',
      'neutral',
      'negative',
      'critical',
      'baixa',
      'media',
      'alta',
      'critica',
      'low',
      'medium',
      'high',
      'urgent',
      'normal',
      'urgente',
      'none',
    ];

    it('normalizeSentiment devolve o mesmo resultado nas duas cópias', () => {
      for (const raw of INPUTS) {
        expect(appVocabulary.normalizeSentiment(raw), `sentiment ${String(raw)}`).toEqual(
          edgeVocabulary.normalizeSentiment(raw),
        );
      }
    });

    it('normalizeUrgency devolve o mesmo resultado nas duas cópias', () => {
      for (const raw of INPUTS) {
        expect(appVocabulary.normalizeUrgency(raw), `urgency ${String(raw)}`).toEqual(
          edgeVocabulary.normalizeUrgency(raw),
        );
      }
    });

    it('normalizeOperationalPriority devolve o mesmo resultado nas duas cópias', () => {
      for (const raw of INPUTS) {
        expect(
          appVocabulary.normalizeOperationalPriority(raw),
          `priority ${String(raw)}`,
        ).toEqual(edgeVocabulary.normalizeOperationalPriority(raw));
      }
    });

    it('urgencyToOperationalPriority concorda nas duas cópias', () => {
      for (const urgency of [...edgeVocabulary.URGENCY_VALUES, null]) {
        expect(appVocabulary.urgencyToOperationalPriority(urgency)).toEqual(
          edgeVocabulary.urgencyToOperationalPriority(urgency),
        );
      }
    });

    it('os conjuntos exportados em runtime são iguais', () => {
      expect(appVocabulary.SENTIMENT_VALUES).toEqual(edgeVocabulary.SENTIMENT_VALUES);
      expect(appVocabulary.URGENCY_VALUES).toEqual(edgeVocabulary.URGENCY_VALUES);
      expect(appVocabulary.OPERATIONAL_PRIORITY_VALUES).toEqual(
        edgeVocabulary.OPERATIONAL_PRIORITY_VALUES,
      );
    });
  });
});
