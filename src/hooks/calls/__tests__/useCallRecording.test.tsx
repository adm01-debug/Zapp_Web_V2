import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallRecording } from '../useCallRecording';

/**
 * TEL-RECORDING-001 (item 62) — o contrato entre o player e a Edge `get-call-recording`.
 *
 * A Edge responde o PROPRIO audio (`new Response(upstream.body)`, T73) para nao expor a URL
 * do provedor. Antes o hook tratava a resposta como JSON (`data.url`) e o SDK 2.117.2
 * decodifica `audio/mpeg` como texto: `disponivel` ficava sempre `false`, e o RecordingPlayer
 * devolvia `null` mesmo com 200 de audio valido. Estes testes travam o lado certo do contrato:
 * a Edge entrega BYTES, o hook devolve um `blob:` local e nunca uma URL pronta.
 *
 * Prova do defeito: com o codigo antigo (invoke + `data.url`) o `fetch` abaixo nunca e chamado
 * e `disponivel` nunca vira `true` - os dois primeiros testes falham.
 */

vi.mock('@/lib/edgeAuthHeaders', () => ({
  edgeAuthHeaders: vi.fn(async () => ({ apikey: 'anon', Authorization: 'Bearer token' })),
}));

const fetchMock = vi.fn();
const createObjectURL = vi.fn((_blob: Blob) => 'blob:audio-local');
const revokeObjectURL = vi.fn();

const audioDaEdge = (conteudo = 'bytes-de-audio-mp3') => new Blob([conteudo], { type: 'audio/mpeg' });

const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe('useCallRecording — contrato com a Edge get-call-recording (TEL-RECORDING-001)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('consome o STREAM de audio da Edge e entrega um blob local (nao um JSON {url})', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, blob: async () => audioDaEdge() });

    const { result } = renderHook(() => useCallRecording('c1', 'available'), { wrapper });

    await waitFor(() => expect(result.current.disponivel).toBe(true));

    // O player recebe um endereco local do navegador, derivado dos bytes da Edge.
    expect(result.current.url).toBe('blob:audio-local');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);

    // A requisicao foi para a Edge com o callId - e o Range/URL de origem nunca aparece.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const alvo = String(fetchMock.mock.calls[0][0]);
    expect(alvo).toContain('/functions/v1/get-call-recording');
    expect(alvo).toContain('callId=c1');
  });

  it('revoga o endereco local ao desmontar (nao vaza memoria)', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, blob: async () => audioDaEdge() });

    const { result, unmount } = renderHook(() => useCallRecording('c9', 'available'), { wrapper });
    await waitFor(() => expect(result.current.disponivel).toBe(true));

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:audio-local');
  });

  it('404 da Edge = "sem gravacao", nao erro de tela', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, blob: async () => audioDaEdge('') });

    const { result } = renderHook(() => useCallRecording('c2', 'available'), { wrapper });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.buscando).toBe(false));
    expect(result.current.disponivel).toBe(false);
    expect(result.current.url).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('sem gravacao na chamada nem requisita a Edge', async () => {
    const { result } = renderHook(() => useCallRecording('c3', 'none'), { wrapper });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.disponivel).toBe(false);
  });
});
