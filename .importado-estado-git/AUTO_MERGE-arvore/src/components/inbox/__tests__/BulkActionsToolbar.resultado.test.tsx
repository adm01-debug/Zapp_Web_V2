/**
 * Regressão do cartão t_8016679b: a barra de ações em lote fechava o diálogo de
 * transferência ANTES do resultado.
 *
 * Antes: `BulkActionsToolbar` chamava `onTransfer(...)` sem `await` e fazia
 * `setShowTransferDialog(false)` na hora. Com o lote (t_2901d317) rejeitando em
 * falha, isso (a) escondia o resumo — o usuário não via quantas conversas
 * transferiram e quantas falharam — e (b) deixava a promise rejeitada sem
 * tratamento.
 *
 * Aqui o alvo é o componente REAL (`BulkActionsToolbar` + `TransferDialog`), e a
 * fronteira dublada é só o dado de fora (auth, agentes, filas, Supabase) e o
 * `onTransfer` que vem do hook. O caso de falha e o de sucesso provam o que o
 * usuário vê: o diálogo só desaparece depois que a transferência resolve.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const CURRENT_USER_ID = 'me-auth-id';

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: CURRENT_USER_ID } }),
}));

vi.mock('@/hooks/business/useQueues', () => ({
  useQueues: () => ({ queues: [], loading: false }),
}));

vi.mock('@/hooks/crm/useAgents', () => ({
  useAgents: () => ({
    agents: [
      {
        id: 'me-profile',
        user_id: CURRENT_USER_ID,
        name: 'Eu Mesmo',
        avatar_url: null,
        status: 'online',
        activeChats: 0,
        max_chats: 5,
      },
    ],
    isLoading: false,
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

import { BulkActionsToolbar } from '@/components/inbox/BulkActionsToolbar';
import { TooltipProvider } from '@/components/ui/tooltip';

type OnTransfer = (type: 'agent' | 'queue', targetId: string, message?: string) => void | Promise<void>;

function renderToolbar(onTransfer: OnTransfer) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BulkActionsToolbar
          selectedCount={2}
          onMarkAsRead={vi.fn()}
          onTransfer={onTransfer}
          onArchive={vi.fn()}
          onClearSelection={vi.fn()}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

/** Abre o diálogo pela barra, escolhe o atendente e confirma a transferência. */
async function confirmarTransferencia() {
  // Só a barra existe neste momento (o diálogo ainda está fechado).
  fireEvent.click(screen.getByRole('button', { name: 'Transferir' }));

  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByText('Eu Mesmo'));
  fireEvent.click(within(dialog).getByRole('button', { name: /transferir/i }));

  return dialog;
}

describe('BulkActionsToolbar — o diálogo só fecha depois do resultado', () => {
  it('falha na transferência: o diálogo CONTINUA aberto (o resumo do lote fica visível)', async () => {
    const onTransfer = vi.fn().mockRejectedValue(
      new Error('Erro ao transferir contatos: 1 de 2 contato(s) transferido(s); 1 falharam'),
    );
    renderToolbar(onTransfer);

    await confirmarTransferencia();

    await waitFor(() =>
      expect(onTransfer).toHaveBeenCalledWith('agent', 'me-profile', undefined),
    );

    // Antes da correção a barra fechava na hora e não havia diálogo nenhum aqui.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Transferir Chat')).toBeInTheDocument();
    // O diálogo destrava: o botão volta a "Transferir" (terminou o "Transferindo…"),
    // então o operador pode corrigir o destino sem reabrir a barra.
    await waitFor(() =>
      expect(within(screen.getByRole('dialog')).getByRole('button', { name: /transferir/i })).toBeEnabled(),
    );
  });

  it('sucesso na transferência: o diálogo fecha depois que a promise resolve', async () => {
    let resolver: (() => void) | undefined;
    const onTransfer = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolver = resolve;
        }),
    );
    renderToolbar(onTransfer);

    await confirmarTransferencia();

    await waitFor(() =>
      expect(onTransfer).toHaveBeenCalledWith('agent', 'me-profile', undefined),
    );

    // Enquanto a promise está em voo, o diálogo fica aberto mostrando a espera.
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /transferindo/i })).toBeDisabled();

    resolver?.();

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
