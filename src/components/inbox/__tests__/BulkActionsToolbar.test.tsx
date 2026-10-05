/**
 * Regressão do cartão t_64f9932b (P1 #88): a toolbar de ações em lote fechava o
 * TransferDialog sem aguardar a Promise de transferência — o diálogo sumia durante
 * a pendência e também após rejeição, dando falso positivo de sucesso. O contrato
 * em lote é `agent | queue` (sem "connection"): a toolbar deve repassar o callback
 * sem cast e deixar o próprio diálogo fechar só no sucesso.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'me-auth-id' } }),
}));

vi.mock('@/hooks/crm/useAgents', () => ({
  useAgents: () => ({
    agents: [
      { id: 'agent-1', user_id: 'me-auth-id', name: 'Agente Um', avatar_url: null, status: 'online', activeChats: 0, max_chats: 5 },
    ],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/business/useQueues', () => ({
  useQueues: () => ({ queues: [], loading: false }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

import { BulkActionsToolbar } from '@/components/inbox/BulkActionsToolbar';

function deferred() {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderToolbar(onTransfer: (type: 'agent' | 'queue', targetId: string, message?: string) => Promise<void>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
  return render(
    <BulkActionsToolbar
      selectedCount={2}
      onMarkAsRead={vi.fn()}
      onTransfer={onTransfer}
      onArchive={vi.fn()}
      onClearSelection={vi.fn()}
    />,
    { wrapper }
  );
}

async function abrirDialogoEConfirmar() {
  fireEvent.click(screen.getByRole('button', { name: 'Transferir' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByText('Agente Um'));
  fireEvent.click(within(dialog).getByRole('button', { name: /transferir/i }));
  return dialog;
}

describe('BulkActionsToolbar — transferência em lote respeita a Promise', () => {
  it('não fecha o diálogo enquanto a transferência está pendente; fecha só no sucesso', async () => {
    const d = deferred();
    const onTransfer = vi.fn(() => d.promise);
    renderToolbar(onTransfer);

    await abrirDialogoEConfirmar();

    expect(onTransfer).toHaveBeenCalledWith('agent', 'agent-1', undefined);
    // Pendência: o diálogo continua aberto.
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    await act(async () => {
      d.resolve();
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('permanece aberto quando a transferência rejeita', async () => {
    const d = deferred();
    const onTransfer = vi.fn(() => d.promise);
    renderToolbar(onTransfer);

    await abrirDialogoEConfirmar();

    await act(async () => {
      d.reject(new Error('falha no banco'));
    });

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  });
});
