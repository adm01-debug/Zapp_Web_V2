import { vi } from 'vitest';

// Chainable query builder mock.
//
// The real PostgREST builder is a promise: `await supabase.from(...).select()...`
// resolves to `{ data, error }`. We reproduce that by backing the mock with a
// resolved Promise instead of hand-rolling a `then` method on a plain object —
// a plain object with `then` becomes thenable and silently hijacks `await`.
export function createQueryBuilder(resolvedData: unknown = [], resolvedError: unknown = null) {
  const result = { data: resolvedData, error: resolvedError };

  const builder: any = Object.assign(Promise.resolve(result), {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
  });

  return builder;
}

export function createMockSupabase(overrides: Record<string, any> = {}) {
  const mockAuth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signUp: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    ...overrides.auth,
  };

  const mockFrom = vi.fn().mockImplementation((table: string) => {
    if (overrides.tables && overrides.tables[table]) {
      return createQueryBuilder(overrides.tables[table].data, overrides.tables[table].error);
    }
    return createQueryBuilder();
  });

  const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });

  const mockChannel = vi.fn().mockReturnValue({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  });

  return {
    auth: mockAuth,
    from: mockFrom,
    rpc: mockRpc,
    channel: mockChannel,
  };
}

export const mockSupabase = createMockSupabase();
