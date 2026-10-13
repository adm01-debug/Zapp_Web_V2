import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PasswordResetRequestsPanel } from '../PasswordResetRequestsPanel';
import { ACCESS_DENIED_MESSAGE } from '@/lib/rlsError';

// Uma solicitação pendente: o botão "Aprovar" fica visível e dispara a Edge
// Function `approve-password-reset`.
const REQUESTS = [
  {
    id: '1', user_id: 'u1', email: 'pendente@ex.com', reason: null, status: 'pending',
    reviewed_by: null, reviewed_at: null, rejection_reason: null,
    ip_address: null, user_agent: null, created_at: '2026-10-01T10:00:00.000Z',
  },
];

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: REQUESTS, error: null })),
      })),
    })),
    functions: { invoke: mockInvoke },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from 'sonner';

describe('PasswordResetRequestsPanel — erro de RLS na aprovação', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra a mensagem fixa e NÃO vaza a tabela/policy do erro cru', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: {
        code: '42501',
        message:
          'new row violates row-level security policy for table "password_reset_requests"',
      },
    });

    render(<PasswordResetRequestsPanel />);
    await waitFor(() => expect(screen.queryByText('Carregando...')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Aprovar/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    const msg = vi.mocked(toast.error).mock.calls[0][0] as string;
    expect(msg).toBe(ACCESS_DENIED_MESSAGE);
    expect(msg).not.toContain('password_reset_requests');
    expect(msg).not.toContain('row-level security');
    expect(msg).not.toContain('42501');
  });

  it('erro que NÃO é de acesso mantém o comportamento anterior', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('Falha de rede') });

    render(<PasswordResetRequestsPanel />);
    await waitFor(() => expect(screen.queryByText('Carregando...')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Aprovar/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(vi.mocked(toast.error).mock.calls[0][0]).toBe('Falha de rede');
  });
});
