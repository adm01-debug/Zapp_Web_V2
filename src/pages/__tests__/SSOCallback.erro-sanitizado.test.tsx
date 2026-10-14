/**
 * Callback do SSO (t_051c55b9 + t_f7e0f50f).
 *
 * A mensagem de erro chega pela URL (`error_code`/`error_description`/`error`),
 * ou seja, o texto é escolhido por quem monta o link. Textos conhecidos do
 * provedor viram pt-BR; o resto é cortado em 200 caracteres, perde caracteres de
 * marcação e cai num texto genérico quando não sobra nada.
 *
 * A sessão pode chegar por dois caminhos (getSession e SIGNED_IN): o sucesso só
 * pode anunciar uma vez e redirecionar uma vez. Provado renderizando a TELA real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
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
    },
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

function renderComQuery(query: string) {
  window.history.replaceState({}, '', '/sso-callback' + query);
  return render(
    <MemoryRouter initialEntries={['/sso-callback']}>
      <SSOCallback />
    </MemoryRouter>,
  );
}

function renderComErroNaUrl(raw: string) {
  return renderComQuery('?error_description=' + encodeURIComponent(raw));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authCallback = null;
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mocks.onAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
    mocks.authCallback = cb;
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  });
  window.history.replaceState({}, '', '/sso-callback');
});

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState({}, '', '/');
});

describe('SSOCallback — erro da URL exibido como texto (t_051c55b9)', () => {
  it('exibe a mensagem sem os caracteres de marcação', () => {
    renderComErroNaUrl('<b>credenciais inválidas</b>');

    const texto = screen.getByText(/credenciais inválidas/);
    expect(texto.textContent).not.toMatch(/[<>]/);
    expect(texto.textContent).toContain('credenciais inválidas');
  });

  it('limita a mensagem a 200 caracteres na tela', () => {
    renderComErroNaUrl('a'.repeat(500));

    const texto = screen.getByText(/^a+$/);
    expect(texto.textContent).toHaveLength(200);
  });

  it('cai no texto genérico quando a URL só traz marcação', () => {
    renderComErroNaUrl('<>"\'&`');

    expect(screen.getByText('Ocorreu um erro durante a autenticação')).toBeTruthy();
  });
});

describe('SSOCallback — erros do provedor em pt-BR (t_f7e0f50f)', () => {
  it('traduz error_code=signup_disabled', () => {
    renderComQuery('?error_code=signup_disabled');

    expect(screen.getByText('Sua conta não está liberada. Peça ao administrador.')).toBeTruthy();
  });

  it('traduz "Signups not allowed for this instance" (error_description)', () => {
    renderComErroNaUrl('Signups not allowed for this instance');

    expect(screen.getByText('Sua conta não está liberada. Peça ao administrador.')).toBeTruthy();
  });

  it('traduz error_code=user_banned', () => {
    renderComQuery('?error_code=user_banned');

    expect(screen.getByText('Sua conta está desativada. Peça ao administrador.')).toBeTruthy();
  });

  it('traduz error_code=access_denied', () => {
    renderComQuery('?error_code=access_denied');

    expect(
      screen.getByText('Acesso não autorizado. Tente novamente ou peça ajuda ao administrador.'),
    ).toBeTruthy();
  });

  it('anuncia o erro com role=alert', () => {
    renderComQuery('?error_code=signup_disabled');

    expect(screen.getByRole('alert').textContent).toContain('Sua conta não está liberada');
  });
});

describe('SSOCallback — um único sucesso e um único redirecionamento (t_f7e0f50f)', () => {
  it('navega e avisa uma vez só quando getSession e SIGNED_IN chegam juntos', async () => {
    vi.useFakeTimers();
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null });

    renderComQuery('');

    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      mocks.authCallback?.('SIGNED_IN', { access_token: 't' });
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });

  it('anuncia o sucesso com role=status', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null });

    renderComQuery('');

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('Login Realizado!')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Login Realizado!');
  });

  it('não navega depois de desmontar — o timer de redirecionamento é limpo', async () => {
    vi.useFakeTimers();
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null });

    const { unmount } = renderComQuery('');
    await act(async () => {
      await Promise.resolve();
    });

    unmount();
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
