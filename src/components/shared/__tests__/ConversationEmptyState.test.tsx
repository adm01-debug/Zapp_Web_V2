/**
 * t_fced78b2 — estado "nenhuma conversa selecionada" unificado.
 *
 * Prova (estrutura/DOM, não cor — jsdom não pinta):
 *  1. as 3 telas de conversa (Inbox, Teams, Email) renderizam o MESMO
 *     componente compartilhado (`data-testid="conversation-empty-state"`);
 *  2. o estado vazio não carrega animação contínua (nem por classe Tailwind
 *     `animate-*`, nem por `repeat: Infinity` do framer-motion);
 *  3. o contrato do componente: título/descrição sempre, CTA só quando passado.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MessageSquare } from 'lucide-react';
import type { EmailThread } from '@/hooks/integrations/useGmail';

vi.mock('framer-motion', () => ({ AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

// ── Email: hooks pesados que não são o alvo ──────────────────────────────
vi.mock('@/hooks/integrations/useGmail', () => ({
  useGmail: () => ({
    accountsLoading: false,
    accountsError: null,
    accounts: [{ id: 'account-1', email_address: 'admin@example.com', is_active: true }],
    activeAccount: { id: 'account-1', email_address: 'admin@example.com', is_active: true },
    threads: [] as EmailThread[],
    threadsLoading: false,
    threadsError: null,
    threadsPageCount: 1,
    threadsTotalCount: 0,
    labels: [],
    unreadCount: 0,
    refetchAccounts: vi.fn(),
    connectGmail: { mutate: vi.fn(), isPending: false },
    syncInbox: { mutate: vi.fn(), isPending: false },
    syncLabels: { mutate: vi.fn(), isPending: false },
    downloadAttachment: { mutate: vi.fn(), isPending: false },
    subscribeToThreads: () => vi.fn(),
  }),
}));
vi.mock('@/hooks/integrations/useEmailThreadForContact', () => ({ useEmailThreadForContact: () => ({ status: 'none', threadId: null }) }));
vi.mock('@/components/email/EmailThreadList', () => ({ EmailThreadList: () => <div data-testid="thread-list" /> }));
vi.mock('@/components/email/EmailChatThread', () => ({ EmailChatThread: () => <div data-testid="thread" /> }));
vi.mock('@/components/email/EmailContactPanel', () => ({ EmailContactPanel: () => <div data-testid="contact-panel" /> }));
vi.mock('@/components/gmail/EmailComposer', () => ({ EmailComposer: () => <div data-testid="composer" /> }));

// ── Teams: hooks/colunas pesadas; só o vazio importa ─────────────────────
vi.mock('@/hooks/chat/useTeamChat', () => ({ useTeamConversations: () => ({ data: [] }) }));
vi.mock('@/hooks/chat/useTeamChatNotifications', () => ({ useActiveTeamChatConversation: vi.fn() }));
vi.mock('@/components/team-chat/TeamConversationList', () => ({ TeamConversationList: () => <div data-testid="team-list" /> }));
vi.mock('@/components/team-chat/TeamChatPanel', () => ({ TeamChatPanel: () => <div data-testid="team-panel" /> }));
vi.mock('@/components/team-chat/TeamMemberDetails', () => ({ TeamMemberDetails: () => <div data-testid="team-details" /> }));
vi.mock('@/components/team-chat/NewConversationDialog', () => ({ NewConversationDialog: () => <div data-testid="team-dialog" /> }));

import { ConversationEmptyState } from '../ConversationEmptyState';
import { InboxEmptyChat } from '@/components/inbox/InboxEmptyChat';
import { TeamChatView } from '@/components/team-chat/TeamChatView';
import { EmailChatInbox } from '@/components/email/EmailChatInbox';

/** Um estado vazio de conversa saudável não tem animação em laço. */
function semAnimacaoContinua(container: HTMLElement) {
  expect(container.innerHTML).not.toMatch(/infinite/i);
  expect(container.innerHTML).not.toMatch(/animate-(pulse|spin|bounce|ping)/);
}

describe('ConversationEmptyState — contrato do componente', () => {
  it('renderiza ícone (decorativo), título e descrição', () => {
    const { container } = render(
      <ConversationEmptyState icon={MessageSquare} title="Selecione uma conversa" description="Escolha na lista ao lado" />,
    );
    expect(screen.getByTestId('conversation-empty-state')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Selecione uma conversa');
    expect(screen.getByText('Escolha na lista ao lado')).toBeInTheDocument();
    semAnimacaoContinua(container);
  });

  it('não renderiza CTA quando nenhuma ação é passada', () => {
    render(<ConversationEmptyState icon={MessageSquare} title="T" description="D" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renderiza o CTA quando uma ação é passada', () => {
    render(<ConversationEmptyState icon={MessageSquare} title="T" description="D" action={<button type="button">Nova conversa</button>} />);
    expect(screen.getByRole('button', { name: 'Nova conversa' })).toBeInTheDocument();
  });
});

describe('Unificação do estado vazio das 3 telas de conversa', () => {
  it('Inbox usa o componente compartilhado', () => {
    const { container } = render(<InboxEmptyChat />);
    expect(screen.getByTestId('conversation-empty-state')).toBeInTheDocument();
    semAnimacaoContinua(container);
  });

  it('Teams usa o componente compartilhado, com "Nova conversa" como CTA', () => {
    const { container } = render(<TeamChatView />);
    expect(screen.getByTestId('conversation-empty-state')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nova conversa/ })).toBeInTheDocument();
    semAnimacaoContinua(container);
  });

  it('Email usa o componente compartilhado', () => {
    const { container } = render(<EmailChatInbox />);
    expect(screen.getByTestId('conversation-empty-state')).toBeInTheDocument();
    semAnimacaoContinua(container);
  });
});
