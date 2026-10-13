/**
 * processVoiceTranscript — POST do transcript para a edge `voice-agent` e saneamento da resposta.
 *
 * A função REAL roda; só a rede (fetch) é substituída. Prova o contrato do pedido, o
 * saneamento de uma resposta sem `action`/`response` e o erro em resposta não-ok.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { processVoiceTranscript } from '@/hooks/voice/processTranscript';

const SUPABASE_URL = 'https://projeto-de-teste.supabase.co';
const ANON_KEY = 'anon-key-de-teste';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('processVoiceTranscript', () => {
  it('envia o transcript com as credenciais e devolve a ação do agente', async () => {
    const acao = { action: 'send_message', response: 'Mensagem enviada', data: { contactId: 'c1' } };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(acao),
      text: () => Promise.resolve(''),
    });

    const resultado = await processVoiceTranscript('manda oi pra Ana', SUPABASE_URL, ANON_KEY);

    expect(resultado).toEqual(acao);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${SUPABASE_URL}/functions/v1/voice-agent`);
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers.apikey).toBe(ANON_KEY);
    expect(String(init.headers.Authorization)).toBe(`Bearer ${ANON_KEY}`);
    expect(init.body).toBe(JSON.stringify({ transcript: 'manda oi pra Ana' }));
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('resposta sem action cai no default "answer"', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    });

    const resultado = await processVoiceTranscript('oi', SUPABASE_URL, ANON_KEY);

    expect(resultado).toEqual({
      action: 'answer',
      response: 'Desculpe, não entendi.',
      data: {},
    });
  });

  it('resposta com texto mas sem action também vira "answer"', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ response: 'Tudo certo por aqui.' }),
      text: () => Promise.resolve(''),
    });

    const resultado = await processVoiceTranscript('oi', SUPABASE_URL, ANON_KEY);

    expect(resultado).toEqual({
      action: 'answer',
      response: 'Tudo certo por aqui.',
      data: {},
    });
  });

  it('resposta não-ok rejeita com o status e um trecho do corpo', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('gateway caiu'),
    });

    await expect(processVoiceTranscript('oi', SUPABASE_URL, ANON_KEY)).rejects.toThrow(
      'Voice agent error: 502 gateway caiu',
    );
  });
});
