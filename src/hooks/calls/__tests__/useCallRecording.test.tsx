import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createRoot } from 'react-dom/client';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallRecording } from '../useCallRecording';
import { SUPABASE_URL } from '@/config/supabase';

/**
 * TEL-RECORDING-001 (item 62) — o contrato entre o player e a Edge `get-call-recording`.
 *
 * A Edge responde o PROPRIO audio (`new Response(upstream.body)`, T73) para nao expor a URL
 * do provedor. Antes o hook tratava a resposta como JSON (`data.url`) e o SDK 2.117.2
 * decodifica `audio/mpeg` como texto: `disponivel` ficava sempre `false`, e o RecordingPlayer
 * devolvia `null` mesmo com 200 de audio valido. Estes testes travam o lado certo do contrato:
 * a Edge entrega BYTES, o hook devolve um `blob:` local e nunca uma URL pronta.
 *
 * O TRANSPORTE e o que ja existia na Edge (`supabase.functions.invoke` faz POST com corpo JSON):
 * POST em `/functions/v1/get-call-recording`, headers de `edgeAuthHeaders()` mais
 * `Content-Type: application/json` e `JSON.stringify({ callId })` no corpo. `callId` NUNCA vai
 * na query string - trocar o transporte do front por GET com query string muda um contrato em
 * producao sem necessidade (a Edge aceita os dois, mas o front nao tinha motivo para mudar).
 *
 * Prova do defeito: com o codigo antigo (invoke + `data.url`) o `fetch` abaixo nunca e chamado
 * e `disponivel` nunca vira `true`. Com o transporte GET da entrega recusada, o teste de
 * contrato falha no metodo/headers/body.
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
    createObjectURL.mockReset().mockImplementation((_blob: Blob) => 'blob:audio-local');
    revokeObjectURL.mockReset();
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
  });

  it('pede a Edge por POST com os headers de auth e o callId no corpo JSON (nunca na query string)', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, blob: async () => audioDaEdge() });

    const { result } = renderHook(() => useCallRecording('c1', 'available'), { wrapper });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.disponivel).toBe(true));

    const [alvo, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const url = String(alvo);
    expect(url).toBe(`${SUPABASE_URL}/functions/v1/get-call-recording`);
    expect(url).not.toContain('?');
    expect(url).not.toContain('callId');

    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe('anon');
    expect(headers.Authorization).toBe('Bearer token');
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(init.body))).toEqual({ callId: 'c1' });
  });

  it('revoga o endereco local ao desmontar (nao vaza memoria)', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, blob: async () => audioDaEdge() });

    const { result, unmount } = renderHook(() => useCallRecording('c9', 'available'), { wrapper });
    await waitFor(() => expect(result.current.disponivel).toBe(true));

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:audio-local');
  });

  it('sob remontagem de efeito (StrictMode) a URL em uso nunca e uma URL ja revogada', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, blob: async () => audioDaEdge() });
    // Cada criacao devolve um endereco DIFERENTE, como o navegador faz - com um endereco
    // repetido o teste nao conseguiria distinguir "reusou o revogado" de "criou outro".
    let criadas = 0;
    createObjectURL.mockImplementation((_blob: Blob) => `blob:audio-${++criadas}`);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // A gravacao ja esta no cache para o efeito nascer montado COM endereco - e o caso em que
    // o StrictMode desmonta e remonta o efeito (com o blob chegando depois, a remontagem nao
    // alcanca o ciclo da URL). Sem `fetch`: o dado esta fresco, a Edge nao e chamada de novo.
    qc.setQueryData(['call-recording', 'c1'], { disponivel: true, blob: audioDaEdge() });

    // `unstable_strictMode` saiu dos tipos do React 19 mas continua valendo no runtime, e e a
    // unica forma de remontar os efeitos aqui: a remontagem do StrictMode e decidida pelo modo
    // do ROOT, e `<StrictMode>` como elemento (o que o `reactStrictMode: true` do RTL faz) so
    // dobra a renderizacao - MEDIDO: com ela o efeito roda uma vez e nunca e limpo.
    const root = createRoot(container, {
      unstable_strictMode: true,
    } as unknown as Parameters<typeof createRoot>[1]);

    try {
      act(() => {
        root.render(
          <QueryClientProvider client={qc}>
            <SondaDoEndereco callId="c1" />
          </QueryClientProvider>,
        );
      });

      await waitFor(() => expect(enderecoMostrado(container)).not.toBe(''));

      // O StrictMode montou, desmontou e montou de novo o MESMO efeito: a limpeza ja revogou o
      // endereco que o player estava usando e a remontagem tem de entregar OUTRO.
      const revogadas = revokeObjectURL.mock.calls.map(([u]) => u as string);
      expect(revogadas.length).toBeGreaterThan(0);
      expect(revogadas).not.toContain(enderecoMostrado(container));
      // Nem vaza memoria: todo endereco criado, menos o que esta em uso, foi revogado.
      expect(revogadas.length).toBe(createObjectURL.mock.calls.length - 1);
    } finally {
      act(() => root.unmount());
      container.remove();
    }
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

/** Mostra no DOM o endereco que o hook entregou - o que o `<audio>` do player usaria. */
function SondaDoEndereco({ callId }: { callId: string }) {
  const { url } = useCallRecording(callId, 'available');
  return <span data-testid="endereco-da-gravacao">{url ?? ''}</span>;
}

const enderecoMostrado = (container: HTMLElement) =>
  container.querySelector('[data-testid="endereco-da-gravacao"]')?.textContent ?? '';
