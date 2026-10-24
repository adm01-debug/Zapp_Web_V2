/**
 * Critério de pronto do cartão: "abrir a tela com muitas threads não baixa tudo
 * (teste com contador de consultas)".
 *
 * Aqui a tela antiga de Gmail roda com o `useGmail` REAL contra um cliente Supabase
 * falso que registra cada chamada. Com 1.738 threads na conta, a tela precisa emitir
 * UMA consulta de lista (`range(0,19)`) — não a coleta em série de páginas de 1.000
 * linhas (`range(0,999)`) que o caminho `full: true` fazia.
 *
 * Vermelho antes da correção: a tela pedia `full: true` e o hook devolvia a caixa
 * inteira (`range(0,999)` em sequência, 1.738 itens renderizados).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { callGmailFunction } from '@/hooks/gmail/gmailApi';
import { supabase } from '@/integrations/supabase/client';
import GmailInboxView from '../GmailInboxView';
import { EMAIL_THREAD_PAGE_SIZE } from '@/lib/emailThreadQuery';

vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: true, isLoading: false }),
}));
vi.mock('@/hooks/gmail/gmailApi');
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('@/lib/gmailOAuth', () => ({
  createGmailOAuthState: vi.fn(() => 'state'),
  storeGmailOAuthReturnContext: vi.fn(),
}));
vi.mock('@/hooks/system/useNavigationHistory', () => ({
  RESERVED_HASHES: new Set(['main-content']),
}));

// Apresentação apenas: o que o teste mede é a consulta, não o desenho do item.
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children, ...props }: { children?: ReactNode }) =>
          createElement('div', props, children),
    }
  ),
}));
const SelectCtx = createContext<(value: string) => void>(() => {});
vi.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    onValueChange,
  }: {
    children: ReactNode;
    onValueChange?: (v: string) => void;
  }) => <SelectCtx.Provider value={onValueChange ?? (() => {})}>{children}</SelectCtx.Provider>,
  SelectTrigger: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) => (
    <div {...props}>{children}</div>
  ),
  SelectValue: ({ placeholder, ...props }: { placeholder?: string; [key: string]: unknown }) => (
    <span {...props}>{placeholder}</span>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => {
    const onValueChange = useContext(SelectCtx);
    return <button onClick={() => onValueChange(value)}>{children}</button>;
  },
}));
vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/gmail/EmailThreadView', () => ({
  EmailThreadView: () => <div data-testid="thread-view" />,
}));
vi.mock('@/components/gmail/EmailComposer', () => ({
  EmailComposer: () => <div data-testid="composer" />,
}));
vi.mock('@/components/gmail/ThreadListItem', () => ({
  ThreadListItem: ({
    thread,
    onClick,
  }: {
    thread: { id: string; subject: string };
    onClick?: () => void;
  }) => (
    <button data-testid="thread-item" data-thread-id={thread.id} onClick={onClick}>
      {thread.subject}
    </button>
  ),
}));

const MOCK_ACCOUNT = {
  id: 'acc1',
  email_address: 'user@example.com',
  is_active: true,
  sync_status: 'synced' as const,
  last_sync_at: null,
  last_error: null,
  created_at: '2024-01-01T00:00:00Z',
};

function makeThread(index: number) {
  return {
    id: `t${index}`,
    gmail_account_id: 'acc1',
    gmail_thread_id: `g-${index}`,
    contact_id: null,
    subject: `Assunto ${index}`,
    snippet: 'trecho',
    label_ids: ['INBOX'],
    message_count: 1,
    is_unread: true,
    is_starred: false,
    is_important: false,
    last_message_at: '2026-09-06T10:00:00Z',
    last_from_name: 'Maria',
    last_from_address: 'maria@exemplo.com',
    assigned_to: null,
    status: 'open' as const,
    priority: 'medium' as const,
    tags: [],
    created_at: '2026-09-06T00:00:00Z',
    updated_at: '2026-09-06T00:00:00Z',
    contact: undefined,
  };
}

type Records = { list: string[]; count: string[]; other: string[] };

/** Mesmo gravador da suíte do hook: cada chamada de filtro/range vira uma linha. */
function makeRecordingChain(
  records: Records,
  table: string,
  rows: unknown[],
  total: number | null
) {
  const payload = () => ({ data: rows, error: null, count: total });
  let bucket: string[] = table === 'email_threads' ? records.list : records.other;
  const chain: Record<string, unknown> = {
    select: (columns: string, options?: unknown) => {
      if (options && (options as { head?: boolean }).head) bucket = records.count;
      bucket.push(`select(${columns}${options ? `,${JSON.stringify(options)}` : ''})`);
      return chain;
    },
    eq: (column: string, value: unknown) => {
      bucket.push(`eq(${column},${JSON.stringify(value)})`);
      return chain;
    },
    contains: (column: string, value: unknown) => {
      bucket.push(`contains(${column},${JSON.stringify(value)})`);
      return chain;
    },
    gte: (column: string, value: unknown) => {
      bucket.push(`gte(${column},${JSON.stringify(value)})`);
      return chain;
    },
    or: (filters: string) => {
      bucket.push(`or(${filters})`);
      return chain;
    },
    order: (column: string) => {
      bucket.push(`order(${column})`);
      return chain;
    },
    in: (column: string, ids: unknown[]) => {
      bucket.push(`in(${column},${JSON.stringify(ids)})`);
      return Promise.resolve({ data: [], error: null });
    },
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    range: (from: number, to: number) => {
      bucket.push(`range(${from},${to})`);
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null, count: total });
    },
    limit: (value: number) => {
      bucket.push(`limit(${value})`);
      return Promise.resolve(payload());
    },
  };
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(payload()).then(resolve);
  return chain;
}

