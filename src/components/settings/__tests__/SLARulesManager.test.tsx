import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

// Mock supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({
          not: () => ({
            is: () => ({
              is: () => ({
                is: () => ({
                  then: (r: unknown) => (r as Function)({ data: [], error: null }),
                }),
                then: (r: unknown) => (r as Function)({ data: [], error: null }),
              }),
              then: (r: unknown) => (r as Function)({ data: [], error: null }),
            }),
            then: (r: unknown) => (r as Function)({ data: [], error: null }),
          }),
          then: (r: unknown) => (r as Function)({ data: [], error: null }),
        }),
        not: () => ({
          then: (r: unknown) => (r as Function)({ data: [], error: null }),
        }),
        eq: () => ({
          then: (r: unknown) => (r as Function)({ data: [], error: null }),
        }),
        then: (r: unknown) => (r as Function)({ data: [], error: null }),
      }),
      insert: () => ({ then: (r: unknown) => (r as Function)({ error: null }) }),
      update: () => ({
        eq: () => ({ then: (r: unknown) => (r as Function)({ error: null }) }),
      }),
      delete: () => ({
        eq: () => ({ then: (r: unknown) => (r as Function)({ error: null }) }),
      }),
    }),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { SLARulesManager } from '../SLARulesManager';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('SLARulesManager', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the component with title and description', async () => {
    render(<SLARulesManager />, { wrapper: createWrapper() });
    expect(screen.getByText('Regras Granulares de SLA')).toBeInTheDocument();
    expect(screen.getByText(/Configure prazos específicos/)).toBeInTheDocument();
  });

  it('renders all 6 scope tabs', async () => {
    render(<SLARulesManager />, { wrapper: createWrapper() });
    expect(screen.getByText('Por Cliente')).toBeInTheDocument();
    expect(screen.getByText('Por Empresa')).toBeInTheDocument();
    expect(screen.getByText('Por Cargo')).toBeInTheDocument();
    expect(screen.getByText('Por Tipo')).toBeInTheDocument();
    expect(screen.getByText('Por Fila')).toBeInTheDocument();
    expect(screen.getByText('Por Agente')).toBeInTheDocument();
  });

  it('shows empty state when no rules exist', async () => {
    render(<SLARulesManager />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByText('Nenhuma regra de SLA neste escopo')).toBeInTheDocument();
    });
  });

  it('shows "Nova Regra" button', async () => {
    render(<SLARulesManager />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByText('Nova Regra')).toBeInTheDocument();
    });
  });

  it('opens dialog when "Nova Regra" is clicked', async () => {
    render(<SLARulesManager />, { wrapper: createWrapper() });
    await waitFor(() => fireEvent.click(screen.getByText('Nova Regra')));
    await waitFor(() => {
      expect(screen.getByText('Nova Regra de SLA')).toBeInTheDocument();
    });
  });

  it('shows form fields in dialog', async () => {
    render(<SLARulesManager />, { wrapper: createWrapper() });
    await waitFor(() => fireEvent.click(screen.getByText('Nova Regra')));
    await waitFor(() => {
      expect(screen.getByText('Nome da Regra')).toBeInTheDocument();
      expect(screen.getByText('1ª Resposta (min)')).toBeInTheDocument();
      expect(screen.getByText('Resolução (min)')).toBeInTheDocument();
      expect(screen.getByText('Prioridade (maior = mais prioritário)')).toBeInTheDocument();
    });
  });

  it('shows DialogDescription for accessibility', async () => {
    render(<SLARulesManager />, { wrapper: createWrapper() });
    await waitFor(() => fireEvent.click(screen.getByText('Nova Regra')));
    await waitFor(() => {
      expect(screen.getByText(/Defina prazos específicos de resposta e resolução/)).toBeInTheDocument();
    });
  });

  it('can switch between scope tabs', async () => {
    render(<SLARulesManager />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByText('Por Empresa'));
    await waitFor(() => {
      expect(screen.getByText('Nenhuma regra de SLA neste escopo')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Por Agente'));
    await waitFor(() => {
      expect(screen.getByText('Nenhuma regra de SLA neste escopo')).toBeInTheDocument();
    });
  });

  it('has cancel and create buttons in dialog', async () => {
    render(<SLARulesManager />, { wrapper: createWrapper() });
    await waitFor(() => fireEvent.click(screen.getByText('Nova Regra')));
    await waitFor(() => {
      expect(screen.getByText('Cancelar')).toBeInTheDocument();
      expect(screen.getByText('Criar')).toBeInTheDocument();
    });
  });
});

describe('SLA formatMinutes utility', () => {
  it('formats minutes correctly', async () => {
    const { formatSLAMinutes } = await import('../sla/sla-utils');
    expect(formatSLAMinutes(5)).toBe('5min');
    expect(formatSLAMinutes(30)).toBe('30min');
    expect(formatSLAMinutes(59)).toBe('59min');
    expect(formatSLAMinutes(60)).toBe('1h');
    expect(formatSLAMinutes(120)).toBe('2h');
    expect(formatSLAMinutes(90)).toBe('1h 30min');
    expect(formatSLAMinutes(125)).toBe('2h 5min');
  });
});
