/**
 * OTH-005 (item 145, P2) — a lista de Email filtrava e paginava em memória:
 * useGmail coletava TODAS as páginas da conta (range/offset até 50 mil linhas) e a
 * UI recortava 20 itens depois de filtrar o array. Este teste fixa o contrato novo:
 * filtros (estado, pasta/marcador, período, anexos, busca) e a página vão ao servidor,
 * e a consulta busca SOMENTE uma página.
 *
 * Enquanto o defeito existia, este arquivo falhava: a consulta da lista pedia
 * `.range(0, 999)` e nenhum filtro de estado/pasta/busca era emitido.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { callGmailFunction } from '@/hooks/gmail/gmailApi';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/hooks/gmail/gmailApi');
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('@/lib/gmailOAuth', () => ({ createGmailOAuthState: vi.fn(() => 'state'), storeGmailOAuthReturnContext: vi.fn() }));
vi.mock('@/hooks/system/useNavigationHistory', () => ({ RESERVED_HASHES: new Set(['main-content']) }));

import { useGmail } from '../useGmail';
import { EMAIL_THREAD_DEFAULT_FILTERS, EMAIL_THREAD_PAGE_SIZE } from '@/lib/emailThreadQuery';

const MOCK_ACCOUNT = {
  id: 'acc1', email_address: 'user@example.com', is_active: true, sync_status: 'synced' as const,
  last_sync_at: null, last_error: null, created_at: '2024-01-01T00:00:00Z',
};

function makeThread(id: string) {
  return {
    id, gmail_account_id: 'acc1', gmail_thread_id: `g-${id}`, contact_id: null, subject: `Assunto ${id}`,
    snippet: 'trecho', label_ids: [], message_count: 1, is_unread: true, is_starred: false, is_important: false,
    last_message_at: '2026-09-06T10:00:00Z', last_from_name: 'Maria', last_from_address: 'maria@exemplo.com',
    assigned_to: null, status: 'open' as const, priority: 'medium' as const, tags: [],
    created_at: '2026-09-06T00:00:00Z', updated_at: '2026-09-06T00:00:00Z', contact: undefined,
  };
}

type Records = { list: string[]; count: string[]; other: string[] };

/**
 * Builder falso que registra cada chamada. A chamada de `select` decide o balde: as
 * contagens de cabeçalho (`select('id', { count, head })`) caem em `count`, a consulta
 * da lista em `list` — assim as asserções falam só da consulta paginada.
 */
function makeRecordingChain(records: Records, rows: unknown[], total: number | null) {
  const payload = () => ({ data: rows, error: null, count: total });
  let bucket: string[] = records.other;
  const chain: Record<string, unknown> = {
    select: (columns: string, options?: unknown) => {
      const head = Boolean(options && (options as { head?: boolean }).head);
      bucket = head ? records.count : records.list;
      bucket.push(`select(${columns}${options ? `,${JSON.stringify(options)}` : ''})`);
      return chain;
    },
    eq: (column: string, value: unknown) => { bucket.push(`eq(${column},${JSON.stringify(value)})`); return chain; },
    contains: (column: string, value: unknown) => { bucket.push(`contains(${column},${JSON.stringify(value)})`); return chain; },
    gte: (column: string, value: unknown) => { bucket.push(`gte(${column},${JSON.stringify(value)})`); return chain; },
    or: (filters: string) => { bucket.push(`or(${filters})`); return chain; },
    order: (column: string) => { bucket.push(`order(${column})`); return chain; },
    in: () => Promise.resolve({ data: [], error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    range: (from: number, to: number) => { bucket.push(`range(${from},${to})`); return Promise.resolve(payload()); },
    limit: (value: number) => { bucket.push(`limit(${value})`); return Promise.resolve(payload()); },
  };
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(payload()).then(resolve);
  return chain;
}

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
}

function setup(threads: unknown[]): Records {
  const records: Records = { list: [], count: [], other: [] };
  vi.mocked(callGmailFunction).mockResolvedValue({ accounts: [MOCK_ACCOUNT] });
  vi.mocked(supabase.from).mockImplementation((table: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    makeRecordingChain(records, table === 'email_threads' ? threads : [], threads.length) as any);
  return records;
}

async function renderList(query: Parameters<typeof useGmail>[2]) {
  const rendered = renderHook(() => useGmail('acc1', null, query), { wrapper: createWrapper() });
  await waitFor(() => expect(rendered.result.current.activeAccount).toBeDefined());
  await waitFor(() => expect(rendered.result.current.threadsLoading).toBe(false));
  return rendered;
}

describe('useGmail — consulta da lista de threads (OTH-005)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.channel).mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() } as unknown as ReturnType<typeof supabase.channel>);
  });

  it('manda os filtros ao servidor e busca somente a página pedida', async () => {
    const records = setup([makeThread('t1'), makeThread('t2')]);
    const query = {
      ...EMAIL_THREAD_DEFAULT_FILTERS, filter: 'unread' as const, labelId: 'INBOX', period: '7d' as const,
      search: 'maria', page: 2,
    };

    const { result } = await renderList(query);

    expect(records.list).toContain('eq(gmail_account_id,"acc1")');
    expect(records.list).toContain('eq(is_unread,true)');
    expect(records.list).toContain('contains(label_ids,["INBOX"])');
    expect(records.list.some(entry => entry.startsWith('gte(last_message_at,'))).toBe(true);
    expect(records.list.some(entry => entry.startsWith('or(') && entry.includes('maria'))).toBe(true);

    // Uma página só: nenhuma coleta em série de páginas de 1.000 linhas.
    const ranges = records.list.filter(entry => entry.startsWith('range('));
    expect(ranges).toEqual([`range(${(2 - 1) * EMAIL_THREAD_PAGE_SIZE},${2 * EMAIL_THREAD_PAGE_SIZE - 1})`]);
    expect(records.list).not.toContain('range(0,999)');
    expect(records.list).not.toContain('limit(1000)');
    expect(result.current.threads).toHaveLength(2);
  });

  it('filtro de anexos é aplicado no join do servidor, não sobre a página', async () => {
    const records = setup([makeThread('t1')]);
    const { result } = await renderList({ ...EMAIL_THREAD_DEFAULT_FILTERS, hasAttachments: true, page: 1 });

    expect(records.list.some(entry => entry.startsWith('select(') && entry.includes('email_messages!inner'))).toBe(true);
    expect(records.list).toContain('eq(email_messages.has_attachments,true)');
    expect(records.list).toContain(`range(0,${EMAIL_THREAD_PAGE_SIZE - 1})`);
    expect(result.current.threads).toHaveLength(1);
  });

  it('total da paginação vem da contagem do servidor para o mesmo filtro', async () => {
    const records = setup([makeThread('t1')]);
    const { result } = await renderList({ ...EMAIL_THREAD_DEFAULT_FILTERS, page: 1 });

    expect(records.list).toContain(`range(0,${EMAIL_THREAD_PAGE_SIZE - 1})`);
    expect(result.current.threads).toHaveLength(1);
    expect(result.current.threadsTotalCount).toBe(1);
  });
});
