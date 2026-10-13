/**
 * Cartão t_5cc4a897 — Follow-up automático: o botão de excluir sequência
 * (linha 232) apagava direto, sem confirmação. A correção passa a exclusão
 * por um diálogo de confirmação.
 * Este teste FALHA sem a correção (o clique já excluía) e PASSA com ela.
 * Dados 100% sintéticos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FollowUpSequences } from '../FollowUpSequences';

const eqMock = vi.fn(async () => ({ error: null }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: async () => ({
          data: [
            {
              id: 'seq-sintetico-001',
              name: 'Sequência de boas-vindas',
              is_active: true,
              trigger_event: 'lead_entered',
              followup_steps: [
                { id: 'step-1', step_order: 1, delay_hours: 24, message_template: 'Olá {name}!' },
              ],
            },
          ],
          error: null,
        }),
      }),
      delete: () => ({ eq: eqMock }),
    }),
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'u-sintetico-001' } }),
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/settings/FollowUpExecutionsHistory', () => ({
  FollowUpExecutionsHistory: () => null,
}));

vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('FollowUpSequences — confirmação antes de excluir', () => {
  beforeEach(() => {
    eqMock.mockClear();
  });

  it('não exclui ao clicar na lixeira; só depois de confirmar no diálogo', async () => {
    render(<FollowUpSequences />, { wrapper });
    const lixeira = await screen.findByRole('button', { name: 'Excluir sequência Sequência de boas-vindas' });

    fireEvent.click(lixeira);
    expect(eqMock).not.toHaveBeenCalled();
    expect(await screen.findByText('Excluir sequência?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(eqMock).toHaveBeenCalledWith('id', 'seq-sintetico-001'));
  });

  it('cancelar não exclui', async () => {
    render(<FollowUpSequences />, { wrapper });
    const lixeira = await screen.findByRole('button', { name: 'Excluir sequência Sequência de boas-vindas' });

    fireEvent.click(lixeira);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(eqMock).not.toHaveBeenCalled();
  });
});
