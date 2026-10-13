import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MessageHoverToolbar } from '../MessageHoverToolbar';
import { Message } from '@/types/chat';
import { toast } from 'sonner';

// R2-INB-014 + PE-20 (t_fef320c8): o delete do menu hover NÃO pode confirmar
// sucesso quando a marcação (RPC `delete_message`) volta com `{ error }`.
// PostgREST não lança: sem checar o campo `error`, a UI mostrava sucesso e
// chamava onMessageDeleted mesmo com a exclusão rejeitada. Desde PE-20 o único
// caminho é `supabase.rpc('delete_message')` — `from('messages')` não pode
// aparecer no caminho de exclusão.

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  fromCalls: [] as string[],
  deleteMessage: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: (table: string) => {
      mocks.fromCalls.push(table);
      throw new Error(`escrita inesperada na tabela: ${table}`);
    },
  },
}));

vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({ deleteMessage: mocks.deleteMessage }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/components/inbox/TextToSpeechButton', () => ({
  TextToSpeechButton: () => null,
}));

// Radix DropdownMenu não abre de forma confiável sob jsdom+fireEvent — mock
// simples que renderiza o conteúdo sempre "aberto" (mesmo padrão de
// ChatPanelHeader.test.tsx).
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const makeMessage = (over: Partial<Message> = {}): Message => ({
  id: 'm-1',
  content: 'olá',
  sender: 'agent',
  timestamp: new Date(),
  type: 'text',
  external_id: 'ext-1',
  ...over,
} as Message);

function renderToolbar(message: Message, onMessageDeleted = vi.fn()) {
  render(
    <MessageHoverToolbar
      message={message}
      isSent
      instanceName="inst-1"
      contactJid="5511999999999@s.whatsapp.net"
      ttsLoading={false}
      ttsPlaying={false}
      ttsMessageId={null}
      onReply={vi.fn()}
      onForward={vi.fn()}
      onCopy={vi.fn()}
      onSpeak={vi.fn()}
      onStop={vi.fn()}
      onMessageDeleted={onMessageDeleted}
    />
  );
  return onMessageDeleted;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fromCalls.length = 0;
  mocks.deleteMessage.mockResolvedValue(undefined);
});

describe('MessageHoverToolbar — exclusão pelo menu hover (R2-INB-014)', () => {
  it('rejeição da RPC ({ error }) mostra erro, sem sucesso e sem callback de remoção', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied', code: '42501' } });
    const onMessageDeleted = renderToolbar(makeMessage());

    fireEvent.click(screen.getByText('Apagar para todos'));

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith('delete_message', { p_message_id: 'm-1' })
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro ao deletar mensagem'));

    expect(toast.success).not.toHaveBeenCalled();
    expect(onMessageDeleted).not.toHaveBeenCalled();
    // Caminho único: nenhuma escrita direta na tabela `messages`.
    expect(mocks.fromCalls).toEqual([]);
  });

  it('erro local após falha da Evolution API: nem sucesso nem callback', async () => {
    mocks.deleteMessage.mockRejectedValue(new Error('evolution fora'));
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'rls' } });
    const onMessageDeleted = renderToolbar(makeMessage());

    fireEvent.click(screen.getByText('Apagar para todos'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro ao deletar mensagem'));
    expect(toast.success).not.toHaveBeenCalled();
    expect(onMessageDeleted).not.toHaveBeenCalled();
  });

  it('{ error: null } mantém sucesso e callback', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const onMessageDeleted = renderToolbar(makeMessage());

    fireEvent.click(screen.getByText('Apagar para todos'));

    await waitFor(() => expect(onMessageDeleted).toHaveBeenCalledWith('m-1'));
    expect(toast.success).toHaveBeenCalledWith('Mensagem deletada para todos');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('preserva o fallback local quando só a Evolution API falha', async () => {
    mocks.deleteMessage.mockRejectedValue(new Error('evolution fora'));
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const onMessageDeleted = renderToolbar(makeMessage());

    fireEvent.click(screen.getByText('Apagar para todos'));

    await waitFor(() => expect(onMessageDeleted).toHaveBeenCalledWith('m-1'));
    expect(toast.success).toHaveBeenCalledWith('Mensagem deletada para todos');
    expect(toast.error).not.toHaveBeenCalled();
    expect(mocks.deleteMessage).toHaveBeenCalledWith(
      'inst-1',
      'ext-1',
      '5511999999999@s.whatsapp.net',
      true
    );
  });

  it('sem external_id e RPC rejeitada: erro, sem "Mensagem removida" e sem callback', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'rejected' } });
    const onMessageDeleted = renderToolbar(makeMessage({ external_id: undefined }));

    fireEvent.click(screen.getByText('Apagar mensagem'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro ao deletar mensagem'));
    expect(toast.success).not.toHaveBeenCalled();
    expect(onMessageDeleted).not.toHaveBeenCalled();
  });
});
