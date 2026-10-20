/**
 * Tela de acesso negado: explica e dá saída. O ponto de controle de
 * "reduzir movimento" é o `useReducedMotion` do framer-motion (é ele que lê
 * `prefers-reduced-motion` no app), por isso o mock está no hook.
 *
 * A rota atual é lida de verdade pelo router (`useLocation`) — o teste prova o
 * destino de cada botão, não uma resposta de mock.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import AccessDenied from '@/pages/AccessDenied';

const reduce = vi.hoisted(() => ({ value: false }));

vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => reduce.value,
}));

type Estado = { from?: { pathname?: string; search?: string } };

function SondaRota() {
  const { pathname } = useLocation();
  return <div data-testid="rota-atual">{pathname}</div>;
}

function renderTela(estado?: Estado, entradasAnteriores: string[] = []) {
  const entrada = { pathname: '/access-denied', state: estado };
  return render(
    <MemoryRouter initialEntries={[...entradasAnteriores, entrada]}>
      <SondaRota />
      <AccessDenied />
    </MemoryRouter>
  );
}

beforeEach(() => {
  reduce.value = false;
  cleanup();
});

describe('AccessDenied', () => {
  it('(1) mostra só o CAMINHO tentado — sem query nem hash', () => {
    renderTela({ from: { pathname: '/admin/roles', search: '?segredo=1' } });

    expect(screen.getByRole('heading', { name: 'Acesso negado' })).toBeTruthy();
    expect(screen.getByText('/admin/roles')).toBeTruthy();
    expect(screen.queryByText(/segredo/)).toBeNull();
  });

  it('(2) sem `state.from` não inventa rota', () => {
    renderTela(undefined);

    expect(screen.getByRole('heading', { name: 'Acesso negado' })).toBeTruthy();
    expect(screen.queryByText(/Rota solicitada/)).toBeNull();
  });

  it('(3) "Voltar" devolve para a tela anterior', () => {
    renderTela({ from: { pathname: '/admin/roles' } }, ['/origem']);
    expect(screen.getByTestId('rota-atual').textContent).toBe('/access-denied');

    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }));

    expect(screen.getByTestId('rota-atual').textContent).toBe('/origem');
  });

  it('(4) "Ir para o início" abre a raiz', () => {
    renderTela({ from: { pathname: '/admin/roles' } });

    fireEvent.click(screen.getByRole('button', { name: /Ir para o início/ }));

    expect(screen.getByTestId('rota-atual').textContent).toBe('/');
  });

  it('(5) Esc no container leva ao início (teclado, sem listener global)', () => {
    renderTela({ from: { pathname: '/admin/roles' } });

    fireEvent.keyDown(screen.getByTestId('access-denied'), { key: 'Escape' });

    expect(screen.getByTestId('rota-atual').textContent).toBe('/');
  });

  it('(6) marcado como movimento reduzido respeita prefers-reduced-motion', () => {
    reduce.value = true;
    renderTela();

    expect(screen.getByTestId('access-denied')).toHaveAttribute('data-motion', 'reduced');
  });

  it('(7) sem redução usa o movimento pleno', () => {
    reduce.value = false;
    renderTela();

    expect(screen.getByTestId('access-denied')).toHaveAttribute('data-motion', 'full');
  });
});
