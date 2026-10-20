/**
 * SEC-FRONTEND-03 — o rascunho de conversa do Inbox é do usuário que saiu: no
 * `SIGNED_OUT` ele tem de sair junto dos rascunhos de e-mail, senão o próximo
 * login na mesma máquina herda o texto de quem saiu. O `AuthProvider` real é
 * montado e o evento é disparado pelo mesmo caminho que o Supabase usa.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useAuth, AuthProvider } from '../useAuth';
import { INBOX_DRAFT_KEY_PREFIX } from '@/lib/inboxDraftSession';

const harness = vi.hoisted(() => ({
  assinantes: [] as Array<(event: string, session: unknown) => void>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      refreshSession: vi.fn(),
      setSession: vi.fn(),
      signOut: vi.fn(),
      onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
        harness.assinantes.push(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
    from: vi.fn(),
  },
}));

describe('AuthProvider — rascunho de conversa do Inbox no logout (SEC-FRONTEND-03)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    harness.assinantes.length = 0;
    localStorage.clear();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it('esvazia o rascunho do Inbox quando o Supabase emite SIGNED_OUT', async () => {
    const chave = `${INBOX_DRAFT_KEY_PREFIX}atendente-a:contato-x`;
    localStorage.setItem(chave, 'texto do atendente A');
    // Preferência do operador: não é rascunho, tem de sobreviver à limpeza.
    localStorage.setItem('zapp.inbox.files.view:atendente-a', '{"v":1}');

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );

    renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(harness.assinantes.length).toBeGreaterThan(0));

    await act(async () => {
      harness.assinantes.forEach((cb) => cb('SIGNED_OUT', null));
    });

    expect(localStorage.getItem(chave)).toBeNull();
    expect(localStorage.getItem('zapp.inbox.files.view:atendente-a')).toBe('{"v":1}');
  });
});
