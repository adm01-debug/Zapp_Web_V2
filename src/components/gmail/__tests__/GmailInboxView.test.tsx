import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GmailInboxView from '../GmailInboxView';
import type { EmailThread } from '@/hooks/integrations/useGmail';

// framer-motion: AnimatePresence passes through children, motion stubs strip animation props
const ANIMATION_PROPS = new Set(['initial', 'animate', 'exit', 'whileHover', 'whileTap', 'variants', 'transition', 'layout']);
function makeMotionEl(tag: string) {
  return function MotionEl({ children, ...props }: Record<string, unknown>) {
    const safe = Object.fromEntries(Object.entries(props).filter(([k]) => !ANIMATION_PROPS.has(k)));
    return createElement(tag, safe, children as React.ReactNode);
  };
}
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy({}, { get: (_t, prop: string) => makeMotionEl(prop === 'button' ? 'button' : 'div') }),
}));

// Select uses Radix portal — mock to avoid jsdom issues
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="select" data-value={value}>
      {typeof children === 'function' ? children : children}
    </div>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value, onClick }: any) => <button onClick={onClick}>{children}</button>,
}));

// ScrollArea: simple div wrapper
vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: any) => <div>{children}</div>,
}));

// Tabs: Radix portal event system doesn't work in jsdom — use context-based stub
vi.mock('@/components/ui/tabs', () => {
  const React = require('react');
  const TabsCtx = React.createContext({ value: '', onChange: (_: string) => {} });
  return {
    Tabs: ({ value, onValueChange, children, ...rest }: any) =>
      React.createElement(TabsCtx.Provider, { value: { value, onChange: onValueChange ?? (() => {}) } },
        React.createElement('div', rest, children)),
    TabsList: ({ children, ...rest }: any) =>
      React.createElement('div', { role: 'tablist', ...rest }, children),
    TabsTrigger: ({ value: tabValue, children, ...rest }: any) => {
      const ctx = React.useContext(TabsCtx);
      return React.createElement('button', {
        role: 'tab',
        'aria-selected': ctx.value === tabValue,
        onClick: () => ctx.onChange(tabValue),
        ...rest,
      }, children);
    },
    TabsContent: ({ children, ...rest }: any) =>
      React.createElement('div', rest, children),
  };
});

// Mock EmailThreadView, EmailComposer, ThreadListItem
// Paths are relative to GmailInboxView.tsx (src/components/gmail/), not the test file
vi.mock('@/components/gmail/EmailThreadView', () => ({
  EmailThreadView: ({ thread, onBack }: any) => (
    <div data-testid="thread-view" data-subject={thread.subject}>
      <button onClick={onBack}>Voltar</button>
    </div>
  ),
}));

vi.mock('@/components/gmail/EmailComposer', () => ({
  EmailComposer: ({ onClose }: any) => (
    <div data-testid="composer">
      <button onClick={onClose}>Fechar</button>
    </div>
  ),
}));

vi.mock('@/components/gmail/ThreadListItem', () => ({
  ThreadListItem: ({ thread, onClick }: any) => (
    <button data-testid="thread-item" data-subject={thread.subject} onClick={onClick}>
      {thread.subject || '(Sem assunto)'}
    </button>
  ),
}));

// Mutable config to control mock values across tests
const config: {
  activeAccount: any;
  threads: EmailThread[];
  threadsLoading: boolean;
  unreadCount: number;
  starredCount: number;
  syncInboxPending: boolean;
} = {
  activeAccount: { email_address: 'eu@promobrindes.com.br', last_sync_at: null },
  threads: [],
  threadsLoading: false,
  unreadCount: 0,
  starredCount: 0,
  syncInboxPending: false,
};

const syncInboxMutate = vi.fn();
const subscribeToThreads = vi.fn(() => vi.fn());

vi.mock('@/hooks/integrations/useGmail', () => ({
  useGmail: () => ({
    accounts: [],
    activeAccount: config.activeAccount,
    threads: config.threads,
    threadsLoading: config.threadsLoading,
    labels: [],
    unreadCount: config.unreadCount,
    starredCount: config.starredCount,
    syncInbox: { mutate: syncInboxMutate, isPending: config.syncInboxPending },
    subscribeToThreads,
  }),
}));

