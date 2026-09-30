import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import * as appVocabulary from '../../src/lib/ai-vocabulary';
import * as canonicalVocabulary from '../../supabase/functions/_shared/ai-vocabulary';

/**
 * Contrato de IDENTIDADE do vocabulário canônico de IA (IA-021/IA-022).
 *
 * Existe UM único módulo de vocabulário: `supabase/functions/_shared/ai-vocabulary.ts`
 * — é o arquivo que o runtime Deno empacota. O front consome esse MESMO arquivo por
 * reexport em `src/lib/ai-vocabulary.ts`; não há mais duas cópias byte-idênticas para
 * divergirem (antes o SonarCloud contava as duas como 454 linhas de duplicação do
 * bloco). Divergência front/edge era o defeito que este contrato impede (achados
 * B11/B12: o mesmo sentimento/urgência significando coisas diferentes dependendo de
 * quem lê).
 *
 * O contrato agora prova IDENTIDADE DE EXPORTAÇÃO: cada símbolo de valor exportado
 * pelo front é a MESMA referência (`===`) do canônico. Se alguém reintroduzir uma
 * cópia local no front — mesmo com o texto igual — a referência deixa de ser
 * idêntica e o teste quebra. Os conjuntos e os mapeamentos de legado seguem travados
 * contra a spec lendo o FONTE do canônico (fonte única da verdade).
 */

const CANONICAL_PATH = 'supabase/functions/_shared/ai-vocabulary.ts';

const read = (path: string) => readFileSync(path, 'utf8');

/** Comentários de linha fora antes de extrair literais (evita casar texto solto). */
const stripLineComments = (source: string) => source.replace(/\/\/[^\n]*/g, '');

const canonicalSource = stripLineComments(read(CANONICAL_PATH));

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

/**
 * Nomes de VALOR exportados (os que existem em runtime). As exportações de TIPO
 * (`Sentiment`, `Urgency`, `OperationalPriority`, `VocabularyMatch`) são apagadas
 * em runtime; a identidade delas é garantida pelo `tsc` quando o app consome
 * `src/lib/ai-vocabulary.ts` (mesmos nomes de tipo do canônico).
 */
const EXPORTED_VALUE_NAMES = [
  'SENTIMENT_VALUES',
  'URGENCY_VALUES',
  'OPERATIONAL_PRIORITY_VALUES',
  'normalizeSentiment',
  'normalizeUrgency',
  'urgencyToOperationalPriority',
  'normalizeOperationalPriority',
] as const;

const ARRAYS = ['SENTIMENT_VALUES', 'URGENCY_VALUES', 'OPERATIONAL_PRIORITY_VALUES'] as const;

const SPEC_ARRAYS: Record<(typeof ARRAYS)[number], string[]> = {
  SENTIMENT_VALUES: ['positivo', 'neutro', 'negativo', 'critico'],
  URGENCY_VALUES: ['baixa', 'media', 'alta', 'critica'],
  OPERATIONAL_PRIORITY_VALUES: ['low', 'medium', 'high', 'urgent'],
};

const MAPPINGS = [
  'SENTIMENT_ALIASES',
  'URGENCY_ALIASES',
  'OPERATIONAL_PRIORITY_ALIASES',
  'URGENCY_TO_OPERATIONAL',
] as const;

const SPEC_MAPPINGS: Record<(typeof MAPPINGS)[number], Array<[string, string]>> = {
  SENTIMENT_ALIASES: [
    ['positive', 'positivo'],
    ['neutral', 'neutro'],
    ['negative', 'negativo'],
    ['critical', 'critico'],
  ],
  URGENCY_ALIASES: [
    ['low', 'baixa'],
    ['medium', 'media'],
    ['high', 'alta'],
    ['critical', 'critica'],
    ['urgent', 'critica'],
  ],
  OPERATIONAL_PRIORITY_ALIASES: [
    ['normal', 'medium'],
    ['baixa', 'low'],
    ['media', 'medium'],
    ['alta', 'high'],
    ['critica', 'urgent'],
  ],
  URGENCY_TO_OPERATIONAL: [
    ['baixa', 'low'],
    ['media', 'medium'],
    ['alta', 'high'],
    ['critica', 'urgent'],
  ],
};

describe('vocabulário canônico de IA — identidade de exportação front × edge (IA-021/IA-022)', () => {
  describe('identidade de exportação (mesmo símbolo, mesma referência)', () => {
    for (const name of EXPORTED_VALUE_NAMES) {
      it(`${name}: o front reexporta o MESMO símbolo do canônico`, () => {
        expect(appVocabulary[name]).toBeDefined();
        expect(appVocabulary[name]).toBe(canonicalVocabulary[name]);
      });
    }

    it('o front não exporta nada além do canônico e não perde nenhum símbolo de valor', () => {
      expect(Object.keys(appVocabulary).sort()).toEqual(Object.keys(canonicalVocabulary).sort());
      expect(Object.keys(canonicalVocabulary).sort()).toEqual([...EXPORTED_VALUE_NAMES].sort());
    });
  });

  describe('conjuntos canônicos (fonte única: o módulo canônico)', () => {
    for (const name of ARRAYS) {
      it(`${name}: é exatamente o conjunto da spec`, () => {
        expect(extractStringArray(canonicalSource, name)).toEqual(SPEC_ARRAYS[name]);
      });
    }
  });

  describe('mapeamentos de legado (fonte única: o módulo canônico)', () => {
    for (const name of MAPPINGS) {
      it(`${name}: é exatamente o mapeamento da spec (sem legado inventado)`, () => {
        expect(sortEntries(extractMapping(canonicalSource, name))).toEqual(
          sortEntries(SPEC_MAPPINGS[name]),
        );
      });
    }
  });

  describe('comportamento em runtime (front e canônico são o mesmo código)', () => {
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

    it('normalizeSentiment devolve o mesmo resultado nas duas pontas', () => {
      for (const raw of INPUTS) {
        expect(appVocabulary.normalizeSentiment(raw), `sentiment ${String(raw)}`).toEqual(
          canonicalVocabulary.normalizeSentiment(raw),
        );
      }
    });

    it('normalizeUrgency devolve o mesmo resultado nas duas pontas', () => {
      for (const raw of INPUTS) {
        expect(appVocabulary.normalizeUrgency(raw), `urgency ${String(raw)}`).toEqual(
          canonicalVocabulary.normalizeUrgency(raw),
        );
      }
    });

    it('normalizeOperationalPriority devolve o mesmo resultado nas duas pontas', () => {
      for (const raw of INPUTS) {
        expect(
          appVocabulary.normalizeOperationalPriority(raw),
          `priority ${String(raw)}`,
        ).toEqual(canonicalVocabulary.normalizeOperationalPriority(raw));
      }
    });

    it('urgencyToOperationalPriority concorda nas duas pontas', () => {
      for (const urgency of [...canonicalVocabulary.URGENCY_VALUES, null]) {
        expect(appVocabulary.urgencyToOperationalPriority(urgency)).toEqual(
          canonicalVocabulary.urgencyToOperationalPriority(urgency),
        );
      }
    });

    it('os conjuntos exportados em runtime são o MESMO objeto', () => {
      expect(appVocabulary.SENTIMENT_VALUES).toBe(canonicalVocabulary.SENTIMENT_VALUES);
      expect(appVocabulary.URGENCY_VALUES).toBe(canonicalVocabulary.URGENCY_VALUES);
      expect(appVocabulary.OPERATIONAL_PRIORITY_VALUES).toBe(
        canonicalVocabulary.OPERATIONAL_PRIORITY_VALUES,
      );
    });
  });
});
