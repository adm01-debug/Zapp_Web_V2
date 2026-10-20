import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  normalizeOperationalPriority,
  normalizeSentiment,
} from '../../src/lib/ai-vocabulary';

/**
 * Contrato dos consumidores de front do vocabulário canônico de IA
 * (etapas IA-021/IA-022).
 *
 * Antes deste contrato os consumidores comparavam o dado cru com literais em
 * inglês (`ai_sentiment === 'positive'`, `ai_priority === 'high'`). Como as
 * funções de análise passaram a gravar sentimento em pt-BR
 * ('positivo'/'negativo'/…) e prioridade em EN (low/medium/high/urgent), toda
 * comparação com o literal em inglês do sentimento virou código MORTO: o selo de
 * sentimento, o engajamento, o bônus de churn e o selo de prioridade nunca
 * disparavam. Este teste lê o FONTE dos consumidores e falha se a comparação
 * crua voltar — é o teste que "segura" o conserto no lugar.
 *
 * Além da varredura por regex, há um auto-teste dos detectores: sem ele, um
 * regex quebrado passaria a suíte inteira em silêncio.
 */

const VOCAB_MODULE = '@/lib/ai-vocabulary';

interface Consumer {
  path: string;
  /** Símbolos que o arquivo precisa importar do vocabulário canônico. */
  imports: readonly string[];
}

const CONSUMERS: readonly Consumer[] = [
  {
    path: 'src/components/inbox/VirtualizedRealtimeList.tsx',
    imports: ['normalizeSentiment', 'normalizeOperationalPriority'],
  },
  {
    path: 'src/components/inbox/contact-details/ContactHeaderSection.tsx',
    imports: ['normalizeSentiment', 'normalizeOperationalPriority'],
  },
  { path: 'src/components/ai/churnRisk.ts', imports: ['normalizeSentiment'] },
  { path: 'src/components/ai/ChurnPredictionDashboard.tsx', imports: ['normalizeSentiment'] },
  {
    path: 'src/hooks/integrations/useTalkXSegments.ts',
    imports: ['SENTIMENT_VALUES', 'OPERATIONAL_PRIORITY_VALUES'],
  },
];

const read = (path: string) => readFileSync(path, 'utf8');

/** Comentários fora antes de varrer: o texto que documenta o defeito cita os literais. */
const stripComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

const SENTIMENT_LITERALS = ['positive', 'negative', 'neutral', 'critical'];

/**
 * Usos crus do sentimento em inglês: o literal isolado (`'negative'`, chave de
 * mapa `negative:`) e a comparação (`ai_sentiment === 'critical'`).
 *
 * `'critical'` só entra na forma COMPARADA: nos arquivos de churn ele também é
 * nível de risco (`riskLevel === 'critical'`), que não é sentimento.
 */
