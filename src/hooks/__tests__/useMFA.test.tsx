import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Mock } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      mfa: {
        enroll: vi.fn(),
        challenge: vi.fn(),
        verify: vi.fn(),
        listFactors: vi.fn().mockResolvedValue({ data: { totp: [], phone: [] }, error: null }),
        unenroll: vi.fn(),
        getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
          data: { currentLevel: 'aal1', nextLevel: 'aal1', currentAuthenticationMethods: [] },
          error: null,
        }),
      },
    },
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },

  getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
  createLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
}));

vi.mock('@/lib/queryClient', () => ({
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn() },
}));

import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useMFA, mapMfaError } from '@/hooks/auth/useMFA';

const listFactorsMock = () => supabase.auth.mfa.listFactors as unknown as Mock;

describe('useMFA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listFactorsMock().mockResolvedValue({ data: { totp: [], phone: [] }, error: null });
    (supabase.auth.mfa.unenroll as unknown as Mock).mockResolvedValue({ data: {}, error: null });
    (supabase.auth.mfa.getAuthenticatorAssuranceLevel as unknown as Mock).mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal1', currentAuthenticationMethods: [] },
      error: null,
    });
  });

  it('initializes with default state', () => {
    const { result } = renderHook(() => useMFA());
    expect(result.current.loading).toBe(false);
    expect(result.current.isMFAEnabled).toBe(false);
  });

  describe('mapMfaError', () => {
    it('distingue "muitas tentativas" de "código inválido" em pt-BR', () => {
      expect(mapMfaError({ code: 'over_request_rate_limit', status: 429 })).toBe(
        'Muitas tentativas. Aguarde alguns minutos antes de tentar de novo.',
      );
      expect(mapMfaError({ code: 'mfa_verification_failed', message: 'Invalid TOTP code entered' })).toBe(
        'Código inválido. Confira o código no app autenticador e tente novamente.',
      );
      expect(mapMfaError({ code: 'mfa_challenge_expired' })).toBe(
        'O código expirou. Gere um código novo no app autenticador e tente novamente.',
      );
      expect(mapMfaError({ code: 'mfa_factor_name_conflict' })).toBe(
        'Já existe um fator com esse nome. Tente novamente.',
      );
    });

    it('nunca devolve o inglês cru do GoTrue', () => {
      const msg = mapMfaError({ message: 'Invalid TOTP code entered' });
      expect(msg).not.toMatch(/invalid|totp/i);
      expect(msg.length).toBeGreaterThan(0);
    });
  });

  it('enrollTOTP usa um friendly_name único e legível (evita colisão de nome)', async () => {
    (supabase.auth.mfa.enroll as unknown as Mock).mockResolvedValue({
      data: { id: 'f1', type: 'totp', totp: { qr_code: 'qr', secret: 'ABC', uri: 'otpauth://...' } },
      error: null,
    });

    const { result } = renderHook(() => useMFA());
    await act(async () => { await result.current.enrollTOTP(); });

    expect(supabase.auth.mfa.enroll).toHaveBeenCalledTimes(1);
    const arg = (supabase.auth.mfa.enroll as unknown as Mock).mock.calls[0][0];
    expect(arg.factorType).toBe('totp');
    expect(arg.friendlyName).toMatch(/^App Autenticador \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    // dois cadastros seguidos não repetem o nome
    await act(async () => { await result.current.enrollTOTP('Outro nome'); });
    expect((supabase.auth.mfa.enroll as unknown as Mock).mock.calls[1][0].friendlyName).toBe('Outro nome');
  });

  it('enrollTOTP remove fatores unverified antes de cadastrar (sem fator órfão)', async () => {
    listFactorsMock().mockResolvedValue({
      data: {
        totp: [
          { id: 'stale-1', factor_type: 'totp', status: 'unverified', friendly_name: 'App Autenticador' },
          { id: 'ok-1', factor_type: 'totp', status: 'verified', friendly_name: 'Celular' },
        ],
        phone: [],
      },
      error: null,
    });
    (supabase.auth.mfa.enroll as unknown as Mock).mockResolvedValue({
      data: { id: 'novo', type: 'totp', totp: { qr_code: 'qr', secret: 'ABC', uri: 'otpauth://...' } },
      error: null,
    });

    const { result } = renderHook(() => useMFA());
    await act(async () => { await result.current.enrollTOTP(); });

    expect(supabase.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'stale-1' });
    expect(supabase.auth.mfa.unenroll).not.toHaveBeenCalledWith({ factorId: 'ok-1' });
    expect(supabase.auth.mfa.enroll).toHaveBeenCalledTimes(1);
  });

  it('enrollTOTP ainda cadastra quando a limpeza do fator pendente falha', async () => {
    listFactorsMock().mockResolvedValue({
      data: { totp: [{ id: 'stale-1', factor_type: 'totp', status: 'unverified' }], phone: [] },
      error: null,
    });
    (supabase.auth.mfa.unenroll as unknown as Mock).mockResolvedValue({
      data: null,
      error: { message: 'network down', code: 'network' },
    });
    (supabase.auth.mfa.enroll as unknown as Mock).mockResolvedValue({
      data: { id: 'novo', type: 'totp', totp: { qr_code: 'qr', secret: 'ABC', uri: 'otpauth://...' } },
      error: null,
    });

    const { result } = renderHook(() => useMFA());
    await act(async () => { await result.current.enrollTOTP(); });

    expect(supabase.auth.mfa.enroll).toHaveBeenCalledTimes(1);
  });

  it('cancelEnroll desfaz o cadastro pendente (unenroll do fator unverified)', async () => {
    (supabase.auth.mfa.enroll as unknown as Mock).mockResolvedValue({
      data: { id: 'pendente', type: 'totp', totp: { qr_code: 'qr', secret: 'ABC', uri: 'otpauth://...' } },
      error: null,
    });
    const { result } = renderHook(() => useMFA());
    await act(async () => { await result.current.enrollTOTP(); });
    expect(result.current.enrollmentData?.id).toBe('pendente');

    listFactorsMock().mockResolvedValue({
      data: { totp: [{ id: 'pendente', factor_type: 'totp', status: 'unverified' }], phone: [] },
      error: null,
    });

    await act(async () => { await result.current.cancelEnroll(); });

    expect(supabase.auth.mfa.unenroll).toHaveBeenCalledTimes(1);
    expect(supabase.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'pendente' });
    expect(result.current.enrollmentData).toBeNull();
  });

  it('verifyTOTP mostra UMA mensagem pt-BR por erro (toast e erro lançado com o mesmo texto)', async () => {
    (supabase.auth.mfa.challenge as unknown as Mock).mockResolvedValue({ data: { id: 'ch-1' }, error: null });
    (supabase.auth.mfa.verify as unknown as Mock).mockResolvedValue({
      data: null,
      error: { code: 'mfa_verification_failed', message: 'Invalid TOTP code entered' },
    });

    const { result } = renderHook(() => useMFA());
    let erro: unknown = null;
    await act(async () => {
      try {
        await result.current.verifyTOTP('f1', '000000');
      } catch (e) {
        erro = e;
      }
    });

    const esperado = 'Código inválido. Confira o código no app autenticador e tente novamente.';
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(esperado);
    expect((erro as Error).message).toBe(esperado);
    expect((erro as Error).message).not.toMatch(/invalid|totp/i);
  });

  it('verifyTOTP distingue excesso de tentativas', async () => {
    (supabase.auth.mfa.challenge as unknown as Mock).mockResolvedValue({
      data: null,
      error: { code: 'over_request_rate_limit', status: 429 },
    });

    const { result } = renderHook(() => useMFA());
    await act(async () => {
      await result.current.verifyTOTP('f1', '000000').catch(() => undefined);
    });

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('Muitas tentativas. Aguarde alguns minutos antes de tentar de novo.');
  });

  it('verifyTOTP calls challenge then verify', async () => {
    (supabase.auth.mfa.challenge as unknown as Mock).mockResolvedValue({ data: { id: 'ch-1' }, error: null });
    (supabase.auth.mfa.verify as unknown as Mock).mockResolvedValue({ data: {}, error: null });

    const { result } = renderHook(() => useMFA());
    await act(async () => { await result.current.verifyTOTP('f1', '123456'); });
    expect(supabase.auth.mfa.challenge).toHaveBeenCalledWith({ factorId: 'f1' });
    expect(supabase.auth.mfa.verify).toHaveBeenCalledWith({ factorId: 'f1', challengeId: 'ch-1', code: '123456' });
  });

  it('unenroll calls mfa.unenroll', async () => {
    (supabase.auth.mfa.unenroll as unknown as Mock).mockResolvedValue({ data: {}, error: null });
    const { result } = renderHook(() => useMFA());
    await act(async () => { await result.current.unenroll('f1'); });
    expect(supabase.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'f1' });
  });

  it('fetchFactors retrieves TOTP factors', async () => {
    listFactorsMock().mockResolvedValue({
      data: { totp: [{ id: 'f1', factor_type: 'totp', status: 'verified', created_at: '', updated_at: '' }], phone: [] },
      error: null,
    });

    const { result } = renderHook(() => useMFA());
    await act(async () => { await result.current.fetchFactors(); });
    expect(result.current.factors).toHaveLength(1);
    expect(result.current.isMFAEnabled).toBe(true);
  });

  it('fetchFactors não engole erro de leitura', async () => {
    listFactorsMock().mockResolvedValue({
      data: null,
      error: { message: 'GoTrue indisponível', code: 'unexpected_failure' },
    });

    const { result } = renderHook(() => useMFA());
    let erro: unknown = null;
    await act(async () => {
      try {
        await result.current.fetchFactors();
      } catch (e) {
        erro = e;
      }
    });

    expect(erro).not.toBeNull();
    expect(result.current.factors).toHaveLength(0);
  });
});
