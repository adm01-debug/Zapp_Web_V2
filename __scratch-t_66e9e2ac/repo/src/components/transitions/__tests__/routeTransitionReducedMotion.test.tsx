/**
 * R2-INF-037 — "Controle de movimento reduzido e transições de rota usam preferências
 * desconectadas".
 *
 * O painel de Acessibilidade (Sidebar → `AccessibilitySettings`) grava a preferência
 * `reducedMotion` e aplica a classe `reduced-motion` no <html>. O hook das transições lia
 * a chave PRIVADA `zapp:reduce-motion`, que NENHUM controle escrevia: com a opção ligada
 * na tela, o `RouteTransition` continuava escolhendo slide/zoom/fade em vez de `none`.
 *
 * A prova monta o `HighContrastProvider` REAL, o painel REAL e o `RouteTransition` REAL
 * numa rota com transição de transform (`/2fa` → zoom), e liga a opção pelo switch que o
 * usuário usa. O que se mede é a DECISÃO da variante, agora observável na própria
 * animação que chega ao nó da rota.
 *
 * SL-103A (09/10/2026): a decisão deixou de ser entregue ao runtime de animação por JS
 * (que era carregado no pacote inicial) e passou a ser a classe de animação do tema
 * (`motion-safe:animate-scale-in` no zoom, nada com movimento reduzido). Este arquivo
 * trocou o espião do motor de animação pelo atributo real — as MESMAS seis verificações
 * de preferência (4 combinações usuário/sistema, preferência salva e alternar no painel)
 * continuam, e o esperado segue ancorado no módulo REAL `resolveTransition`.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AccessibilitySettings, HighContrastProvider } from '@/components/theme/HighContrastToggle';
import { RouteTransition } from '../RouteTransition';
import { resolveTransition } from '../transitionConfig';

// Rota sob teste: `/2fa` é zoom. A expectativa vem do módulo real, não de um literal.
const CLASSE_DA_ROTA = `motion-safe:animate-${resolveTransition('/2fa').variant === 'zoom' ? 'scale-in' : 'fade-in'}`;

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

function renderRota(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <HighContrastProvider>
        <AccessibilitySettings />
        <RouteTransition>
          <div>conteúdo da rota</div>
        </RouteTransition>
      </HighContrastProvider>
    </MemoryRouter>,
  );
}

/** Animação que o nó da rota (o pai do conteúdo) recebeu. */
function animacoesDaRota() {
  const no = screen.getByText('conteúdo da rota').parentElement as HTMLElement;
  return no.className.match(/animate-[a-z-]+/g) ?? [];
}

async function abrirPainelELigarReduzirMovimento() {
  fireEvent.click(screen.getByLabelText('Configurações de acessibilidade'));
  const chave = await screen.findByRole('switch', { name: /Reduzir Movimento/i });
  fireEvent.click(chave);
  await waitFor(() => expect(chave).toHaveAttribute('aria-checked', 'true'));
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RouteTransition — preferência de movimento reduzido (R2-INF-037)', () => {
  it('a rota sob teste é a de zoom (a expectativa do arquivo sai daqui)', () => {
    expect(resolveTransition('/2fa').variant).toBe('zoom');
    expect(CLASSE_DA_ROTA).toBe('motion-safe:animate-scale-in');
  });

  const casos = [
    { rotulo: 'opção desligada e sistema sem preferência: a rota anima (zoom)', usuario: false, sistema: false },
    { rotulo: 'opção ligada no painel e sistema sem preferência: a rota NÃO anima', usuario: true, sistema: false },
    { rotulo: 'opção desligada e sistema pedindo redução: a rota NÃO anima', usuario: false, sistema: true },
    { rotulo: 'opção ligada no painel e sistema pedindo redução: a rota NÃO anima', usuario: true, sistema: true },
  ];

  it.each(casos)('$rotulo', async ({ usuario, sistema }) => {
    sistemaPedeMovimentoReduzido(sistema);
    renderRota('/2fa');

    if (usuario) await abrirPainelELigarReduzirMovimento();

    const deveAnimar = !usuario && !sistema;
    await waitFor(() => {
      if (deveAnimar) {
        expect(animacoesDaRota()).toEqual([CLASSE_DA_ROTA.replace('motion-safe:', '')]);
      } else {
        expect(animacoesDaRota()).toEqual([]);
      }
    });
  });

  it('preferência já salva (usuário que volta) chega à rota sem passar pelo painel', async () => {
    sistemaPedeMovimentoReduzido(false);
    window.localStorage.setItem('reducedMotion', 'true');

    renderRota('/2fa');

    await waitFor(() => expect(animacoesDaRota()).toEqual([]));
  });

  it('ligar e desligar "Reduzir Movimento" troca a animação da rota sem recarregar a página', async () => {
    sistemaPedeMovimentoReduzido(false);
    renderRota('/2fa');
    await waitFor(() => expect(animacoesDaRota()).toEqual([CLASSE_DA_ROTA.replace('motion-safe:', '')]));

    await abrirPainelELigarReduzirMovimento();
    await waitFor(() => expect(animacoesDaRota()).toEqual([]));
    // Mesma chave de preferência do painel (nada de segunda chave escondida).
    expect(window.localStorage.getItem('reducedMotion')).toBe('true');

    const chave = screen.getByRole('switch', { name: /Reduzir Movimento/i });
    fireEvent.click(chave);
    await waitFor(() => expect(chave).toHaveAttribute('aria-checked', 'false'));
    await waitFor(() => expect(animacoesDaRota()).toEqual([CLASSE_DA_ROTA.replace('motion-safe:', '')]));
  });
});
