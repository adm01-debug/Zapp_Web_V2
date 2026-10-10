import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailThread } from '@/hooks/integrations/useGmail';

const THREAD: EmailThread = {
  id: 'thread-1', gmail_account_id: 'account-1', gmail_thread_id: 'gmail-thread-1', contact_id: null,
  subject: 'Assunto real', snippet: 'Prévia', label_ids: ['INBOX'], message_count: 1, is_unread: true,
  is_starred: false, is_important: false, last_message_at: '2026-10-02T12:00:00Z', last_from_name: 'Cliente',
  last_from_address: 'cliente@example.com', assigned_to: null, status: 'open', priority: 'medium', tags: [],
  created_at: '2026-10-02T12:00:00Z', updated_at: '2026-10-02T12:00:00Z',
};

const state = vi.hoisted(() => ({
  accountsLoading: false,
  accountsError: null as Error | null,
  accounts: [{ id: 'account-1', email_address: 'admin@example.com', is_active: true }],
  activeAccount: { id: 'account-1', email_address: 'admin@example.com', is_active: true },
  threads: [] as EmailThread[],
}));

vi.mock('framer-motion', () => ({ AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/hooks/integrations/useGmail', () => ({
  useGmail: () => ({
    ...state,
    refetchAccounts: vi.fn(), connectGmail: { mutate: vi.fn(), isPending: false }, labels: [],
    threadsLoading: false, threadsError: null, syncInbox: { mutate: vi.fn(), isPending: false },
    syncLabels: { mutate: vi.fn(), isPending: false }, unreadCount: state.threads.filter(thread => thread.is_unread).length, threadsTotalCount: state.threads.length,
    downloadAttachment: { mutate: vi.fn(), isPending: false },
    subscribeToThreads: () => vi.fn(),
  }),
}));
vi.mock('../EmailThreadList', () => ({
  EmailThreadList: ({ threads, onSelectThread, onNewEmail }: { threads: EmailThread[]; onSelectThread: (thread: EmailThread) => void; onNewEmail: () => void }) => <div data-testid="thread-list"><button onClick={() => threads[0] && onSelectThread(threads[0])}>Selecionar primeira</button><button onClick={onNewEmail}>Compor pela lista</button></div>,
}));
vi.mock('../EmailChatThread', () => ({ EmailChatThread: ({ accountId, onToggleDetails }: { accountId?: string; onToggleDetails?: () => void }) => <div data-testid="thread-account">{accountId}<button type="button" onClick={onToggleDetails}>Detalhes</button></div> }));
vi.mock('../EmailContactPanel', () => ({ EmailContactPanel: () => <div data-testid="contact-panel" /> }));
vi.mock('@/components/gmail/EmailComposer', () => ({ EmailComposer: ({ accountId }: { accountId?: string }) => <div data-testid="composer-account">{accountId}</div> }));

import { EmailChatInbox } from '../EmailChatInbox';

describe('EmailChatInbox', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/?view=email-chat');
    state.accountsLoading = false;
    state.accountsError = null;
    state.accounts = [{ id: 'account-1', email_address: 'admin@example.com', is_active: true }];
    state.activeAccount = { id: 'account-1', email_address: 'admin@example.com', is_active: true };
    state.threads = [];
  });

  it('distingue carregamento de conta desconectada', () => {
    state.accountsLoading = true;
    state.activeAccount = undefined as never;
    render(<EmailChatInbox />);
    expect(screen.getByLabelText('Carregando Email')).toBeInTheDocument();
    expect(screen.queryByText('Conecte seu Gmail ao ZAPP')).not.toBeInTheDocument();
  });

  it('mostra erro recuperável sem fingir inbox vazio', () => {
    state.accountsError = new Error('offline');
    render(<EmailChatInbox />);
    expect(screen.getByRole('alert')).toHaveTextContent('Você está offline');
  });

  it('distingue falta de permissão de indisponibilidade genérica', () => {
    state.accountsError = Object.assign(new Error('Forbidden'), { context: { status: 403 } });
    render(<EmailChatInbox />);
    expect(screen.getByRole('alert')).toHaveTextContent('Acesso ao Email não autorizado');
    expect(screen.getByRole('alert')).toHaveTextContent('administrador');
  });

  it('mostra conexão somente quando nenhuma conta ativa existe', () => {
    state.activeAccount = undefined as never;
    state.accounts = [];
    render(<EmailChatInbox />);
    expect(screen.getByText('Conecte seu Gmail ao ZAPP')).toBeInTheDocument();
  });

  it('propaga a conta ativa para thread e compositor', () => {
    state.threads = [THREAD];
    render(<EmailChatInbox />);
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar primeira' }));
    expect(screen.getByTestId('thread-account')).toHaveTextContent('account-1');
    expect(new URLSearchParams(window.location.search).get('emailThread')).toBe('thread-1');
    fireEvent.click(screen.getByRole('button', { name: 'Nova mensagem' }));
    expect(screen.getByTestId('composer-account')).toHaveTextContent('account-1');
  });

  it('restaura seleção ao navegar pelo histórico do navegador', () => {
    state.threads = [THREAD];
    render(<EmailChatInbox />);
    window.history.pushState({}, '', '/?view=email-chat&emailThread=thread-1');
    fireEvent.popState(window);
    expect(screen.getByTestId('thread-account')).toHaveTextContent('account-1');
  });

  it('abre ajuda funcional e explica ausência de confirmação de leitura', () => {
    render(<EmailChatInbox />);
    fireEvent.click(screen.getByRole('button', { name: 'Ajuda' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Gmail não fornece esse sinal');
  });

  it('abre o painel contextual como drawer em largura intermediária', () => {
    state.threads = [THREAD];
    render(<EmailChatInbox />);
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar primeira' }));
    expect(screen.queryByTestId('contact-panel')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Detalhes' }));
    expect(screen.getByRole('dialog')).toContainElement(screen.getByTestId('contact-panel'));
  });

  it('remove o cabeçalho autônomo quando incorporado em outro workspace', () => {
    render(<EmailChatInbox embedded />);
    expect(screen.queryByText('Comunicação profissional, organizada como uma conversa.')).not.toBeInTheDocument();
    expect(screen.getByText('admin@example.com')).toBeInTheDocument();
  });
});
