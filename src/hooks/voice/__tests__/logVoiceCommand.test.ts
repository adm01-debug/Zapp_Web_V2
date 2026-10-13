/**
 * logVoiceCommand — registro do comando de voz em `voice_command_logs`.
 *
 * A função REAL roda: só o cliente Supabase (auth) e a rede (fetch) são substituídos.
 * O registro é "fire-and-forget": nunca deve rejeitar nem travar a UI.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const authMock = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getUser: authMock.getUser, getSession: authMock.getSession } },
  SUPABASE_URL: 'https://projeto-de-teste.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key-de-teste',
}));

import { logVoiceCommand } from '@/hooks/voice/logVoiceCommand';

let fetchMock: ReturnType<typeof vi.fn>;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  authMock.getUser.mockReset();
  authMock.getSession.mockReset();
  authMock.getUser.mockResolvedValue({ data: { user: { id: 'usuario-1' } } });
  authMock.getSession.mockResolvedValue({ data: { session: { access_token: 'token-de-teste' } } });
  fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('logVoiceCommand', () => {
  it('grava o comando do usuário autenticado com o corpo esperado', async () => {
    logVoiceCommand({
      transcript: 'manda oi pra Ana',
      action: 'send_message',
      response: 'Mensagem enviada',
      data: { contactId: 'c1' },
      durationMs: 42,
      success: true,
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];

    expect(String(url)).toBe('https://projeto-de-teste.supabase.co/rest/v1/voice_command_logs');
    expect(init.method).toBe('POST');
    expect(init.headers.apikey).toBe('anon-key-de-teste');
    expect(String(init.headers.Authorization)).toContain('token-de-teste');
    expect(String(init.headers.Authorization)).toMatch(/^Bearer /);
    expect(init.headers.Prefer).toBe('return=minimal');

    expect(JSON.parse(init.body)).toEqual({
      user_id: 'usuario-1',
      transcript: 'manda oi pra Ana',
      action: 'send_message',
      response: 'Mensagem enviada',
      data: { contactId: 'c1' },
      duration_ms: 42,
      success: true,
    });
  });

  it('usa success=true e data vazio por padrão', async () => {
    logVoiceCommand({ transcript: 'oi', action: 'answer', response: 'olá' });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(body.success).toBe(true);
    expect(body.data).toEqual({});
    expect(body).not.toHaveProperty('duration_ms');
  });

  it('sem usuário autenticado não grava nada', async () => {
    authMock.getUser.mockResolvedValue({ data: { user: null } });

    logVoiceCommand({ transcript: 'oi', action: 'answer', response: 'olá' });
    await flush();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('é fire-and-forget: falha do fetch não rejeita nem propaga', async () => {
    fetchMock.mockRejectedValue(new Error('rede fora'));

    const retorno = logVoiceCommand({ transcript: 'oi', action: 'answer', response: 'olá' });

    expect(retorno).toBeUndefined();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
