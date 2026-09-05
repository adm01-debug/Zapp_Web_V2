import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const roleState = { isAdmin: true, loading: false };
const authState = { user: { id: 'admin-1' } as { id: string } | null };
const mfaState: { data: boolean | undefined } = { data: false };
const useHasVerifiedTotp = vi.fn((_enabled: boolean) => mfaState);
const storage = new Map<string, string>();

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => authState }));
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
    authState.user = { id: 'admin-1' };
    mfaState.data = false;
  });
  afterEach(() => vi.useRealTimers());

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

  it('dispensar e por usuario, persiste, desliga a query e volta apos 24h', () => {
    vi.useFakeTimers();
    const { unmount } = render(<MfaAdminNudge onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dispensar por 24 horas' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(storage.get('zapp:mfa-nudge-dismissed-until:admin-1')).toBeTruthy();

    // Passadas as 24h com a aba aberta, o aviso volta sozinho.
    act(() => { vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1); });
    expect(screen.getByRole('status')).toBeTruthy();
    unmount();

    // Outro admin no mesmo navegador nao herda a dispensa.
    storage.set('zapp:mfa-nudge-dismissed-until:admin-1', String(Date.now() + 60_000));
    authState.user = { id: 'admin-2' };
    useHasVerifiedTotp.mockClear();
    render(<MfaAdminNudge onNavigate={vi.fn()} />);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(useHasVerifiedTotp).toHaveBeenCalledWith(true);
  });
});
