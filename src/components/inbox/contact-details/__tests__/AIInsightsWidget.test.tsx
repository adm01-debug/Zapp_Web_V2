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
  churn: { recommended_actions: ['Ligar hoje'] },
};

beforeEach(() => {
  h.crmEnabled = true;
  h.data = null;
  h.isLoading = false;
  h.calls = [];
});

describe('AIInsightsWidget', () => {
  it('mostra no máximo 4 insights reais do CRM, com rótulo para leitor de tela', () => {
    h.data = full;
    render(<AIInsightsWidget contactId="c1" />);
    const list = screen.getByTestId('ai-insights');
    expect(list).toHaveTextContent('Retomar orçamento de canecas');
    expect(list).toHaveTextContent('Reclamou do prazo');
    expect(list).toHaveTextContent('Falar do time de futebol');
    expect(list).toHaveTextContent('Escassez');
    expect(list).not.toHaveTextContent('Ligar hoje');
    expect(screen.getByText('Dica de abordagem:')).toHaveClass('sr-only');
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

  it('ficha sem nenhum texto útil também é vazio (não inventa)', () => {
    h.data = { found: true, briefing: { opening_tip: '  ', risk_alert: null }, rapport: { suggestions: [] }, triggers: [], churn: null };
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
