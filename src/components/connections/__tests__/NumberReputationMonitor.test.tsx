import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const mockSelectReputations = vi.hoisted(() => vi.fn());
const mockSelectConnections = vi.hoisted(() => vi.fn());
const mockEq = vi.hoisted(() => vi.fn());

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
  mockSelectReputations.mockResolvedValue({ data: [repRow], error: null });
  mockSelectConnections.mockResolvedValue({ data: [connRow], error: null });
  mockEq.mockResolvedValue({ error: null });
});

describe('NumberReputationMonitor', () => {
  it('não anuncia sucesso quando a escrita do aquecimento falha', async () => {
    mockEq.mockResolvedValueOnce({ error: { message: 'permission denied' } });

    render(<NumberReputationMonitor />);
    const botao = await screen.findByRole('button', { name: /aquecer/i });
    fireEvent.click(botao);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Não foi possível iniciar o aquecimento');
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('anuncia sucesso somente quando a escrita é aceita', async () => {
    render(<NumberReputationMonitor />);
    const botao = await screen.findByRole('button', { name: /aquecer/i });
    fireEvent.click(botao);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Aquecimento iniciado');
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('apresenta a tela como configuração sem execução automática', async () => {
    render(<NumberReputationMonitor />);

    expect(await screen.findByText(/sem execução automática/i)).toBeInTheDocument();
    expect(screen.queryByText(/populados automaticamente/i)).not.toBeInTheDocument();
  });
});
