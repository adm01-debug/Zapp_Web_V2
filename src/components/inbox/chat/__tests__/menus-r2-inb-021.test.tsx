import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MessageHoverToolbar } from '../MessageHoverToolbar';
import { ChatPanelHeader } from '../ChatPanelHeader';
import { Message, Conversation } from '@/types/chat';
import { toast } from 'sonner';

// R2-INB-021 (item 317): o menu do balão e o menu do header exibiam itens que
// anunciavam uma ação e não concluíam nada (Favoritar/Fixar/Responder depois/
// Reportar no balão; "Adicionar tag" no header). Aqui se prova o consumidor:
// nenhuma dessas entradas é oferecida e cada entrada que sobra conclui a
// operação declarada no clique.

const mocks = vi.hoisted(() => ({
  updateEq: vi.fn(),
  deleteMessage: vi.fn(),
  markMessageAsRead: vi.fn(),
  markMessageAsUnread: vi.fn(),
  useApplicableSLA: vi.fn(),
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
  useEvolutionApi: () => ({
    deleteMessage: mocks.deleteMessage,
    markMessageAsRead: mocks.markMessageAsRead,
    markMessageAsUnread: mocks.markMessageAsUnread,
    isLoading: false,
  }),
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

vi.mock('@/hooks/ui/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/popupManager', () => ({ openChatPopup: vi.fn() }));
vi.mock('@/hooks/sla/useApplicableSLA', () => ({ useApplicableSLA: mocks.useApplicableSLA }));
vi.mock('@/components/inbox/SLAIndicator', () => ({
  SLAIndicator: () => <div data-testid="sla-indicator" />,
}));
vi.mock('@/components/inbox/VoiceSelector', () => ({ VoiceSelector: () => null }));
vi.mock('@/components/inbox/SpeedSelector', () => ({ SpeedSelector: () => null }));
vi.mock('@/components/inbox/RealtimeCollaboration', () => ({ RealtimeCollaboration: () => null }));
vi.mock('@/components/inbox/contact-details/AnalysisBadges', () => ({ AnalysisBadges: () => null }));
vi.mock('@/components/inbox/contact-details/BusinessHoursBadge', () => ({ BusinessHoursBadge: () => null }));
vi.mock('@/components/inbox/contact-details/QueuePositionNotifier', () => ({ QueuePositionNotifier: () => null }));

// Radix DropdownMenu não abre de forma confiável sob jsdom+fireEvent — mock
// simples que renderiza o conteúdo sempre "aberto" (mesmo padrão de
// ChatPanelHeader.test.tsx e MessageHoverToolbar.delete.test.tsx).
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div data-testid="menu-content">{children}</div>,
  DropdownMenuItem: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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

function renderToolbar(message: Message, handlers: { onMessageDeleted?: (id: string) => void } = {}) {
  const onMessageDeleted = handlers.onMessageDeleted ?? vi.fn();
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

const mockConversation = {
  id: 'conv-1',
  contact: { id: 'c-1', name: 'Maria Silva', phone: '+5511999999999', avatar: '' },
  lastMessage: { content: 'Olá', timestamp: new Date(), sender: 'contact' },
  unreadCount: 0,
  status: 'open',
  priority: 'medium',
  channel: 'whatsapp',
  tags: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as Conversation;

const headerProps = {
  conversation: mockConversation,
  isContactTyping: false,
  showAIAssistant: false,
  showDetails: false,
  voiceId: 'voice-1',
  speed: 1,
  onToggleAIAssistant: vi.fn(),
  onToggleDetails: vi.fn(),
  onStartCall: vi.fn(),
  onOpenSearch: vi.fn(),
  onOpenTransfer: vi.fn(),
  onOpenSchedule: vi.fn(),
  onVoiceChange: vi.fn(),
  onSpeedChange: vi.fn(),
  onCloseConversation: vi.fn(),
  onArchive: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleteMessage.mockResolvedValue(undefined);
  mocks.updateEq.mockResolvedValue({ error: null });
  mocks.markMessageAsRead.mockResolvedValue(undefined);
  mocks.markMessageAsUnread.mockResolvedValue(undefined);
  mocks.useApplicableSLA.mockReturnValue({ data: null, isLoading: false });
});

describe('menu do balão — R2-INB-021', () => {
  it('não oferece mais as ações que não concluíam nada', () => {
    renderToolbar(makeMessage());

    for (const morta of ['Favoritar', 'Fixar', 'Responder depois', 'Em 1 hora', 'Em 3 horas', 'Amanhã', 'Reportar']) {
      expect(screen.queryByText(morta)).toBeNull();
    }
  });

  it('reportar também não aparece no balão de mensagem recebida', () => {
    render(
      <MessageHoverToolbar
        message={makeMessage({ sender: 'contact' })}
        isSent={false}
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

    for (const morta of ['Favoritar', 'Fixar', 'Responder depois', 'Reportar']) {
      expect(screen.queryByText(morta)).toBeNull();
    }
  });

  it('cada ação que sobrou no menu conclui a operação declarada', async () => {
    const onMessageDeleted = renderToolbar(makeMessage());

    fireEvent.click(screen.getByText('Marcar como lida'));
    await waitFor(() =>
      expect(mocks.markMessageAsRead).toHaveBeenCalledWith('inst-1', {
        remoteJid: '5511999999999@s.whatsapp.net',
        fromMe: true,
        id: 'ext-1',
      })
    );
    expect(toast.success).toHaveBeenCalledWith('Marcada como lida');

    fireEvent.click(screen.getByText('Marcar como não lida'));
    await waitFor(() => expect(mocks.markMessageAsUnread).toHaveBeenCalled());

    fireEvent.click(screen.getByText('Apagar para todos'));
    await waitFor(() => expect(onMessageDeleted).toHaveBeenCalledWith('m-1'));
    expect(toast.success).toHaveBeenCalledWith('Mensagem deletada para todos');
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe('menu do header — R2-INB-021', () => {
  it('não oferece mais "Adicionar tag" sem ação', () => {
    render(<ChatPanelHeader {...headerProps} />);

    expect(screen.queryByText('Adicionar tag')).toBeNull();
  });

  it('cada ação que sobrou no menu do header chega ao seu handler', () => {
    render(<ChatPanelHeader {...headerProps} />);

    fireEvent.click(screen.getByText('Transferir'));
    expect(headerProps.onOpenTransfer).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Agendar mensagem'));
    expect(headerProps.onOpenSchedule).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Arquivar'));
    expect(headerProps.onArchive).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Encerrar Conversa'));
    expect(headerProps.onCloseConversation).toHaveBeenCalledTimes(1);
  });
});
