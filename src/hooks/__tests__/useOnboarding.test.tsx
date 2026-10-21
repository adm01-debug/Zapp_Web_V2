import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children?: import("react").ReactNode }) => children,
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn() },
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn() }),
}));

import { useOnboarding, onboardingStatusQueryKey } from '@/hooks/ui/useOnboarding';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
}

/** Cada teste usa o MESMO client para todas as instâncias — é o cache compartilhado. */
function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/** Resposta da leitura da coluna `user_settings.onboarding_completed`. */
function mockRead(onboardingCompleted: boolean | null, opts: { reject?: boolean } = {}) {
  const maybeSingle = opts.reject
    ? vi.fn().mockRejectedValue(new Error('DB error'))
    : vi.fn().mockResolvedValue({
        data: onboardingCompleted === null ? null : { onboarding_completed: onboardingCompleted },
        error: null,
      });
  const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) });
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: updateEq });
  const upsert = vi.fn().mockResolvedValue({ error: null });
  mockFrom.mockReturnValue({ select, upsert, update });
  return { select, maybeSingle, upsert, update, updateEq };
}

describe('useOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('returns loading=false e status null quando não há usuário', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useOnboarding(), { wrapper: createWrapper(createQueryClient()) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasCompletedOnboarding).toBeNull();
  });

  it('lê a coluna onboarding_completed do banco (true = tour já concluído)', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    const { select } = mockRead(true);

    const { result } = renderHook(() => useOnboarding(), { wrapper: createWrapper(createQueryClient()) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasCompletedOnboarding).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('user_settings');
    expect(select).toHaveBeenCalledWith('onboarding_completed');
  });

  it('sem linha em user_settings o tour não foi concluído (false)', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockRead(null);

    const { result } = renderHook(() => useOnboarding(), { wrapper: createWrapper(createQueryClient()) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasCompletedOnboarding).toBe(false);
  });

  // Outro dispositivo: o localStorage dele não tem nada; mesmo que estivesse
  // desatualizado ('true'), a coluna é a fonte da verdade e o tour deve aparecer.
  it('outro dispositivo: coluna false vence o localStorage desatualizado', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    localStorage.setItem('onboarding_completed_u1', 'true');
    mockRead(false);

    const { result } = renderHook(() => useOnboarding(), { wrapper: createWrapper(createQueryClient()) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasCompletedOnboarding).toBe(false);
  });

  it('falha ao ler o banco não cobre a tela com o tour (default concluído)', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockRead(null, { reject: true });

    const { result } = renderHook(() => useOnboarding(), { wrapper: createWrapper(createQueryClient()) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasCompletedOnboarding).toBe(true);
  });

  it('concluir grava onboarding_completed=true na coluna e cria a linha ausente', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    const { upsert } = mockRead(false);

    const { result } = renderHook(() => useOnboarding(), { wrapper: createWrapper(createQueryClient()) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.completeOnboarding());

    // O react-query notifica os assinantes num microtask, daí o waitFor.
    await waitFor(() => expect(result.current.hasCompletedOnboarding).toBe(true));
    await waitFor(() =>
      expect(upsert).toHaveBeenCalledWith(
        { user_id: 'u1', onboarding_completed: true },
        { onConflict: 'user_id' },
      ),
    );
  });

  it('mantém a conclusão quando a gravação no banco falha', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    const { upsert } = mockRead(false);
    upsert.mockRejectedValue(new Error('db offline'));

    const { result } = renderHook(() => useOnboarding(), { wrapper: createWrapper(createQueryClient()) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.completeOnboarding());

    await waitFor(() => expect(result.current.hasCompletedOnboarding).toBe(true));
  });

  it('reiniciar faz UPDATE onboarding_completed=false e o tour volta na hora', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    const { update, updateEq } = mockRead(true);

    const { result } = renderHook(() => useOnboarding(), { wrapper: createWrapper(createQueryClient()) });
    await waitFor(() => expect(result.current.hasCompletedOnboarding).toBe(true));

    act(() => result.current.resetOnboarding());

    await waitFor(() => expect(result.current.hasCompletedOnboarding).toBe(false));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({ onboarding_completed: false }),
    );
    expect(updateEq).toHaveBeenCalledWith('user_id', 'u1');
  });

  // O defeito do cartão: o estado vivia só na instância (Index × Configurações),
  // então reiniciar em uma não reaparecia o overlay da outra sem recarregar.
  it('reiniciar propaga para as outras instâncias do hook sem recarregar', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockRead(true);
    const queryClient = createQueryClient();

    const { result } = renderHook(
      () => ({ config: useOnboarding(), shell: useOnboarding() }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.shell.hasCompletedOnboarding).toBe(true));

    act(() => result.current.config.resetOnboarding());

    await waitFor(() => expect(result.current.shell.hasCompletedOnboarding).toBe(false));
    expect(queryClient.getQueryData(onboardingStatusQueryKey('u1'))).toBe(false);
  });

  it('concluir também propaga para as outras instâncias', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockRead(false);
    const queryClient = createQueryClient();

    const { result } = renderHook(
      () => ({ config: useOnboarding(), shell: useOnboarding() }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.shell.hasCompletedOnboarding).toBe(false));

    act(() => result.current.config.completeOnboarding());

    await waitFor(() => expect(result.current.shell.hasCompletedOnboarding).toBe(true));
  });
});
