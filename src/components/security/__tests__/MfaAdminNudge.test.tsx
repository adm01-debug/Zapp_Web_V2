import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const roleState = { isAdmin: true, loading: false };
const mfaState: { data: boolean | undefined } = { data: false };
const useHasVerifiedTotp = vi.fn((_enabled: boolean) => mfaState);
const storage = new Map<string, string>();

vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => roleState }));
vi.mock('@/hooks/auth/useMFA', () => ({ useHasVerifiedTotp: (e: boolean) => useHasVerifiedTotp(e) }));
vi.mock('@/lib/safeStorage', () => ({
  safeGetItem: (k: string) => storage.get(k) ?? null,
  safeSetItem: (k: string, v: string) => { storage.set(k, v); return true; },
}));

import { MfaAdminNudge } from '../MfaAdminNudge';

describe('MfaAdminNudge', () => {
  beforeEach(() => {
    useHasVerifiedTotp.mockClear();
    storage.clear();
    roleState.isAdmin = true;
    roleState.loading = false;
    mfaState.data = false;
  });

  it('mostra o aviso para admin sem TOTP verificado e navega para security', () => {
    const onNavigate = vi.fn();
    render(<MfaAdminNudge onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ativar 2FA' }));
    expect(onNavigate).toHaveBeenCalledWith('security');
    expect(useHasVerifiedTotp).toHaveBeenCalledWith(true);
  });

  it('nao mostra quando o admin ja tem fator verificado', () => {
    mfaState.data = true;
    render(<MfaAdminNudge onNavigate={vi.fn()} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('nao consulta fatores nem renderiza para nao-admin', () => {
    roleState.isAdmin = false;
    render(<MfaAdminNudge onNavigate={vi.fn()} />);
    expect(useHasVerifiedTotp).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('carregando/erro (undefined) nao incomoda', () => {
    mfaState.data = undefined;
    render(<MfaAdminNudge onNavigate={vi.fn()} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('dispensar esconde por 24h, persiste e desliga a query', () => {
    const { unmount } = render(<MfaAdminNudge onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dispensar por 24 horas' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(storage.get('zapp:mfa-nudge-dismissed-at')).toBeTruthy();
    unmount();

    useHasVerifiedTotp.mockClear();
    render(<MfaAdminNudge onNavigate={vi.fn()} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(useHasVerifiedTotp).toHaveBeenCalledWith(false);
  });
});
