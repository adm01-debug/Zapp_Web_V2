/**
 * R2-INF-037 — prova no DOM com o Framer Motion REAL (sem stub do motor de animação).
 *
 * A rota `/2fa` é `zoom`; a transição anima `scale`, e o Framer escreve a propriedade
 * `transform` no nó da rota quando a variante animada é aplicada. Com movimento reduzido
 * a variante é `none` (só opacidade) e o nó fica sem `transform` — é isso que o usuário
 * vê: nenhum zoom/slide chegando à tela. Aqui a preferência do usuário é a mesma que o
 * painel de Acessibilidade grava (`reducedMotion`), lida na montagem do provider — o
 * caminho de quem já tinha a opção ligada e abre o app.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HighContrastProvider } from '@/components/theme/HighContrastToggle';
import { RouteTransition } from '../RouteTransition';

function sistemaPedeMovimentoReduzido(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matches && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  }));
}

function renderRotaReduzida() {
  return render(
    <MemoryRouter initialEntries={['/2fa']}>
      <HighContrastProvider>
        <RouteTransition>
          <div data-testid="pagina">conteúdo da rota</div>
        </RouteTransition>
      </HighContrastProvider>
    </MemoryRouter>,
  );
}

const transformDaRota = () => (screen.getByTestId('pagina').parentElement as HTMLElement).style.transform;

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RouteTransition — animação efetiva (Framer Motion real)', () => {
  it('sem a opção ligada, o zoom da rota aplica transform no nó', async () => {
    sistemaPedeMovimentoReduzido(false);
    renderRotaReduzida();

    await waitFor(() => expect(transformDaRota()).not.toBe(''));
  });

  it('com a opção ligada, o nó da rota não recebe transform (nada de zoom)', async () => {
    sistemaPedeMovimentoReduzido(false);
    window.localStorage.setItem('reducedMotion', 'true');
    renderRotaReduzida();

    await waitFor(() => expect(transformDaRota()).toBe(''));
  });
});
