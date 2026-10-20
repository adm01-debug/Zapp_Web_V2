import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

// Mock supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({
          then: (r: (value: unknown) => void) => r({
            data: [
              {
                id: 'sla-1',
                name: 'SLA Crítico',
                first_response_minutes: 5,
                resolution_minutes: 30,
                priority: 'critical',
                is_default: false,
                is_active: true,
                created_at: '2026-01-01',
                updated_at: '2026-01-01',
              },
              {
                id: 'sla-2',
                name: 'SLA Padrão',
                first_response_minutes: 15,
                resolution_minutes: 120,
                priority: 'medium',
                is_default: true,
                is_active: true,
                created_at: '2026-01-01',
                updated_at: '2026-01-01',
              },
            ],
            error: null,
          }),
        }),
      }),
      insert: () => ({ then: (r: (value: unknown) => void) => r({ error: null }) }),
      update: () => ({ eq: () => ({ then: (r: (value: unknown) => void) => r({ error: null }) }) }),
      delete: () => ({ eq: () => ({ then: (r: (value: unknown) => void) => r({ error: null }) }) }),
    }),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { SLAConfigurationManager } from '../SLAConfigurationManager';

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

describe('SLAConfigurationManager', () => {
  it('renders the title', async () => {
    render(<SLAConfigurationManager />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByText('Configurações Globais de SLA')).toBeInTheDocument();
    });
  });

  it('renders "Novo SLA" button', async () => {
    render(<SLAConfigurationManager />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByText('Novo SLA')).toBeInTheDocument();
    });
  });

  it('displays SLA configurations from database', async () => {
    render(<SLAConfigurationManager />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByText('SLA Crítico')).toBeInTheDocument();
      expect(screen.getByText('SLA Padrão')).toBeInTheDocument();
    });
  });

  it('shows priority badges', async () => {
    render(<SLAConfigurationManager />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByText('Crítica')).toBeInTheDocument();
      expect(screen.getByText('Média')).toBeInTheDocument();
    });
  });

  it('shows "Padrão" badge for default SLA', async () => {
    render(<SLAConfigurationManager />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByText('Padrão')).toBeInTheDocument();
    });
  });

  it('shows formatted response times', async () => {
    render(<SLAConfigurationManager />, { wrapper: createWrapper() });
    await waitFor(() => {
      const allText = document.body.textContent || '';
      expect(allText).toContain('1ª Resp:');
      expect(allText).toContain('5min');
      expect(allText).toContain('15min');
    });
  });

  it('opens create dialog on "Novo SLA" click', async () => {
    render(<SLAConfigurationManager />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByText('Novo SLA')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Novo SLA'));
    await waitFor(() => {
      expect(screen.getByText('Nova Configuração de SLA')).toBeInTheDocument();
    });
  });

  it('has active toggle switches for each config', async () => {
    render(<SLAConfigurationManager />, { wrapper: createWrapper() });
    await waitFor(() => {
      const switches = screen.getAllByRole('switch');
      expect(switches.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('botões e switches nomeados com aria-label por regra', async () => {
    render(<SLAConfigurationManager />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Editar SLA SLA Crítico' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Editar SLA SLA Padrão' })).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'Ativar SLA SLA Crítico' })).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'Ativar SLA SLA Padrão' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Excluir SLA SLA Crítico' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Excluir SLA SLA Padrão' })).toBeInTheDocument();
    });
  });

  it('seletor de prioridade tem rótulo ligado via combobox nomeado', async () => {
    render(<SLAConfigurationManager />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByText('Novo SLA'));
    expect(await screen.findByRole('combobox', { name: 'Prioridade' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'SLA padrão' })).toBeInTheDocument();
  });

  it('axe zerado no SLAConfigurationManager', async () => {
    const { container } = render(<SLAConfigurationManager />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByText('Configurações Globais de SLA')).toBeInTheDocument();
    });
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results).toHaveNoViolations();
  });
});