/** Consultas de lista que a tela disparou (o balde `list` é a tabela email_threads). */
function listRanges(records: Records) {
  return records.list.filter((entry) => entry.startsWith('range('));
}

function setup(totalThreads = 1738): { records: Records; client: QueryClient } {
  const records: Records = { list: [], count: [], other: [] };
  const threads = Array.from({ length: totalThreads }, (_, index) => makeThread(index + 1));
  vi.mocked(callGmailFunction).mockResolvedValue({ accounts: [MOCK_ACCOUNT] });
  // PE-09: toda busca também chama a RPC search_email_threads (casa corpo/anexo,
  // paginada por cursor) ANTES de montar o `.or()` de colunas da própria tabela —
  // sem este mock a RPC devolve `undefined` e a busca inteira lança.
  vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never);
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return makeRecordingChain(
      records,
      table,
      table === 'email_threads' ? threads : [],
      threads.length
    ) as any;
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return { records, client };
}

function renderView(client: QueryClient) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return render(<GmailInboxView />, { wrapper });
}

describe('GmailInboxView — a tela antiga pagina em vez de baixar a caixa inteira', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.channel).mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    } as unknown as ReturnType<typeof supabase.channel>);
    window.history.replaceState({}, '', '/');
  });

  it('conta com 1.738 threads rende a primeira página: uma consulta, 20 itens', async () => {
    const { records, client } = setup(1738);
    renderView(client);

    await waitFor(() =>
      expect(screen.getAllByTestId('thread-item')).toHaveLength(EMAIL_THREAD_PAGE_SIZE)
    );

    // Contador de consultas: uma página pedida, nada de coleta em série.
    expect(listRanges(records)).toEqual([`range(0,${EMAIL_THREAD_PAGE_SIZE - 1})`]);
    expect(records.list).not.toContain('range(0,999)');
    expect(records.list).not.toContain('limit(1000)');
    expect(screen.queryAllByTestId('thread-item')).toHaveLength(EMAIL_THREAD_PAGE_SIZE);

    // O total vem do servidor e a paginação anuncia o conjunto completo.
    expect(
      screen.getByText(`Página 1 de ${Math.ceil(1738 / EMAIL_THREAD_PAGE_SIZE)} · 1738 emails`)
    ).toBeInTheDocument();
  });

  it('abre no rótulo INBOX e manda a pasta/busca ao servidor, sem reler a caixa', async () => {
    const { records, client } = setup(1738);
    renderView(client);
    await waitFor(() =>
      expect(screen.getAllByTestId('thread-item')).toHaveLength(EMAIL_THREAD_PAGE_SIZE)
    );

    expect(records.list).toContain('contains(label_ids,["INBOX"])');

    fireEvent.change(screen.getByPlaceholderText('Buscar emails...'), {
      target: { value: 'parceria' },
    });
    await waitFor(() =>
      expect(
        records.list.some((entry) => entry.startsWith('or(') && entry.includes('parceria'))
      ).toBe(true)
    );

    // Cada nova consulta também é uma única página.
    expect(
      listRanges(records).every((entry) => entry === `range(0,${EMAIL_THREAD_PAGE_SIZE - 1})`)
    ).toBe(true);
  });

  it('trocar de pasta troca o filtro no servidor e não acumula páginas na memória', async () => {
    const { records, client } = setup(1738);
    renderView(client);
    await waitFor(() =>
      expect(screen.getAllByTestId('thread-item')).toHaveLength(EMAIL_THREAD_PAGE_SIZE)
    );

    fireEvent.click(screen.getByRole('button', { name: /spam/i }));
    await waitFor(() => expect(records.list).toContain('contains(label_ids,["SPAM"])'));
    expect(
      listRanges(records).every((entry) => entry === `range(0,${EMAIL_THREAD_PAGE_SIZE - 1})`)
    ).toBe(true);
  });

  it('filtro de status vira cláusula do servidor, não filtro do array da página', async () => {
    const { records, client } = setup(1738);
    renderView(client);
    await waitFor(() =>
      expect(screen.getAllByTestId('thread-item')).toHaveLength(EMAIL_THREAD_PAGE_SIZE)
    );

    fireEvent.click(screen.getByRole('button', { name: 'Arquivado' }));
    await waitFor(() => expect(records.list).toContain('eq(status,"archived")'));
    expect(
      listRanges(records).every((entry) => entry === `range(0,${EMAIL_THREAD_PAGE_SIZE - 1})`)
    ).toBe(true);
  });

  it('próxima página pede a fatia seguinte ao servidor', async () => {
    const { records, client } = setup(1738);
    renderView(client);
    await waitFor(() =>
      expect(screen.getAllByTestId('thread-item')).toHaveLength(EMAIL_THREAD_PAGE_SIZE)
    );

    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    await waitFor(() =>
      expect(records.list).toContain(
        `range(${EMAIL_THREAD_PAGE_SIZE},${2 * EMAIL_THREAD_PAGE_SIZE - 1})`
      )
    );
    expect(listRanges(records).filter((entry) => entry.startsWith('range(1000,'))).toHaveLength(0);
  });
});
