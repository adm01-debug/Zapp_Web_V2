import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Contrato do ENVELOPE no front (etapas IA-023 / IA-025 do plano de IA).
 *
 * As duas funções de IA do Bloco 03 respondem num envelope de execução comum
 * (`{ capability, status, context, evidence, error?, data, analysisId? }`,
 * montado por `buildAiEnvelope`). Estes testes leem o FONTE dos consumidores e
 * travam o conserto no lugar: se alguém voltar a ler a resposta crua ou a
 * reintroduzir o default `50`, o teste quebra.
 *
 * Leitura de fonte (não execução) de propósito: o ponto é provar que os
 * consumidores falam a língua do envelope — `payload.data`, `payload.analysisId`
 * no topo e `payload.error` mostrado quando `status === 'error'`.
 */
const root = resolve(__dirname, '../..');
const analysisSource = readFileSync(
  resolve(root, 'src/components/inbox/AIConversationAssistant.tsx'),
  'utf8',
);
const summarySource = readFileSync(
  resolve(root, 'src/components/inbox/ConversationSummary.tsx'),
  'utf8',
);

/** `|| 50` / `?? 50`: o default fabricado que o Bloco 03 removeu. */
const FABRICATED_50 = /(\|\||\?\?)\s*50(?![\d.])/;

describe('IA-025 · a análise (AIConversationAssistant) lê o envelope', () => {
  it('tira o objeto da análise de payload.data (não da resposta crua)', () => {
    expect(analysisSource).toMatch(/payload\??\.data/);
  });

  it('lê o id da análise gravada em payload.analysisId (topo do envelope)', () => {
    expect(analysisSource).toMatch(/payload\??\.analysisId/);
  });

  it('mostra payload.error quando o status é de erro, em vez de silêncio', () => {
    expect(analysisSource).toMatch(/\.status\s*===\s*'error'/);
    expect(analysisSource).toMatch(/payload\??\.error/);
  });

  it('lê o envelope de erro também quando o invoke falha (error.context)', () => {
    expect(analysisSource).toContain('readAiErrorEnvelope');
  });

  it('não reintroduz o default 50', () => {
    expect(analysisSource).not.toMatch(FABRICATED_50);
  });
});

describe('IA-025 · o resumo (ConversationSummary) lê o envelope', () => {
  it('tira o resumo de payload.data (não da resposta crua)', () => {
    expect(summarySource).toMatch(/payload\??\.data/);
  });

  it('mostra payload.error quando o status é de erro, em vez de silêncio', () => {
    expect(summarySource).toMatch(/\.status\s*===\s*'error'/);
    expect(summarySource).toMatch(/payload\??\.error/);
  });

  it('lê o envelope de erro também quando o invoke falha (error.context)', () => {
    expect(summarySource).toMatch(/context\.clone\(\)/);
  });

  it('o resumo não tem id de análise — não inventa payload.analysisId', () => {
    expect(summarySource).not.toMatch(/payload\??\.analysisId/);
  });

  it('não reintroduz o default 50', () => {
    expect(summarySource).not.toMatch(FABRICATED_50);
  });
});

describe('IA-023 · nenhum consumidor de IA inventa nota ausente', () => {
  const confidenceSource = readFileSync(
    resolve(root, 'src/components/ai/ticketClassification.ts'),
    'utf8',
  );
  const classifierSource = readFileSync(
    resolve(root, 'src/components/ai/AutoTicketClassifier.tsx'),
    'utf8',
  );
  const statsSource = readFileSync(
    resolve(root, 'src/hooks/analytics/useAIStats.ts'),
    'utf8',
  );
  const alertsSource = readFileSync(
    resolve(root, 'src/hooks/inbox/useRealtimeSentimentAlerts.ts'),
    'utf8',
  );

  it('a confiança passa pelo normalizador em vez do default 0,7', () => {
    expect(confidenceSource).toMatch(/normalizeScore\(/);
    expect(classifierSource).toMatch(/normalizeScore\(/);
    expect(confidenceSource).not.toMatch(/0\.7/);
    expect(classifierSource).not.toMatch(/\|\|\s*0\.7/);
  });

  it('as médias/notas usam o agregador que exclui ausente em vez de 0/50', () => {
    expect(statsSource).toContain('aggregateScores');
    expect(alertsSource).toMatch(/normalizeScore\(/);
    expect(statsSource).not.toMatch(FABRICATED_50);
  });
});
