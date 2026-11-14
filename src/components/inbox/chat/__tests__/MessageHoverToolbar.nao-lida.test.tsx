import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MessageHoverToolbar } from '../MessageHoverToolbar';
import { Message } from '@/types/chat';
import { toast } from 'sonner';

// P2-GO-6 (auditoria Conversas 13/11): "Marcar como não lida" sempre dava erro —
// a Evolution GO não tem essa ação (a edge responde `notSupported`). A marcação
// passa a ser estado do Zapp (`messages.is_read = false` da mensagem do
// contato); o WhatsApp é bônus e `notSupported` não é erro para o atendente.

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  updateEq: vi.fn(),
  updateSelect: vi.fn(),
  lastInbound: vi.fn(),
  markMessageAsUnread: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      update: (patch: unknown) => {
        mocks.update(patch);
        return {
          eq: (...args: unknown[]) => {
            mocks.updateEq(...args);
            return { select: () => mocks.updateSelect() };
          },
        };
      },
      select: () => {
        const b = {
          eq: () => b,
          order: () => b,
          limit: () => b,
          maybeSingle: () => mocks.lastInbound(),
        };
        return b;
      },
    }),
  },
}));

vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({ markMessageAsUnread: mocks.markMessageAsUnread }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withCorrelation: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })) })),
}));

vi.mock('@/components/inbox/TextToSpeechButton', () => ({
  TextToSpeechButton: () => null,
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

const makeMessage = (over: Partial<Message> = {}): Message => ({
  id: 'm-1',
  content: 'olá',
  sender: 'contact',
  timestamp: new Date(),
  type: 'text',
  external_id: 'ext-1',
  contact_id: 'c-1',
  ...over,
} as Message);

function renderToolbar(message: Message, isSent = message.sender === 'agent') {
  render(
    <MessageHoverToolbar
      message={message}
      isSent={isSent}
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
      onMessageDeleted={vi.fn()}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateSelect.mockResolvedValue({ data: [{ id: 'm-1' }], error: null });
  mocks.markMessageAsUnread.mockResolvedValue({ success: false, notSupported: true });
});

describe('MessageHoverToolbar — marcar como não lida (P2-GO-6)', () => {
  it('Evolution GO (notSupported): marca no Zapp e confirma sucesso, sem erro', async () => {
    renderToolbar(makeMessage());
    fireEvent.click(screen.getByText('Marcar como não lida'));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Marcada como não lida'));
    expect(mocks.update).toHaveBeenCalledWith({ is_read: false });
    expect(mocks.updateEq).toHaveBeenCalledWith('id', 'm-1');
    expect(mocks.markMessageAsUnread).toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('falha do provedor (403/404 antigo) não derruba a marcação do Zapp', async () => {
    mocks.markMessageAsUnread.mockRejectedValue(new Error('404'));
    renderToolbar(makeMessage());
    fireEvent.click(screen.getByText('Marcar como não lida'));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Marcada como não lida'));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('escrita negada no banco (0 linhas) é erro e não chama o provedor', async () => {
    mocks.updateSelect.mockResolvedValue({ data: [], error: null });
    renderToolbar(makeMessage());
    fireEvent.click(screen.getByText('Marcar como não lida'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro ao marcar como não lida'));
    expect(toast.success).not.toHaveBeenCalled();
    expect(mocks.markMessageAsUnread).not.toHaveBeenCalled();
  });

  it('em mensagem nossa, marca a última mensagem do cliente', async () => {
    mocks.lastInbound.mockResolvedValue({ data: { id: 'm-in-9' }, error: null });
    renderToolbar(makeMessage({ id: 'm-out', sender: 'agent' }));
    fireEvent.click(screen.getByText('Marcar como não lida'));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Marcada como não lida'));
    expect(mocks.updateEq).toHaveBeenCalledWith('id', 'm-in-9');
  });

  it('conversa sem mensagem do cliente avisa em vez de dizer sucesso', async () => {
    mocks.lastInbound.mockResolvedValue({ data: null, error: null });
    renderToolbar(makeMessage({ id: 'm-out', sender: 'agent' }));
    fireEvent.click(screen.getByText('Marcar como não lida'));

    await waitFor(() => expect(toast.info).toHaveBeenCalled());
    expect(mocks.update).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
