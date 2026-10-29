import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GmailInboxView from '../GmailInboxView';
import type { EmailThread, GmailAccount, EmailLabel, EmailThreadListQueryWithStatus } from '@/hooks/integrations/useGmail';

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

// Select uses Radix portal — mock to avoid jsdom issues. O contexto entrega o
// `onValueChange` para que os itens clicáveis exercitem o filtro de status.
const SelectCtx = createContext<(value: string) => void>(() => {});
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: { children: ReactNode; value?: string; onValueChange?: (v: string) => void }) => (
    <SelectCtx.Provider value={onValueChange ?? (() => {})}>
      <div data-testid="select" data-value={value}>
        {children}
      </div>
    </SelectCtx.Provider>
  ),
  SelectTrigger: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) => <div {...props}>{children}</div>,
  SelectValue: ({ placeholder, ...props }: { placeholder?: string; [key: string]: unknown }) => <span {...props}>{placeholder}</span>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => {
    const onValueChange = useContext(SelectCtx);
    return <button onClick={() => onValueChange(value)}>{children}</button>;
  },
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
  threadsTotalCount: number;
  threadsPageCount: number;
  labels: EmailLabel[];
  unreadCount: number;
  starredCount: number;
  syncInboxPending: boolean;
  /** Última consulta que a tela mandou ao hook (filtros + página). */
  listQuery: EmailThreadListQueryWithStatus | null;
  /** Todas as consultas, para contar quantas vezes a tela reconsultou. */
  listQueries: EmailThreadListQueryWithStatus[];
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
  threadsTotalCount: 0,
  threadsPageCount: 1,
  labels: [],
  unreadCount: 0,
  starredCount: 0,
  syncInboxPending: false,
  listQuery: null,
  listQueries: [],
};

const syncInboxMutate = vi.fn();
const subscribeToThreads = vi.fn(() => vi.fn());
const refetchAccounts = vi.fn();
const refetchThreads = vi.fn();

