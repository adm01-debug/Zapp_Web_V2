import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailThread } from '@/hooks/integrations/useGmail';

const THREAD: EmailThread = {
  id: 'thread-1', gmail_account_id: 'account-1', gmail_thread_id: 'gmail-thread-1', contact_id: null,
  subject: 'Assunto real', snippet: 'Prévia', label_ids: ['INBOX'], message_count: 1, is_unread: true,
  is_starred: false, is_important: false, last_message_at: '2026-10-02T12:00:00Z', last_from_name: 'Cliente',
  last_from_address: 'cliente@example.com', assigned_to: null, status: 'open', priority: 'medium', tags: [],
  created_at: '2026-10-02T12:00:00Z', updated_at: '2026-10-02T12:00:00Z',
};

const ACCOUNT = { id: 'account-1', email_address: 'admin@example.com', is_active: true };

const state = vi.hoisted(() => ({
  threads: [] as EmailThread[],
  threadsLoading: false,
  threadsError: null as Error | null,
  refetchCalls: 0,
  /** O 3º argumento de cada chamada do hook — a consulta enviada ao servidor. */
  listQueryCalls: [] as Array<{ page?: number; search?: string } | undefined>,
  /** O "Limpar" que a lista recebe do pai (mesmo clear do cabeçalho). */
  onClearGlobalSearch: undefined as (() => void) | undefined,
}));

vi.mock('framer-motion', () => ({ AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/hooks/integrations/useGmail', () => ({
  useGmail: (_accountId?: string, _threadId?: string | null, listQuery?: { page?: number; search?: string }) => {
    state.listQueryCalls.push(listQuery);
    return {
      accounts: [ACCOUNT],
      accountsLoading: false,
      accountsError: null,
      activeAccount: ACCOUNT,
      refetchAccounts: vi.fn(),
      threads: state.threads,
      threadsLoading: state.threadsLoading,
      threadsError: state.threadsError,
      threadsTotalCount: state.threads.length,
      threadsPageCount: 1,
      labels: [],
      unreadCount: state.threads.filter(thread => thread.is_unread).length,
      requestedThread: null,
      connectGmail: { mutate: vi.fn(), isPending: false },
      syncInbox: { mutate: vi.fn(), isPending: false },
      syncLabels: { mutate: vi.fn(), isPending: false },
      downloadAttachment: { mutate: vi.fn(), isPending: false },
      subscribeToThreads: () => vi.fn(),
      refetchThreads: () => { state.refetchCalls += 1; },
    };
  },
}));
vi.mock('@/hooks/integrations/useEmailThreadForContact', () => ({
  useEmailThreadForContact: () => ({ status: 'none', threadId: null }),
}));
vi.mock('../EmailThreadList', () => ({
  EmailThreadList: ({ onClearGlobalSearch }: { onClearGlobalSearch?: () => void }) => {
    state.onClearGlobalSearch = onClearGlobalSearch;
    return <div data-testid="thread-list" />;
  },
}));
vi.mock('../EmailChatThread', () => ({ EmailChatThread: () => <div data-testid="thread" /> }));
vi.mock('../EmailContactPanel', () => ({ EmailContactPanel: () => <div data-testid="contact-panel" /> }));
vi.mock('@/components/gmail/EmailComposer', () => ({ EmailComposer: () => <div data-testid="composer" /> }));

import { EmailChatInbox } from '../EmailChatInbox';

const SEARCH_LABEL = 'Busca global do Email';

function digita(termo: string) {
  fireEvent.change(screen.getByLabelText(SEARCH_LABEL), { target: { value: termo } });
}

function venceEsperaCurta() {
  act(() => { vi.advanceTimersByTime(300); });
}

function ultimaConsulta() {
  return state.listQueryCalls[state.listQueryCalls.length - 1];
}

