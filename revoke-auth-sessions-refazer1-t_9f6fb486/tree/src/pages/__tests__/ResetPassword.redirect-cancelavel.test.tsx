/**
 * Polimento das telas de auth (t_051c55b9).
 *
 * Antes: a tela de redefinição de senha redirecionava para o login em 3s sem
 * aviso e sem saída — quem estivesse lendo o resultado era jogado para fora.
 * Agora o redirecionamento tem contagem regressiva VISÍVEL (5s) e o botão
 * "Ficar nesta página" cancela: nada navega depois do cancelamento.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, useRoutes } from 'react-router-dom';

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

const SENHA = 'Senha@Forte1';

async function flush() {
  await act(async () => {
    for (let i = 0; i < 3; i += 1) await Promise.resolve();
  });
}

async function preencherESubmeter() {
  fireEvent.change(screen.getByLabelText('Nova Senha'), { target: { value: SENHA } });
  fireEvent.change(screen.getByLabelText('Confirmar Senha'), { target: { value: SENHA } });
  fireEvent.click(screen.getByRole('button', { name: /Alterar Senha/i }));
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  h.getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  h.updateUser.mockResolvedValue({ error: null });
  h.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('ResetPassword — redirecionamento cancelável com contagem (t_051c55b9)', () => {
  it('mostra contagem regressiva a partir de 5s após o sucesso', async () => {
    cenario();
    await flush();
    await preencherESubmeter();

    expect(screen.getByText('Senha Alterada!')).toBeTruthy();
    expect(screen.getByText(/Redirecionando para login em 5s/)).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText(/Redirecionando para login em 4s/)).toBeTruthy();
  });

  it('navega para /auth quando a contagem chega a zero', async () => {
    cenario();
    await flush();
    await preencherESubmeter();

    await flush(); // cada decremento re-renderiza antes de agendar o próximo
    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    expect(screen.getByText('TELA LOGIN')).toBeTruthy();
  });

  it('"Ficar nesta página" cancela o redirecionamento', async () => {
    cenario();
    await flush();
    await preencherESubmeter();

    fireEvent.click(screen.getByRole('button', { name: 'Ficar nesta página' }));
    expect(screen.getByText(/Redirecionamento cancelado/)).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(screen.queryByText('TELA LOGIN')).toBeNull();
    expect(screen.getByText(/Redirecionamento cancelado/)).toBeTruthy();
  });
});
