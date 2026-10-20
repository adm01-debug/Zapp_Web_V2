import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const source = readFileSync(resolve(root, 'supabase/functions/ai-conversation-analysis/index.ts'), 'utf8');

/**
 * Contrato de origem do `ai-conversation-analysis` (etapas IA-021..IA-027).
 * Estes testes falham se alguém reintroduzir o comportamento defeituoso que o
 * Bloco 03 corrigiu — é o teste que "segura" o conserto no lugar.
 */
describe('IA-023 · a análise não inventa dado quando a IA não devolve', () => {
  it('não tem mais os defaults fabricados (50 / 3 / "neutro" / "media" / "low")', () => {
    expect(source).not.toMatch(/sentimentScore:\s*50/);
    expect(source).not.toMatch(/customerSatisfaction:\s*3/);
    expect(source).not.toMatch(/sentiment:\s*'neutro'/);
    expect(source).not.toMatch(/urgency:\s*'media'/);
    expect(source).not.toMatch(/churnRisk:[^\n]*'low'/);
  });

  it('não sintetiza análise a partir de texto livre ("resumo não disponível")', () => {
    expect(source).not.toContain('Não foi possível gerar análise.');
    expect(source).not.toContain('Resumo não disponível');
  });

  it('usa o contrato numérico em vez de clamp com fallback', () => {
    expect(source).toContain("from \"../_shared/ai-values.ts\"");
    expect(source).toMatch(/normalizeScore\(analysis\.sentimentScore/);
    expect(source).toMatch(/normalizeScore\(analysis\.customerSatisfaction/);
    expect(source).not.toMatch(/Math\.max\(0,\s*Math\.min\(100/);
    expect(source).not.toMatch(/Math\.max\(1,\s*Math\.min\(5/);
  });

  it('não reintroduz fallback numérico por `?? 50` / `|| 50` em nenhum campo', () => {
    expect(source).not.toMatch(/\?\?\s*50/);
    expect(source).not.toMatch(/\|\|\s*50/);
    expect(source).not.toMatch(/\?\?\s*3[,)]/);
  });
});

describe('IA-021 / IA-022 · vocabulário unificado e urgência separada da prioridade', () => {
  it('normaliza o sentimento anterior antes de usar no contexto', () => {
    expect(source).toMatch(/normalizeSentiment\(contact\.ai_sentiment\)/);
    expect(source).toMatch(/normalizeSentiment\(a\.sentiment\)/);
  });

  it('converte urgência em prioridade operacional por tabela explícita', () => {
    expect(source).toMatch(/urgencyToOperationalPriority\(normalizeUrgency\(analysis\.urgency\)\.value\)/);
    // A comparação morta era `urgency === 'critical'` contra enum em português.
    // A asserção olha a COMPARAÇÃO, não a palavra solta (que aparece no
    // comentário que documenta o defeito).
    expect(source).not.toMatch(/urgency\s*===\s*'critical'/);
    expect(source).not.toMatch(/===\s*'critic(al|a)'\s*\?/);
  });

  it('traduz legado conhecido e deixa valor inventado para o contrato rejeitar', () => {
    expect(source).toMatch(/legacySentiment\.known/);
    expect(source).toMatch(/legacyUrgency\.known/);
    expect(source).toContain('vocabularyConversions');
  });
});

describe('IA-025 · saída do modelo é validada antes de persistir', () => {
  it('valida com o schema da capacidade e devolve 502 quando não bate', () => {
    expect(source).toMatch(/parseModelOutput\(ConversationAnalysisOutput/);
    expect(source).toMatch(/buildAiEnvelope\(/);
    expect(source).toMatch(/status: 'error'/);
    expect(source).toContain('502');
  });

  it('responde no envelope comum com contexto e evidência', () => {
    expect(source).toContain('measureConversationContext(messages, periodDays)');
    expect(source).toMatch(/context:\s*contextBudget/);
    expect(source).toMatch(/valueIssues/);
  });
});

describe('IA-026 / IA-027 · persistência atômica com trava de recência', () => {
  it('grava pela RPC (uma transação) e não faz UPDATE solto em contacts', () => {
    expect(source).toContain("supabase.rpc('persist_conversation_analysis'");
    expect(source).not.toMatch(/\.from\('contacts'\)\s*\n?\s*\.update\(/);
    expect(source).not.toMatch(/\.from\('conversation_analyses'\)\s*\n?\s*\.insert\(/);
  });

  it('manda os campos que antes eram perdidos na gravação', () => {
    for (const campo of ['agent_performance', 'churn_risk', 'sales_opportunity', 'analysis_version', 'period_days', 'coverage']) {
      expect(source).toContain(campo);
    }
  });

  it('falha de gravação não vira sucesso silencioso', () => {
    expect(source).toMatch(/if \(persistError\)/);
    expect(source).not.toMatch(/log\.warn\("Failed to persist conversation analysis"/);
  });

  it('expõe se a projeção do contato foi aplicada (trava de recência)', () => {
    expect(source).toMatch(/projected = persistedResult\?\.projected === true/);
  });
});

describe('IA-024 · o contexto enviado é medido e versionado', () => {
  it('lê periodDays do corpo e reporta o recorte', () => {
    expect(source).toContain('contactId, periodDays } = parsed.data');
    expect(source).toContain('Recorte pedido');
    expect(source).toContain('CONTEXT_CONTRACT_VERSION');
  });
});

describe('IA-048 · revalida o contexto antes do efeito e devolve cancelled', () => {
  it('revalida o contexto ANTES de chamar a RPC de persistência', () => {
    const revalidacao = source.indexOf('await revalidateContextBeforeEffect({');
    const rpc = source.indexOf("supabase.rpc('persist_conversation_analysis'");
    expect(revalidacao, 'não revalida o contexto antes de persistir').toBeGreaterThan(-1);
    expect(rpc, 'não chama a RPC de persistência').toBeGreaterThan(-1);
    expect(revalidacao).toBeLessThan(rpc);
  });

  it('sem contexto vigente NÃO persiste: volta envelope cancelled (200) ecoando o requestId', () => {
    const guarda = source.indexOf('if (!revalidation.current)');
    const rpc = source.indexOf("supabase.rpc('persist_conversation_analysis'");
    expect(guarda, 'não há guarda de cancelamento antes da persistência').toBeGreaterThan(-1);
    const bloco = source.slice(guarda, rpc);
    expect(bloco).toContain('contextCancelledEnvelope(');
    expect(bloco).toContain('requestId');
    expect(bloco).toMatch(/200,\s*req\)/);
  });

  it('ecoa o requestId no envelope de sucesso (descarte seguro no cliente)', () => {
    const resposta = source.indexOf('conversationRunResponse({');
    expect(resposta).toBeGreaterThan(-1);
    expect(source.slice(resposta)).toContain('requestId,');
  });
});
