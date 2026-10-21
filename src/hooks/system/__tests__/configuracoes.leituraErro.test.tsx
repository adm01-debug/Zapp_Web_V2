/**
 * C-1 — erro de leitura das configurações era invisível: o hook de alertas
 * devolvia os padrões como se fossem a configuração gravada (engolia o erro) e
 * o de settings gerais não expunha nenhum sinal de falha. O usuário via números
 * que não são os dele e podia salvar por cima.
 *
 * Prova: com a leitura falhando, os dois hooks expõem isError, mantêm os
 * padrões (não os descartam em silêncio) e mostram UM aviso destrutivo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children?: React.ReactNode }) => children,
}));

const mockToast = vi.fn();
vi.mock('@/hooks/ui/use-toast', () => ({
  toast: (...args: unknown[]) => mockToast(...args),
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { useUserSettings } from '@/hooks/system/useUserSettings';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const ERRO = { message: 'permission denied for table user_settings', code: '42501' };

describe('configurações — falha de leitura fica visível', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: ERRO }) }) }),
    });
  });

  it('useNotificationSettings expõe isError, mantém os padrões e avisa', async () => {
    const { result } = renderHook(() => useNotificationSettings(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.settings.soundEnabled).toBe(true);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive' }),
    );
  });

  it('useUserSettings expõe isError, mantém os padrões e avisa', async () => {
    const { result } = renderHook(() => useUserSettings(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.settings.theme).toBe('system');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive' }),
    );
  });
});
