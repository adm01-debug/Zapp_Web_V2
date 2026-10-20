import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GmailInboxView from '../GmailInboxView';
import type { EmailThread, GmailAccount, EmailLabel } from '@/hooks/integrations/useGmail';

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
  Select: ({ children, value }: { children: ReactNode; value?: string; onValueChange?: (v: string) => void }) => (
    <div data-testid="select" data-value={value}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) => <div {...props}>{children}</div>,
  SelectValue: ({ placeholder, ...props }: { placeholder?: string; [key: string]: unknown }) => <span {...props}>{placeholder}</span>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, onClick }: { children: ReactNode; value?: string; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
}));

// ScrollArea: simple div wrapper
vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// Mock EmailThreadView, EmailComposer, ThreadListItem
vi.mock('@/components/gmail/EmailThreadView', () => ({
  EmailThreadView: ({ thread, onBack }: { thread: EmailThread; onBack: () => void }) => (
    <div data-testid="thread-view" data-subject={thread.subject}>
      <button onClick={onBack}>Voltar</button>
    </div>
  ),
}));

vi.mock('@/components/gmail/EmailComposer', () => ({
  EmailComposer: ({ onClose }: { onClose?: () => void }) => (
    <div data-testid="composer">
      <button onClick={onClose}>Fechar</button>
    </div>
  ),
}));

vi.mock('@/components/gmail/ThreadListItem', () => ({
  ThreadListItem: ({ thread, onClick }: { thread: EmailThread; onClick?: () => void }) => (
    <button data-testid="thread-item" data-subject={thread.subject} onClick={onClick}>
      {thread.subject || '(Sem assunto)'}
    </button>
  ),
}));

// Mutable config to control mock values across tests
const config: {
  activeAccount: GmailAccount | null;
  accountsLoading: boolean;
  accountsError: Error | null;
  threads: EmailThread[];
  threadsLoading: boolean;
  threadsError: Error | null;
  labels: EmailLabel[];
  unreadCount: number;
  starredCount: number;
  syncInboxPending: boolean;
} = {
  activeAccount: {
    id: 'acc1',
    email_address: 'eu@promobrindes.com.br',
    is_active: true,
    sync_status: 'synced',
    last_sync_at: null,
    last_error: null,
    created_at: '2026-09-04T00:00:00Z',
  },
  accountsLoading: false,
  accountsError: null,
  threads: [],
  threadsLoading: false,
  threadsError: null,
  labels: [],
  unreadCount: 0,
  starredCount: 0,
  syncInboxPending: false,
};

const syncInboxMutate = vi.fn();
const subscribeToThreads = vi.fn(() => vi.fn());
const refetchAccounts = vi.fn();
const refetchThreads = vi.fn();

