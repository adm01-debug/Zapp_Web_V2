/**
 * t_90d875a4 — o diálogo de transferência do painel do contato deve
 * distinguir sucesso total, sucesso PARCIAL (nota interna não salva) e falha
 * real (nada gravado). Antes ele mostrava
 * "Conversa transferida com sucesso!" sempre que o callback resolvia —
 * inclusive quando a policy de UPDATE negava a escrita em silêncio.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HandoffDialog } from '../HandoffDialog';

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: toastMock }));

const AGENTS = [{ id: 'agent-1', name: 'Fulano', avatar_url: null }];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: AGENTS, error: null }),
      }),
    }),
  },
}));

function renderDialog(
  onHandoff: (agentId: string, comment: string) => Promise<{ noteSaved: boolean }>
) {
  const qc = new QueryClient();
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <HandoffDialog open onOpenChange={onOpenChange} contactId="c1" onHandoff={onHandoff} />
    </QueryClientProvider>
  );
  return { onOpenChange };
}

async function selectAgentAndSubmit() {
  const agentButton = await screen.findByText('Fulano');
  fireEvent.click(agentButton);
  fireEvent.click(screen.getByRole('button', { name: /Transferir/ }));
}

beforeEach(() => {
  toastMock.success.mockClear();
  toastMock.error.mockClear();
  toastMock.warning.mockClear();
});

describe('HandoffDialog — aviso por resultado (sem falso "transferida")', () => {
  it('sucesso total (noteSaved=true): fecha o diálogo e mostra toast.success', async () => {
    const onHandoff = vi.fn().mockResolvedValue({ noteSaved: true });
    const { onOpenChange } = renderDialog(onHandoff);

    await selectAgentAndSubmit();

    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith('Conversa transferida com sucesso!')
    );
    expect(toastMock.warning).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('sucesso parcial (noteSaved=false): avisa que a nota não foi salva, sem toast.success', async () => {
    const onHandoff = vi.fn().mockResolvedValue({ noteSaved: false });
    renderDialog(onHandoff);

    await selectAgentAndSubmit();

    await waitFor(() =>
      expect(toastMock.warning).toHaveBeenCalledWith(
        'Conversa transferida, mas a nota não pôde ser salva.'
      )
    );
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('callback rejeita (ID inválido, RLS, nada gravado): toast.error e diálogo ABERTO', async () => {
    const onHandoff = vi.fn().mockRejectedValue(new Error('permission denied'));
    const { onOpenChange } = renderDialog(onHandoff);

    await selectAgentAndSubmit();

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('Erro ao transferir conversa')
    );
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.warning).not.toHaveBeenCalled();
    // Rejeição = nada foi commitado: o diálogo fica aberto para nova tentativa.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
