import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

const mockMutateAbsent = vi.fn();
const mockMutateOverloaded = vi.fn();

vi.mock('@/hooks/crm/useAgentReassignment', () => ({
  useAgentReassignment: () => ({
    reassignAbsent: { mutate: mockMutateAbsent, isPending: false },
    reassignOverloaded: { mutate: mockMutateOverloaded, isPending: false },
    isLoading: false,
  }),
}));

import { AgentReassignmentPanel } from '../AgentReassignmentPanel';

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // As mutações são spies de módulo: sem limpar, a chamada de um caso vaza no seguinte.
  mockMutateAbsent.mockClear();
  mockMutateOverloaded.mockClear();
});

describe('AgentReassignmentPanel — reatribuição em massa exige confirmação', () => {
  it('clicar em "Reatribuir Ausentes" abre a confirmação e não dispara a RPC', () => {
    renderWithProviders(<AgentReassignmentPanel />);

    fireEvent.click(screen.getByRole('button', { name: /Reatribuir Ausentes/ }));

    expect(mockMutateAbsent).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/inativos há mais de 30 minutos/)).toBeInTheDocument();
  });

  it('confirmar dispara reassignAbsent(30) e não dispara o balanceamento', () => {
    renderWithProviders(<AgentReassignmentPanel />);

    fireEvent.click(screen.getByRole('button', { name: /Reatribuir Ausentes/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reatribuição' }));

    expect(mockMutateAbsent).toHaveBeenCalledTimes(1);
    expect(mockMutateAbsent).toHaveBeenCalledWith(30);
    expect(mockMutateOverloaded).not.toHaveBeenCalled();
  });

  it('cancelar não dispara a reatribuição', () => {
    renderWithProviders(<AgentReassignmentPanel />);

    fireEvent.click(screen.getByRole('button', { name: /Reatribuir Ausentes/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(mockMutateAbsent).not.toHaveBeenCalled();
  });

  it('confirmar "Balancear Carga" dispara reassignOverloaded', () => {
    renderWithProviders(<AgentReassignmentPanel />);

    fireEvent.click(screen.getByRole('button', { name: /Balancear Carga/ }));
    expect(mockMutateOverloaded).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar balanceamento' }));

    expect(mockMutateOverloaded).toHaveBeenCalledTimes(1);
    expect(mockMutateAbsent).not.toHaveBeenCalled();
  });

  it('o diálogo diz que o número é calculado no servidor e que a ação não volta atrás', () => {
    renderWithProviders(<AgentReassignmentPanel />);

    fireEvent.click(screen.getByRole('button', { name: /Balancear Carga/ }));

    expect(screen.getByText(/só é conhecido quando o servidor executa/)).toBeInTheDocument();
    expect(screen.getByText(/A ação não pode ser desfeita/)).toBeInTheDocument();
  });
});
