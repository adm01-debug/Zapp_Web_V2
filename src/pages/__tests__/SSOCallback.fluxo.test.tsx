/**
 * SSOCallback — t_62a7ee39.
 *
 * Prova os estados reais do callback: sessão que já existe (redirect rápido),
 * logout durante o callback, timeout de 10s (sem spinner infinito) e erro vindo
 * na URL — sempre terminando em navegação ou tela explícita.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, useRoutes } from 'react-router-dom';

type AuthCb = (event: string, session: unknown) => void;

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  cb: null as AuthCb | null,
  unsubscribe: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => h.getSession(...a),
      onAuthStateChange: (cb: AuthCb) => {
        h.cb = cb;
        return { data: { subscription: { unsubscribe: h.unsubscribe } } };
      },
    },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/postLoginRedirect', () => ({ resolverDestinoPosLogin: () => '/painel' }));

import SSOCallback from '../SSOCallback';

function Rotas() {
  return useRoutes([
    { path: '/sso-callback', element: <SSOCallback /> },
    { path: '/painel', element: <div>PAINEL</div> },
    { path: '/auth', element: <div>TELA LOGIN</div> },
  ]);
}

function cenario() {
  return render(
    <MemoryRouter initialEntries={['/sso-callback']}>
      <Rotas />
    </MemoryRouter>,
  );
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState({}, '', '/sso-callback');
  h.cb = null;
  h.getSession.mockResolvedValue({ data: { session: null }, error: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('SSOCallback — fluxo', () => {
  it('mostra o estado de autenticação em andamento', () => {
    cenario();
    expect(screen.getByText('Autenticando...')).toBeTruthy();
  });

  it('sessão já presente mostra sucesso e navega para o destino', async () => {
    h.getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } }, error: null });
    cenario();
    await flush();

    expect(screen.getByText('Login Realizado!')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(screen.getByText('PAINEL')).toBeTruthy();
  });

  it('SIGNED_OUT mostra "Sessão não encontrada"', async () => {
    cenario();
    await flush();

    await act(async () => {
      h.cb?.('SIGNED_OUT', null);
    });
    expect(screen.getByText('Sessão não encontrada')).toBeTruthy();
    expect(screen.queryByText('PAINEL')).toBeNull();
  });

  it('sem nada em 10s cai no erro de tempo esgotado (não trava em loading)', async () => {
    cenario();
    await flush();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(screen.getByText('Tempo esgotado. Tente novamente.')).toBeTruthy();
  });

  it('erro na URL vira tela de erro já sanitizada, sem esperar', async () => {
    window.history.replaceState({}, '', '/sso-callback?error_description=%3Cscript%3Ex%3C/script%3Efalhou');
    cenario();
    await flush();

    expect(screen.getByText('Erro no Login')).toBeTruthy();
    expect(screen.getByText(/falhou/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('<script>');
  });
});