function makeThread(overrides: Partial<EmailThread> = {}): EmailThread {
  return {
    id: Math.random().toString(36).slice(2),
    gmail_thread_id: 'gt1',
    gmail_account_id: 'a1',
    subject: 'Thread de teste',
    snippet: '',
    label_ids: [],
    is_unread: false,
    is_starred: false,
    is_important: false,
    message_count: 1,
    last_message_at: '2026-09-04T11:00:00-03:00',
    last_from_name: null,
    last_from_address: 'remetente@exemplo.com',
    contact: null,
    tags: [],
    status: 'open',
    ...overrides,
  } as EmailThread;
}

describe('GmailInboxView', () => {
  beforeEach(() => {
    config.activeAccount = { email_address: 'eu@promobrindes.com.br', last_sync_at: null };
    config.threads = [];
    config.threadsLoading = false;
    config.unreadCount = 0;
    config.starredCount = 0;
    config.syncInboxPending = false;
    syncInboxMutate.mockClear();
    subscribeToThreads.mockClear().mockReturnValue(vi.fn());
  });

  it('exibe estado "Gmail nao conectado" quando não há conta ativa', () => {
    config.activeAccount = null;
    render(<GmailInboxView />);
    expect(screen.getByText('Gmail nao conectado')).toBeInTheDocument();
  });

  it('renderiza a lista de threads do inbox quando há conta ativa', () => {
    config.threads = [
      makeThread({ subject: 'Proposta Comercial' }),
      makeThread({ subject: 'Orçamento solicitado' }),
    ];
    render(<GmailInboxView />);
    expect(screen.getByText('Proposta Comercial')).toBeInTheDocument();
    expect(screen.getByText('Orçamento solicitado')).toBeInTheDocument();
  });

  it('aba Favoritos exibe apenas threads com is_starred=true', async () => {
    config.threads = [
      makeThread({ subject: 'Email normal', is_starred: false }),
      makeThread({ subject: 'Email favorito', is_starred: true }),
    ];
    render(<GmailInboxView />);
    fireEvent.click(screen.getByRole('tab', { name: /favoritos/i }));
    await waitFor(() => {
      expect(screen.queryByText('Email normal')).not.toBeInTheDocument();
      expect(screen.getByText('Email favorito')).toBeInTheDocument();
    });
  });

  it('aba Nao lidos exibe apenas threads com is_unread=true', async () => {
    config.threads = [
      makeThread({ subject: 'Email lido', is_unread: false }),
      makeThread({ subject: 'Email nao lido', is_unread: true }),
    ];
    render(<GmailInboxView />);
    fireEvent.click(screen.getByRole('tab', { name: /nao lidos/i }));
    await waitFor(() => {
      expect(screen.queryByText('Email lido')).not.toBeInTheDocument();
      expect(screen.getByText('Email nao lido')).toBeInTheDocument();
    });
  });

  it('busca filtra threads pelo assunto', async () => {
    config.threads = [
      makeThread({ subject: 'Proposta de parceria' }),
      makeThread({ subject: 'Fatura vencida' }),
    ];
    render(<GmailInboxView />);
    fireEvent.change(screen.getByPlaceholderText('Buscar emails...'), { target: { value: 'parceria' } });
    await waitFor(() => {
      expect(screen.getByText('Proposta de parceria')).toBeInTheDocument();
      expect(screen.queryByText('Fatura vencida')).not.toBeInTheDocument();
    });
  });

  it('botão Compor exibe o EmailComposer', async () => {
    render(<GmailInboxView />);
    expect(screen.queryByTestId('composer')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /compor/i }));
    await waitFor(() => {
      expect(screen.getByTestId('composer')).toBeInTheDocument();
    });
  });

  it('botão Sync chama syncInbox.mutate({})', () => {
    render(<GmailInboxView />);
    fireEvent.click(screen.getByRole('button', { name: /sync/i }));
    expect(syncInboxMutate).toHaveBeenCalledWith({});
  });

  it('clicar em um thread abre o EmailThreadView', async () => {
    config.threads = [makeThread({ subject: 'Thread clicável' })];
    render(<GmailInboxView />);
    fireEvent.click(screen.getByText('Thread clicável'));
    await waitFor(() => {
      expect(screen.getByTestId('thread-view')).toBeInTheDocument();
    });
  });

  it('subscribeToThreads é chamado no mount', () => {
    render(<GmailInboxView />);
    expect(subscribeToThreads).toHaveBeenCalled();
  });
});
