import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
}));

import { serverLogin, AUTH_LOGIN_TIMEOUT_MS } from '@/lib/serverLogin';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * O contrato observavel pelo usuario: o login TEM de desistir dentro de 60s e
 * dizer alguma coisa. Nao e "esperar o valor exato da constante" — avancar o
 * fake timer pelo proprio AUTH_LOGIN_TIMEOUT_MS deixaria o teste tautologico
 * (passa mesmo com o timeout configurado em 10 minutos).
 */
const TETO_DE_ESPERA_MS = 60_000;

describe('serverLogin', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('chama a edge auth-login com apikey/bearer anon e devolve os tokens', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { access_token: 'at', refresh_token: 'rt', expires_in: 3600 }));
    const r = await serverLogin('a@b.co', 'secret');
    expect(r).toEqual({ ok: true, accessToken: 'at', refreshToken: 'rt' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://proj.supabase.co/functions/v1/auth-login?forceFunctionRegion=us-west-2');
    expect(init.headers.apikey).toBe('anon-key');
    expect(init.headers.Authorization).toBe('Bearer anon-key');
    expect(JSON.parse(init.body)).toMatchObject({ email: 'a@b.co', password: 'secret' });
  });

  it('fixa a regiao us-west-2 na invocacao (banco/GoTrue vivem la — T06)', async () => {
    // O auth-login faz ~5 round-trips ao banco/GoTrue. Sem o pin a edge roda na
    // regiao do usuario (sa-east-1 no Brasil) e cada salto cruza o continente:
    // p50 medido 925ms em sa-east-1 contra 101ms em us-east-1 (T06).
    fetchMock.mockResolvedValue(jsonResponse(200, { access_token: 'at', refresh_token: 'rt' }));
    await serverLogin('a@b.co', 'secret');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('forceFunctionRegion=us-west-2');
    // x-region exigiria liberar o header no preflight CORS (getCorsHeaders lista
    // os headers permitidos); o query param e o caminho documentado para browser.
    expect(init.headers['x-region']).toBeUndefined();
  });

  it('401 devolve a recusa com o estado do lock', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, {
      error: 'Invalid login credentials', isLocked: false, lockedUntil: null, attempts: 3, remainingTime: 0,
    }));
    const r = await serverLogin('a@b.co', 'x');
    expect(r).toEqual({
      ok: false, unavailable: false, error: 'Invalid login credentials',
      lock: { isLocked: false, lockedUntil: null, attempts: 3, remainingTime: 0 },
    });
  });

  it('423 devolve conta travada com lockedUntil como Date', async () => {
    fetchMock.mockResolvedValue(jsonResponse(423, {
      error: 'Account locked', isLocked: true, lockedUntil: '2026-09-05T10:00:00.000Z', attempts: 5, remainingTime: 120,
    }));
    const r = await serverLogin('a@b.co', 'x');
    expect(r.ok).toBe(false);
    if (r.ok || r.unavailable) throw new Error('esperava recusa com lock');
    expect(r.lock.isLocked).toBe(true);
    expect(r.lock.lockedUntil).toEqual(new Date('2026-09-05T10:00:00.000Z'));
    expect(r.lock.remainingTime).toBe(120);
  });

  it.each([
    ['rede', () => { throw new TypeError('Failed to fetch'); }],
    ['5xx', () => jsonResponse(500, { error: 'Internal error' })],
    ['200 sem tokens', () => jsonResponse(200, { ok: true })],
    ['corpo nao-JSON', () => new Response('<html>', { status: 502 })],
  ])('%s vira unavailable para o chamador cair no signInWithPassword', async (_name, impl) => {
    fetchMock.mockImplementation(async () => impl());
    const r = await serverLogin('a@b.co', 'x');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.unavailable).toBe(true);
  });

  /** Resposta 429 da edge `auth-login`, com o corpo generico dela. */
  const rateLimitedResponse = (headers: Record<string, string> = {}) =>
    new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', ...headers },
    });

  /**
   * O BUG: o 429 do rate limit da edge caia no ramo generico e a pessoa lia
   * "Login temporariamente indisponivel. Tente novamente em instantes." — como se
   * o servico estivesse fora. Sao MUITAS TENTATIVAS: mensagem propria, e por isso
   * o 429 sai da lista acima (deixou de ser `unavailable`).
   */
  it('429 tem mensagem propria e nao e indisponivel nem lockout de conta', async () => {
    fetchMock.mockResolvedValue(rateLimitedResponse());
    const r = await serverLogin('a@b.co', 'x');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.unavailable).toBe(false);
    if (!('rateLimited' in r)) throw new Error('esperava rateLimited');
    expect(r.rateLimited).toBe(true);
    expect(r.error).toBe('Muitas tentativas de login. Aguarde alguns minutos.');
    expect(r.error).not.toMatch(/indisponivel/i);
    // Nem lockout: a senha nao foi conferida, entao nao ha tentativa contabilizada
    // (com attempts > 0 a tela de login anunciaria "N tentativas restantes").
    expect(r.lock.isLocked).toBe(false);
    expect(r.lock.attempts).toBe(0);
  });

  it('429 nao revela se a conta existe: a mensagem nao depende do corpo da edge', async () => {
    // A edge usa o mesmo "Rate limit exceeded" para o limite por IP e por e-mail;
    // a mensagem do front nao pode derivar de nada disso nem do e-mail digitado.
    fetchMock.mockResolvedValueOnce(rateLimitedResponse());
    const porIp = await serverLogin('nao-existe@b.co', 'x');
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Email rate limit exceeded' }), { status: 429 }),
    );
    const porEmail = await serverLogin('existe@b.co', 'x');
    if (porIp.ok || porEmail.ok) throw new Error('unreachable');
    expect(porIp.error).toBe(porEmail.error);
    expect(String(porIp.error)).not.toMatch(/@|conta|existe|senha/i);
  });

  it('429 sem corpo JSON (proxy/CDN) ainda vira rateLimited, com a mensagem generica', async () => {
    // O ramo do 429 nao pode depender do corpo: um 429 de proxy/CDN vem HTML.
    fetchMock.mockResolvedValue(new Response('<html>429</html>', { status: 429 }));
    const r = await serverLogin('a@b.co', 'x');
    if (r.ok || !('rateLimited' in r)) throw new Error('esperava rateLimited');
    expect(r.error).toBe('Muitas tentativas de login. Aguarde alguns minutos.');
    expect(r.retryAfterSeconds).toBeNull();
  });

  it('429 usa o Retry-After em segundos quando a edge o envia', async () => {
    fetchMock.mockResolvedValue(rateLimitedResponse({ 'Retry-After': '45' }));
    const r = await serverLogin('a@b.co', 'x');
    if (r.ok || !('rateLimited' in r)) throw new Error('esperava rateLimited');
    expect(r.retryAfterSeconds).toBe(45);
    expect(r.error).toBe('Muitas tentativas de login. Tente novamente em 45s.');
  });

  it('429 aceita Retry-After como data HTTP', async () => {
    const em90s = new Date(Date.now() + 90_000).toUTCString();
    fetchMock.mockResolvedValue(rateLimitedResponse({ 'Retry-After': em90s }));
    const r = await serverLogin('a@b.co', 'x');
    if (r.ok || !('rateLimited' in r)) throw new Error('esperava rateLimited');
    expect(r.retryAfterSeconds).toBeGreaterThan(60);
    expect(r.retryAfterSeconds).toBeLessThanOrEqual(90);
    expect(r.error).toContain('min.');
  });

  it('Retry-After ilegivel ou no passado nao vira espera inventada', async () => {
    const casos = ['em breve', '0', new Date(Date.now() - 60_000).toUTCString()];
    for (const valor of casos) {
      fetchMock.mockResolvedValue(rateLimitedResponse({ 'Retry-After': valor }));
      const r = await serverLogin('a@b.co', 'x');
      if (r.ok || !('rateLimited' in r)) throw new Error('esperava rateLimited');
      expect(r.retryAfterSeconds).toBeNull();
      expect(r.error).toBe('Muitas tentativas de login. Aguarde alguns minutos.');
    }
  });

  /**
   * O BUG: com o banco respondendo 522 a edge auth-login trava nos ~5 round-trips
   * dela. Sem teto de espera o fetch fica pendurado, o spinner do botao nunca sai
   * de "Entrando..." e o usuario nao ve erro nenhum.
   */
  it('nao espera para sempre: sem resposta da edge, expira e devolve unavailable', async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')));
      }));

      const promise = serverLogin('a@b.co', 'x');
      expect(AUTH_LOGIN_TIMEOUT_MS).toBeLessThanOrEqual(TETO_DE_ESPERA_MS);
      await vi.advanceTimersByTimeAsync(TETO_DE_ESPERA_MS);
      const r = await promise;

      expect(r.ok).toBe(false);
      if (r.ok) throw new Error('unreachable');
      expect(r.unavailable).toBe(true);
      expect(String(r.error)).toMatch(/timeout/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it('passa o signal do abort para o fetch e nao aborta quando a edge responde', async () => {
    vi.useFakeTimers();
    try {
      let sinal: AbortSignal | undefined;
      fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
        sinal = init.signal ?? undefined;
        return jsonResponse(200, { access_token: 'at', refresh_token: 'rt' });
      });

      const r = await serverLogin('a@b.co', 'x');
      expect(r).toEqual({ ok: true, accessToken: 'at', refreshToken: 'rt' });
      // sem o signal o abort nao alcanca o fetch e a expiracao vira letra morta
      expect(sinal).toBeInstanceOf(AbortSignal);
      // e o timer tem de ser limpo: senao aborta uma chamada ja concluida
      await vi.advanceTimersByTimeAsync(AUTH_LOGIN_TIMEOUT_MS + 1);
      expect(sinal?.aborted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
