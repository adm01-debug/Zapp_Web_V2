/**
 * As configurações globais vêm de UMA consulta compartilhada.
 *
 * Antes, cada `useGlobalSettings()` guardava a lista em estado próprio (`useState`):
 * dois componentes montados na mesma tela (GlobalSettingsSection e
 * IntegrationKeysSection, por exemplo) disparavam DUAS consultas e, quando um
 * alterava uma chave, o outro continuava exibindo o valor antigo até recarregar a
 * página — a tela mostrava duas verdades diferentes.
 *
 * Aqui o hook REAL é exercitado: só o cliente Supabase (a fonte do dado) e o logger
 * são trocados. O `order` é o contador de consultas de leitura, e o QueryClient é o
 * mesmo para as duas instâncias (cache de aplicação, como no AppProviders).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockOrder = vi.hoisted(() => vi.fn());
const mockSelectAposUpdate = vi.hoisted(() => vi.fn());
const mockEq = vi.hoisted(() => vi.fn(() => ({ select: mockSelectAposUpdate })));
const mockUpdate = vi.hoisted(() => vi.fn(() => ({ eq: mockEq })));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ order: mockOrder })),
      update: mockUpdate,
    })),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

import { useGlobalSettings } from '@/hooks/system/useGlobalSettings';

const linhas = [
  { id: 's1', key: 'theme', value: 'dark', description: 'Tema', updated_by: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
  { id: 's2', key: 'language', value: 'pt-BR', description: 'Idioma', updated_by: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
];

function criarWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 5 * 60 * 1000 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEq.mockReturnValue({ select: mockSelectAposUpdate });
  mockOrder.mockResolvedValue({ data: linhas, error: null });
});

describe('useGlobalSettings — configurações compartilhadas', () => {
  it('duas instâncias montadas juntas leem a mesma lista com UMA consulta', async () => {
    const wrapper = criarWrapper();

    const primeira = renderHook(() => useGlobalSettings(), { wrapper });
    await waitFor(() => expect(primeira.result.current.isLoading).toBe(false));
    expect(primeira.result.current.getSetting('theme')).toBe('dark');

    // A segunda instância encontra o dado no cache: não repassa o carregando
    // e não faz uma segunda ida ao banco.
    const segunda = renderHook(() => useGlobalSettings(), { wrapper });
    expect(segunda.result.current.isLoading).toBe(false);
    expect(segunda.result.current.getSetting('theme')).toBe('dark');
    expect(mockOrder).toHaveBeenCalledTimes(1);
  });

  it('atualizar em uma instância reflete na outra, sem nova consulta', async () => {
    mockSelectAposUpdate.mockResolvedValue({ data: [{ key: 'theme' }], error: null });
    const wrapper = criarWrapper();

    const primeira = renderHook(() => useGlobalSettings(), { wrapper });
    const segunda = renderHook(() => useGlobalSettings(), { wrapper });
    await waitFor(() => expect(primeira.result.current.isLoading).toBe(false));
    await waitFor(() => expect(segunda.result.current.isLoading).toBe(false));

    await act(async () => {
      await primeira.result.current.updateSetting('theme', 'light');
    });

    await waitFor(() => expect(segunda.result.current.getSetting('theme')).toBe('light'));
    expect(primeira.result.current.getSetting('theme')).toBe('light');
    expect(mockOrder).toHaveBeenCalledTimes(1);
  });
});
