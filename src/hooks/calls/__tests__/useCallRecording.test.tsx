import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
const edgeAuthHeadersMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn() },
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
  },
}));

vi.mock('@/lib/edgeAuthHeaders', () => ({
  edgeAuthHeaders: () => edgeAuthHeadersMock(),
}));

import { useCallRecording } from '../useCallRecording';

const criarWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
};

describe('useCallRecording — contrato de transporte da Edge', () => {
  beforeEach(() => {
    invoke.mockReset().mockResolvedValue({ data: { url: 'https://edge.test/audio.mp3' }, error: null });
    edgeAuthHeadersMock.mockReset().mockResolvedValue({
      apikey: 'anon-teste',
      Authorization: 'Bearer usuario-teste',
    });
  });

  it('nao chama a Edge quando a chamada nao tem gravacao disponivel', () => {
    renderHook(() => useCallRecording('call-sem-gravacao', 'none'), { wrapper: criarWrapper() });

    expect(edgeAuthHeadersMock).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('preserva POST com headers de autenticacao e JSON no corpo, sem callId na query string', async () => {
    const { result } = renderHook(() => useCallRecording('call-json-1', 'available'), {
      wrapper: criarWrapper(),
    });

    await waitFor(() => expect(result.current.disponivel).toBe(true));

    expect(result.current.url).toBeNull();
    expect(result.current.blob).toBeInstanceOf(Blob);
    expect(edgeAuthHeadersMock).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(
      'get-call-recording',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          apikey: 'anon-teste',
          Authorization: 'Bearer usuario-teste',
          'Content-Type': 'application/json',
        }),
        body: { callId: 'call-json-1' },
      }),
    );

    const [functionName, options] = invoke.mock.calls[0] as [string, { method?: string; body?: unknown }];
    expect(functionName).toBe('get-call-recording');
    expect(options.method).not.toBe('GET');
    expect(JSON.stringify(options.body)).toBe(JSON.stringify({ callId: 'call-json-1' }));
    expect(JSON.stringify(options)).not.toContain('?callId=');
    expect(JSON.stringify(options)).not.toContain('call-json-1&');
  });
});
