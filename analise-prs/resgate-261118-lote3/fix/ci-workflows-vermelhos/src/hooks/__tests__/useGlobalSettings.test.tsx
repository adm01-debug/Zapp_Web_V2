import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const mockFrom = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() }, createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }) }));

import { useGlobalSettings } from '@/hooks/system/useGlobalSettings';

// O hook lê do cache do React Query (configuração compartilhada): cada teste renderiza
// com o próprio QueryClient, como o AppProviders monta na aplicação.
function renderGlobalSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useGlobalSettings(), { wrapper });
}

describe('useGlobalSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [
          { id: 's1', key: 'theme', value: 'dark', description: 'App theme' },
          { id: 's2', key: 'language', value: 'pt-BR', description: 'Language' },
        ], error: null }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 's3', key: 'new', value: 'val' }, error: null }),
        }),
      }),
    });
  });

  it('fetches global settings', async () => {
    const { result } = renderGlobalSettings();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFrom).toHaveBeenCalledWith('global_settings');
  });

  it('exposes getSetting function', async () => {
    const { result } = renderGlobalSettings();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(typeof result.current.getSetting).toBe('function');
  });

  it('exposes updateSetting function', () => {
    const { result } = renderGlobalSettings();
    expect(typeof result.current.updateSetting).toBe('function');
  });

  it('exposes addSetting function', () => {
    const { result } = renderGlobalSettings();
    expect(typeof result.current.addSetting).toBe('function');
  });

  it('getSetting returns null for unknown key', async () => {
    const { result } = renderGlobalSettings();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.getSetting('nonexistent')).toBeNull();
  });
});
