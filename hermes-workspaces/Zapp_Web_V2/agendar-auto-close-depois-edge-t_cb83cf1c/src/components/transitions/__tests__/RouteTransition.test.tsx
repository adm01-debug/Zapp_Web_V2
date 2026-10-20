/**
 * SL-103A — a entrada de rota passou a ser animação CSS do tema (sem o runtime de
 * animação por JS no pacote inicial). Este arquivo prova o comportamento preservado:
 * cada rota continua entrando com o movimento que `transitionConfig` define, o nó da
 * rota continua declarando o estado final do transform, a troca de rota troca a
 * animação, e com movimento reduzido a rota não anima.
 *
 * O esperado sai dos módulos REAIS (`resolveTransition`) — os nomes de classe são a
 * tradução do token de animação equivalente (ver ENTRADA_POR_DIRECAO em
 * `RouteTransition.tsx`: o token descreve o sentido do movimento, `direction` diz de
 * onde a rota vem).
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Link, MemoryRouter } from 'react-router-dom';
import { HighContrastProvider } from '@/components/theme/HighContrastToggle';
import { RouteTransition } from '../RouteTransition';
import { resolveTransition } from '../transitionConfig';

const FONTE = readFileSync(resolve(process.cwd(), 'src/components/transitions/RouteTransition.tsx'), 'utf8');

function renderRota(path: string, children: React.ReactNode = <div>conteúdo da rota</div>) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <HighContrastProvider>
        <RouteTransition>{children}</RouteTransition>
      </HighContrastProvider>
    </MemoryRouter>,
  );
}

const noDaRota = () => screen.getByText('conteúdo da rota').parentElement as HTMLElement;
const animacoesDaRota = () => noDaRota().className.match(/animate-[a-z-]+/g) ?? [];

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RouteTransition — entrada por rota (SL-103A)', () => {
  it('mantém o sentido do movimento configurado por rota', () => {
    expect(resolveTransition('/auth')).toMatchObject({ variant: 'fade' });
    expect(resolveTransition('/2fa')).toMatchObject({ variant: 'zoom' });
    expect(resolveTransition('/queue')).toMatchObject({ variant: 'slide', direction: 'right' });
    expect(resolveTransition('/install')).toMatchObject({ variant: 'slide', direction: 'up' });
  });

  const casos = [
    { rotulo: 'fade entra com fade-in', path: '/auth', classe: 'animate-fade-in' },
    { rotulo: 'zoom entra com scale-in', path: '/2fa', classe: 'animate-scale-in' },
    {
      rotulo: 'rota que vem da direita anda para a esquerda (slide-left)',
      path: '/queue',
      classe: 'animate-slide-left',
    },
    {
      rotulo: 'rota que vem de cima desce (slide-down)',
      path: '/install',
      classe: 'animate-slide-down',
    },
  ];

  it.each(casos)('$rotulo', ({ path, classe }) => {
    renderRota(path);

    // `motion-safe:` mantém a animação fora do alcance de quem pede movimento reduzido.
    expect(animacoesDaRota()).toEqual([classe]);
    expect(noDaRota().className).toContain(`motion-safe:${classe}`);
  });

  it('declara o estado estável do transform só nas variantes que deslocam', () => {
    const { unmount } = renderRota('/2fa');
    expect(noDaRota().style.transform).toBe('scale(1)');
    expect(noDaRota().style.height).toBe('100%');
    unmount();

    renderRota('/auth');
    expect(noDaRota().style.transform).toBe('');
  });

  it('troca a animação ao trocar de rota, sem tocar no resto do nó', async () => {
    renderRota(
      '/auth',
      <div>
        conteúdo da rota
        <Link to="/2fa">ir para o 2fa</Link>
      </div>,
    );
    expect(animacoesDaRota()).toEqual(['animate-fade-in']);

    fireEvent.click(screen.getByText('ir para o 2fa'));

    await waitFor(() => expect(animacoesDaRota()).toEqual(['animate-scale-in']));
  });

  it('com movimento reduzido nenhuma animação de rota é aplicada', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }));

    renderRota('/2fa');

    await waitFor(() => expect(animacoesDaRota()).toEqual([]));
    expect(noDaRota().style.transform).toBe('');
  });
});

describe('RouteTransition.tsx — sem o runtime de animação no caminho inicial (SL-103A)', () => {
  it('não importa nem usa o runtime de animação por JS', () => {
    expect(FONTE).not.toMatch(/from ['"]framer-motion['"]/);
    expect(FONTE).not.toMatch(/\bmotion\.[a-z]/);
    expect(FONTE).not.toMatch(/\bAnimatePresence\b/);
    expect(FONTE).not.toMatch(/variants=/);
    expect(FONTE).not.toMatch(/whileHover=/);
    expect(FONTE).not.toMatch(/whileTap=/);
  });
});
