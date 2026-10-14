/**
 * Porteiro pós-login no retorno do SSO (t_a86bc967, ADR-007).
 *
 * Sessão social/OTP não entra no app antes de a Edge `post-login-gate` decidir
 * política de rede + conta ativa. Recusa (403, 503, erro de rede ou corpo
 * inesperado) = falha fechada: mensagem genérica em pt-BR, sessão encerrada e
 * volta para `/auth`. O teste renderiza a TELA real do callback.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
  signOut: vi.fn(),
  invoke: vi.fn(),
  navigate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  authCallback: null as null | ((event: string, session: unknown) => void),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      signOut: mocks.signOut,
    },
    functions: { invoke: mocks.invoke },
  },
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mocks.navigate };
});

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

import SSOCallback from '../SSOCallback';

const MENSAGEM_GENERICA = 'Acesso não autorizado. Tente novamente ou peça ajuda ao administrador.';

function renderCallback() {
  window.history.replaceState({}, '', '/sso-callback');
  return render(
    <MemoryRouter initialEntries={['/sso-callback']}>
      <SSOCallback />
    </MemoryRouter>,
  );
}

/** Deixa a cadeia getSession -> porteiro -> setStatus assentar. */
async function assentarFluxo() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authCallback = null;
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.invoke.mockResolvedValue({ data: { allowed: true }, error: null });
  mocks.onAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
    mocks.authCallback = cb;
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  });
});

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState({}, '', '/');
});

describe('SSOCallback — sessão social negada pelo porteiro não entra (t_a86bc967)', () => {
  it('consulta a Edge post-login-gate quando a sessão chega', async () => {
    renderCallback();
    await assentarFluxo();

    expect(mocks.invoke).toHaveBeenCalledWith('post-login-gate', { method: 'POST' });
  });

  it('recusa 403 do porteiro: mostra a mensagem genérica, encerra a sessão e volta a /auth', async () => {
    vi.useFakeTimers();
    mocks.invoke.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', name: 'FunctionsHttpError' },
    });

    renderCallback();
    await assentarFluxo();

    expect(screen.getByRole('alert').textContent).toContain(MENSAGEM_GENERICA);
    expect(mocks.signOut).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(mocks.navigate).toHaveBeenCalledWith('/auth', { replace: true });
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('não vaza o motivo da recusa (rede, país ou conta inativa)', async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: { message: 'Access denied' },
    });

    renderCallback();
    await assentarFluxo();

    const naTela = screen.getByRole('alert').textContent ?? '';
    expect(naTela).toContain(MENSAGEM_GENERICA);
    expect(naTela).not.toMatch(/rede|pa[íi]s|inativ|bloquead/i);
    expect(String(mocks.toastError.mock.calls[0]?.[0] ?? '')).toBe('Erro no login SSO');
  });

  it('porteiro indisponível (promessa rejeitada) também falha fechado', async () => {
    mocks.invoke.mockRejectedValue(new Error('Failed to fetch'));

    renderCallback();
    await assentarFluxo();

    expect(screen.getByRole('alert').textContent).toContain(MENSAGEM_GENERICA);
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('consulta o porteiro uma única vez quando getSession e SIGNED_IN chegam juntos', async () => {
    vi.useFakeTimers();
    renderCallback();
    await assentarFluxo();

    act(() => {
      mocks.authCallback?.('SIGNED_IN', { access_token: 't' });
    });
    await assentarFluxo();

    expect(mocks.invoke).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
  });
});

describe('SSOCallback — sessão social liberada segue o fluxo normal (t_a86bc967)', () => {
  it('com {allowed:true} anuncia o sucesso e navega para o destino', async () => {
    vi.useFakeTimers();
    mocks.invoke.mockResolvedValue({ data: { allowed: true }, error: null });

    renderCallback();
    await assentarFluxo();

    expect(screen.getByText('Login Realizado!')).toBeTruthy();
    expect(mocks.signOut).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(mocks.navigate).toHaveBeenCalledWith('/');
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
  });
});
