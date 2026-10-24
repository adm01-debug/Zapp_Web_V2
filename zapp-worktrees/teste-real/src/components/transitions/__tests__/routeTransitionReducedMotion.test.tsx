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
 * usuário usa. O que se mede é a DECISÃO da variante: o motor do Framer Motion é
 * substituído por um espião que registra as `variants` que o `RouteTransition` entregou
 * (o achado não mede a animação em si — a decisão da variante é o efeito demonstrado) e o
 * esperado é sempre computado pelos módulos REAIS (`buildVariants` + `resolveTransition`).
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AccessibilitySettings, HighContrastProvider } from '@/components/theme/HighContrastToggle';
import { RouteTransition } from '../RouteTransition';
import { buildVariants } from '../transitionVariants';
import { resolveTransition } from '../transitionConfig';

const captura = vi.hoisted(() => ({ variantesDaRota: [] as unknown[] }));

vi.mock('framer-motion', async (importOriginal) => {
  const real = await importOriginal<typeof import('framer-motion')>();
  const { createElement } = await import('react');
  // Um componente estável por tag (identidade fixa: o React não remonta a cada render) —
  // registra as variants recebidas e devolve um nó comum, sem animar.
  const porTag = new Map<string, (props: Record<string, unknown>) => unknown>();
  const motion = new Proxy(
    {},
    {
      get: (_alvo, tag: string) => {
        if (!porTag.has(tag)) {
          porTag.set(tag, (props: Record<string, unknown>) => {
            if (props.variants) captura.variantesDaRota.push(props.variants);
            return createElement(
              tag,
              { 'data-testid': 'no-da-rota', style: props.style, className: props.className },
              props.children as React.ReactNode,
            );
          });
        }
        return porTag.get(tag);
      },
    },
  );
  return {
    ...real,
    motion: motion as unknown as typeof real.motion,
    AnimatePresence: (({ children }: { children?: React.ReactNode }) =>
      children ?? null) as unknown as typeof real.AnimatePresence,
  };
});

const VARIANTE_SEM_ANIMACAO = buildVariants({ variant: 'none' });
const VARIANTE_DA_ROTA = buildVariants(resolveTransition('/2fa'));

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

function varianteAplicada() {
  return captura.variantesDaRota[captura.variantesDaRota.length - 1];
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
  captura.variantesDaRota.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RouteTransition — preferência de movimento reduzido (R2-INF-037)', () => {
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
        expect(varianteAplicada()).toEqual(VARIANTE_DA_ROTA);
        expect(varianteAplicada()).not.toEqual(VARIANTE_SEM_ANIMACAO);
      } else {
        expect(varianteAplicada()).toEqual(VARIANTE_SEM_ANIMACAO);
      }
    });
  });

  it('preferência já salva (usuário que volta) chega à rota sem passar pelo painel', async () => {
    sistemaPedeMovimentoReduzido(false);
    window.localStorage.setItem('reducedMotion', 'true');

    renderRota('/2fa');

    await waitFor(() => expect(varianteAplicada()).toEqual(VARIANTE_SEM_ANIMACAO));
  });

  it('ligar e desligar "Reduzir Movimento" troca a variante sem recarregar a página', async () => {
    sistemaPedeMovimentoReduzido(false);
    renderRota('/2fa');
    await waitFor(() => expect(varianteAplicada()).toEqual(VARIANTE_DA_ROTA));

    await abrirPainelELigarReduzirMovimento();
    await waitFor(() => expect(varianteAplicada()).toEqual(VARIANTE_SEM_ANIMACAO));
    // Mesma chave de preferência do painel (nada de segunda chave escondida).
    expect(window.localStorage.getItem('reducedMotion')).toBe('true');

    const chave = screen.getByRole('switch', { name: /Reduzir Movimento/i });
    fireEvent.click(chave);
    await waitFor(() => expect(chave).toHaveAttribute('aria-checked', 'false'));
    await waitFor(() => expect(varianteAplicada()).toEqual(VARIANTE_DA_ROTA));
  });
});
