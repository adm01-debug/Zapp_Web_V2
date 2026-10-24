import { describe, expect, it } from 'vitest';
import {
  AutoTagOutput,
  ConversationAnalysisOutput,
  ConversationSummaryOutput,
  SuggestedRepliesOutput,
  buildAiEnvelope,
  parseModelOutput,
} from '../../supabase/functions/_shared/ai-response-contracts.ts';
import type { ParseModelOutputResult } from '../../supabase/functions/_shared/ai-response-contracts.ts';
import { normalizeSentiment, normalizeUrgency } from '../../supabase/functions/_shared/ai-vocabulary.ts';

/**
 * Contrato de saída do modelo (IA-025) + integração com o vocabulário (IA-021).
 * O que estes testes seguram: JSON válido com estrutura/valor errado é
 * REJEITADO antes de renderizar ou persistir, e campo opcional ausente continua
 * ausente (nunca vira 50, 3 ou 'neutro').
 */

type Analise = ConversationAnalysisOutput;
type CaminhosDeErro = string[];

/** Guarda explícita: não depende da inferência de união do TypeScript. */
function ehFalha<T>(
  r: ParseModelOutputResult<T>,
): r is { ok: false; errors: Array<{ path: string; message: string }> } {
  return r.ok === false;
}

/** Helpers tipados: evitam depender da inferência do genérico no teste. */
function dadosDe(raw: unknown): Analise | null {
  const r = parseModelOutput<Analise>(ConversationAnalysisOutput, raw);
  return r.ok ? r.data : null;
}

function caminhosComErro(raw: unknown): CaminhosDeErro {
  const r = parseModelOutput<Analise>(ConversationAnalysisOutput, raw);
  return ehFalha(r) ? r.errors.map((e) => e.path) : [];
}

const analiseValida = () => ({
  department: 'vendas',
  relationshipType: 'cliente novo',
  summary: 'Cliente pediu orçamento de brindes personalizados.',
  status: 'pendente',
  keyPoints: ['pediu orçamento', 'prazo curto'],
  nextSteps: ['enviar proposta'],
  sentiment: 'positivo',
  urgency: 'media',
  topics: ['orçamento'],
});

describe('IA-025 · estrutura correta passa', () => {
  it('aceita a saída completa', () => {
    expect(dadosDe(analiseValida())).not.toBeNull();
  });

  it('aceita a saída mínima e não inventa os opcionais', () => {
    const dados = dadosDe(analiseValida());
    expect(dados).not.toBeNull();
    expect(dados?.sentimentScore).toBeUndefined();
    expect(dados?.customerSatisfaction).toBeUndefined();
    expect(dados?.agentPerformance).toBeUndefined();
    expect(dados?.churnRisk).toBeUndefined();
    expect(dados !== null && 'sentimentScore' in dados).toBe(false);
  });
});

describe('IA-025 · JSON válido com valor errado é rejeitado (não corrigido)', () => {
  const casos: Array<[string, Record<string, unknown>, string]> = [
    ['sentimento inventado', { sentiment: 'purple' }, 'sentiment'],
    ['sentimento em inglês não normalizado', { sentiment: 'positive' }, 'sentiment'],
    ['urgência inventada', { urgency: 'urgentissimo' }, 'urgency'],
    ['nota como string', { sentimentScore: '80' }, 'sentimentScore'],
    ['nota acima da faixa', { sentimentScore: 101 }, 'sentimentScore'],
    ['nota negativa', { sentimentScore: -1 }, 'sentimentScore'],
    ['CSAT acima de 5', { customerSatisfaction: 6 }, 'customerSatisfaction'],
    ['CSAT zero', { customerSatisfaction: 0 }, 'customerSatisfaction'],
    ['pontos-chave acima do teto', { keyPoints: ['a', 'b', 'c', 'd', 'e', 'f'] }, 'keyPoints'],
    ['temas acima do teto', { topics: ['1', '2', '3', '4', '5', '6'] }, 'topics'],
    ['desempenho acima da escala', { agentPerformance: { empathy: 11, clarity: 5, efficiency: 5, knowledge: 5 } }, 'agentPerformance'],
    ['risco de churn inventado', { churnRisk: 'lowish' }, 'churnRisk'],
    ['departamento fora do enum', { department: 'marketing' }, 'department'],
    ['status fora do enum', { status: 'em andamento' }, 'status'],
    ['resumo vazio', { summary: '' }, 'summary'],
  ];

  it.each(casos)('rejeita %s', (_nome, override, pathEsperado) => {
    const caminhos = caminhosComErro({ ...analiseValida(), ...override });
    expect(caminhos.length).toBeGreaterThan(0);
    expect(caminhos.some((p) => p === pathEsperado || p.startsWith(`${pathEsperado}.`))).toBe(true);
  });

  it('aponta o índice exato do item errado', () => {
    expect(caminhosComErro({ ...analiseValida(), keyPoints: ['ok', 42, 'ok'] })).toContain('keyPoints.1');
  });
});

