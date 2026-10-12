import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SystemHealthCard } from '../overview/SystemHealthCard';

const mockUseSignals = vi.fn();
vi.mock('@/hooks/system/useSystemHealthSignals', () => ({
  useSystemHealthSignals: () => mockUseSignals(),
}));

describe('SystemHealthCard (Saúde do Sistema)', () => {
  it('enquanto mede, não mostra nota (nada inventado)', () => {
    mockUseSignals.mockReturnValue({ signals: null, isLoading: true, isError: false });
    render(<SystemHealthCard />);
    expect(screen.getByText('Medindo a saúde do sistema…')).toBeInTheDocument();
    expect(screen.queryByTestId('system-health-score')).not.toBeInTheDocument();
  });

  it('erro de coleta não vira nota: avisa em vez de afirmar saúde', () => {
    mockUseSignals.mockReturnValue({ signals: null, isLoading: false, isError: true });
    render(<SystemHealthCard />);
    expect(screen.getByText('Não foi possível medir a saúde do sistema agora.')).toBeInTheDocument();
    expect(screen.queryByTestId('system-health-score')).not.toBeInTheDocument();
  });

  it('com sinais saudáveis, mostra 100, Excelente e os três detalhes', () => {
    mockUseSignals.mockReturnValue({
      signals: {
        connections: [{ status: 'connected', healthStatus: 'healthy' }],
        failedRecent: 0,
        totalRecent: 40,
        stalledSending: 0,
      },
      isLoading: false,
      isError: false,
    });
    render(<SystemHealthCard />);
    expect(screen.getByTestId('system-health-score')).toHaveTextContent('100');
    expect(screen.getByText('Excelente')).toBeInTheDocument();
    expect(screen.getAllByTestId('system-health-signal')).toHaveLength(3);
    expect(screen.getByText('Nenhuma falha em 40 envio(s) nas últimas 24h')).toBeInTheDocument();
  });

  it('sinal ruim aparece no detalhe com o resumo real (não escondido pela nota)', () => {
    mockUseSignals.mockReturnValue({
      signals: {
        connections: [
          { status: 'connected', healthStatus: 'healthy' },
          { status: 'connected', healthStatus: 'degraded' },
        ],
        failedRecent: 0,
        totalRecent: 10,
        stalledSending: 3,
      },
      isLoading: false,
      isError: false,
    });
    render(<SystemHealthCard />);
    // 30 (conexões) + 30 (falhas) + 0 (fila) = 60 → Atenção
    expect(screen.getByTestId('system-health-score')).toHaveTextContent('60');
    // "Atenção" aparece no selo da nota (60/100) e na linha de conexões — basta existir.
    expect(screen.getAllByText('Atenção').length).toBeGreaterThan(0);
    expect(screen.getByText('1 de 2 conectada(s) · 1 degradada(s)')).toBeInTheDocument();
    expect(screen.getByText('3 mensagem(ns) presa(s) há mais de 5 min')).toBeInTheDocument();
    expect(screen.getByText('Falha')).toBeInTheDocument();
  });

  it('o link de Diagnóstico chama o handler (e o padrão navega, não fica inerte)', () => {
    const onOpenDiagnostics = vi.fn();
    mockUseSignals.mockReturnValue({
      signals: { connections: [{ status: 'connected', healthStatus: 'healthy' }], failedRecent: 0, totalRecent: 1, stalledSending: 0 },
      isLoading: false,
      isError: false,
    });
    render(<SystemHealthCard onOpenDiagnostics={onOpenDiagnostics} />);
    fireEvent.click(screen.getByTestId('system-health-diagnostics'));
    expect(onOpenDiagnostics).toHaveBeenCalledTimes(1);
  });
});
