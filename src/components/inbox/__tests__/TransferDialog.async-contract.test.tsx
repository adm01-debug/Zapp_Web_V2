import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransferDialog } from '../TransferDialog';

vi.mock('@/hooks/crm/useAgents', () => ({
  useAgents: () => ({
    agents: [{
      id: 'agent-2', name: 'Agente Destino', avatar_url: null,
      status: 'online', activeChats: 1, max_chats: 5,
    }],
    isLoading: false,
  }),
}));
vi.mock('@/hooks/business/useQueues', () => ({ useQueues: () => ({ queues: [], loading: false }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));

function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function selectTargetAndSubmit() {
  fireEvent.click(screen.getByRole('button', { name: /Agente Destino/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Transferir' }));
}

describe('TransferDialog — contrato assíncrono', () => {
  beforeEach(() => vi.clearAllMocks());

  it('aguarda a Promise, bloqueia reenvio e fecha somente após resolve', async () => {
    const operation = deferred();
    const onTransfer = vi.fn(() => operation.promise);
    const onOpenChange = vi.fn();
    render(<TransferDialog open onOpenChange={onOpenChange} onTransfer={onTransfer} />);

    selectTargetAndSubmit();

    expect(onTransfer).toHaveBeenCalledWith('agent', 'agent-2', undefined);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Transferindo...' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Transferindo...' }));
    expect(onTransfer).toHaveBeenCalledTimes(1);

    await act(async () => {
      operation.resolve();
      await operation.promise;
    });

    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('permanece aberto e reabilita a ação quando a Promise rejeita', async () => {
    const operation = deferred();
    const onTransfer = vi.fn(() => operation.promise);
    const onOpenChange = vi.fn();
    render(<TransferDialog open onOpenChange={onOpenChange} onTransfer={onTransfer} />);

    selectTargetAndSubmit();

    await act(async () => {
      operation.reject(new Error('transfer failed'));
      await operation.promise.catch(() => undefined);
    });

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Transferir' })).toBeEnabled();
  });
});
