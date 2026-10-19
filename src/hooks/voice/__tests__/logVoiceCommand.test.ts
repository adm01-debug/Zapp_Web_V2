import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  getLogger: () => ({
    warn: hoisted.logWarn,
    error: hoisted.logError,
    info: vi.fn(),
    debug: vi.fn(),
  }),

  createLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'usuario-de-teste' } } })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: 'token-de-teste' } } })),
    },
  },
  SUPABASE_URL: 'https://projeto-de-teste.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key-de-teste',
}));

import { logVoiceCommand } from '@/hooks/voice/logVoiceCommand';

const PARAMS = {
  transcript: 'quais conversas não lidas',
  action: 'search',
  response: 'Buscando',
};

async function chamar() {
  logVoiceCommand(PARAMS);
  // É fire-and-forget: espera o fetch sair (e a resposta ser tratada).
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * #347 — o log de voz era um `fetch` sem teto e sem checagem: um 401/403/5xx sumia
 * em silêncio e um fetch pendurado ficava vivo para sempre. O log é telemetria:
 * falhar nele nunca pode virar exceção nem travar a tela.
 */
describe('logVoiceCommand — teto de 15 s e resposta não-ok (#347)', () => {
  beforeEach(() => {
    hoisted.logWarn.mockClear();
    hoisted.logError.mockClear();
  });

  it('leva AbortSignal com teto de tempo no fetch', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 204 })));

    await chamar();

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('resposta não-ok fica no log técnico e não vira exceção', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 403 })));

    await chamar();

    expect(hoisted.logWarn).toHaveBeenCalledTimes(1);
    expect(String(hoisted.logWarn.mock.calls[0][0])).toContain('403');
    expect(hoisted.logError).not.toHaveBeenCalled();
  });

  it('erro de rede (ou teto de 15 s estourado) é registrado, não lançado', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('signal timed out'))));

    await expect(chamar()).resolves.toBeUndefined();

    expect(hoisted.logError).toHaveBeenCalledTimes(1);
  });

  it('resposta ok não gera aviso', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 201 })));

    await chamar();

    expect(hoisted.logWarn).not.toHaveBeenCalled();
    expect(hoisted.logError).not.toHaveBeenCalled();
  });
});
