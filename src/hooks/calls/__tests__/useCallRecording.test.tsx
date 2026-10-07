import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TEL-RECORDING-001 (refazer): o contrato da Edge `get-call-recording` e POST com JSON no
 * corpo e os headers de `edgeAuthHeaders()` (apikey + bearer da sessao) mais Content-Type.
 *
 * O mock aqui NAO e de `functions.invoke`: e o `FunctionsClient` REAL do SDK instalado,
 * com `customFetch` apontando para `fetchDaEdge`. Assim o teste observa o que de fato sai
 * na requisicao (metodo, URL, headers, body serializado) - se o hook montasse GET ou
 * pusesse `callId` na query string, as assercoes ficam vermelhas. `@/lib/edgeAuthHeaders`
 * NAO e mockado: ele roda de verdade e monta `apikey`/`Authorization` a partir da sessao
 * sintetica abaixo (nunca credencial real).
 */
const fetchDaEdge = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', async () => {
  const { FunctionsClient } = await import('@supabase/functions-js');
  return {
    SUPABASE_ANON_KEY: 'anon-key-do-teste',
    supabase: {
      auth: {
        getSession: async () => ({
          data: { session: { access_token: 'jwt-do-usuario-teste' } },
        }),
      },
      functions: new FunctionsClient('http://projeto-teste.local/functions/v1', {
        customFetch: fetchDaEdge,
      }),
    },
  };
});

import { useCallRecording } from '../useCallRecording';

const respostaJson = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const criarWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
};

describe('useCallRecording — contrato de transporte da Edge (TEL-RECORDING-001)', () => {
  beforeEach(() => {
    fetchDaEdge
      .mockReset()
      .mockResolvedValue(respostaJson({ url: 'https://edge.local/gravacao-1.mp3' }));
  });

  it('nao chama a Edge quando a chamada nao tem gravacao', () => {
    renderHook(() => useCallRecording('call-sem-gravacao', 'none'), { wrapper: criarWrapper() });

    expect(fetchDaEdge).not.toHaveBeenCalled();
  });

  it('preserva POST com auth + Content-Type e JSON { callId } no corpo, sem callId na URL', async () => {
    const { result } = renderHook(() => useCallRecording('call-json-1', 'available'), {
      wrapper: criarWrapper(),
    });
    await waitFor(() => expect(result.current.disponivel).toBe(true));

    expect(fetchDaEdge).toHaveBeenCalledTimes(1);
    const [urlAtingida, init] = fetchDaEdge.mock.calls[0] as [string, RequestInit];

    // Metodo: POST explicito; prova negativa - qualquer troca para GET reprova aqui.
    expect(init.method).toBe('POST');
    expect(init.method).not.toBe('GET');

    // URL: a funcao e o caminho; callId NUNCA vai em query string nem em URL de GET.
    expect(String(urlAtingida).endsWith('/get-call-recording')).toBe(true);
    expect(new URL(urlAtingida).search).toBe('');
    expect(String(urlAtingida)).not.toContain('callId');
    expect(String(urlAtingida)).not.toMatch(/callId=/);
    expect(String(urlAtingida)).not.toContain('call-json-1');

    // Headers: edgeAuthHeaders REAL (apikey + bearer da sessao) mais Content-Type JSON.
    expect(init.headers).toMatchObject({
      apikey: 'anon-key-do-teste',
      Authorization: 'Bearer jwt-do-usuario-teste',
      'Content-Type': 'application/json',
    });

    // Corpo: o SDK serializou o objeto { callId } como JSON de verdade.
    expect(init.body).toBe('{"callId":"call-json-1"}');
    expect(JSON.parse(init.body as string)).toEqual({ callId: 'call-json-1' });
  });

  it('mantem o retorno original { disponivel, url, buscando } - sem campo blob', async () => {
    const { result } = renderHook(() => useCallRecording('call-retorno', 'available'), {
      wrapper: criarWrapper(),
    });
    await waitFor(() => expect(result.current.disponivel).toBe(true));

    expect(result.current.url).toBe('https://edge.local/gravacao-1.mp3');
    expect('blob' in result.current).toBe(false);
    expect(Object.keys(result.current).sort()).toEqual(['buscando', 'disponivel', 'url']);
  });

  it('erro da Edge nao vira gravacao disponivel: o unico caminho segue sendo if (error) throw error', async () => {
    fetchDaEdge.mockReset().mockResolvedValue(respostaJson({ message: 'boom' }, 500));

    const { result } = renderHook(() => useCallRecording('call-erro', 'available'), {
      wrapper: criarWrapper(),
    });
    await waitFor(() => expect(result.current.buscando).toBe(false));

    expect(result.current.disponivel).toBe(false);
    expect(result.current.url).toBeNull();
  });
});
