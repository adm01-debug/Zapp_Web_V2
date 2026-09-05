import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const listFactors = vi.fn();
const roleState = { isAdmin: true, loading: false };
const storage = new Map<string, string>();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { mfa: { listFactors: (...a: unknown[]) => listFactors(...a) } } },
}));
vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => roleState }));
vi.mock('@/lib/safeStorage', () => ({
  safeGetItem: (k: string) => storage.get(k) ?? null,
  safeSetItem: (k: string, v: string) => { storage.set(k, v); return true; },
}));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn() } }));

import { MfaAdminNudge } from '../MfaAdminNudge';

describe('MfaAdminNudge', () => {
  beforeEach(() => {
    listFactors.mockReset();
    storage.clear();
    roleState.isAdmin = true;
    roleState.loading = false;
  });

  it('mostra o aviso para admin sem TOTP verificado e navega para security', async () => {
    listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
    const onNavigate = vi.fn();
    render(<MfaAdminNudge onNavigate={onNavigate} />);
    const btn = await screen.findByRole('button', { name: 'Ativar 2FA' });
    fireEvent.click(btn);
    expect(onNavigate).toHaveBeenCalledWith('security');
  });

  it('nao mostra quando o admin ja tem fator verificado', async () => {
    listFactors.mockResolvedValue({ data: { totp: [{ id: 'f1', status: 'verified' }] }, error: null });
    render(<MfaAdminNudge onNavigate={vi.fn()} />);
    await waitFor(() => expect(listFactors).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('nao consulta fatores nem renderiza para nao-admin', () => {
    roleState.isAdmin = false;
    render(<MfaAdminNudge onNavigate={vi.fn()} />);
    expect(listFactors).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('dispensar esconde por 24h (persistido) e em erro de listFactors nao incomoda', async () => {
    listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
    const { unmount } = render(<MfaAdminNudge onNavigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Dispensar por 24 horas' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(storage.get('zapp:mfa-nudge-dismissed-at')).toBeTruthy();
    unmount();

    render(<MfaAdminNudge onNavigate={vi.fn()} />);
    expect(screen.queryByRole('status')).toBeNull();

    storage.clear();
    listFactors.mockRejectedValue(new Error('boom'));
    render(<MfaAdminNudge onNavigate={vi.fn()} />);
    await waitFor(() => expect(listFactors).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
