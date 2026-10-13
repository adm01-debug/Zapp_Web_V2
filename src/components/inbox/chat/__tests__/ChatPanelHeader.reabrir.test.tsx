/**
 * Cartão: reabrir/desarquivar conversa no MENU do cabeçalho (ChatPanelHeader).
 *
 * Prova, no cabeçalho REAL:
 * 1) Resolvida mostra "Reabrir conversa"; arquivada mostra "Desarquivar conversa";
 *    conversa ativa não mostra nenhum dos dois.
 * 2) O item abre a confirmação leve e a RPC (handler) só é chamada no "Reabrir"/
 *    "Desarquivar" do diálogo, com o contact id da conversa.
 * 3) Estado de espera desabilita o botão; erro mantém o diálogo aberto com o motivo.
 *
 * O Radix é mockado (mesmo padrão do ChatPanelHeader.test.tsx: DropdownMenu não
 * abre de forma confiável sob jsdom+fireEvent); o ConversationReopenDialog é REAL.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatPanelHeader } from '../ChatPanelHeader';
import { Conversation } from '@/types/chat';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BrowserRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ useApplicableSLA: vi.fn() }));

vi.mock('@/hooks/sla/useApplicableSLA', () => ({ useApplicableSLA: mocks.useApplicableSLA }));
vi.mock('@/hooks/ui/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/popupManager', () => ({ openChatPopup: vi.fn() }));
vi.mock('@/components/inbox/SLAIndicator', () => ({ SLAIndicator: () => null }));
vi.mock('@/components/inbox/VoiceSelector', () => ({ VoiceSelector: () => null }));
vi.mock('@/components/inbox/SpeedSelector', () => ({ SpeedSelector: () => null }));
vi.mock('@/components/inbox/RealtimeCollaboration', () => ({ RealtimeCollaboration: () => null }));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (open ? <div>{children}</div> : null),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div role="alertdialog">{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) => (
    <button type="button" disabled={disabled}>{children}</button>
  ),
  AlertDialogAction: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: (e: React.MouseEvent) => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

function makeConversation(status: string | null): Conversation {
  return {
    id: 'conv-1',
    contact: { id: 'c-1', name: 'Maria Silva', phone: '+5511999999999', avatar: '', conversation_status: status },
    lastMessage: { content: 'Olá', timestamp: new Date(), sender: 'contact' },
    unreadCount: 0,
    status: 'open',
    priority: 'medium',
    channel: 'whatsapp',
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as Conversation;
}

function renderHeader(status: string | null, onReopenConversation = vi.fn()) {
  render(
    <BrowserRouter>
      <TooltipProvider>
        <ChatPanelHeader
          conversation={makeConversation(status)}
          isContactTyping={false}
          showAIAssistant={false}
          voiceId="voice-1"
          speed={1}
          onToggleAIAssistant={vi.fn()}
          onOpenSearch={vi.fn()}
          onOpenTransfer={vi.fn()}
          onOpenSchedule={vi.fn()}
          onVoiceChange={vi.fn()}
          onSpeedChange={vi.fn()}
          onArchive={vi.fn()}
          onReopenConversation={onReopenConversation}
        />
      </TooltipProvider>
    </BrowserRouter>
  );
  return onReopenConversation;
}

beforeEach(() => {
  mocks.useApplicableSLA.mockReturnValue({ data: { firstResponseMinutes: 5, resolutionMinutes: 60, ruleName: 'Padrão do Sistema', ruleId: null } });
});

describe('ChatPanelHeader — reabrir/desarquivar', () => {
  it('resolvida mostra "Reabrir conversa" e não mostra "Desarquivar conversa"', () => {
    renderHeader('resolved');
    expect(screen.getByRole('button', { name: 'Reabrir conversa' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desarquivar conversa' })).not.toBeInTheDocument();
  });

  it('arquivada mostra "Desarquivar conversa"', () => {
    renderHeader('archived');
    expect(screen.getByRole('button', { name: 'Desarquivar conversa' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reabrir conversa' })).not.toBeInTheDocument();
  });

  it('conversa ativa não oferece reabertura', () => {
    renderHeader('open');
    expect(screen.queryByRole('button', { name: 'Reabrir conversa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desarquivar conversa' })).not.toBeInTheDocument();
  });

  it('o item abre a confirmação e a RPC só roda no botão do diálogo, com o contact id', async () => {
    const onReopen = renderHeader('resolved');

    fireEvent.click(screen.getByRole('button', { name: 'Reabrir conversa' }));
    expect(onReopen).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Reabrir conversa?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reabrir' }));

    await waitFor(() => expect(onReopen).toHaveBeenCalledWith('c-1'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('estado de espera desabilita o confirmar até a RPC responder', async () => {
    let resolver: (() => void) | undefined;
    const onReopen = vi.fn(() => new Promise<void>((resolve) => { resolver = resolve; }));
    renderHeader('archived', onReopen);

    fireEvent.click(screen.getByRole('button', { name: 'Desarquivar conversa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Desarquivar' }));

    await waitFor(() => expect(onReopen).toHaveBeenCalledWith('c-1'));
    const confirmar = screen.getByRole('button', { name: 'Desarquivar' }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);

    fireEvent.click(confirmar);
    expect(onReopen).toHaveBeenCalledTimes(1);

    resolver?.();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('erro na RPC mantém o diálogo aberto com o motivo', async () => {
    const onReopen = vi.fn().mockRejectedValue(new Error('boom'));
    renderHeader('resolved', onReopen);

    fireEvent.click(screen.getByRole('button', { name: 'Reabrir conversa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