function rawSentimentUses(source: string): string[] {
  const clean = stripComments(source);
  const hits: string[] = [];
  const push = (hit: string) => {
    if (!hits.includes(hit)) hits.push(hit);
  };
  for (const match of Array.from(
    clean.matchAll(/['"](positive|negative|neutral)['"]|\b(positive|negative|neutral)\s*:/gi),
  )) {
    push(match[0]);
  }
  for (const match of Array.from(
    clean.matchAll(/\w*sentiment\w*\s*(?:===|!==|==|!=)\s*['"]([a-z_]+)['"]/gi),
  )) {
    if (SENTIMENT_LITERALS.includes(match[1].toLowerCase())) push(match[0]);
  }
  return hits;
}

/**
 * Comparação crua com a prioridade operacional: só o campo lido direto
 * (`ai_priority === 'high'`) ou a variável crua (`priority === 'high'`).
 * `priority.value === 'high'` e `priorityLevel === 'high'` são o valor JÁ
 * normalizado — a escala do front é em inglês, então comparar com ela é o
 * código correto.
 */
function rawPriorityUses(source: string): string[] {
  return Array.from(
    stripComments(source).matchAll(/\b(?:ai_priority|priority)\s*(?:===|!==|==|!=)\s*['"]([^'"]*)['"]/gi),
  ).map((match) => match[0]);
}

/** Confirma que o símbolo é importado direto do vocabulário canônico. */
function importsSymbol(source: string, symbol: string): boolean {
  const pattern = new RegExp(
    `import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from\\s*'@/lib/ai-vocabulary'`,
  );
  return pattern.test(source);
}

describe('consumidores de front do vocabulário canônico (IA-021/IA-022)', () => {
  it.each(CONSUMERS)('$path lê o vocabulário canônico em vez de literal cru', ({ path, imports }) => {
    const source = read(path);

    expect(source, `${path} não importa de ${VOCAB_MODULE}`).toContain(`'${VOCAB_MODULE}'`);
    for (const symbol of imports) {
      expect(importsSymbol(source, symbol), `${path} não importa ${symbol}`).toBe(true);
    }
  });

  it.each(CONSUMERS)('$path não compara sentimento com literal em inglês', ({ path }) => {
    expect(rawSentimentUses(read(path))).toEqual([]);
  });

  it.each(CONSUMERS)('$path não compara prioridade com literal cru', ({ path }) => {
    expect(rawPriorityUses(read(path))).toEqual([]);
  });

  it('useTalkXSegments oferece exatamente as opções canônicas de filtro', () => {
    const source = read('src/hooks/integrations/useTalkXSegments.ts');

    // Sentimento em pt-BR e prioridade na escala EN, vindos das constantes
    // canônicas — nunca uma lista local que o banco não aceita.
    expect(source).toMatch(/value: 'ai_sentiment'[^}]*options: \[\.\.\.SENTIMENT_VALUES\]/);
    expect(source).toMatch(
      /value: 'ai_priority'[^}]*options: \[\.\.\.OPERATIONAL_PRIORITY_VALUES\]/,
    );
  });
});

describe('os detectores pegam a reintrodução da comparação crua', () => {
  // Se um destes voltar a qualquer consumidor, o teste acima falha.
  const REGRESSIONS = [
    "if (contact.ai_sentiment === 'negative') score += 30;",
    "if (sentiment === 'positive') s += 25;",
    "} else if (contact.ai_sentiment === 'neutral') {",
    "if (contact.ai_sentiment === 'critical') {",
    "const SENTIMENT_LABEL = { positive: 'positivo', neutral: 'neutro' };",
    "const isHighPriority = conversation.contact.ai_priority === 'urgent';",
    "if (priority === 'high') {",
  ];

  it.each(REGRESSIONS)('detecta: %s', (source) => {
    expect(rawSentimentUses(source).length + rawPriorityUses(source).length).toBeGreaterThan(0);
  });

  it('não marca o código correto (comparação com o valor já normalizado)', () => {
    const CLEAN = [
      "if (sentiment.value === 'negativo') score += 30;",
      "} else if (sentimentValue === 'neutro') {",
      "if (priority.value === 'high' || priority.value === 'urgent') {",
      "const isHighPriority = priority.value === 'high';",
      "const level = score >= 80 ? 'critical' : 'low';",
      "if (risk.riskLevel === 'critical') total += 1;",
    ];
    for (const source of CLEAN) {
      expect(rawSentimentUses(source), source).toEqual([]);
      expect(rawPriorityUses(source), source).toEqual([]);
    }
  });
});

describe('as duas direções do vocabulário que os consumidores dependem', () => {
  it('dado legado em inglês continua sendo reconhecido (o que já está gravado)', () => {
    expect(normalizeSentiment('negative')).toEqual({ value: 'negativo', known: true });
    expect(normalizeSentiment('positive')).toEqual({ value: 'positivo', known: true });
    expect(normalizeSentiment('neutral')).toEqual({ value: 'neutro', known: true });
    expect(normalizeSentiment('critical')).toEqual({ value: 'critico', known: true });
    // Urgência pt-BR gravada na coluna do front → escala operacional EN.
    expect(normalizeOperationalPriority('alta')).toEqual({ value: 'high', known: true });
    expect(normalizeOperationalPriority('normal')).toEqual({ value: 'medium', known: true });
  });

  it('dado canônico é lido sem alteração', () => {
    expect(normalizeSentiment('negativo')).toEqual({ value: 'negativo', known: true });
    expect(normalizeOperationalPriority('urgent')).toEqual({ value: 'urgent', known: true });
  });

  it('desconhecido/ausente não vira rótulo nem prioridade alta', () => {
    for (const raw of [null, undefined, '', '   ', 'very_negative', 'urgente', 'none', 42, {}]) {
      expect(normalizeSentiment(raw), String(raw)).toEqual({ value: null, known: false });
    }
    for (const raw of [null, undefined, '', 'urgente', 'normal_', 7, []]) {
      expect(normalizeOperationalPriority(raw), String(raw)).toEqual({ value: null, known: false });
    }
    // `very_negative` NÃO pode ser adivinhado como 'negativo' (não há intensidade
    // na escala canônica) e `urgente` não é prioridade operacional.
    expect(normalizeSentiment('very_negative').value).not.toBe('negativo');
    expect(normalizeOperationalPriority('urgente').value).not.toBe('urgent');
  });
});
