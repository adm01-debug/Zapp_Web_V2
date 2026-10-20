import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MessageHoverToolbar } from '../MessageHoverToolbar';
import { Message } from '@/types/chat';
import { toast } from 'sonner';

// R2-INB-014: o delete do menu hover NÃO pode confirmar sucesso quando a
// marcação local (Supabase/PostgREST) volta com `{ error }`. PostgREST não
// lança: sem checar o campo `error`, a UI mostrava sucesso e chamava
// onMessageDeleted mesmo com o update rejeitado.

const mocks = vi.hoisted(() => ({
  updateEq: vi.fn(),
  deleteMessage: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      update: () => ({
        eq: (...args: unknown[]) => mocks.updateEq(...args),
      }),
    }),
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
  mocks.deleteMessage.mockResolvedValue(undefined);
});

describe('MessageHoverToolbar — exclusão pelo menu hover (R2-INB-014)', () => {
  it('rejeição local ({ error }) mostra erro, sem sucesso e sem callback de remoção', async () => {
    mocks.updateEq.mockResolvedValue({ error: { message: 'permission denied', code: '42501' } });
    const onMessageDeleted = renderToolbar(makeMessage());

    fireEvent.click(screen.getByText('Apagar para todos'));

    await waitFor(() => expect(mocks.updateEq).toHaveBeenCalledWith('id', 'm-1'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro ao deletar mensagem'));

    expect(toast.success).not.toHaveBeenCalled();
    expect(onMessageDeleted).not.toHaveBeenCalled();
  });

  it('erro local após falha da Evolution API: nem sucesso nem callback', async () => {
    mocks.deleteMessage.mockRejectedValue(new Error('evolution fora'));
    mocks.updateEq.mockResolvedValue({ error: { message: 'rls' } });
    const onMessageDeleted = renderToolbar(makeMessage());

    fireEvent.click(screen.getByText('Apagar para todos'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro ao deletar mensagem'));
    expect(toast.success).not.toHaveBeenCalled();
    expect(onMessageDeleted).not.toHaveBeenCalled();
  });

  it('{ error: null } mantém sucesso e callback', async () => {
    mocks.updateEq.mockResolvedValue({ error: null });
    const onMessageDeleted = renderToolbar(makeMessage());

    fireEvent.click(screen.getByText('Apagar para todos'));

    await waitFor(() => expect(onMessageDeleted).toHaveBeenCalledWith('m-1'));
    expect(toast.success).toHaveBeenCalledWith('Mensagem deletada para todos');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('preserva o fallback local quando só a Evolution API falha', async () => {
    mocks.deleteMessage.mockRejectedValue(new Error('evolution fora'));
    mocks.updateEq.mockResolvedValue({ error: null });
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

  it('sem external_id local rejeitado: erro, sem "Mensagem removida" e sem callback', async () => {
    mocks.updateEq.mockResolvedValue({ error: { message: 'rejected' } });
    const onMessageDeleted = renderToolbar(makeMessage({ external_id: undefined }));

    fireEvent.click(screen.getByText('Apagar mensagem'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro ao deletar mensagem'));
    expect(toast.success).not.toHaveBeenCalled();
    expect(onMessageDeleted).not.toHaveBeenCalled();
  });
});
