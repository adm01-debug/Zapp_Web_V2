/**
 * t_148b3c50 — acessibilidade e veracidade da tela de redefinição de senha.
 *
 * Antes:
 *  - `hasSession` começava false: com PKCE + detectSessionInUrl a troca do
 *    link é assíncrona, então 'Link Inválido' aparecia por um instante antes
 *    de a sessão chegar;
 *  - o olho de mostrar senha não tinha nome acessível nem aria-pressed;
 *  - os campos não tinham autoComplete="new-password";
 *  - senha vazada (HIBP) só era avisada: o botão seguia habilitado e o envio
 *    acontecia mesmo assim.
 *
 * Estes testes renderizam a tela REAL e falham sem a correção.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { createHash } from 'node:crypto';

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  updateUser: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => h.getSession(...a),
      updateUser: (...a: unknown[]) => h.updateUser(...a),
      onAuthStateChange: (...a: unknown[]) => h.onAuthStateChange(...a),
    },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ResetPassword from '../ResetPassword';

function Rotas() {
  return useRoutes([
    { path: '/reset-password', element: <ResetPassword /> },
    { path: '/auth', element: <div>TELA LOGIN</div> },
    { path: '/forgot-password', element: <div>TELA PEDIR LINK</div> },
  ]);
}

function cenario() {
  return render(
    <MemoryRouter initialEntries={['/reset-password']}>
      <Rotas />
    </MemoryRouter>,
  );
}

function sha1Upper(value: string): string {
  return createHash('sha1').update(value, 'utf8').digest('hex').toUpperCase();
}

const SENHA = 'Senha@Forte1';
const TEXTO_VERIFICANDO = 'Verificando link de recuperação…';

beforeEach(() => {
  h.getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  h.updateUser.mockResolvedValue({ error: null });
  h.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('ResetPassword — sem "Link Inválido" falso (t_148b3c50)', () => {
  it('mostra "Verificando" e NÃO "Link Inválido" enquanto a sessão é conferida', async () => {
    let resolver: (v: unknown) => void = () => {};
    h.getSession.mockReturnValue(new Promise((r) => { resolver = r; }));

    cenario();

    expect(screen.getByText(TEXTO_VERIFICANDO)).toBeTruthy();
    expect(screen.queryByText('Link Inválido')).toBeNull();

    await act(async () => {
      resolver({ data: { session: { access_token: 'tok' } } });
    });

    expect(await screen.findByLabelText('Nova Senha')).toBeTruthy();
    expect(screen.queryByText('Link Inválido')).toBeNull();
  });

  it('só mostra "Link Inválido" depois de a sessão ser conferida (sem sessão)', async () => {
    let resolver: (v: unknown) => void = () => {};
    h.getSession.mockReturnValue(new Promise((r) => { resolver = r; }));

    cenario();
    expect(screen.queryByText('Link Inválido')).toBeNull();
    expect(screen.getByText(TEXTO_VERIFICANDO)).toBeTruthy();

    await act(async () => {
      resolver({ data: { session: null } });
    });

    expect(await screen.findByText('Link Inválido')).toBeTruthy();
    expect(screen.queryByText(TEXTO_VERIFICANDO)).toBeNull();
  });
});

describe('ResetPassword — acessibilidade dos campos (t_148b3c50)', () => {
  it('o olho tem nome acessível, aria-pressed e alterna a visibilidade', async () => {
    cenario();
    const campo = (await screen.findByLabelText('Nova Senha')) as HTMLInputElement;

    const mostrar = screen.getByRole('button', { name: 'Mostrar senha' });
    expect(mostrar.getAttribute('aria-pressed')).toBe('false');
    expect(mostrar.getAttribute('aria-controls')).toBe('password');
    expect(campo.type).toBe('password');

    fireEvent.click(mostrar);

    const ocultar = screen.getByRole('button', { name: 'Ocultar senha' });
    expect(ocultar.getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByLabelText('Nova Senha') as HTMLInputElement).type).toBe('text');
    expect(screen.queryByRole('button', { name: 'Mostrar senha' })).toBeNull();
  });

  it('os dois campos pedem autoComplete="new-password"', async () => {
    cenario();
    const senha = await screen.findByLabelText('Nova Senha');
    const confirmar = await screen.findByLabelText('Confirmar Senha');
    expect(senha.getAttribute('autocomplete')).toBe('new-password');
    expect(confirmar.getAttribute('autocomplete')).toBe('new-password');
  });
});

describe('ResetPassword — senha vazada barra o envio (t_148b3c50)', () => {
  it('bloqueia o envio quando o HIBP confirma vazamento e mostra o motivo', async () => {
    const sha1 = sha1Upper(SENHA);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => `0000000000000000000000000000000000:3\n${sha1.slice(5)}:42\n`,
    }));
    vi.stubGlobal('fetch', fetchMock);

    cenario();
    await screen.findByLabelText('Nova Senha');

    fireEvent.change(screen.getByLabelText('Nova Senha'), { target: { value: SENHA } });
    fireEvent.change(screen.getByLabelText('Confirmar Senha'), { target: { value: SENHA } });

    // O veredito do medidor chega (debounce de 500 ms + resposta).
    expect(await screen.findByText('Senha comprometida!', undefined, { timeout: 4000 })).toBeTruthy();

    expect(
      await screen.findByText('A senha precisa atender aos requisitos e não pode estar em vazamentos conhecidos.'),
    ).toBeTruthy();

    const enviar = screen.getByRole('button', { name: /Alterar Senha/i });
    await waitFor(() => expect((enviar as HTMLButtonElement).disabled).toBe(true));

    fireEvent.click(enviar);
    await act(async () => { for (let i = 0; i < 3; i += 1) await Promise.resolve(); });
    expect(h.updateUser).not.toHaveBeenCalled();
  });
});
