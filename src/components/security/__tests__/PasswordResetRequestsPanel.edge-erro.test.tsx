/**
 * Refazer 1 do leitor unico do corpo de erro: `PasswordResetRequestsPanel`
 * migrou `throw error` para `new Error((await parseEdgeError(...)).message)`.
 * Este teste fixa que o toast de aprovar/rejeitar mostra a mensagem do
 * SERVIDOR, nao o "non-2xx" generico do SDK.
 */
import { describe, it, expect, vi, type Mock } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PasswordResetRequestsPanel } from '../PasswordResetRequestsPanel';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const REQUEST = {
  id: 'req-1',
  email: 'aguardando@ex.com',
  reason: 'Esqueci a senha',
  status: 'pending',
  reviewed_at: null,
  rejection_reason: null,
  ip_address: '10.0.0.1',
  created_at: '2026-10-01T10:00:00.000Z',
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: [REQUEST], error: null })),
      })),
    })),
    functions: { invoke: vi.fn() },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function edgeError(body: unknown) {
  return {
    message: 'Edge Function returned a non-2xx status code',
    context: { clone: () => ({ json: async () => body }) },
  };
}

describe('PasswordResetRequestsPanel — erro da edge com o leitor unico', () => {
  it('aprovar com corpo de erro mostra a mensagem do servidor (nao o "non-2xx")', async () => {
    (supabase.functions.invoke as unknown as Mock).mockResolvedValue({
      data: null,
      error: edgeError({ message: 'Ja aprovado por outro administrador' }),
    });

    const { unmount } = render(<PasswordResetRequestsPanel />);
    await waitFor(() => expect(screen.getByText('aguardando@ex.com')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /aprovar/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Ja aprovado por outro administrador');
    });
    expect(toast.success).not.toHaveBeenCalled();
    unmount();
  });
});
