/**
 * C03 — clicar no e-mail do contato (painel de detalhes do chat) navega para
 * ?view=email-chat&emailContact=<uuid>&emailTo=<email>. A caixa então:
 *  - espera haver conta Gmail ativa (sem conta: tela de conectar, params ficam);
 *  - achou conversa do contato → abre ?emailThread=<id> na mesma entrada;
 *  - não achou → abre o compositor novo com defaultTo = emailTo;
 *  - ?emailThread explícito tem prioridade sobre emailContact;
 *  - depois de consumir, remove emailContact/emailTo da URL (replaceState).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailThread } from '@/hooks/integrations/useGmail';

const CONTACT_UUID = '123e4567-e89b-42d3-a456-426614174000';
const THREAD: EmailThread = {
  id: 'thread-1', gmail_account_id: 'account-1', gmail_thread_id: 'gmail-thread-1', contact_id: CONTACT_UUID,
  subject: 'Assunto real', snippet: 'Prévia', label_ids: ['INBOX'], message_count: 1, is_unread: true,
  is_starred: false, is_important: false, last_message_at: '2026-10-02T12:00:00Z', last_from_name: 'Cliente',
  last_from_address: 'maria@test.com', assigned_to: null, status: 'open', priority: 'medium', tags: [],
  created_at: '2026-10-02T12:00:00Z', updated_at: '2026-10-02T12:00:00Z',
};

const state = vi.hoisted(() => ({
  accountsLoading: false,
  accountsError: null as Error | null,
  accounts: [{ id: 'account-1', email_address: 'admin@example.com', is_active: true }],
  activeAccount: { id: 'account-1', email_address: 'admin@example.com', is_active: true } as { id: string; email_address: string; is_active: boolean } | undefined,
  threads: [] as EmailThread[],
}));

const lookup = vi.hoisted(() => ({
  status: 'none' as 'loading' | 'found' | 'none' | 'error',
  threadId: null as string | null,
  calls: [] as Array<string | null | undefined>,
}));

vi.mock('framer-motion', () => ({ AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/hooks/integrations/useGmail', () => ({
  useGmail: () => ({
    ...state,
    refetchAccounts: vi.fn(), connectGmail: { mutate: vi.fn(), isPending: false }, labels: [],
    threadsLoading: false, threadsError: null, syncInbox: { mutate: vi.fn(), isPending: false },
    syncLabels: { mutate: vi.fn(), isPending: false }, unreadCount: 0, threadsTotalCount: state.threads.length,
    downloadAttachment: { mutate: vi.fn(), isPending: false },
    subscribeToThreads: () => vi.fn(),
  }),
}));
vi.mock('@/hooks/integrations/useEmailThreadForContact', () => ({
  useEmailThreadForContact: (_accountId: string | undefined, contactId: string | null | undefined) => {
    lookup.calls.push(contactId);
    return { status: lookup.status, threadId: lookup.threadId };
  },
}));
vi.mock('../EmailThreadList', () => ({
  EmailThreadList: () => <div data-testid="thread-list" />,
}));
vi.mock('../EmailChatThread', () => ({ EmailChatThread: ({ accountId }: { accountId?: string }) => <div data-testid="thread-account">{accountId}</div> }));
vi.mock('../EmailContactPanel', () => ({ EmailContactPanel: () => <div data-testid="contact-panel" /> }));
vi.mock('@/components/gmail/EmailComposer', () => ({ EmailComposer: ({ accountId, defaultTo }: { accountId?: string; defaultTo?: string }) => <div data-testid="composer-account" data-to={defaultTo}>{accountId}</div> }));

import { EmailChatInbox } from '../EmailChatInbox';

const param = (name: string) => new URLSearchParams(window.location.search).get(name);

describe('EmailChatInbox — intenção de e-mail de contato (C03)', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/?view=email-chat');
    state.accountsLoading = false;
    state.accountsError = null;
    state.accounts = [{ id: 'account-1', email_address: 'admin@example.com', is_active: true }];
    state.activeAccount = { id: 'account-1', email_address: 'admin@example.com', is_active: true };
    state.threads = [];
    lookup.status = 'none';
    lookup.threadId = null;
    lookup.calls.length = 0;
  });

  it('com conversa existente abre emailThread=<id> e limpa emailContact/emailTo', async () => {
    lookup.status = 'found';
    lookup.threadId = 'thread-1';
    state.threads = [THREAD];
    window.history.replaceState({}, '', `/?view=email-chat&emailContact=${CONTACT_UUID}&emailTo=maria@test.com`);

    render(<EmailChatInbox />);

    await waitFor(() => expect(param('emailThread')).toBe('thread-1'));
    expect(screen.getByTestId('thread-account')).toHaveTextContent('account-1');
    expect(param('emailContact')).toBeNull();
    expect(param('emailTo')).toBeNull();
  });

  it('sem conversa abre o compositor com o e-mail do contato e limpa a URL', async () => {
    lookup.status = 'none';
    window.history.replaceState({}, '', `/?view=email-chat&emailContact=${CONTACT_UUID}&emailTo=maria@test.com`);

    render(<EmailChatInbox />);

    await waitFor(() => expect(screen.getByTestId('composer-account')).toBeInTheDocument());
    expect(screen.getByTestId('composer-account')).toHaveAttribute('data-to', 'maria@test.com');
    expect(screen.getByTestId('composer-account')).toHaveTextContent('account-1');
    expect(param('emailContact')).toBeNull();
    expect(param('emailTo')).toBeNull();
    expect(param('emailThread')).toBeNull();
  });

  it('erro na consulta cai no compositor com o destinatário (a intenção não se perde)', async () => {
    lookup.status = 'error';
    window.history.replaceState({}, '', `/?view=email-chat&emailContact=${CONTACT_UUID}&emailTo=maria@test.com`);

    render(<EmailChatInbox />);

    await waitFor(() => expect(screen.getByTestId('composer-account')).toBeInTheDocument());
    expect(screen.getByTestId('composer-account')).toHaveAttribute('data-to', 'maria@test.com');
    expect(param('emailContact')).toBeNull();
  });

  it('?emailThread explícito vence emailContact: abre a thread e descarta a intenção', async () => {
    lookup.status = 'found';
    lookup.threadId = 'thread-9';
    state.threads = [THREAD];
    window.history.replaceState({}, '', `/?view=email-chat&emailThread=thread-1&emailContact=${CONTACT_UUID}&emailTo=maria@test.com`);

    render(<EmailChatInbox />);

    await waitFor(() => expect(param('emailContact')).toBeNull());
    expect(param('emailThread')).toBe('thread-1');
    expect(screen.getByTestId('thread-account')).toHaveTextContent('account-1');
    expect(screen.queryByTestId('composer-account')).not.toBeInTheDocument();
    // A consulta por contato nem é disparada (intent descartado antes).
    expect(lookup.calls.every(contactId => !contactId)).toBe(true);
  });

  it('sem conta Gmail mantém a tela de conectar e preserva os parâmetros', () => {
    state.activeAccount = undefined;
    state.accounts = [];
    window.history.replaceState({}, '', `/?view=email-chat&emailContact=${CONTACT_UUID}&emailTo=maria@test.com`);

    render(<EmailChatInbox />);

    expect(screen.getByText('Conecte seu Gmail ao ZAPP')).toBeInTheDocument();
    expect(param('emailContact')).toBe(CONTACT_UUID);
    expect(param('emailTo')).toBe('maria@test.com');
  });

  it('espera a conta aparecer: a intenção preservada é consumida depois', async () => {
    state.activeAccount = undefined;
    state.accounts = [];
    lookup.status = 'none';
    window.history.replaceState({}, '', `/?view=email-chat&emailContact=${CONTACT_UUID}&emailTo=maria@test.com`);

    const { rerender } = render(<EmailChatInbox />);
    expect(param('emailContact')).toBe(CONTACT_UUID);

    state.activeAccount = { id: 'account-1', email_address: 'admin@example.com', is_active: true };
    state.accounts = [state.activeAccount];
    rerender(<EmailChatInbox />);

    await waitFor(() => expect(screen.getByTestId('composer-account')).toBeInTheDocument());
    expect(param('emailContact')).toBeNull();
  });

  it('enquanto a consulta por contato carrega, nada abre e os parâmetros ficam', () => {
    lookup.status = 'loading';
    window.history.replaceState({}, '', `/?view=email-chat&emailContact=${CONTACT_UUID}&emailTo=maria@test.com`);

    render(<EmailChatInbox />);

    expect(param('emailContact')).toBe(CONTACT_UUID);
    expect(screen.queryByTestId('composer-account')).not.toBeInTheDocument();
    expect(screen.queryByTestId('thread-account')).not.toBeInTheDocument();
  });

  it('popstate para uma entrada com emailContact consome a intenção', async () => {
    lookup.status = 'found';
    lookup.threadId = 'thread-1';
    state.threads = [THREAD];
    render(<EmailChatInbox />);

    window.history.pushState({}, '', `/?view=email-chat&emailContact=${CONTACT_UUID}&emailTo=maria@test.com`);
    fireEvent.popState(window);

    await waitFor(() => expect(param('emailThread')).toBe('thread-1'));
    expect(param('emailContact')).toBeNull();
  });
});
