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

const sessao = (token: string) => ({ data: { session: { access_token: token } }, error: null });
const aal = (currentLevel: string, nextLevel: string) => ({
  data: { currentLevel, nextLevel },
  error: null,
});

describe('notifyNewDeviceOnLogin — aviso de dispositivo novo no login (R2-AUTH-004)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.getSession.mockResolvedValue(sessao('token-sessao-a'));
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

  it('sessão Auth nova (outro token) avisa de novo', async () => {
    await notifyNewDeviceOnLogin();
    mocks.getSession.mockResolvedValue(sessao('token-sessao-b'));
    await notifyNewDeviceOnLogin();

    expect(mocks.invoke).toHaveBeenCalledTimes(2);
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

  it('a guarda no sessionStorage não grava o token', async () => {
    await notifyNewDeviceOnLogin();

    const chave = sessionGuardKey('token-sessao-a');
    expect(sessionStorage.getItem(chave)).toBe('1');
    expect(chave).toContain('zapp.device-check');
    expect(chave).not.toContain('token-sessao-a');
  });
});
