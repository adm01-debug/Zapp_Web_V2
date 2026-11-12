/**
 * Testes de `src/pages/VerifyEmail.tsx` — a tela pública `/verify-email`
 * (`src/routes/AppRoutes.tsx`) aberta pelo link de confirmação de email.
 *
 * A tela REAL é montada num MemoryRouter; a única fronteira dublada é o
 * `supabase.auth` (getSession, onAuthStateChange e resend) e o toast.
 * Trava os quatro estados (verificando, sucesso, erro, expirado) e as ações de
 * cada um (ir ao dashboard, reenviar email, voltar ao login).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

type AuthCallback = (event: string, session: unknown) => void;

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  resend: vi.fn(),
  unsubscribe: vi.fn(),
  authCallback: null as AuthCallback | null,
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => h.getSession(...a),
      resend: (...a: unknown[]) => h.resend(...a),
      onAuthStateChange: (cb: AuthCallback) => {
        h.authCallback = cb;
        return { data: { subscription: { unsubscribe: h.unsubscribe } } };
      },
    },
  },
}));

vi.mock('sonner', () => ({ toast: h.toast }));

import VerifyEmail from '../VerifyEmail';

const sessao = { user: { email: 'ana@empresa.com' } };

function cenario(query = '?type=signup') {
  return render(
    <MemoryRouter initialEntries={[`/verify-email${query}`]}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/" element={<p>tela do dashboard</p>} />
        <Route path="/auth" element={<p>tela de login</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('VerifyEmail (/verify-email)', () => {
  beforeEach(() => {
    h.getSession.mockReset();
    h.resend.mockReset();
    h.unsubscribe.mockReset();
    h.authCallback = null;
    h.toast.success.mockReset();
    h.toast.error.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('link de cadastro com sessão: mostra sucesso com o email e leva ao dashboard', async () => {
    h.getSession.mockResolvedValue({ data: { session: sessao }, error: null });
    cenario('?type=signup&email=ana%40empresa.com');

    expect(await screen.findByText('Email Verificado!')).toBeInTheDocument();
    expect(screen.getByText('ana@empresa.com')).toBeInTheDocument();
    expect(h.toast.success).toHaveBeenCalledWith('Email verificado com sucesso!');

    fireEvent.click(screen.getByRole('button', { name: 'Ir para o Dashboard' }));
    expect(screen.getByText('tela do dashboard')).toBeInTheDocument();
  });

  it('erro ao ler a sessão: mostra erro, reenvia o email e volta ao login', async () => {
    h.getSession.mockResolvedValue({ data: { session: null }, error: new Error('falha') });
    h.resend.mockResolvedValue({ error: null });
    cenario('?type=email_change&email=ana%40empresa.com');

    expect(await screen.findByText('Erro na Verificação')).toBeInTheDocument();
    expect(screen.queryByText('Email Verificado!')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Reenviar Email/ }));
    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith('Email reenviado!'));
    expect(h.resend).toHaveBeenCalledWith(expect.objectContaining({ type: 'signup' }));

    fireEvent.click(screen.getByRole('button', { name: 'Voltar para Login' }));
    expect(screen.getByText('tela de login')).toBeInTheDocument();
  });

  it('falha no reenvio aparece como erro, não como sucesso', async () => {
    h.getSession.mockResolvedValue({ data: { session: null }, error: new Error('falha') });
    h.resend.mockResolvedValue({ error: new Error('rate limit') });
    cenario('?type=signup&email=ana%40empresa.com');

    fireEvent.click(await screen.findByRole('button', { name: /Reenviar Email/ }));

    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith('Erro ao reenviar email'));
    expect(h.toast.success).not.toHaveBeenCalledWith('Email reenviado!');
  });

  it('link de cadastro sem sessão: mostra link expirado e manda para o login', async () => {
    h.getSession.mockResolvedValue({ data: { session: null }, error: null });
    cenario('?type=signup&email=ana%40empresa.com');

    expect(await screen.findByText('Link Expirado')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fazer Login e Reenviar' }));
    expect(screen.getByText('tela de login')).toBeInTheDocument();
  });

  it('sem type: fica em "Verificando..." e resolve a sessão depois de 2s', async () => {
    vi.useFakeTimers();
    h.getSession.mockResolvedValue({ data: { session: sessao }, error: null });
    cenario('');

    expect(screen.getByText('Verificando...')).toBeInTheDocument();
    expect(h.getSession).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(h.getSession).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Email Verificado!')).toBeInTheDocument();
    expect(screen.getByText('ana@empresa.com')).toBeInTheDocument();
  });

  it('sem type e sem sessão após 2s: mostra link expirado', async () => {
    vi.useFakeTimers();
    h.getSession.mockResolvedValue({ data: { session: null }, error: null });
    cenario('');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(screen.getByText('Link Expirado')).toBeInTheDocument();
  });

  it('evento SIGNED_IN do Supabase leva ao sucesso e a saída cancela a assinatura', async () => {
    vi.useFakeTimers();
    h.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const { unmount } = cenario('');

    act(() => {
      h.authCallback?.('SIGNED_IN', sessao);
    });

    expect(screen.getByText('Email Verificado!')).toBeInTheDocument();
    expect(h.toast.success).toHaveBeenCalledWith('Email verificado com sucesso!');

    unmount();
    expect(h.unsubscribe).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.getSession).not.toHaveBeenCalled();
  });
});
