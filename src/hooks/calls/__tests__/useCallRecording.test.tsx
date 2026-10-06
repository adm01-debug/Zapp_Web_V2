import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallRecording } from '../useCallRecording';
import { SUPABASE_URL } from '@/config/supabase';

/**
 * TEL-RECORDING-001 — contrato da chamada de audio do hook com a Edge `get-call-recording`.
 *
 * O que estes testes travam: a Edge continua recebendo `POST` em
 * `/functions/v1/get-call-recording`, com os headers de `edgeAuthHeaders()` mais
 * `Content-Type: application/json`, e o `callId` sai NO CORPO (`JSON.stringify({ callId })`),
 * nunca na query string. A Edge aceita GET e POST, mas o front sempre falou por POST com JSON -
 * trocar o transporte por `GET ?callId=...` muda um contrato em producao sem necessidade.
 *
 * Prova do defeito: com o hook anterior (`supabase.functions.invoke`) o `apikey`/`Authorization`
 * nao vem de `edgeAuthHeaders()` e os headers de sessao do usuario nao entram na chamada. Com a
 * entrega recusada (GET com `callId` na query string) este teste falha no metodo e na URL.
 */

const { edgeAuthHeadersMock } = vi.hoisted(() => ({ edgeAuthHeadersMock: vi.fn() }));

vi.mock('@/lib/edgeAuthHeaders', () => ({ edgeAuthHeaders: edgeAuthHeadersMock }));

const fetchMock = vi.fn();

/** Resposta minima da Edge no formato que o hook consome (`{ url }`), ja com `headers`. */
const respostaDaEdge = (corpo: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers({ 'Content-Type': 'application/json' }),
  json: async () => corpo,
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useCallRecording — contrato POST + JSON com a Edge get-call-recording (TEL-RECORDING-001)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    edgeAuthHeadersMock.mockReset().mockResolvedValue({
      apikey: 'anon-do-teste',
      Authorization: 'Bearer token-da-sessao',
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pede a Edge por POST com os headers de auth e o callId no corpo JSON (nunca na query string)', async () => {
    fetchMock.mockResolvedValue(respostaDaEdge({ url: 'https://exemplo/audio.mp3' }));

    renderHook(() => useCallRecording('c1', 'available'), { wrapper });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [alvo, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const url = String(alvo);

    // O callId nao aparece na URL nem em query string nenhuma (falha se virar `GET ?callId=`).
    expect(url).toBe(`${SUPABASE_URL}/functions/v1/get-call-recording`);
    expect(url).not.toContain('?');
    expect(url).not.toMatch(/callId/);

    // Continua POST.
    expect(init.method).toBe('POST');

    // Headers de sessao da Edge (edgeAuthHeaders) + Content-Type JSON.
    expect(edgeAuthHeadersMock).toHaveBeenCalledTimes(1);
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe('anon-do-teste');
    expect(headers.Authorization).toBe('Bearer token-da-sessao');
    expect(headers['Content-Type']).toBe('application/json');

    // O corpo e o JSON do callId.
    expect(init.body).toBe(JSON.stringify({ callId: 'c1' }));
  });

  it('entrega a URL da gravacao quando a Edge responde { url }', async () => {
    fetchMock.mockResolvedValue(respostaDaEdge({ url: 'https://exemplo/audio.mp3' }));

    const { result } = renderHook(() => useCallRecording('c1', 'available'), { wrapper });

    await waitFor(() => expect(result.current.disponivel).toBe(true));
    expect(result.current.url).toBe('https://exemplo/audio.mp3');
  });

  it('sem gravacao na chamada nem requisita a Edge', async () => {
    const { result } = renderHook(() => useCallRecording('c3', 'none'), { wrapper });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.disponivel).toBe(false);
  });

  it('404 da Edge = "sem gravacao", nao erro de tela', async () => {
    fetchMock.mockResolvedValue(respostaDaEdge({ error: 'sem gravacao' }, 404));

    const { result } = renderHook(() => useCallRecording('c2', 'available'), { wrapper });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.buscando).toBe(false));
    expect(result.current.disponivel).toBe(false);
    expect(result.current.url).toBeNull();
  });
});
