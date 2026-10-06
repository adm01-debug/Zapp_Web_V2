import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * TEL-RECORDING-001 — o corpo de audio que a Edge `get-call-recording` devolve.
 *
 * A Edge (T73) responde o PROPRIO audio (`new Response(upstream.body, ...)`) para nao expor a
 * URL assinada do provedor. O SDK resolve esse corpo pelo `Content-Type`: `application/octet-stream`
 * (e `application/pdf`) chega ao hook como `Blob`. Um 200 com corpo VAZIO chega como Blob de
 * `size === 0` - e um Blob vazio e `true` em qualquer teste de existencia, entao ele passaria
 * como gravacao valida se o hook nao olhasse o TAMANHO.
 *
 * Estes testes travam as duas pontas: corpo vazio NUNCA e gravacao, corpo com bytes continua
 * sendo. E travam tambem o limite deste cartao: transporte, headers, corpo da requisicao,
 * query string e streaming NAO mudam aqui (quem le os bytes e o que ja existia).
 *
 * Vermelho antes da correcao: o hook decidia a disponibilidade sem olhar o corpo, entao
 * `blob` nem existia no contrato (`undefined`) e o audio com bytes nunca virava gravacao valida.
 */

const functionsInvoke = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => functionsInvoke(...args) } },
}));

import { useCallRecording } from '../useCallRecording';

const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

/** Resposta do `functions.invoke` quando a Edge entrega o audio como bytes. */
const bytesDaEdge = (conteudo = 'bytes-de-audio-mp3') => ({
  data: new Blob([conteudo], { type: 'application/octet-stream' }),
  error: null,
});

describe('useCallRecording — corpo de audio vazio (TEL-RECORDING-001)', () => {
  beforeEach(() => {
    functionsInvoke.mockReset();
  });

  it('recusa Blob de audio com size 0: 200 sem bytes NAO e gravacao', async () => {
    functionsInvoke.mockResolvedValue({ data: new Blob([], { type: 'application/octet-stream' }), error: null });

    const { result } = renderHook(() => useCallRecording('c-vazia', 'available'), { wrapper });

    await waitFor(() => expect(functionsInvoke).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.buscando).toBe(false));

    expect(result.current.disponivel).toBe(false);
    expect(result.current.blob).toBeNull();
    expect(result.current.url).toBeNull();
  });

  it('corpo COM bytes continua virando gravacao valida (a recusa e do vazio, nao do Blob)', async () => {
    functionsInvoke.mockResolvedValue(bytesDaEdge());

    const { result } = renderHook(() => useCallRecording('c1', 'available'), { wrapper });

    await waitFor(() => expect(result.current.disponivel).toBe(true));

    expect(result.current.blob).toBeInstanceOf(Blob);
    expect(result.current.blob?.size).toBeGreaterThan(0);
  });

  it('nao muda o transporte: functions.invoke com o callId no corpo JSON, sem fetch e sem query string', async () => {
    functionsInvoke.mockResolvedValue(bytesDaEdge());
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    try {
      const { result } = renderHook(() => useCallRecording('c1', 'available'), { wrapper });
      await waitFor(() => expect(result.current.buscando).toBe(false));

      expect(functionsInvoke).toHaveBeenCalledTimes(1);
      const [nome, opcoes] = functionsInvoke.mock.calls[0] as [string, Record<string, unknown>];
      expect(nome).toBe('get-call-recording');
      expect(opcoes).toEqual({ body: { callId: 'c1' } });
      // Nada de streaming nem de leitura de `response`/reader: o corpo vem pelo proprio invoke.
      expect(opcoes).not.toHaveProperty('method');
      expect(opcoes).not.toHaveProperty('headers');
      expect(String(nome)).not.toContain('?');
      expect(JSON.stringify(opcoes)).not.toContain('?callId');
      // Nenhuma chamada direta a Edge: o transporte existente continua sendo o unico caminho.
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('chamada sem gravacao continua sem disparar requisicao', async () => {
    const { result } = renderHook(() => useCallRecording('c1', 'none'), { wrapper });

    await waitFor(() => expect(result.current.buscando).toBe(false));

    expect(functionsInvoke).not.toHaveBeenCalled();
    expect(result.current.disponivel).toBe(false);
    expect(result.current.blob).toBeNull();
  });
});
