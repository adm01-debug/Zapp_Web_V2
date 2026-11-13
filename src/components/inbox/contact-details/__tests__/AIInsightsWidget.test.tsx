import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AIInsightsWidget } from '../AIInsightsWidget';

const h = vi.hoisted(() => ({
  crmEnabled: true,
  data: null as unknown,
  isLoading: false,
  calls: [] as unknown[],
}));

vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => h.crmEnabled }));
vi.mock('@/hooks/crm/useContactIntelligence', () => ({
  useContactIntelligence: (id: unknown) => {
    h.calls.push(id);
    return { data: h.data, isLoading: h.isLoading };
  },
}));

const full = {
  found: true,
  briefing: { opening_tip: 'Retomar orçamento de canecas', risk_alert: 'Reclamou do prazo' },
  rapport: { suggestions: ['Falar do time de futebol'] },
  triggers: [{ trigger_name: 'Escassez' }],
  churn: { risk_factors: null, recommended_actions: ['Ligar hoje', 'Oferecer frete grátis'] },
  disc_tips: { sales_approach: ['Seja direto e mostre resultado'], keywords_to_avoid: ['talvez', 'acho'] },
  last_interactions: [{ channel: 'email', assunto: 'Orçamento', resumo: 'Pediu desconto para 500 unidades', sentiment: 'neutro', data: '2026-11-01' }],
};

beforeEach(() => {
  h.crmEnabled = true;
  h.data = null;
  h.isLoading = false;
  h.calls = [];
});

describe('AIInsightsWidget', () => {
  it('mostra só o que não aparece em outro lugar da tela', () => {
    h.data = full;
    render(<AIInsightsWidget contactId="c1" />);
    const list = screen.getByTestId('ai-insights');
    expect(list).toHaveTextContent('Oferecer frete grátis');
    expect(list).toHaveTextContent('Seja direto e mostre resultado');
    expect(list).toHaveTextContent('Evite: talvez, acho');
    expect(list).toHaveTextContent('Última interação: Pediu desconto para 500 unidades (email)');
    expect(screen.getAllByText('Ação recomendada:')[0]).toBeVisible();
  });

  it('não repete o briefing (dica/alerta), o Singu (rapport/gatilho) nem a ação já mostrada no churn', () => {
    h.data = full;
    render(<AIInsightsWidget contactId="c1" />);
    const list = screen.getByTestId('ai-insights');
    expect(list).not.toHaveTextContent('Retomar orçamento de canecas');
    expect(list).not.toHaveTextContent('Reclamou do prazo');
    expect(list).not.toHaveTextContent('Falar do time de futebol');
    expect(list).not.toHaveTextContent('Escassez');
    // sem fatores de risco o bloco de churn já mostra a 1ª ação
    expect(list).not.toHaveTextContent('Ligar hoje');
  });

  it('com fatores de risco no churn a 1ª ação não aparece lá, então aparece aqui', () => {
    h.data = { ...full, churn: { risk_factors: { dias_sem_contato: 40 }, recommended_actions: ['Ligar hoje'] } };
    render(<AIInsightsWidget contactId="c1" />);
    expect(screen.getByTestId('ai-insights')).toHaveTextContent('Ligar hoje');
  });

  it('carregando mostra esqueleto', () => {
    h.isLoading = true;
    render(<AIInsightsWidget contactId="c1" />);
    expect(screen.getByTestId('ai-insights-loading')).toBeInTheDocument();
  });

  it('sem ficha (ou falha do CRM, que o hook devolve como null) mostra vazio honesto', () => {
    h.data = null;
    render(<AIInsightsWidget contactId="c1" />);
    expect(screen.getByTestId('ai-insights-empty')).toHaveTextContent('Sem insights do CRM');
  });

  it('ficha só com o que já aparece em outro lugar é vazio (não repete nem inventa)', () => {
    h.data = { ...full, churn: null, disc_tips: null, last_interactions: [] };
    render(<AIInsightsWidget contactId="c1" />);
    expect(screen.getByTestId('ai-insights-empty')).toBeInTheDocument();
  });

  it('integração do CRM desligada não consulta nada', () => {
    h.crmEnabled = false;
    h.data = full;
    render(<AIInsightsWidget contactId="c1" />);
    expect(screen.getByTestId('ai-insights-disabled')).toHaveTextContent('Integração com o CRM desligada.');
    expect(h.calls).toHaveLength(0);
  });
});