vi.mock('@/hooks/integrations/useGmail', () => ({
  useGmail: (_accountId?: string, _requestedThreadId?: string | null, listQuery?: EmailThreadListQueryWithStatus) => {
    if (listQuery) {
      config.listQuery = listQuery;
      config.listQueries.push(listQuery);
    }
    return {
      accounts: [],
      activeAccount: config.activeAccount,
      accountsLoading: config.accountsLoading,
      accountsError: config.accountsError,
      refetchAccounts,
      threads: config.threads,
      threadsLoading: config.threadsLoading,
      threadsError: config.threadsError,
      refetchThreads,
      threadsTotalCount: config.threadsTotalCount,
      threadsPageCount: config.threadsPageCount,
      labels: config.labels,
      unreadCount: config.unreadCount,
      starredCount: config.starredCount,
      syncInbox: { mutate: syncInboxMutate, isPending: config.syncInboxPending },
      subscribeToThreads,
    };
  },
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
    config.threadsTotalCount = 0;
    config.threadsPageCount = 1;
    config.labels = [];
    config.unreadCount = 0;
    config.starredCount = 0;
    config.syncInboxPending = false;
    config.listQuery = null;
    config.listQueries = [];
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

  // OTH-005 (tela antiga): a pasta/estado/busca vão ao servidor ANTES da paginação;
  // filtrar o array em memória mostraria só o que caiu na página.
  it('pasta inicial (Inbox) consulta o rótulo INBOX e não filtra em memória', () => {
    config.threads = [makeThread({ subject: 'Thread com outro rótulo', label_ids: ['SPAM'] })];
    render(<GmailInboxView />);
    expect(config.listQuery).toMatchObject({ labelId: 'INBOX', filter: 'all', page: 1, threadStatus: undefined });
    // quem filtraria por `label_ids` em memória esconderia esta thread da lista
    expect(screen.getByText('Thread com outro rótulo')).toBeInTheDocument();
  });

  it('pasta Não lidos pede o estado da thread ao servidor', async () => {
    config.threads = [makeThread({ subject: 'Qualquer thread' })];
    render(<GmailInboxView />);
    fireEvent.click(screen.getByRole('button', { name: /não lidos/i }));
    await waitFor(() => expect(config.listQuery).toMatchObject({ filter: 'unread', labelId: 'all', page: 1 }));
  });

  it('pasta Favoritos pede o estado da thread ao servidor', async () => {
    config.threads = [makeThread({ subject: 'Qualquer thread' })];
    render(<GmailInboxView />);
    fireEvent.click(screen.getByRole('button', { name: /favoritos/i }));
    await waitFor(() => expect(config.listQuery).toMatchObject({ filter: 'starred', labelId: 'all', page: 1 }));
  });

  it('pasta Importantes usa o rótulo IMPORTANT que a sincronização agrega em label_ids', async () => {
    config.threads = [makeThread({ subject: 'Qualquer thread' })];
    render(<GmailInboxView />);
    fireEvent.click(screen.getByRole('button', { name: /importantes/i }));
    await waitFor(() => expect(config.listQuery).toMatchObject({ labelId: 'IMPORTANT', filter: 'all' }));
  });

  it('pasta Spam vira labelId SPAM na consulta do servidor', async () => {
    config.threads = [makeThread({ subject: 'Qualquer thread' })];
    render(<GmailInboxView />);
    fireEvent.click(screen.getByRole('button', { name: /spam/i }));
    await waitFor(() => expect(config.listQuery).toMatchObject({ labelId: 'SPAM', page: 1 }));
  });

  it('marcador personalizado do hook aparece na barra e vira labelId na consulta', async () => {
    config.labels = [
      { id: 'l1', gmail_label_id: 'Label_9', name: 'Clientes VIP', label_type: 'user', color: '#7c3aed', message_count: 0, unread_count: 0 },
    ];
    config.threads = [makeThread({ subject: 'Thread marcada', label_ids: ['INBOX', 'Label_9'] })];
    render(<GmailInboxView />);
    fireEvent.click(screen.getByRole('button', { name: /clientes vip/i }));
    await waitFor(() => expect(config.listQuery).toMatchObject({ labelId: 'Label_9' }));
    expect(screen.getByText('Thread marcada')).toBeInTheDocument();
  });

  it('trocar de pasta volta para a página 1', async () => {
    config.threads = [makeThread({ subject: 'Thread da página 2' })];
    config.threadsTotalCount = 60;
    config.threadsPageCount = 3;
    render(<GmailInboxView />);
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    await waitFor(() => expect(config.listQuery?.page).toBe(2));
    fireEvent.click(screen.getByRole('button', { name: /lixeira/i }));
    await waitFor(() => expect(config.listQuery).toMatchObject({ labelId: 'TRASH', page: 1 }));
  });

  it('busca consulta o servidor só depois da pausa de digitação e volta para a página 1', async () => {
    config.threads = [makeThread({ subject: 'Proposta de parceria' })];
    config.threadsTotalCount = 60;
    config.threadsPageCount = 3;
    render(<GmailInboxView />);
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    await waitFor(() => expect(config.listQuery?.page).toBe(2));
    fireEvent.change(screen.getByPlaceholderText('Buscar emails...'), { target: { value: '  parceria ' } });
    await waitFor(() => expect(config.listQuery).toMatchObject({ search: 'parceria', page: 1 }));
  });

  it('paginação: a próxima página pede a página seguinte e a lista mostra o que voltou', async () => {
    config.threads = [makeThread({ subject: 'Thread da página 1' })];
    config.threadsTotalCount = 45;
    config.threadsPageCount = 3;
    render(<GmailInboxView />);
    expect(screen.getByText('Página 1 de 3 · 45 emails')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    await waitFor(() => expect(config.listQuery?.page).toBe(2));
    expect(screen.getByText('Thread da página 1')).toBeInTheDocument();
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
    config.threads = [makeThread({ subject: 'Thread importante' })];
    render(<GmailInboxView />);
    expect(config.listQuery).toMatchObject({ labelId: 'IMPORTANT' });
    expect(screen.getByRole('button', { name: /importantes/i })).toHaveAttribute('aria-current', 'page');
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

  it('consulta da lista em andamento mostra o carregador', () => {
    config.threadsLoading = true;
    render(<GmailInboxView />);
    expect(screen.getByRole('status', { name: 'Carregando emails' })).toBeInTheDocument();
    expect(screen.queryByText('Nenhum email nesta pasta')).not.toBeInTheDocument();
  });

  it('pasta sem threads mostra o estado vazio com o convite para sincronizar', () => {
    config.threads = [];
    render(<GmailInboxView />);
    expect(screen.getByText('Nenhum email nesta pasta')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Paginação de emails' })).not.toBeInTheDocument();
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

  it('filtro de status escolhido vai ao servidor e volta para a página 1', async () => {
    config.threads = [makeThread({ subject: 'Thread arquivada' })];
    render(<GmailInboxView />);
    expect(config.listQuery?.threadStatus).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Arquivado' }));
    await waitFor(() => expect(config.listQuery).toMatchObject({ threadStatus: 'archived', page: 1 }));
  });
});
