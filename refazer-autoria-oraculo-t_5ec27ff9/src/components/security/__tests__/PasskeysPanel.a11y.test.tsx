import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * t_a07d8dd9 — botões só de ícone do PasskeysPanel (renomear/excluir) sem nome acessível
 * (axe `button-name`). Evidência da auditoria
 * (docs/audits/AUDITORIA_A11Y_MOBILE_CONFIG_ADMIN_SHELL_2026-10-07.md:51).
 */
vi.mock('@/hooks/auth/useWebAuthn', () => ({
  useWebAuthn: () => ({
    loading: false,
    passkeys: [
      {
        id: 'p-1',
        credential_id: 'cred-1',
        friendly_name: 'MacBook Pro',
        device_type: 'platform',
        created_at: '2026-10-01T00:00:00.000Z',
        last_used_at: null,
      },
    ],
    isSupported: () => true,
    isPlatformAuthenticatorAvailable: () => Promise.resolve(true),
    fetchPasskeys: vi.fn(),
    registerPasskey: vi.fn(),
    deletePasskey: vi.fn(),
    renamePasskey: vi.fn(),
  }),
}));

import { PasskeysPanel } from '../PasskeysPanel';

describe('a11y: botões de passkey com nome acessível', () => {
  it('os botões de renomear e excluir têm nome acessível', () => {
    render(<PasskeysPanel />);
    expect(screen.getByRole('button', { name: 'Renomear passkey' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir passkey' })).toBeInTheDocument();
  });
});
