import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: authMocks.getSession,
      refreshSession: authMocks.refreshSession,
      onAuthStateChange: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    from: authMocks.from,
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { warn: vi.fn() },
}));

import { AuthService } from '@/services/auth.service';

describe('AuthService session freshness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deduplicates concurrent reads but does not cache a resolved session forever', async () => {
    let resolveFirst!: (value: unknown) => void;
    authMocks.getSession
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ data: { session: { access_token: 'fresh' } }, error: null });

    const first = AuthService.getSession();
    const concurrent = AuthService.getSession();
    expect(authMocks.getSession).toHaveBeenCalledTimes(1);
    resolveFirst({ data: { session: { access_token: 'initial' } }, error: null });
    await expect(Promise.all([first, concurrent])).resolves.toHaveLength(2);

    await AuthService.getSession();
    expect(authMocks.getSession).toHaveBeenCalledTimes(2);
  });

  it('refreshes once and retries a profile query after an expired JWT', async () => {
    const maybeSingle = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } })
      .mockResolvedValueOnce({ data: { id: 'profile-1' }, error: null });
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    authMocks.from.mockReturnValue(query);
    authMocks.refreshSession.mockResolvedValue({
      data: { session: { access_token: 'fresh' } },
      error: null,
    });

    await expect(AuthService.fetchProfile('user-1')).resolves.toMatchObject({ id: 'profile-1' });
    expect(authMocks.refreshSession).toHaveBeenCalledTimes(1);
    expect(maybeSingle).toHaveBeenCalledTimes(2);
  });
});
