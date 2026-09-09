import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatPanelHeader } from '../ChatPanelHeader';
import { Conversation } from '@/types/chat';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BrowserRouter } from 'react-router-dom';

vi.mock('@/hooks/ui/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/popupManager', () => ({ openChatPopup: vi.fn() }));
vi.mock('@/components/inbox/SLAIndicator', () => ({ SLAIndicator: () => null }));
vi.mock('@/components/inbox/VoiceSelector', () => ({ VoiceSelector: () => null }));
vi.mock('@/components/inbox/SpeedSelector', () => ({ SpeedSelector: () => null }));
vi.mock('@/components/inbox/RealtimeCollaboration', () => ({ RealtimeCollaboration: () => null }));

// Radix DropdownMenu/Popover não abrem de forma confiável sob jsdom+fireEvent
// (mesmo padrão usado em EmailChatReplyBar.test.tsx) — mock simples que
// renderiza o conteúdo sempre "aberto" para testar os itens do menu.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockConversation = {
  id: 'conv-1',
  contact: {
    id: 'c-1',
    name: 'Maria Silva',
    phone: '+5511999999999',
    avatar: '',
  },
  lastMessage: { content: 'Olá', timestamp: new Date(), sender: 'contact' },
  unreadCount: 0,
  status: 'open',
  priority: 'medium',
  channel: 'whatsapp',
  tags: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as Conversation;

const baseProps = {
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
};

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>
    <TooltipProvider>{children}</TooltipProvider>
  </BrowserRouter>
);

describe('ChatPanelHeader', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders contact name', () => {
    render(
      <Wrapper>
        <ChatPanelHeader {...baseProps} />
      </Wrapper>
    );
    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
  });

  it('renders avatar fallback initials', () => {
    render(
      <Wrapper>
        <ChatPanelHeader {...baseProps} />
      </Wrapper>
    );
    expect(screen.getByText('MS')).toBeInTheDocument();
  });

  it('shows Online when contact is not typing', () => {
    render(
      <Wrapper>
        <ChatPanelHeader {...baseProps} isContactTyping={false} />
      </Wrapper>
    );
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('renders exactly 4 header action buttons (Ligar · Vídeo · Adicionar participante · Mais)', () => {
    render(
      <Wrapper>
        <ChatPanelHeader {...baseProps} />
      </Wrapper>
    );
    expect(screen.getByLabelText('Ligar')).toBeInTheDocument();
    expect(screen.getByLabelText('Videochamada')).toBeInTheDocument();
    expect(screen.getByLabelText('Adicionar participante')).toBeInTheDocument();
    expect(screen.getByLabelText('Mais ações')).toBeInTheDocument();
  });

  it('does NOT render summary item in the menu when onGenerateSummary is undefined', () => {
    render(
      <Wrapper>
        <ChatPanelHeader {...baseProps} canGenerateSummary={true} />
      </Wrapper>
    );
    fireEvent.click(screen.getByLabelText('Mais ações'));
    expect(screen.queryByText(/resumo da conversa/i)).not.toBeInTheDocument();
  });

  it('renders summary menu item when handler is provided', () => {
    const onGenerate = vi.fn();
    render(
      <Wrapper>
        <ChatPanelHeader {...baseProps} canGenerateSummary={true} onGenerateSummary={onGenerate} />
      </Wrapper>
    );
    fireEvent.click(screen.getByLabelText('Mais ações'));
    expect(screen.getByText(/resumo da conversa/i)).toBeInTheDocument();
  });

  it('calls onGenerateSummary when the menu item is clicked', () => {
    const onGenerate = vi.fn();
    render(
      <Wrapper>
        <ChatPanelHeader {...baseProps} canGenerateSummary={true} onGenerateSummary={onGenerate} />
      </Wrapper>
    );
    fireEvent.click(screen.getByLabelText('Mais ações'));
    fireEvent.click(screen.getByText(/resumo da conversa/i));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('calls onOpenSearch when the "Buscar na conversa" menu item is clicked', () => {
    render(
      <Wrapper>
        <ChatPanelHeader {...baseProps} />
      </Wrapper>
    );
    fireEvent.click(screen.getByLabelText('Mais ações'));
    fireEvent.click(screen.getByText(/buscar na conversa/i));
    expect(baseProps.onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it('renders the favorite star and calls onToggleFavorite when clicked', () => {
    const onToggleFavorite = vi.fn();
    render(
      <Wrapper>
        <ChatPanelHeader {...baseProps} isFavorite={false} onToggleFavorite={onToggleFavorite} />
      </Wrapper>
    );
    fireEvent.click(screen.getByLabelText('Favoritar conversa'));
    expect(onToggleFavorite).toHaveBeenCalledTimes(1);
  });
});
