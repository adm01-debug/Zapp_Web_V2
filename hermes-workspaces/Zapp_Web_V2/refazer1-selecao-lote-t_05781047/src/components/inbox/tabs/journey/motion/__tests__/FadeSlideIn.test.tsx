/**
 * J05 — `FadeSlideIn`: entrada em fade + 8 px, escalonada por índice (60 ms por
 * item, teto de 8 itens) e UMA vez só por elemento. Com "reduzir movimento" não
 * existe animação: o cartão já nasce no estado final.
 *
 * Duas provas complementares:
 *  1. comportamento — o `IntersectionObserver` é controlado pelo teste (o do
 *     `src/test/setup.ts` é um stub que nunca dispara), então "o cartão entrou na
 *     tela" é dito pelo teste do mesmo jeito que o navegador diria;
 *  2. contrato — o `motion.div` real continua sendo o que renderiza (o wrapper
 *     abaixo só ANOTA as props e repassa), e é nele que se conferem o atraso por
 *     índice, o teto de 8 itens e o `viewport` que dispara uma vez.
 * O item (2) existe porque `whileInView` do framer-motion é agendado em quadro de
 * animação: com tempo falso o observador nem chega a ser criado, e uma prova só
 * de "passou 50 ms" ficaria refém da carga da máquina.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { motion } from 'framer-motion';
import { FadeSlideIn } from '../FadeSlideIn';

type PropsDoMotion = {
  initial?: { opacity?: number; y?: number };
  whileInView?: { opacity?: number; y?: number };
  viewport?: { once?: boolean; margin?: string };
  transition?: { duration?: number; delay?: number; ease?: number[] };
};

const instrumentacao = vi.hoisted(() => ({
  registrados: [] as Array<Record<string, unknown>>,
  reduzido: false,
}));

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  const { createElement } = await import('react');
  const MdivReal = actual.motion.div;
  const MdivAnotado = (props: Record<string, unknown>) => {
    instrumentacao.registrados.push(props);
    return createElement(MdivReal as never, props);
  };
  return {
    ...actual,
    motion: { div: MdivAnotado },
    useReducedMotion: () => instrumentacao.reduzido,
  };
});

type Entrada = { isIntersecting: boolean; target: Element };
type CallbackInterseccao = (entradas: Entrada[]) => void;

const observadores: ObservadorControlado[] = [];

class ObservadorControlado {
  static desconectados = 0;
  alvos: Element[] = [];
  constructor(public cb: CallbackInterseccao) {
    observadores.push(this);
  }
  observe(alvo: Element) {
    this.alvos.push(alvo);
  }
  unobserve() {}
  disconnect() {
    ObservadorControlado.desconectados += 1;
  }
}

function montar(index = 0) {
  const utils = render(
    <FadeSlideIn index={index}>
      <span>episódio</span>
    </FadeSlideIn>,
  );
  const raiz = utils.container.firstElementChild as HTMLElement;
  const observador = observadores[observadores.length - 1];
  const entrar = () => act(() => observador.cb([{ isIntersecting: true, target: raiz }]));
  const sair = () => act(() => observador.cb([{ isIntersecting: false, target: raiz }]));
  return { ...utils, raiz, observador, entrar, sair };
}

const propsDoUltimo = () =>
  instrumentacao.registrados[instrumentacao.registrados.length - 1] as PropsDoMotion;

beforeEach(() => {
  instrumentacao.reduzido = false;
  instrumentacao.registrados.length = 0;
  observadores.length = 0;
  ObservadorControlado.desconectados = 0;
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: ObservadorControlado,
  });
});

afterEach(() => {
  cleanup();
});

describe('J05 FadeSlideIn — comportamento', () => {
  it('(1) nasce transparente e deslocado, entra uma vez e não volta atrás ao sair da tela', async () => {
    const { raiz, entrar, sair } = montar(0);

    expect(raiz.style.opacity).toBe('0');
    expect(raiz.style.transform).toContain('translateY(8px)');
    expect(screen.getByText('episódio')).toBeInTheDocument();

    entrar();
    await waitFor(() => expect(raiz.style.opacity).toBe('1'));
    expect(raiz.style.transform).not.toContain('translateY(8px)');

    sair();
    expect(raiz.style.opacity).toBe('1');
    expect(screen.getByText('episódio')).toBeInTheDocument();
  });

  it('(2) controle: com `once` falso o mesmo caminho repetiria a entrada (a prova do item 1 não é vazia)', async () => {
    const { container } = render(
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: false }}
        transition={{ duration: 0.05 }}
      >
        <span>controle</span>
      </motion.div>,
    );
    const raiz = container.firstElementChild as HTMLElement;
    const observador = observadores[observadores.length - 1];

    act(() => observador.cb([{ isIntersecting: true, target: raiz }]));
    await waitFor(() => expect(raiz.style.opacity).toBe('1'));

    act(() => observador.cb([{ isIntersecting: false, target: raiz }]));
    await waitFor(() => expect(raiz.style.opacity).toBe('0'));
  });

  it('(3) com reduzir movimento: sem opacidade, sem deslocamento e nenhum observador de tela', () => {
    instrumentacao.reduzido = true;
    const { raiz } = montar(3);

    expect(raiz.style.opacity).not.toBe('0');
    expect(raiz.style.transform).not.toContain('translateY(8px)');
    expect(screen.getByText('episódio')).toBeInTheDocument();
    expect(observadores).toHaveLength(0);
    expect(instrumentacao.registrados).toHaveLength(0); // nem motion.div foi usado
  });
});

describe('J05 FadeSlideIn — contrato do movimento', () => {
  it('(4) atraso de 60 ms por item com teto de 8: o 9º já entra sem atraso', () => {
    const esperado: Array<[number, number]> = [
      [0, 0],
      [1, 60],
      [7, 420],
      [8, 0], // do 9º em diante não há atraso
      [20, 0],
    ];
    for (const [index, atraso] of esperado) {
      instrumentacao.registrados.length = 0;
      cleanup();
      render(
        <FadeSlideIn index={index}>
          <span>item {index}</span>
        </FadeSlideIn>,
      );
      expect(propsDoUltimo().transition?.delay).toBe(atraso / 1000);
    }
  });

  it('(5) a entrada é 8 px, 200 ms (MOTION.base) e dispara uma vez quando o item aparece', () => {
    render(
      <FadeSlideIn index={2}>
        <span>episódio</span>
      </FadeSlideIn>,
    );

    const props = propsDoUltimo();
    expect(props.initial).toEqual({ opacity: 0, y: 8 });
    expect(props.whileInView).toEqual({ opacity: 1, y: 0 });
    expect(props.transition?.duration).toBe(0.2);
    expect(props.transition?.ease).toEqual([0.22, 1, 0.36, 1]);
    expect(props.viewport).toEqual({ once: true, margin: '0px 0px -40px 0px' });
  });
});
