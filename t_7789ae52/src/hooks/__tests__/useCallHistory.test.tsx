import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

function makeCallsQueryBuilder({ historyResult = { data: [], error: null }, statsResult = { data: [], error: null } } = {}) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    or: vi.fn(() => builder),
    is: vi.fn(() => builder),
    not: vi.fn(() => builder),
    in: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve({ data: [{ id: 'contact-1' }], error: null })),
    order: vi.fn(() => builder),
    range: vi.fn(() => Promise.resolve(historyResult)),
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => Promise.resolve(statsResult).then(resolve, reject),
  };
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(() => makeCallsQueryBuilder()) },
}));

import { useCallHistory } from '../communication/useCallHistory';
import { supabase } from '@/integrations/supabase/client';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useCallHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(makeCallsQueryBuilder());
  });

  it('does not query when there is no signed-in profile', () => {
    renderHook(() => useCallHistory(undefined), { wrapper });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('applies direction, channel and result filters to both queries', async () => {
    const builder = makeCallsQueryBuilder();
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(builder);

    renderHook(() => useCallHistory('profile-1', { direction: 'inbound', channel: 'whatsapp', result: 'ended_answered' }), { wrapper });

    await waitFor(() => expect(builder.range).toHaveBeenCalled());

    expect(builder.eq).toHaveBeenCalledWith('direction', 'inbound');
    expect(builder.not).toHaveBeenCalledWith('whatsapp_connection_id', 'is', null);
    expect(builder.eq).toHaveBeenCalledWith('status', 'ended');
    expect(builder.not).toHaveBeenCalledWith('answered_at', 'is', null);
  });

  it('resolves a search term to contact ids and scopes calls to them', async () => {
    const builder = makeCallsQueryBuilder();
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(builder);

    renderHook(() => useCallHistory('profile-1', { search: 'Maria' }), { wrapper });

    await waitFor(() => expect(builder.in).toHaveBeenCalledWith('contact_id', ['contact-1']));
  });

  it('short-circuits to an empty page when the search matches no contact', async () => {
    const builder = makeCallsQueryBuilder();
    builder.limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(builder);

    const { result } = renderHook(() => useCallHistory('profile-1', { search: 'Ninguem' }), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.calls).toEqual([]);
    expect(builder.range).not.toHaveBeenCalled();
  });
});
