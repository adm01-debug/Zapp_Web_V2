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
 * A fronteira de rede e UMA (`fetch` global) e a sessao e a outra (`supabase.auth.getSession`); o
 * hook e o react-query rodam de verdade. Assim o teste observa a requisicao que sairia na rede
 * (metodo, URL, headers, corpo) e os BYTES que chegam ao consumidor. O token e sintetico.
 */

const getSession = vi.hoisted(() => vi.fn());
const fetchDaEdge = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'http://projeto-teste.local',
  supabase: { auth: { getSession: (...args: unknown[]) => getSession(...args) } },
}));

import { useCallRecording } from '../useCallRecording';

/** Bytes com sequencias invalidas em UTF-8: se passassem pelo TEXTO da resposta, nao sobreviveriam. */
const BYTES_DE_AUDIO: Uint8Array<ArrayBuffer> = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 0x49, 0x44, 0x33, 0x80, 0xc3, 0x28]);

const respostaDeAudio = (
  tipo: string,
  bytes: Uint8Array<ArrayBuffer> = BYTES_DE_AUDIO,
) => new Response(bytes, { status: 200, headers: { 'Content-Type': tipo } });

const respostaJson = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

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
    getSession.mockReset().mockResolvedValue({
      data: { session: { access_token: 'jwt-do-usuario-teste' } },
      error: null,
    });
    fetchDaEdge.mockReset().mockImplementation(() => Promise.resolve(respostaDeAudio('audio/mpeg')));
    vi.stubGlobal('fetch', fetchDaEdge);
  });

  it('nao chama a Edge nem a sessao quando a chamada nao tem gravacao', () => {
    const { wrapper } = criarWrapper();
    renderHook(() => useCallRecording('call-sem-gravacao', 'none'), { wrapper });

    expect(fetchDaEdge).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
  });

  it.each(['audio/mpeg', 'application/octet-stream'])(
    'entrega os BYTES da Edge (%s) como Blob - nunca a URL de origem',
    async (tipo) => {
      fetchDaEdge.mockReset().mockImplementation(() => Promise.resolve(respostaDeAudio(tipo)));

      const { wrapper } = criarWrapper();
      const { result } = renderHook(() => useCallRecording(`call-bytes-${tipo}`, 'available'), { wrapper });

      await waitFor(() => expect(result.current.disponivel).toBe(true));

      // `Response.blob()` devolve o Blob do fetch do Node, não o do jsdom: `toBeInstanceOf(Blob)`
      // compara dois construtores diferentes e falha no CI. A marca do objeto é a mesma nos dois.
      expect(Object.prototype.toString.call(result.current.blob)).toBe('[object Blob]');
      expect(result.current.blob?.type).toBe(tipo);
      expect(result.current.blob?.size).toBe(BYTES_DE_AUDIO.byteLength);
      const bytesDoBlob = new Uint8Array(await result.current.blob!.arrayBuffer());
      expect(Array.from(bytesDoBlob)).toEqual(Array.from(BYTES_DE_AUDIO));

      // O que sai do hook e so isto: o consumidor nunca recebe endereco nenhum da Edge.
      expect(Object.keys(result.current).sort()).toEqual(['blob', 'buscando', 'disponivel']);
      expect(result.current).not.toHaveProperty('url');
    },
  );

  it('pede a Edge por POST com o JWT da sessao + JSON { callId }, sem callId na URL', async () => {
    const { wrapper } = criarWrapper();
    const { result } = renderHook(() => useCallRecording('call-bytes-2', 'available'), { wrapper });
    await waitFor(() => expect(result.current.disponivel).toBe(true));

    expect(fetchDaEdge).toHaveBeenCalledTimes(1);
    const [urlAtingida, init] = fetchDaEdge.mock.calls[0] as [string, RequestInit];
    const url = String(urlAtingida);

    // Metodo: POST explicito; prova negativa - qualquer troca para GET reprova aqui.
    expect(init.method).toBe('POST');
    expect(init.method).not.toBe('GET');

    // URL: a funcao e o caminho; callId NUNCA vai em query string nem em URL de GET.
    expect(url).toBe('http://projeto-teste.local/functions/v1/get-call-recording');
    expect(new URL(url).search).toBe('');
    expect(url).not.toContain('callId');
    expect(url).not.toContain('call-bytes-2');

    // Headers: bearer da sessao + Content-Type JSON.
    expect(init.headers).toEqual({
      Authorization: 'Bearer jwt-do-usuario-teste',
      'Content-Type': 'application/json',
    });

    // Corpo: { callId } serializado como JSON, nunca na URL.
    expect(init.body).toBe('{"callId":"call-bytes-2"}');
    expect(JSON.parse(init.body as string)).toEqual({ callId: 'call-bytes-2' });
  });

  it('resposta 200 em JSON com campo url nao vira endereco nem gravacao', async () => {
    fetchDaEdge
      .mockReset()
      .mockImplementation(() => Promise.resolve(respostaJson({ url: 'https://edge.local/gravacao-1.mp3' })));

    const { queryClient, wrapper } = criarWrapper();
    const { result } = renderHook(() => useCallRecording('call-json-1', 'available'), { wrapper });

    await waitFor(() => expect(estadoDaQuery(queryClient, 'call-json-1')?.status).toBe('success'));

    expect(result.current.disponivel).toBe(false);
    expect(result.current.blob).toBeNull();
    // Nem a URL vira endereco, nem o corpo JSON vira bytes de audio.
    expect(result.current).not.toHaveProperty('url');
    expect(JSON.stringify(result.current)).not.toContain('http');
  });

  it.each([403, 404])('%i (sem gravacao / chamada de outro agente) vira disponivel: false', async (status) => {
    fetchDaEdge.mockReset().mockImplementation(() => Promise.resolve(new Response(null, { status })));

    const { queryClient, wrapper } = criarWrapper();
    const { result } = renderHook(() => useCallRecording(`call-${status}`, 'available'), { wrapper });

    await waitFor(() => expect(estadoDaQuery(queryClient, `call-${status}`)?.status).toBe('success'));

    // Resposta esperada da Edge, nao erro de tela: a query resolve indisponivel.
    expect(result.current.disponivel).toBe(false);
    expect(result.current.blob).toBeNull();
  });

  it('Blob vazio nao e gravacao valida', async () => {
    fetchDaEdge
      .mockReset()
      .mockImplementation(() => Promise.resolve(respostaDeAudio('audio/mpeg', new Uint8Array(0))));

    const { queryClient, wrapper } = criarWrapper();
    const { result } = renderHook(() => useCallRecording('call-vazio', 'available'), { wrapper });

    await waitFor(() => expect(estadoDaQuery(queryClient, 'call-vazio')?.status).toBe('success'));

    expect(result.current.disponivel).toBe(false);
    expect(result.current.blob).toBeNull();
  });

  it('erro de rede propaga na query (nada engole a falha)', async () => {
    fetchDaEdge.mockReset().mockRejectedValue(new TypeError('Failed to fetch'));

    const { queryClient, wrapper } = criarWrapper();
    const { result } = renderHook(() => useCallRecording('call-rede', 'available'), { wrapper });

    await waitFor(() => expect(estadoDaQuery(queryClient, 'call-rede')?.status).toBe('error'));
    expect(result.current.disponivel).toBe(false);
    expect(result.current.blob).toBeNull();
  });

  it('resposta nao-ok fora de 403/404 propaga na query em vez de virar indisponivel', async () => {
    fetchDaEdge
      .mockReset()
      .mockImplementation(() => Promise.resolve(respostaJson({ message: 'boom' }, 500)));

    const { queryClient, wrapper } = criarWrapper();
    renderHook(() => useCallRecording('call-erro', 'available'), { wrapper });

    await waitFor(() => expect(estadoDaQuery(queryClient, 'call-erro')?.status).toBe('error'));
    expect(String(estadoDaQuery(queryClient, 'call-erro')?.error)).toContain('Falha ao buscar a gravacao');
  });

  it('sem sessao valida nao chama a Edge e propaga o erro', async () => {
    getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });

    const { queryClient, wrapper } = criarWrapper();
    renderHook(() => useCallRecording('call-sem-sessao', 'available'), { wrapper });

    await waitFor(() => expect(estadoDaQuery(queryClient, 'call-sem-sessao')?.status).toBe('error'));
    expect(fetchDaEdge).not.toHaveBeenCalled();
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
    expect(fetchDaEdge).toHaveBeenCalledTimes(1);
  });
});
