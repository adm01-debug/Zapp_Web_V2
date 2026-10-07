import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

/**
 * Contrato de integridade do resumo de conversa (IA-021..IA-027).
 *
 * O `ai-conversation-summary` era a função mais frágil do bloco: inventava a
 * análise quando o modelo não devolvia JSON (`sentimentScore: 50`,
 * `customerSatisfaction: 3`, `churnRisk || 'low'`), comparava a urgência com um
 * token em inglês que nunca casava com o valor em português, descartava
 * department/relationshipType/agentPerformance/churnRisk/salesOpportunity e
 * gravava a projeção do contato num UPDATE solto (fora da transação).
 *
 * Este contrato LÊ o fonte e falha se qualquer um desses defeitos voltar. Não
 * exercita o handler (o runtime é Deno) — verifica a forma do código, que é
 * exatamente o que regride sem ninguém perceber.
 */
describe('ai-conversation-summary — sem fallback que invente análise (IA-023)', () => {
  const source = read('supabase/functions/ai-conversation-summary/index.ts');

  it('não inventa defaults numéricos para sentimento/satisfação ausentes', () => {
    expect(source, 'sentimentScore voltou a ter default 50').not.toMatch(/sentimentScore\s*:\s*50/);
    expect(source, 'customerSatisfaction voltou a ter default 3').not.toMatch(
      /customerSatisfaction\s*:\s*3/,
    );
  });

  it('não usa o fallback textual que sintetizava um resumo', () => {
    expect(source).not.toContain('Não foi possível gerar análise.');
    expect(source).not.toContain("Resumo não disponível");
  });

  it('não aplica o default de churnRisk nem clamp em braço', () => {
    // O defeito era `churnRisk: analysisData.churnRisk || 'low'`.
    expect(source).not.toMatch(/churnRisk[^\n]*\|\|\s*'low'/);
    expect(source).not.toContain("|| 'low'");
    expect(source).not.toContain('Math.min(5, ');
    expect(source).not.toContain('Math.min(100, ');
  });
});

