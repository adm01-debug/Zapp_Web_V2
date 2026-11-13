/**
 * Reenvio no estado de erro de `src/pages/VerifyEmail.tsx`.
 *
 * No erro não existe sessão, então o email nunca vinha preenchido e
 * "Reenviar Email" chamava `supabase.auth.resend` com `email: ''`.
 * Regra travada: o reenvio nunca sai com email vazio; usa o `?email=` da URL
 * quando existe, ou o que o usuário digitar no campo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  resend: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: (...a: unknown[]) => h.getSession(...a),
      resend: (...a: unknown[]) => h.resend(...a),
    },
  },
}));

vi.mock('sonner', () => ({ toast: h.toast }));

import VerifyEmail from '../VerifyEmail';

function abrir(query: string) {
  render(
    <MemoryRouter initialEntries={[`/verify-email${query}`]}>
      <VerifyEmail />
    </MemoryRouter>,
  );
}

describe('VerifyEmail — reenviar no estado de erro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getSession.mockResolvedValue({ data: { session: null }, error: new Error('falhou') });
    h.resend.mockResolvedValue({ error: null });
  });

  it('sem email conhecido, clicar em Reenviar não chama resend com email vazio', async () => {
    abrir('?type=signup');
    const botao = await screen.findByRole('button', { name: /reenviar email/i });
    fireEvent.click(botao);
    await new Promise((r) => setTimeout(r, 0));
    expect(h.resend).not.toHaveBeenCalled();
  });

  it('reenvia para o email digitado no campo', async () => {
    abrir('?type=signup');
    await screen.findByRole('heading', { name: /erro na verificação/i });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: '  ana@exemplo.com ' } });
    fireEvent.click(screen.getByRole('button', { name: /reenviar email/i }));
    await waitFor(() =>
      expect(h.resend).toHaveBeenCalledWith({ type: 'signup', email: 'ana@exemplo.com' }),
    );
    expect(h.toast.success).toHaveBeenCalledWith('Email reenviado!');
  });

  it('usa o ?email= da URL quando o link o traz', async () => {
    abrir('?type=signup&email=bia%40exemplo.com');
    fireEvent.click(await screen.findByRole('button', { name: /reenviar email/i }));
    await waitFor(() =>
      expect(h.resend).toHaveBeenCalledWith({ type: 'signup', email: 'bia@exemplo.com' }),
    );
  });
});
