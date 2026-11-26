import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { state } = vi.hoisted(() => ({
  state: { current: {} as Record<string, unknown> },
}));

vi.mock('@/hooks/integrations/useTalkXEngineAlerts', () => ({
  useTalkXEngineAlerts: () => state.current,
}));

import { TalkXEngineAlertsCard } from '../tracking/TalkXEngineAlertsCard';

/**
 * C-11/X158 — card "Alertas do motor" no acompanhamento da campanha.
 * Antes dele a tabela `talkx_alerts` era escrita pelo tick do motor e não tinha
 * nenhuma tela lendo: o operador só via o problema quando a campanha parava.
 */

const CAMPANHA = '621521f3-e9c9-49c2-834e-cea07545d476';

function alert(partial: Record<string, unknown>) {
  return {
    id: 'a', kind: 'stalled_campaign', campaignId: CAMPANHA, openedAt: '2026-11-27T12:00:00Z',
    label: 'Campanha parada', detail: null, tone: 'warning' as const, ...partial,
  };
}

function setState(partial: Record<string, unknown>) {
  state.current = { alerts: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn(), ...partial };
  return state.current;
}

beforeEach(() => {
  setState({});
});

describe('TalkXEngineAlertsCard', () => {
  it('mostra o esqueleto enquanto carrega', () => {
    setState({ isLoading: true });
    const { container } = render(<TalkXEngineAlertsCard campaignId={CAMPANHA} />);
    expect(container.querySelector('[data-talkx-query="loading"]')).toBeTruthy();
  });

  it('sem alerta aberto afirma que o motor está limpo (não é erro nem silêncio)', () => {
    setState({ alerts: [] });
    render(<TalkXEngineAlertsCard campaignId={CAMPANHA} />);
    expect(screen.getByText('Nenhum alerta aberto')).toBeTruthy();
    expect(screen.getByText('Sem alertas')).toBeTruthy();
    expect(screen.getByText(/administradores e supervisores/)).toBeTruthy();
  });

  it('lista os alertas abertos com rótulo, tempo e motivo do payload', () => {
    setState({
      alerts: [
        alert({ id: 'a', label: 'Motor com problemas', tone: 'danger', detail: '3 falhas seguidas · últimos retornos', openedAt: new Date(Date.now() - 90_000).toISOString() }),
        alert({ id: 'b', kind: 'stalled_campaign', campaignId: null, label: 'Campanha parada', tone: 'warning' }),
      ],
    });
    render(<TalkXEngineAlertsCard campaignId={CAMPANHA} />);

    expect(screen.getByText('2 abertos')).toBeTruthy();
    expect(screen.getByText('Motor com problemas')).toBeTruthy();
    expect(screen.getByText('Campanha parada')).toBeTruthy();
    expect(screen.getByText('Crítico')).toBeTruthy();
    expect(screen.getByText('Atenção')).toBeTruthy();
    expect(screen.getByText('3 falhas seguidas · últimos retornos')).toBeTruthy();
    expect(screen.getByText(/^Motor \(geral\) · aberto há /)).toBeTruthy();
    expect(screen.getByText(/^Esta campanha · aberto há /)).toBeTruthy();
  });

  it('distingue alerta de outra campanha pelo começo do id', () => {
    setState({ alerts: [alert({ campaignId: 'ffffffff-1111-2222-3333-444444444444' })] });
    render(<TalkXEngineAlertsCard campaignId={CAMPANHA} />);
    expect(screen.getByText(/^Campanha ffffffff · aberto há /)).toBeTruthy();
  });

  it('sem crítico, o resumo fica em atenção', () => {
    setState({ alerts: [alert({})] });
    render(<TalkXEngineAlertsCard campaignId={CAMPANHA} />);
    expect(screen.getByText('1 aberto')).toBeTruthy();
    expect(screen.queryByText('Crítico')).toBeNull();
  });

  it('erro tem precedência sobre o vazio e oferece nova tentativa', () => {
    const refetch = vi.fn();
    setState({ alerts: [], isError: true, error: new Error('talkx-engine-alerts: falha ao consultar talkx_alerts'), refetch });
    render(<TalkXEngineAlertsCard campaignId={CAMPANHA} />);

    expect(screen.getByText('Não foi possível carregar as alertas do motor')).toBeTruthy();
    expect(screen.queryByText('Nenhum alerta aberto')).toBeNull();
    fireEvent.click(screen.getByText('Tentar novamente'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});