describe('IA-023 · zero sobrevive, ausência não vira default', () => {
  it('nota zero é aceita como zero (não como 50)', () => {
    const dados = dadosDe({ ...analiseValida(), sentimentScore: 0, customerSatisfaction: 1 });
    expect(dados?.sentimentScore).toBe(0);
    expect(dados?.customerSatisfaction).toBe(1);
  });

  it('CSAT ausente não vira 3', () => {
    const dados = dadosDe(analiseValida());
    expect(dados !== null && 'customerSatisfaction' in dados).toBe(false);
  });
});

describe('IA-021 + IA-025 · legado é traduzido ANTES do contrato', () => {
  it('saída em inglês, depois de normalizada, passa no contrato', () => {
    const bruto = { ...analiseValida(), sentiment: 'negative', urgency: 'critical' };
    expect(caminhosComErro(bruto).length).toBeGreaterThan(0); // cru não passa

    const s = normalizeSentiment(bruto.sentiment);
    const u = normalizeUrgency(bruto.urgency);
    const normalizado = { ...bruto, sentiment: s.value, urgency: u.value };
    const dados = dadosDe(normalizado);
    expect(dados?.sentiment).toBe('negativo');
    expect(dados?.urgency).toBe('critica');
  });

  it('valor inventado continua rejeitado mesmo depois da normalização', () => {
    const s = normalizeSentiment('purple');
    expect(s.known).toBe(false);
    expect(caminhosComErro({ ...analiseValida(), sentiment: s.value }).length).toBeGreaterThan(0);
  });
});

describe('IA-025 · outras capacidades', () => {
  it('resumo aceita department/relationshipType ausentes', () => {
    const { department, relationshipType, ...sem } = analiseValida();
    void department;
    void relationshipType;
    expect(parseModelOutput(ConversationSummaryOutput, sem).ok).toBe(true);
  });

  it('respostas sugeridas exigem exatamente 3', () => {
    const uma = [{ type: 'curta', text: 'oi' }];
    const tres = [...uma, { type: 'formal', text: 'bom dia' }, { type: 'direta', text: 'segue' }];
    expect(parseModelOutput(SuggestedRepliesOutput, tres).ok).toBe(true);
    expect(parseModelOutput(SuggestedRepliesOutput, uma).ok).toBe(false);
  });

  it('etiquetas exigem nome e confiança na faixa 0-1', () => {
    expect(parseModelOutput(AutoTagOutput, { tags: [{ name: 'reclamação', confidence: 0.8 }] }).ok).toBe(true);
    expect(parseModelOutput(AutoTagOutput, { tags: [{ name: 'reclamação', confidence: 80 }] }).ok).toBe(false);
    expect(parseModelOutput(AutoTagOutput, { tags: [{ name: '', confidence: 0.8 }] }).ok).toBe(false);
    expect(parseModelOutput(AutoTagOutput, { tags: [{ name: 'x', confidence: 0 }] }).ok).toBe(true);
  });
});

describe('IA-025 · envelope comum de execução', () => {
  it('monta o envelope com o que existe e omite o que não existe', () => {
    const envelope = buildAiEnvelope({
      capability: 'ai-conversation-analysis',
      status: 'ok',
      context: { version: 2, messageCount: 12, totalChars: 300, periodDays: 7 },
      evidence: { projected: true },
      data: { sentiment: 'positivo' },
    });
    expect(Object.keys(envelope).sort()).toEqual(['capability', 'context', 'data', 'evidence', 'status']);
    expect('error' in envelope).toBe(false);
  });

  it('status de erro carrega a mensagem e não carrega dado', () => {
    const envelope = buildAiEnvelope({
      capability: 'ai-conversation-analysis',
      status: 'error',
      error: 'A resposta do modelo não atende ao contrato de análise; nada foi gravado.',
    });
    expect(envelope.status).toBe('error');
    expect(String(envelope.error)).toContain('nada foi gravado');
    expect('data' in envelope).toBe(false);
  });
});
