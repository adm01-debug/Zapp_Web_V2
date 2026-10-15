import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * R2-AUTH-004 (item 6): o aviso de dispositivo novo precisa rodar no LOGIN.
 * Antes, `detect-new-device` só era chamada por `useDeviceDetection` — isto é,
 * só quando alguém abria a aba Segurança. Estes testes cobrem a função de
 * módulo que o AuthProvider dispara no `SIGNED_IN`:
 *   1. uma chamada por sessão Auth (guarda no sessionStorage);
 *   2. MFA pendente (aal1 com fator cadastrado) não chama a Edge e não consome
 *      a sessão — o aviso sai quando a sessão vira aal2;
 *   3. falha da Edge é silenciosa e não repete na mesma sessão.
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getAssurance: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => mocks.getSession(...a),
      mfa: {
        getAuthenticatorAssuranceLevel: (...a: unknown[]) => mocks.getAssurance(...a),
      },
      onAuthStateChange: vi.fn(),
    },
    functions: { invoke: (...a: unknown[]) => mocks.invoke(...a) },
    from: vi.fn(),
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: null }),
  AuthProvider: ({ children }: { children?: unknown }) => children,
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { notifyNewDeviceOnLogin, sessionGuardKey } from '@/hooks/ui/useDeviceDetection';

/** JWT falso com claim session_id (só o payload importa: a guarda decodifica sem verificar). */
const jwt = (sessionId: string | null, userId: string) => {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const payload: Record<string, string> = { sub: userId };
  if (sessionId !== null) payload.session_id = sessionId;
  return `${b64({ alg: 'none' })}.${b64(payload)}.assinatura`;
};

const sessao = (sessionId: string | null, userId: string, token?: string) => ({
  data: {
    session: {
      access_token: token ?? jwt(sessionId, userId),
      user: { id: userId },
    },
  },
  error: null,
});
const aal = (currentLevel: string, nextLevel: string) => ({
  data: { currentLevel, nextLevel },
  error: null,
});

/** Chaves da guarda marcadas no sessionStorage (prefixo do módulo). */
const chavesDaGuarda = () => {
  const chaves: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const chave = sessionStorage.key(i);
    if (chave?.startsWith('zapp.device-check')) chaves.push(chave);
  }
  return chaves;
};

describe('notifyNewDeviceOnLogin — aviso de dispositivo novo no login (R2-AUTH-004)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.getSession.mockResolvedValue(sessao('sessao-a', 'user-a'));
    mocks.getAssurance.mockResolvedValue(aal('aal1', 'aal1'));
    mocks.invoke.mockResolvedValue({ data: { device_id: 'dev-1' }, error: null });
  });

  it('chama a Edge detect-new-device uma vez por sessão', async () => {
    await notifyNewDeviceOnLogin();
    await notifyNewDeviceOnLogin();

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith(
      'detect-new-device',
      expect.objectContaining({
        body: expect.objectContaining({
          device_fingerprint: expect.any(String),
          browser: expect.any(String),
          os: expect.any(String),
          device_name: expect.any(String),
        }),
      }),
    );
  });

  it('chamadas simultâneas (SIGNED_IN + MFA_CHALLENGE_VERIFIED) geram um único envio', async () => {
    // A guarda do sessionStorage é marcada no meio de awaits: sem o cadeado de
    // "aviso em voo", as duas pontas do login disparariam duas vezes.
    await Promise.all([notifyNewDeviceOnLogin(), notifyNewDeviceOnLogin()]);

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it('sessão Auth nova (outro session_id e outro usuário) avisa de novo', async () => {
    await notifyNewDeviceOnLogin();
    mocks.getSession.mockResolvedValue(sessao('sessao-b', 'user-b'));
    await notifyNewDeviceOnLogin();

    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });

  it('mesma sessão com access_token renovado NÃO chama a Edge de novo', async () => {
    await notifyNewDeviceOnLogin();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);

    // Renovação (~1h): o access_token muda mas o session_id continua o mesmo;
    // o supabase-js volta a emitir SIGNED_IN e o login chama de novo.
    mocks.getSession.mockResolvedValue(
      sessao('sessao-a', 'user-a', `${jwt('sessao-a', 'user-a')}-renovado`),
    );
    await notifyNewDeviceOnLogin();

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    // Sem acúmulo: continua uma única entrada da guarda no sessionStorage.
    expect(chavesDaGuarda()).toHaveLength(1);
  });

  it('sem claim session_id a guarda usa o user.id (renovação não reenvia)', async () => {
    mocks.getSession.mockResolvedValue(sessao(null, 'user-a'));
    await notifyNewDeviceOnLogin();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);

    mocks.getSession.mockResolvedValue(sessao(null, 'user-a', 'token-opaco-renovado'));
    await notifyNewDeviceOnLogin();

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(chavesDaGuarda()).toHaveLength(1);
  });

  it('MFA pendente (aal1 com nextLevel aal2) NÃO chama a Edge', async () => {
    mocks.getAssurance.mockResolvedValue(aal('aal1', 'aal2'));

    await notifyNewDeviceOnLogin();

    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('MFA pendente não consome a sessão: depois do aal2 o aviso sai', async () => {
    mocks.getAssurance.mockResolvedValue(aal('aal1', 'aal2'));
    await notifyNewDeviceOnLogin();
    expect(mocks.invoke).not.toHaveBeenCalled();

    // MFA_CHALLENGE_VERIFIED: a sessão virou aal2 na mesma sessão Auth.
    mocks.getAssurance.mockResolvedValue(aal('aal2', 'aal2'));
    await notifyNewDeviceOnLogin();

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it('assurance ilegível falha fechado: não chama a Edge', async () => {
    mocks.getAssurance.mockResolvedValue({ data: null, error: new Error('sem assurance') });

    await notifyNewDeviceOnLogin();

    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('falha da Edge é silenciosa e não repete na mesma sessão', async () => {
    mocks.invoke.mockRejectedValue(new Error('Edge indisponível'));

    await expect(notifyNewDeviceOnLogin()).resolves.toBeUndefined();
    await notifyNewDeviceOnLogin();

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it('sem sessão não consulta assurance nem chama a Edge', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });

    await notifyNewDeviceOnLogin();

    expect(mocks.getAssurance).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('a guarda no sessionStorage não grava token, session_id nem user.id', async () => {
    const token = jwt('sessao-a', 'user-a');
    await notifyNewDeviceOnLogin();

    const chave = sessionGuardKey({ access_token: token, user: { id: 'user-a' } });
    expect(sessionStorage.getItem(chave)).toBe('1');
    expect(chave).toContain('zapp.device-check');
    expect(chave).not.toContain(token);
    expect(chave).not.toContain('sessao-a');
    expect(chave).not.toContain('user-a');
  });

  it('sessionGuardKey é estável na renovação e muda de sessão', () => {
    const antes = sessionGuardKey({ access_token: jwt('sessao-a', 'user-a'), user: { id: 'user-a' } });
    const renovado = sessionGuardKey({
      access_token: `${jwt('sessao-a', 'user-a')}-renovado`,
      user: { id: 'user-a' },
    });
    const outra = sessionGuardKey({ access_token: jwt('sessao-b', 'user-b'), user: { id: 'user-b' } });

    expect(renovado).toBe(antes);
    expect(outra).not.toBe(antes);
    // Degenerado (sem JWT nem user.id): a chave cai no token, como antes.
    expect(sessionGuardKey({ access_token: 'opaco' })).toBe(sessionGuardKey({ access_token: 'opaco' }));
  });
});
