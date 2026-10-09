import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { useEmailThreadForContact } from '../useEmailThreadForContact';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

const ACCOUNT = 'acc-1';
const CONTACT = '123e4567-e89b-42d3-a456-426614174000';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

/** Cadeia de query do supabase com os filtros registrados para asserção. */
function makeChain(result: { data: unknown; error: unknown }) {
  const calls = { table: '', eq: [] as Array<[string, unknown]>, order: [] as Array<[string, unknown]>, limit: 0 };
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((col: string, val: unknown) => { calls.eq.push([col, val]); return chain; }),
    order: vi.fn((col: string, opts: unknown) => { calls.order.push([col, opts]); return chain; }),
    limit: vi.fn((n: number) => { calls.limit = n; return Promise.resolve(result); }),
  };
  return { chain, calls };
}

describe('useEmailThreadForContact', () => {
  beforeEach(() => vi.clearAllMocks());

  it('found: devolve o id da conversa mais recente do contato na conta', async () => {
    const { chain, calls } = makeChain({ data: [{ id: 'thread-9' }], error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(supabase.from).mockImplementation(((table: string) => { calls.table = table; return chain; }) as any);

    const { result } = renderHook(() => useEmailThreadForContact(ACCOUNT, CONTACT), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.status).toBe('found'));
    expect(result.current.threadId).toBe('thread-9');
    // A consulta real filtra conta + contato e ordena pela mais recente.
    expect(calls.table).toBe('email_threads');
    expect(calls.eq).toEqual([['gmail_account_id', ACCOUNT], ['contact_id', CONTACT]]);
    expect(calls.order[0]).toEqual(['last_message_at', { ascending: false }]);
    expect(calls.limit).toBe(1);
  });

  it('none: sem conversa do contato devolve none e threadId nulo', async () => {
    const { chain } = makeChain({ data: [], error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(supabase.from).mockImplementation((() => chain) as any);

    const { result } = renderHook(() => useEmailThreadForContact(ACCOUNT, CONTACT), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.status).toBe('none'));
    expect(result.current.threadId).toBeNull();
  });

  it('error: falha da consulta devolve error', async () => {
    const { chain } = makeChain({ data: null, error: new Error('boom') });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(supabase.from).mockImplementation((() => chain) as any);

    const { result } = renderHook(() => useEmailThreadForContact(ACCOUNT, CONTACT), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.threadId).toBeNull();
  });

  it('sem conta ou contato não consulta o banco e devolve none', async () => {
    const { result } = renderHook(() => useEmailThreadForContact(undefined, CONTACT), { wrapper: createWrapper() });
    const semContato = renderHook(() => useEmailThreadForContact(ACCOUNT, null), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.status).toBe('none');
      expect(semContato.result.current.status).toBe('none');
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