describe('ai-conversation-summary — vocabulário canônico (IA-021/IA-022)', () => {
  const source = read('supabase/functions/ai-conversation-summary/index.ts');

  it('traduz o legado com normalizeSentiment/normalizeUrgency antes do contrato', () => {
    const sentimento = source.indexOf('normalizeSentiment(');
    const urgencia = source.indexOf('normalizeUrgency(');
    const contrato = source.indexOf('parseModelOutput(');
    expect(sentimento, 'não normaliza o sentimento').toBeGreaterThan(-1);
    expect(urgencia, 'não normaliza a urgência').toBeGreaterThan(-1);
    expect(contrato, 'não valida com o contrato de saída').toBeGreaterThan(-1);
    expect(sentimento, 'normaliza o sentimento depois do contrato').toBeLessThan(contrato);
    expect(urgencia, 'normaliza a urgência depois do contrato').toBeLessThan(contrato);
  });

  it('não compara a urgência com o token em inglês que nunca casava', () => {
    // O defeito B11: `urgency === 'critical'` contra um valor português.
    expect(source).not.toMatch(/\bcritical\b/);
    expect(source).not.toMatch(/urgency\s*===\s*['"]/);
  });

  it('converte urgência em prioridade operacional com a função do vocabulário', () => {
    expect(source).toContain('urgencyToOperationalPriority(');
    expect(source).toContain('ai_priority: operationalPriority');
  });
});

describe('ai-conversation-summary — contrato de saída e números (IA-023/IA-025)', () => {
  const source = read('supabase/functions/ai-conversation-summary/index.ts');

  it('valida com parseModelOutput(ConversationSummaryOutput, ...)', () => {
    expect(source).toMatch(/parseModelOutput\(\s*ConversationSummaryOutput/);
  });

  it('rejeita a resposta do modelo com 502 e envelope, sem gravar', () => {
    const rejeicao = source.indexOf('const validated = parseModelOutput(');
    const persistencia = source.indexOf("supabase.rpc('persist_conversation_analysis'");
    expect(rejeicao, 'não valida o contrato').toBeGreaterThan(-1);
    expect(persistencia, 'não persiste pela RPC').toBeGreaterThan(-1);
    expect(rejeicao, 'grava antes de validar').toBeLessThan(persistencia);

    const bloco = source.slice(rejeicao, persistencia);
    // Envelope de erro + status 502 dentro do mesmo caminho de rejeição.
    expect(bloco, 'não devolve envelope na rejeição').toContain('buildAiEnvelope({');
    expect(bloco, 'não marca 502').toContain('502');
    // A evidência da rejeição carrega os erros do contrato, não um texto solto.
    expect(bloco, 'evidência sem os errors do contrato').toContain('validated.errors');

    // Sem JSON parseável: erro explícito, nunca análise fabricada.
    expect(source).toContain('A IA não devolveu um resumo em formato válido');
    expect(source).toMatch(/502,\s*req\)/);
  });

  it('passa os números por normalizeScore nas escalas certas', () => {
    expect(source).toContain('normalizeScore(analysis.sentimentScore, { min: 0, max: 100, scale: ' +
      "'percent' })");
    expect(source).toContain('normalizeScore(analysis.customerSatisfaction, { min: 1, max: 5, scale: ' +
      "'integer' })");
  });

  it('usa a cobertura medida do contexto com o periodDays do corpo', () => {
    expect(source).toContain('measureConversationContext(messages, periodDays)');
    expect(source).toContain('CONTEXT_CONTRACT_VERSION');
  });
});

describe('ai-conversation-summary — persistência atômica (IA-026/IA-027)', () => {
  const source = read('supabase/functions/ai-conversation-summary/index.ts');

  it('grava pela RPC persist_conversation_analysis com os três parâmetros', () => {
    expect(source).toContain("supabase.rpc('persist_conversation_analysis'");
    for (const param of ['p_contact_id', 'p_analysis', 'p_analyzed_at']) {
      expect(source, `RPC sem ${param}`).toContain(param);
    }
  });

  it('envia TODOS os campos da análise, inclusive os que antes eram descartados', () => {
    const rpc = source.indexOf("supabase.rpc('persist_conversation_analysis'");
    const bloco = source.slice(rpc, source.indexOf('p_analyzed_at'));
    for (const campo of [
      'department',
      'relationship_type',
      'summary',
      'sentiment',
      'sentiment_score',
      'customer_satisfaction',
      'key_points',
      'next_steps',
      'topics',
      'urgency',
      'status',
      'message_count',
      'agent_performance',
      'churn_risk',
      'sales_opportunity',
      'analysis_version',
      'period_days',
      'coverage',
      'ai_priority',
    ]) {
      expect(bloco, `p_analysis sem ${campo}`).toContain(`${campo}:`);
    }
  });

  it('não faz UPDATE solto em contacts (a projeção é atômica na RPC)', () => {
    expect(source).not.toMatch(/from\(['"]contacts['"]\)\s*\.update/);
    expect(source).not.toMatch(/ai_priority:.*===/);
  });

  it('erro de persistência devolve 502 com mensagem clara (não warn + 200)', () => {
    expect(source).toContain('persistConversationAnalysisGuarded(');
    const erro = source.indexOf("outcome.kind === 'error'");
    expect(erro, 'não trata o erro da RPC').toBeGreaterThan(-1);
    const bloco = source.slice(erro, source.indexOf('analysisId = outcome.analysisId', erro));
    expect(bloco).toContain('502');
    expect(bloco).toMatch(/log\.error\(/);
    expect(source).not.toContain("log.warn(\"Failed to persist");
  });
});

describe('ai-conversation-summary — resposta em envelope (IA-025)', () => {
  const source = read('supabase/functions/ai-conversation-summary/index.ts');

  it('devolve envelope com analysisId no topo e os dados em `data`', () => {
    const resposta = source.indexOf('log.done(200, { analysisId');
    const bloco = source.slice(resposta);
    expect(bloco).toContain('buildAiEnvelope({');
    expect(bloco).toContain('data: analysis,');
    expect(bloco).toMatch(/\.\.\.buildAiEnvelope\(\{[\s\S]*\}\)\s*,\s*\n\s*analysisId,/);
  });
});

describe('IA-048 · revalida o contexto antes do efeito e devolve cancelled', () => {
  const source = read('supabase/functions/ai-conversation-summary/index.ts');

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

  it('ecoa o requestId no envelope de sucesso', () => {
    const resposta = source.indexOf('log.done(200, { analysisId');
    expect(source.slice(resposta)).toContain('requestId');
  });
});
