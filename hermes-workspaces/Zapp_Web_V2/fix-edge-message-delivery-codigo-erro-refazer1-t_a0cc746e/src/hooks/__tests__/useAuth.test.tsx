import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth, AuthProvider } from '../auth/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { SignInResult } from '@/services/auth.service';
import React from 'react';

const mockServerLogin = vi.hoisted(() => vi.fn());

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      setSession: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

vi.mock('@/lib/serverLogin', () => ({
  serverLogin: (...args: unknown[]) => mockServerLogin(...args),
}));

describe('useAuth hook', () => {
  // Uma instancia por teste: recriar o client a cada render do wrapper jogaria
  // fora o cache em qualquer re-render e mascararia o efeito do queryClient.clear().
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.auth.setSession).mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  // AuthProvider limpa o cache do react-query no SIGNED_OUT, entao precisa do
  // QueryClientProvider por volta — igual a AppProviders.
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );

  it('initializes with loading state', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null }, error: null } as never);
    
    const { result } = renderHook(() => useAuth(), { wrapper });
    
    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBeNull();
  });

  it('handles sign in successfully', async () => {
    mockServerLogin.mockResolvedValue({
      ok: true,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    
    let response: SignInResult | undefined;
    await act(async () => {
      response = await result.current.signIn('test@test.com', 'password123');
    });
    
    expect(mockServerLogin).toHaveBeenCalledWith('test@test.com', 'password123');
    expect(supabase.auth.setSession).toHaveBeenCalledWith({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    });
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(response?.error).toBeNull();
  });

  it('handles sign out', async () => {
    vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null } as never);

    const { result } = renderHook(() => useAuth(), { wrapper });
    
    await act(async () => {
      await result.current.signOut();
    });
    
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });
});
