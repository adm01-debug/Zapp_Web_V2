import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AgentReassignmentPanel } from '../AgentReassignmentPanel';

vi.mock('@/hooks/crm/useAgentReassignment', () => ({
  useAgentReassignment: () => ({
    reassignAbsent: { mutate: vi.fn(), isPending: false },
    reassignOverloaded: { mutate: vi.fn(), isPending: false },
    isLoading: false,
  }),
}));

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('AgentReassignmentPanel — rótulos de botão sem corte no celular', () => {
  it('o botão "Reatribuir Ausentes" tem whitespace-normal para permitir quebra de linha', () => {
    renderWithProviders(<AgentReassignmentPanel />);
    const button = screen.getByRole('button', { name: /Reatribuir Ausentes/ });
    expect(button).toHaveClass('whitespace-normal');
  });

  it('o botão "Reatribuir Ausentes" tem min-w-0 para evitar overflow em flex', () => {
    renderWithProviders(<AgentReassignmentPanel />);
    const button = screen.getByRole('button', { name: /Reatribuir Ausentes/ });
    expect(button).toHaveClass('min-w-0');
  });

  it('o botão "Balancear Carga" tem whitespace-normal para permitir quebra de linha', () => {
    renderWithProviders(<AgentReassignmentPanel />);
    const button = screen.getByRole('button', { name: /Balancear Carga/ });
    expect(button).toHaveClass('whitespace-normal');
  });

  it('o botão "Balancear Carga" tem min-w-0 para evitar overflow em flex', () => {
    renderWithProviders(<AgentReassignmentPanel />);
    const button = screen.getByRole('button', { name: /Balancear Carga/ });
    expect(button).toHaveClass('min-w-0');
  });

  it('os dois botões de reatribuição expõem os nomes acessíveis completos', () => {
    renderWithProviders(<AgentReassignmentPanel />);
    expect(screen.getByRole('button', { name: /Reatribuir Ausentes/ })).toHaveTextContent('Reatribuir Ausentes');
    expect(screen.getByRole('button', { name: /Balancear Carga/ })).toHaveTextContent('Balancear Carga');
  });
});