describe('EmailChatInbox — estados da busca do cabeçalho', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/?view=email-chat');
    state.threads = [];
    state.threadsLoading = false;
    state.threadsError = null;
    state.refetchCalls = 0;
    state.listQueryCalls.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('anuncia o termo antes de ele ir ao servidor, em vez de ficar mudo', () => {
    vi.useFakeTimers();
    render(<EmailChatInbox />);

    digita('fatura');

    expect(screen.getByTestId('busca-global-buscando')).toHaveTextContent('Buscando por "fatura"');
    expect(screen.getByLabelText(SEARCH_LABEL)).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('busca-global-vazia')).not.toBeInTheDocument();
    expect(screen.queryByTestId('busca-global-erro')).not.toBeInTheDocument();
  });

  it('troca "buscando" pelo vazio nomeando o termo e confirma a consulta enviada', () => {
    vi.useFakeTimers();
    render(<EmailChatInbox />);

    digita('fatura');
    venceEsperaCurta();

    expect(ultimaConsulta()?.search).toBe('fatura');
    expect(screen.queryByTestId('busca-global-buscando')).not.toBeInTheDocument();
    expect(screen.getByTestId('busca-global-vazia')).toHaveTextContent('Nenhum resultado para "fatura"');
    expect(screen.getByLabelText(SEARCH_LABEL)).toHaveAttribute('aria-busy', 'false');
  });

  it('mostra o resultado encontrado sem rótulo de vazio nem de erro', () => {
    vi.useFakeTimers();
    state.threads = [THREAD];
    render(<EmailChatInbox />);

    digita('fatura');
    venceEsperaCurta();

    expect(screen.queryByTestId('busca-global-vazia')).not.toBeInTheDocument();
    expect(screen.queryByTestId('busca-global-erro')).not.toBeInTheDocument();
    expect(screen.queryByTestId('busca-global-buscando')).not.toBeInTheDocument();
  });

  it('mostra o erro da busca e repete a consulta no clique', () => {
    vi.useFakeTimers();
    state.threadsError = new Error('offline');
    render(<EmailChatInbox />);

    digita('fatura');
    venceEsperaCurta();

    expect(screen.getByTestId('busca-global-erro')).toHaveTextContent('Você está offline');
    expect(screen.queryByTestId('busca-global-vazia')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(state.refetchCalls).toBe(1);
  });

  it('Escape limpa o campo e devolve a consulta sem termo', () => {
    vi.useFakeTimers();
    render(<EmailChatInbox />);

    digita('fatura');
    venceEsperaCurta();
    expect(ultimaConsulta()?.search).toBe('fatura');

    fireEvent.keyDown(screen.getByLabelText(SEARCH_LABEL), { key: 'Escape' });
    venceEsperaCurta();

    expect(screen.getByLabelText(SEARCH_LABEL)).toHaveValue('');
    expect(ultimaConsulta()?.search).toBe('');
    expect(screen.queryByTestId('busca-global-buscando')).not.toBeInTheDocument();
    expect(screen.queryByTestId('busca-global-vazia')).not.toBeInTheDocument();
  });

  it('o "Limpar" da lista usa o mesmo clear e tira o termo da consulta de uma vez', () => {
    vi.useFakeTimers();
    render(<EmailChatInbox />);

    digita('fatura');
    venceEsperaCurta();
    expect(ultimaConsulta()?.search).toBe('fatura');

    act(() => { state.onClearGlobalSearch?.(); });

    // Sem esperar a espera curta: o termo já saiu da consulta.
    expect(screen.getByLabelText(SEARCH_LABEL)).toHaveValue('');
    expect(ultimaConsulta()?.search).toBe('');
  });

  it('Enter antecipa a consulta sem esperar a espera curta', () => {
    vi.useFakeTimers();
    render(<EmailChatInbox />);

    digita('fatura');
    fireEvent.keyDown(screen.getByLabelText(SEARCH_LABEL), { key: 'Enter' });

    expect(ultimaConsulta()?.search).toBe('fatura');
  });

  it('só promete o que a busca cobre quando o campo está em repouso', () => {
    render(<EmailChatInbox />);

    expect(screen.getByLabelText(SEARCH_LABEL)).toHaveAttribute(
      'placeholder',
      'Buscar e-mails, remetentes, assuntos, anexos…',
    );
    expect(screen.queryByTestId('busca-global-buscando')).not.toBeInTheDocument();
    expect(screen.queryByTestId('busca-global-vazia')).not.toBeInTheDocument();
    expect(screen.queryByTestId('busca-global-erro')).not.toBeInTheDocument();
  });
});
