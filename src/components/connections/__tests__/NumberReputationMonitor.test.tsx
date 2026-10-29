import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const mockSelectReputations = vi.hoisted(() => vi.fn());
const mockSelectConnections = vi.hoisted(() => vi.fn());
const mockEq = vi.hoisted(() => vi.fn());
const mockUpdateSelect = vi.hoisted(() => vi.fn());
// Papel mutável: cada teste ajusta quem está vendo a tela.
const mockRole = vi.hoisted(() => ({ isAdmin: false, isSupervisor: false, loading: false }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'number_reputation') {
        return {
          select: mockSelectReputations,
          update: vi.fn(() => ({ eq: mockEq })),
        };
      }
      return { select: mockSelectConnections };
    }),
  },
}));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => mockRole,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children }: { children?: import('react').ReactNode }) => <div>{children}</div>,
  },
}));

import { NumberReputationMonitor } from '@/components/connections/NumberReputationMonitor';
import { toast } from 'sonner';

const repRow = {
  id: 'r1',
  whatsapp_connection_id: 'c1',
  health_score: 90,
  messages_sent_today: 0,
  failures_today: 0,
  complaints_count: 0,
  warmup_status: 'none',
  warmup_day: null,
  daily_limit: null,
};

const connRow = { id: 'c1', instance_id: 'Instância 1', phone_number: '+55 11 90000-0000' };

beforeEach(() => {
  vi.clearAllMocks();
  mockRole.isAdmin = false;
  mockRole.isSupervisor = false;
  mockSelectReputations.mockResolvedValue({ data: [repRow], error: null });
  mockSelectConnections.mockResolvedValue({ data: [connRow], error: null });
  // Cadeia do update: .eq('id', id) -> .select('id')
  mockEq.mockReturnValue({ select: mockUpdateSelect });
  mockUpdateSelect.mockResolvedValue({ data: [{ id: 'r1' }], error: null });
});

describe('NumberReputationMonitor', () => {
  it('não anuncia sucesso quando a escrita do aquecimento falha', async () => {
    mockRole.isAdmin = true;
    mockUpdateSelect.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } });

    render(<NumberReputationMonitor />);
    const botao = await screen.findByRole('button', { name: /aquecer/i });
    fireEvent.click(botao);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Não foi possível iniciar o aquecimento');
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('não anuncia sucesso quando a RLS grava zero linhas sem erro', async () => {
    mockRole.isSupervisor = true;
    // PostgREST devolve sucesso com 0 linhas quando a policy USING filtra o alvo.
    mockUpdateSelect.mockResolvedValueOnce({ data: [], error: null });

    render(<NumberReputationMonitor />);
    const botao = await screen.findByRole('button', { name: /aquecer/i });
    fireEvent.click(botao);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Não foi possível iniciar o aquecimento');
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('anuncia sucesso somente quando a escrita é aceita', async () => {
    mockRole.isSupervisor = true;
    render(<NumberReputationMonitor />);
    const botao = await screen.findByRole('button', { name: /aquecer/i });
    fireEvent.click(botao);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Aquecimento iniciado');
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('não mostra o botão Aquecer para quem não é admin nem supervisor', async () => {
    render(<NumberReputationMonitor />);

    expect(await screen.findByText('Instância 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /aquecer/i })).not.toBeInTheDocument();
  });

  it('mostra o botão Aquecer para supervisor', async () => {
    mockRole.isSupervisor = true;
    render(<NumberReputationMonitor />);

    expect(await screen.findByRole('button', { name: /aquecer/i })).toBeInTheDocument();
  });

  it('não renderiza cartão vazio quando não há nenhuma linha de reputação', async () => {
    mockSelectReputations.mockResolvedValue({ data: [], error: null });
    mockSelectConnections.mockResolvedValue({ data: [], error: null });

    const { container } = render(<NumberReputationMonitor />);

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
    expect(screen.queryByText(/Nenhum dado de reputação registrado/i)).not.toBeInTheDocument();
  });

  it('distingue erro de leitura de lista vazia', async () => {
    mockSelectReputations.mockResolvedValue({ data: null, error: { message: 'boom' } });

    render(<NumberReputationMonitor />);

    expect(await screen.findByText(/não foi possível carregar a reputação dos números/i)).toBeInTheDocument();
    expect(screen.queryByText(/Nenhum dado de reputação registrado/i)).not.toBeInTheDocument();
  });

  it('apresenta a tela como configuração sem execução automática', async () => {
    render(<NumberReputationMonitor />);

    expect(await screen.findByText(/sem execução automática/i)).toBeInTheDocument();
    expect(screen.queryByText(/populados automaticamente/i)).not.toBeInTheDocument();
  });
});
