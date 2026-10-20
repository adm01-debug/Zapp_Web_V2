/**
 * R2-INB-014 / item 90 — o menu contextual não pode confirmar uma exclusão rejeitada.
 *
 * `MessageContextActions.handleDelete` aguardava a atualização local do Supabase mas
 * ignorava o `{ error }` devolvido pela cadeia PostgREST (que NÃO lança exceção).
 * Resultado: a UI mostrava "Mensagem deletada/removida" e chamava `onMessageDeleted`
 * mesmo quando a marcação local falhava.
 *
 * Contrato exigido:
 *  - update local resolve `{ error: <algo> }` → toast.error presente, toast.success
 *    AUSENTE e `onMessageDeleted` NÃO chamado.
 *  - update local resolve `{ error: null }` → toast.success presente e callback chamado.
 *  - falha APENAS da Evolution API (deleteMessage rejeita) → o fallback local continua
 *    valendo, desde que o update local venha com `error: null`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MessageContextActions } from '@/components/inbox/MessageContextActions';
import type { Message } from '@/types/chat';

const { toastMock, supabaseResult, deleteMessageMock, supabaseChain } = vi.hoisted(() => ({
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  supabaseResult: { error: null as { message: string; code?: string } | null },
  deleteMessageMock: vi.fn(),
  supabaseChain: {
    eq: vi.fn(),
    update: vi.fn(),
    from: vi.fn(),
  },
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

// PostgREST: update(...).eq(...) devolve uma Promise com { error } — nunca lança.
supabaseChain.eq.mockImplementation(() => Promise.resolve(supabaseResult));
supabaseChain.update.mockImplementation(() => ({ eq: supabaseChain.eq }));
supabaseChain.from.mockImplementation(() => ({ update: supabaseChain.update }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: supabaseChain.from } }));

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
    supabaseResult.error = null;
    deleteMessageMock.mockResolvedValue(undefined);
  });

  it('erro no update local → toast de erro, nenhum sucesso e nenhum callback', async () => {
    supabaseResult.error = { message: 'permission denied', code: '42501' };

    const { onMessageDeleted } = cliqueApagar();

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalled();
    });
    expect(toastMock.error).toHaveBeenCalledWith('Erro ao deletar mensagem');
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(onMessageDeleted).not.toHaveBeenCalled();
  });

  it('sucesso no update local (error: null) → toast de sucesso e callback', async () => {
    supabaseResult.error = null;

    const { onMessageDeleted } = cliqueApagar();

    await waitFor(() => {
      expect(onMessageDeleted).toHaveBeenCalledWith('msg-1');
    });
    expect(toastMock.success).toHaveBeenCalledWith('Mensagem deletada para todos');
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('falha só da Evolution API mantém o fallback local quando o update local confirma', async () => {
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
