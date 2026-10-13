/**
 * R2-INB-014 / item 90 — o menu contextual não pode confirmar uma exclusão rejeitada.
 *
 * `MessageContextActions.handleDelete` aguardava a exclusão e ignorava o `{ error }`
 * devolvido pelo PostgREST (que NÃO lança exceção). Resultado: a UI mostrava
 * "Mensagem deletada" e chamava `onMessageDeleted` mesmo com a exclusão falhando.
 * Desde PE-20 (t_fef320c8) a exclusão sai pelo caminho único
 * `supabase.rpc('delete_message', { p_message_id })`.
 *
 * Contrato exigido:
 *  - RPC resolve `{ error: <algo> }` → toast.error presente, toast.success
 *    AUSENTE e `onMessageDeleted` NÃO chamado.
 *  - RPC resolve `{ error: null }` → toast.success presente e callback chamado.
 *  - falha APENAS da Evolution API (deleteMessage rejeita) → o fallback local continua
 *    valendo, desde que a RPC venha com `error: null`.
 *  - nenhum caminho escreve direto na tabela `messages`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MessageContextActions } from '@/components/inbox/MessageContextActions';
import type { Message } from '@/types/chat';

const { toastMock, supabaseResult, deleteMessageMock, rpcMock, fromCalls } = vi.hoisted(() => ({
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  supabaseResult: { error: null as { message: string; code?: string } | null },
  deleteMessageMock: vi.fn(),
  rpcMock: vi.fn(),
  fromCalls: [] as string[],
}));

vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({
    deleteMessage: deleteMessageMock,
    updateMessage: vi.fn(),
    markMessageAsRead: vi.fn(),
    markMessageAsUnread: vi.fn(),
    archiveChat: vi.fn(),
    updateBlockStatus: vi.fn(),
    isLoading: false,
  }),
}));

// PostgREST: rpc(...) devolve uma Promise com { error } — nunca lança.
rpcMock.mockImplementation(() => Promise.resolve(supabaseResult));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: rpcMock,
    from: (table: string) => {
      fromCalls.push(table);
      throw new Error(`escrita inesperada na tabela: ${table}`);
    },
  },
}));

// Renderiza os itens do dropdown como botões clicáveis.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

function mensagem(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    content: 'olá',
    sender: 'agent',
    type: 'text',
    timestamp: new Date(),
    external_id: 'ext-1',
    ...overrides,
  } as Message;
}

function cliqueApagar(onMessageDeleted = vi.fn()) {
  render(
    <MessageContextActions
      message={mensagem()}
      instanceName="inst-1"
      contactJid="5511999999999@s.whatsapp.net"
      onMessageDeleted={onMessageDeleted}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /apagar/i }));
  return { onMessageDeleted };
}

describe('MessageContextActions — R2-INB-014 exclusão rejeitada pelo banco', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCalls.length = 0;
    supabaseResult.error = null;
    deleteMessageMock.mockResolvedValue(undefined);
  });

  it('erro na RPC de exclusão → toast de erro, nenhum sucesso e nenhum callback', async () => {
    supabaseResult.error = { message: 'permission denied', code: '42501' };

    const { onMessageDeleted } = cliqueApagar();

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalled();
    });
    expect(rpcMock).toHaveBeenCalledWith('delete_message', { p_message_id: 'msg-1' });
    expect(fromCalls).toEqual([]);
    expect(toastMock.error).toHaveBeenCalledWith('Erro ao deletar mensagem');
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(onMessageDeleted).not.toHaveBeenCalled();
  });

  it('sucesso na RPC (error: null) → toast de sucesso e callback', async () => {
    supabaseResult.error = null;

    const { onMessageDeleted } = cliqueApagar();

    await waitFor(() => {
      expect(onMessageDeleted).toHaveBeenCalledWith('msg-1');
    });
    expect(rpcMock).toHaveBeenCalledWith('delete_message', { p_message_id: 'msg-1' });
    expect(fromCalls).toEqual([]);
    expect(toastMock.success).toHaveBeenCalledWith('Mensagem deletada para todos');
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('falha só da Evolution API mantém o fallback local quando a RPC confirma', async () => {
    deleteMessageMock.mockRejectedValue(new Error('evolution fora do ar'));
    supabaseResult.error = null;

    const { onMessageDeleted } = cliqueApagar();

    await waitFor(() => {
      expect(onMessageDeleted).toHaveBeenCalledWith('msg-1');
    });
    expect(toastMock.success).toHaveBeenCalledWith('Mensagem deletada para todos');
    expect(toastMock.error).not.toHaveBeenCalled();
  });
});
