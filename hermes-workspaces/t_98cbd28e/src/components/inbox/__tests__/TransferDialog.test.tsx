/**
 * Regressão da auditoria desta sessão: trg_prevent_contact_assignee_hijack
 * (20260924203300) só permite transferir um contato SEM fila para você
 * mesmo (self-claim only), mas o picker de "Usuário" mostrava qualquer
 * atendente — transferir para um colega parecia funcionar na UI e falhava
 * silenciosamente no banco (toast de erro genérico). Este teste trava que
 * o picker já filtra corretamente antes de chegar no banco.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const CURRENT_USER_ID = 'me-auth-id';

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: CURRENT_USER_ID } }),
}));

vi.mock('@/hooks/business/useQueues', () => ({
  useQueues: () => ({ queues: [], loading: false }),
}));

const agentsMock = [
  { id: 'me-profile', user_id: CURRENT_USER_ID, name: 'Eu Mesmo', avatar_url: null, status: 'online', activeChats: 0, max_chats: 5 },
  { id: 'colega-profile', user_id: 'colega-auth-id', name: 'Colega Um', avatar_url: null, status: 'online', activeChats: 0, max_chats: 5 },
];

vi.mock('@/hooks/crm/useAgents', () => ({
  useAgents: () => ({ agents: agentsMock, isLoading: false }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

import { TransferDialog } from '@/components/inbox/TransferDialog';

function renderDialog(queueId: string | null | undefined) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TransferDialog open onOpenChange={vi.fn()} onTransfer={vi.fn()} queueId={queueId} />
    </QueryClientProvider>
  );
}

describe('TransferDialog — contato sem fila só pode ser assumido por você mesmo', () => {
  it('sem fila (queueId null), o picker de "Usuário" só mostra você mesmo', () => {
    renderDialog(null);

    expect(screen.getByText('Eu Mesmo')).toBeInTheDocument();
    expect(screen.queryByText('Colega Um')).not.toBeInTheDocument();
    expect(screen.getByText(/só é possível assumir para você mesmo/i)).toBeInTheDocument();
  });

  it('com fila, o picker mostra todos os atendentes disponíveis', () => {
    renderDialog('queue-1');

    expect(screen.getByText('Eu Mesmo')).toBeInTheDocument();
    expect(screen.getByText('Colega Um')).toBeInTheDocument();
    expect(screen.queryByText(/só é possível assumir para você mesmo/i)).not.toBeInTheDocument();
  });
});

/**
 * Item 88 / R2-INB-009: o TransferDialog não deve oferecer `connection`.
 * Nenhum consumidor Inbox tem operação canônica de transferência de contato
 * entre conexões, e o contrato público fica somente `agent | queue`.
 */
describe('TransferDialog — contrato público restrito a agent|queue (#88)', () => {
  it('não oferece a opção "Conexão" nem o caminho de outro WhatsApp', () => {
    renderDialog(null);

    expect(screen.queryByText('Conexão')).not.toBeInTheDocument();
    expect(screen.queryByText('Outro WhatsApp')).not.toBeInTheDocument();
    // Sobram só as duas opções com backend suportado: Usuário e Departamento.
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('onTransfer aceita somente agent|queue, sem cast', () => {
    // A atribuição abaixo só compila se o contrato de `onTransfer` for
    // exatamente 'agent' | 'queue': parâmetros de função são contravariantes
    // sob strictFunctionTypes. Se 'connection' voltar ao contrato, `tsc -b`
    // reprova este arquivo — o cast (`as ...`) que escondia a incompatibilidade
    // não é mais aceito como prova.
    const onTransfer: ComponentProps<typeof TransferDialog>['onTransfer'] = async (
      type: 'agent' | 'queue',
      targetId: string,
      message?: string
    ) => {
      void type;
      void targetId;
      void message;
    };

    expect(typeof onTransfer).toBe('function');
  });

  it('confirma a transferência para Usuário pelo caminho suportado (agent) e só fecha após resolver', async () => {
    const onTransfer = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <TransferDialog open onOpenChange={onOpenChange} onTransfer={onTransfer} queueId="queue-1" />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByText('Colega Um'));
    fireEvent.click(screen.getByRole('button', { name: /transferir/i }));

    await waitFor(() =>
      expect(onTransfer).toHaveBeenCalledWith('agent', 'colega-profile', undefined)
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
