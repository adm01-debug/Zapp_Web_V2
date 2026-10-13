import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TEL-RECORDING-001 — o contrato do hook com a Edge `get-call-recording` sao os BYTES do audio.
 *
 * A Edge (`supabase/functions/get-call-recording/index.ts`, T73) responde o PROPRIO audio do
 * provedor (`new Response(upstream.body, ...)`) e nunca uma URL: `recording_url` nao pode chegar
 * ao front. Quem monta o endereco `blob:` e o `RecordingPlayer`, a partir do `blob` que este hook
 * entrega - por isso o hook expoe `{ disponivel, blob, buscando }`, e nunca `url`.
 *
 * A fronteira de rede e UMA (`supabase.functions.invoke`, a API padrao da Edge no projeto) e a
 * autenticacao e a outra (`edgeAuthHeaders`); o hook e o react-query rodam de verdade. Assim o
 * teste observa a invocacao que sairia para a Edge (nome da funcao, headers e corpo) e os BYTES que
 * chegam ao consumidor. Headers e tokens sao sinteticos.
 */

const invokeDaEdge = vi.hoisted(() => vi.fn());
const headersDaEdge = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeDaEdge(...args) } },
}));

vi.mock('@/lib/edgeAuthHeaders', () => ({
  edgeAuthHeaders: (...args: unknown[]) => headersDaEdge(...args),
}));

import { useCallRecording } from '../useCallRecording';

/** Bytes com sequencias invalidas em UTF-8: se passassem pelo TEXTO da resposta, nao sobreviveriam. */
const BYTES_DE_AUDIO: Uint8Array<ArrayBuffer> = new Uint8Array([
  0xff, 0xfb, 0x90, 0x00, 0x49, 0x44, 0x33, 0x80, 0xc3, 0x28,
]);

const blobDeAudio = (tipo: string, bytes: Uint8Array<ArrayBuffer> = BYTES_DE_AUDIO) =>
  new Blob([bytes], { type: tipo });

const arrayBufferDeAudio = (bytes: Uint8Array<ArrayBuffer> = BYTES_DE_AUDIO): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

const erroHttp = (status: number) => Object.assign(new Error(`HTTP ${status}`), { context: { status } });

const criarWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
};

const estadoDaQuery = (queryClient: QueryClient, callId: string) =>
  queryClient.getQueryState(['call-recording', callId]);

