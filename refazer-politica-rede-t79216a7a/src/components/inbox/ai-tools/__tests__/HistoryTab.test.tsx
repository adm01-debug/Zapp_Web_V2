import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HistoryTab } from '../HistoryTab';

/**
 * IA-026 — abrir o histórico tem de reproduzir integralmente a análise aceita,
 * inclusive os campos opcionais (desempenho, risco de churn e oportunidade de venda).
 */
const analiseCompleta = {
  id: 'analise-1',
  summary: 'Resumo salvo',
  status: 'resolvido',
  key_points: ['ponto 1'],
  next_steps: ['passo 1'],
  sentiment: 'positivo',
  sentiment_score: 82,
  topics: ['vendas'],
  urgency: 'alta',
  customer_satisfaction: 9,
  message_count: 12,
  created_at: '2026-10-01T12:00:00Z',
  department: 'vendas',
  relationship_type: 'vendedor_cliente',
  agent_performance: { empathy: 8, clarity: 7, efficiency: 9, knowledge: 6 },
  churn_risk: 'alto',
  sales_opportunity: 'Upgrade do plano',
};

describe('HistoryTab (IA-026)', () => {
  it('reabre a análise com todos os campos opcionais gravados', () => {
    const onLoadHistory = vi.fn();
    render(<HistoryTab analyses={[analiseCompleta]} historyLoading={false} onLoadHistory={onLoadHistory} />);

    fireEvent.click(screen.getByText('Resumo salvo'));

    expect(onLoadHistory).toHaveBeenCalledTimes(1);
    expect(onLoadHistory.mock.calls[0][0]).toMatchObject({
      analysisId: 'analise-1',
      department: 'vendas',
      relationshipType: 'vendedor_cliente',
      summary: 'Resumo salvo',
      keyPoints: ['ponto 1'],
      nextSteps: ['passo 1'],
      sentimentScore: 82,
      urgency: 'alta',
      customerSatisfaction: 9,
      agentPerformance: { empathy: 8, clarity: 7, efficiency: 9, knowledge: 6 },
      churnRisk: 'alto',
      salesOpportunity: 'Upgrade do plano',
    });
  });

  it('não inventa campos quando a linha antiga não os tem', () => {
    const onLoadHistory = vi.fn();
    render(
      <HistoryTab
        analyses={[{ ...analiseCompleta, agent_performance: null, churn_risk: null, sales_opportunity: null }]}
        historyLoading={false}
        onLoadHistory={onLoadHistory}
      />,
    );

    fireEvent.click(screen.getByText('Resumo salvo'));

    const carregada = onLoadHistory.mock.calls[0][0];
    expect(carregada.agentPerformance).toBeNull();
    expect(carregada.churnRisk).toBeUndefined();
    expect(carregada.salesOpportunity).toBeUndefined();
  });

  it('mostra o vazio quando não há análises', () => {
    render(<HistoryTab analyses={[]} historyLoading={false} onLoadHistory={vi.fn()} />);
    expect(screen.getByText('Nenhuma análise anterior')).toBeInTheDocument();
  });
});
