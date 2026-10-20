import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

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
}));

import { supabase } from '@/integrations/supabase/client';
import { useMFA } from '@/hooks/auth/useMFA';

describe('useMFA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (supabase.auth.mfa.listFactors as any).mockResolvedValue({ data: { totp: [], phone: [] }, error: null });
    (supabase.auth.mfa.getAuthenticatorAssuranceLevel as any).mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal1', currentAuthenticationMethods: [] },
      error: null,
    });
  });

  it('initializes with default state', () => {
    const { result } = renderHook(() => useMFA());
    expect(result.current.loading).toBe(false);
    expect(result.current.isMFAEnabled).toBe(false);
  });

  it('enrollTOTP calls mfa.enroll', async () => {
    (supabase.auth.mfa.enroll as any).mockResolvedValue({
      data: { id: 'f1', type: 'totp', totp: { qr_code: 'qr', secret: 'ABC', uri: 'otpauth://...' } },
      error: null,
    });

    const { result } = renderHook(() => useMFA());
    await act(async () => { await result.current.enrollTOTP(); });
    expect(supabase.auth.mfa.enroll).toHaveBeenCalledWith({ factorType: 'totp', friendlyName: 'Authenticator App' });
  });

  it('verifyTOTP calls challenge then verify', async () => {
    (supabase.auth.mfa.challenge as any).mockResolvedValue({ data: { id: 'ch-1' }, error: null });
    (supabase.auth.mfa.verify as any).mockResolvedValue({ data: {}, error: null });

    const { result } = renderHook(() => useMFA());
    await act(async () => { await result.current.verifyTOTP('f1', '123456'); });
    expect(supabase.auth.mfa.challenge).toHaveBeenCalledWith({ factorId: 'f1' });
    expect(supabase.auth.mfa.verify).toHaveBeenCalledWith({ factorId: 'f1', challengeId: 'ch-1', code: '123456' });
  });

  it('unenroll calls mfa.unenroll', async () => {
    (supabase.auth.mfa.unenroll as any).mockResolvedValue({ data: {}, error: null });
    const { result } = renderHook(() => useMFA());
    await act(async () => { await result.current.unenroll('f1'); });
    expect(supabase.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'f1' });
  });

  it('fetchFactors retrieves TOTP factors', async () => {
    (supabase.auth.mfa.listFactors as any).mockResolvedValue({
      data: { totp: [{ id: 'f1', factor_type: 'totp', status: 'verified', created_at: '', updated_at: '' }], phone: [] },
      error: null,
    });

    const { result } = renderHook(() => useMFA());
    await act(async () => { await result.current.fetchFactors(); });
    expect(result.current.factors).toHaveLength(1);
    expect(result.current.isMFAEnabled).toBe(true);
  });
});