describe('useCallRecording — a Edge entrega BYTES (TEL-RECORDING-001)', () => {
  beforeEach(() => {
    headersDaEdge.mockReset().mockResolvedValue({
      apikey: 'chave-publica-de-teste',
      Authorization: 'Bearer jwt-do-usuario-teste',
    });
    invokeDaEdge.mockReset().mockResolvedValue({ data: blobDeAudio('audio/mpeg'), error: null });
  });

  it('nao invoca a Edge nem monta auth quando a chamada nao tem gravacao', () => {
    const { wrapper } = criarWrapper();
    renderHook(() => useCallRecording('call-sem-gravacao', 'none'), { wrapper });

    expect(invokeDaEdge).not.toHaveBeenCalled();
    expect(headersDaEdge).not.toHaveBeenCalled();
  });

  it.each(['audio/mpeg', 'application/octet-stream'])(
    'entrega os BYTES da Edge (%s) como Blob - nunca a URL de origem',
    async (tipo) => {
      invokeDaEdge.mockResolvedValueOnce({ data: blobDeAudio(tipo), error: null });

      const { wrapper } = criarWrapper();
      const { result } = renderHook(() => useCallRecording(`call-bytes-${tipo}`, 'available'), { wrapper });

      await waitFor(() => expect(result.current.disponivel).toBe(true));

      expect(result.current.blob).toBeInstanceOf(Blob);
      expect(result.current.blob?.size).toBe(BYTES_DE_AUDIO.byteLength);
      const bytesDoBlob = new Uint8Array(await result.current.blob!.arrayBuffer());
      expect(Array.from(bytesDoBlob)).toEqual(Array.from(BYTES_DE_AUDIO));

      // O que sai do hook e so isto: o consumidor nunca recebe endereco nenhum da Edge.
      expect(Object.keys(result.current).sort()).toEqual(['blob', 'buscando', 'disponivel']);
      expect(result.current).not.toHaveProperty('url');
      expect(JSON.stringify(result.current)).not.toContain('http');
    },
  );

  it('tambem aceita ArrayBuffer da Edge e entrega Blob com os mesmos bytes', async () => {
    invokeDaEdge.mockResolvedValueOnce({ data: arrayBufferDeAudio(), error: null });

    const { wrapper } = criarWrapper();
    const { result } = renderHook(() => useCallRecording('call-array-buffer', 'available'), { wrapper });

    await waitFor(() => expect(result.current.disponivel).toBe(true));
    const bytesDoBlob = new Uint8Array(await result.current.blob!.arrayBuffer());
    expect(Array.from(bytesDoBlob)).toEqual(Array.from(BYTES_DE_AUDIO));
  });

  it('invoca a Edge por supabase.functions.invoke com edgeAuthHeaders + JSON { callId }, sem callId em URL manual', async () => {
    const { wrapper } = criarWrapper();
    const { result } = renderHook(() => useCallRecording('call-bytes-2', 'available'), { wrapper });
    await waitFor(() => expect(result.current.disponivel).toBe(true));

    expect(headersDaEdge).toHaveBeenCalledTimes(1);
    expect(invokeDaEdge).toHaveBeenCalledTimes(1);
    expect(invokeDaEdge).toHaveBeenCalledWith('get-call-recording', {
      method: 'POST',
      headers: {
        apikey: 'chave-publica-de-teste',
        Authorization: 'Bearer jwt-do-usuario-teste',
        'Content-Type': 'application/json',
      },
      body: { callId: 'call-bytes-2' },
    });
    expect(JSON.stringify(invokeDaEdge.mock.calls[0])).not.toContain('callId=');
    expect(JSON.stringify(invokeDaEdge.mock.calls[0])).not.toContain('/functions/v1/');
  });

  it('resposta 200 em JSON com campo url nao vira endereco nem gravacao', async () => {
    invokeDaEdge.mockResolvedValueOnce({ data: { url: 'https://edge.local/gravacao-1.mp3' }, error: null });

    const { queryClient, wrapper } = criarWrapper();
    const { result } = renderHook(() => useCallRecording('call-json-1', 'available'), { wrapper });

    await waitFor(() => expect(estadoDaQuery(queryClient, 'call-json-1')?.status).toBe('success'));

    expect(result.current.disponivel).toBe(false);
    expect(result.current.blob).toBeNull();
    expect(result.current).not.toHaveProperty('url');
    expect(JSON.stringify(result.current)).not.toContain('http');
  });

  it.each([403, 404])('%i (sem gravacao / chamada de outro agente) vira disponivel: false', async (status) => {
    invokeDaEdge.mockResolvedValueOnce({ data: null, error: erroHttp(status) });

    const { queryClient, wrapper } = criarWrapper();
    const { result } = renderHook(() => useCallRecording(`call-${status}`, 'available'), { wrapper });

    await waitFor(() => expect(estadoDaQuery(queryClient, `call-${status}`)?.status).toBe('success'));

    // Resposta esperada da Edge, nao erro de tela: a query resolve indisponivel.
    expect(result.current.disponivel).toBe(false);
    expect(result.current.blob).toBeNull();
  });

  it('Blob vazio nao e gravacao valida', async () => {
    invokeDaEdge.mockResolvedValueOnce({ data: blobDeAudio('audio/mpeg', new Uint8Array(0) as Uint8Array<ArrayBuffer>), error: null });

    const { queryClient, wrapper } = criarWrapper();
    const { result } = renderHook(() => useCallRecording('call-vazio', 'available'), { wrapper });

    await waitFor(() => expect(estadoDaQuery(queryClient, 'call-vazio')?.status).toBe('success'));

    expect(result.current.disponivel).toBe(false);
    expect(result.current.blob).toBeNull();
  });

  it('erro de rede propaga na query (nada engole a falha)', async () => {
    invokeDaEdge.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const { queryClient, wrapper } = criarWrapper();
    const { result } = renderHook(() => useCallRecording('call-rede', 'available'), { wrapper });

    await waitFor(() => expect(estadoDaQuery(queryClient, 'call-rede')?.status).toBe('error'));
    expect(result.current.disponivel).toBe(false);
    expect(result.current.blob).toBeNull();
  });

  it('resposta nao-ok fora de 403/404 propaga na query em vez de virar indisponivel', async () => {
    invokeDaEdge.mockResolvedValueOnce({ data: null, error: erroHttp(500) });

    const { queryClient, wrapper } = criarWrapper();
    renderHook(() => useCallRecording('call-erro', 'available'), { wrapper });

    await waitFor(() => expect(estadoDaQuery(queryClient, 'call-erro')?.status).toBe('error'));
    expect(String(estadoDaQuery(queryClient, 'call-erro')?.error)).toContain('Falha ao buscar a gravacao');
  });

  it('erro ao montar auth nao invoca a Edge e propaga o erro', async () => {
    headersDaEdge.mockRejectedValueOnce(new Error('sessao invalida para o teste'));

    const { queryClient, wrapper } = criarWrapper();
    renderHook(() => useCallRecording('call-sem-auth', 'available'), { wrapper });

    await waitFor(() => expect(estadoDaQuery(queryClient, 'call-sem-auth')?.status).toBe('error'));
    expect(invokeDaEdge).not.toHaveBeenCalled();
  });

  it('sem sessao valida usa os headers do helper e propaga 401 da Edge', async () => {
    headersDaEdge.mockResolvedValueOnce({
      apikey: 'chave-publica-sem-sessao',
      Authorization: 'Bearer anon-sem-sessao',
    });
    invokeDaEdge.mockResolvedValueOnce({ data: null, error: erroHttp(401) });

    const { queryClient, wrapper } = criarWrapper();
    renderHook(() => useCallRecording('call-sem-sessao', 'available'), { wrapper });

    await waitFor(() => expect(estadoDaQuery(queryClient, 'call-sem-sessao')?.status).toBe('error'));
    expect(invokeDaEdge).toHaveBeenCalledWith('get-call-recording', {
      method: 'POST',
      headers: {
        apikey: 'chave-publica-sem-sessao',
        Authorization: 'Bearer anon-sem-sessao',
        'Content-Type': 'application/json',
      },
      body: { callId: 'call-sem-sessao' },
    });
  });

  it('o cache guarda o Blob: remontar dentro do staleTime reentrega o MESMO Blob sem novo download', async () => {
    const { wrapper } = criarWrapper();
    const primeiro = renderHook(() => useCallRecording('call-cache', 'available'), { wrapper });
    await waitFor(() => expect(primeiro.result.current.disponivel).toBe(true));
    const blobDoCache = primeiro.result.current.blob;
    primeiro.unmount();

    const segundo = renderHook(() => useCallRecording('call-cache', 'available'), { wrapper });
    await waitFor(() => expect(segundo.result.current.disponivel).toBe(true));

    expect(segundo.result.current.blob).toBe(blobDoCache);
    expect(invokeDaEdge).toHaveBeenCalledTimes(1);
  });
});