vi.mock('@/hooks/integrations/useGmail', () => ({
  useGmail: () => ({
    accounts: [],
    activeAccount: config.activeAccount,
    accountsLoading: config.accountsLoading,
    accountsError: config.accountsError,
    refetchAccounts,
    threads: config.threads,
    threadsLoading: config.threadsLoading,
    threadsError: config.threadsError,
    refetchThreads,
    labels: config.labels,
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
    label_ids: ['INBOX'],
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
    config.activeAccount = {
      id: 'acc1',
      email_address: 'eu@promobrindes.com.br',
      is_active: true,
      sync_status: 'synced',
      last_sync_at: null,
      last_error: null,
      created_at: '2026-09-04T00:00:00Z',
    };
    config.accountsLoading = false;
    config.accountsError = null;
    config.threads = [];
    config.threadsLoading = false;
    config.threadsError = null;
    config.labels = [];
    config.unreadCount = 0;
    config.starredCount = 0;
    config.syncInboxPending = false;
    window.history.replaceState({}, '', '/');
    syncInboxMutate.mockClear();
    refetchAccounts.mockClear();
    refetchThreads.mockClear();
    subscribeToThreads.mockClear().mockReturnValue(vi.fn());
  });

  it('exibe estado "Gmail não conectado" quando não há conta ativa', () => {
    config.activeAccount = null;
    render(<GmailInboxView />);
    expect(screen.getByText('Gmail não conectado')).toBeInTheDocument();
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

  it('pasta Favoritos exibe apenas threads com is_starred=true', async () => {
    config.threads = [
      makeThread({ subject: 'Email normal', is_starred: false }),
      makeThread({ subject: 'Email favorito', is_starred: true }),
    ];
    render(<GmailInboxView />);
    fireEvent.click(screen.getByRole('button', { name: /favoritos/i }));
    await waitFor(() => {
      expect(screen.queryByText('Email normal')).not.toBeInTheDocument();
      expect(screen.getByText('Email favorito')).toBeInTheDocument();
    });
  });

  it('pasta Não lidos exibe apenas threads com is_unread=true', async () => {
    config.threads = [
      makeThread({ subject: 'Email lido', is_unread: false }),
      makeThread({ subject: 'Email nao lido', is_unread: true }),
    ];
    render(<GmailInboxView />);
    fireEvent.click(screen.getByRole('button', { name: /não lidos/i }));
    await waitFor(() => {
      expect(screen.queryByText('Email lido')).not.toBeInTheDocument();
      expect(screen.getByText('Email nao lido')).toBeInTheDocument();
    });
  });

  it('pasta Spam exibe só threads com o rótulo SPAM em label_ids', async () => {
    config.threads = [
      makeThread({ subject: 'Email da caixa' }),
      makeThread({ subject: 'Oferta suspeita', label_ids: ['SPAM'] }),
    ];
    render(<GmailInboxView />);
    expect(screen.queryByText('Oferta suspeita')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /spam/i }));
    await waitFor(() => {
      expect(screen.getByText('Oferta suspeita')).toBeInTheDocument();
      expect(screen.queryByText('Email da caixa')).not.toBeInTheDocument();
    });
  });

  it('marcador personalizado do hook aparece na barra e filtra a lista', async () => {
    config.labels = [
      { id: 'l1', gmail_label_id: 'Label_9', name: 'Clientes VIP', label_type: 'user', color: '#7c3aed', message_count: 0, unread_count: 0 },
    ];
    config.threads = [
      makeThread({ subject: 'Thread comum' }),
      makeThread({ subject: 'Thread marcada', label_ids: ['INBOX', 'Label_9'] }),
    ];
    render(<GmailInboxView />);
    fireEvent.click(screen.getByRole('button', { name: /clientes vip/i }));
    await waitFor(() => {
      expect(screen.getByText('Thread marcada')).toBeInTheDocument();
      expect(screen.queryByText('Thread comum')).not.toBeInTheDocument();
    });
  });

  it('a pasta selecionada vai para a URL e carrega aria-current', async () => {
    config.threads = [makeThread({ subject: 'Thread antiga', label_ids: ['TRASH'] })];
    render(<GmailInboxView />);
    fireEvent.click(screen.getByRole('button', { name: /lixeira/i }));
    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).get('pasta')).toBe('TRASH');
      expect(screen.getByRole('button', { name: /lixeira/i })).toHaveAttribute('aria-current', 'page');
    });
  });

  it('abre já na pasta indicada pela URL', () => {
    window.history.replaceState({}, '', '/?pasta=IMPORTANT');
    config.threads = [
      makeThread({ subject: 'Importante', is_important: true }),
      makeThread({ subject: 'Comum', is_important: false }),
    ];
    render(<GmailInboxView />);
    expect(screen.getByText('Importante')).toBeInTheDocument();
    expect(screen.queryByText('Comum')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /importantes/i })).toHaveAttribute('aria-current', 'page');
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

  // R2-API-059: falha de consulta não é ausência de dado (conta desconectada ou inbox vazio).
  it('falha na consulta de threads: mostra erro com recuperação e não "Inbox vazio"', () => {
    config.threads = [];
    config.threadsError = new Error('permission denied for table email_threads');
    render(<GmailInboxView />);
    expect(screen.getByText('Não foi possível carregar os emails')).toBeInTheDocument();
    expect(screen.queryByText('Inbox vazio')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(refetchThreads).toHaveBeenCalledTimes(1);
  });

  it('threads em cache com consulta falhada: mantém a lista e avisa que está desatualizada', () => {
    config.threads = [makeThread({ subject: 'Thread em cache' })];
    config.threadsError = new Error('timeout');
    render(<GmailInboxView />);
    expect(screen.getByText('Thread em cache')).toBeInTheDocument();
    expect(screen.getByText(/podem estar desatualizados/)).toBeInTheDocument();
  });

  it('falha na consulta de contas: não afirma "Gmail não conectado"', () => {
    config.activeAccount = null;
    config.accountsError = new Error('JWT expired');
    render(<GmailInboxView />);
    expect(screen.getByText('Não foi possível verificar suas contas Gmail')).toBeInTheDocument();
    expect(screen.queryByText('Gmail não conectado')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(refetchAccounts).toHaveBeenCalledTimes(1);
  });

  it('consulta de contas em andamento: não afirma "Gmail não conectado"', () => {
    config.activeAccount = null;
    config.accountsLoading = true;
    render(<GmailInboxView />);
    expect(screen.getByText('Verificando conta Gmail...')).toBeInTheDocument();
    expect(screen.queryByText('Gmail não conectado')).not.toBeInTheDocument();
  });

  it('filtro de status: o controle tem rótulo próprio (aria-label)', () => {
    const { container } = render(<GmailInboxView />);
    const trigger = container.querySelector('[aria-label="Filtro de status"]');
    expect(trigger).not.toBeNull();
    expect(trigger).toHaveAttribute('aria-label', 'Filtro de status');
    // o valor visível segue exibido dentro do controle
    expect(trigger?.textContent?.trim().length).toBeGreaterThan(0);
  });
});
