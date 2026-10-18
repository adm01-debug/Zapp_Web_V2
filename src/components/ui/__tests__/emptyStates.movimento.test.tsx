/**
 * A11Y — movimento reduzido nas ilustrações de estado vazio e no selo pulsante.
 *
 * Prova, com o componente REAL, que com `prefers-reduced-motion: reduce`
 * nenhuma ilustração recebe `repeat: Infinity` (o portão devolve
 * `{ initial: false }`, estado estático). O controle positivo (mesma árvore,
 * sem reduzir) garante que o espião enxerga os loops — sem ele o teste poderia
 * passar por não estar medindo nada.
 *
 * Só o `useReducedMotion` e o `motion` são espionados; o resto do framer-motion
 * segue real (mesmo padrão de contactsMotion.test.ts).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { createElement, Fragment, type ComponentType, type ReactNode } from 'react';
import { Inbox } from 'lucide-react';

const reduzido = { value: true };
const registrado: Array<{ tag: string; props: Record<string, unknown> }> = [];

vi.mock('framer-motion', async (importOriginal) => {
  const real = await importOriginal<typeof import('framer-motion')>();
  const cache = new Map<string, ComponentType<Record<string, unknown>>>();
  const motion = new Proxy(real.motion, {
    get(target, tag: string) {
      if (typeof tag !== 'string') return Reflect.get(target, tag);
      if (!cache.has(tag)) {
        const Base = (target as unknown as Record<string, ComponentType<Record<string, unknown>>>)[tag];
        const Espiao = (props: Record<string, unknown>) => {
          registrado.push({ tag, props });
          return createElement(Base, props);
        };
        cache.set(tag, Espiao as ComponentType<Record<string, unknown>>);
      }
      return cache.get(tag);
    },
  });
  return { ...real, motion, useReducedMotion: () => reduzido.value };
});

import { illustrations } from '@/components/ui/empty-state-illustrations';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';

const loopsRegistrados = () =>
  registrado.filter(({ props }) => {
    const transition = props.transition as { repeat?: number } | undefined;
    return transition?.repeat === Infinity;
  });

const renderIlustracoes = () =>
  render(
    <>
      {Object.entries(illustrations).map(([nome, arte]) => (
        <Fragment key={nome}>{arte as ReactNode}</Fragment>
      ))}
    </>,
  );

beforeEach(() => {
  reduzido.value = true;
  registrado.length = 0;
});

describe('ilustrações de estado vazio — movimento reduzido', () => {
  it('1. com reduzir ligado, NENHUMA ilustração anima em loop', () => {
    renderIlustracoes();

    // 13 ilustrações, todas renderizadas de verdade.
    expect(registrado.length).toBeGreaterThan(0);
    expect(loopsRegistrados()).toEqual([]);
    expect(
      registrado.filter(({ props }) => props.transition !== undefined),
    ).toEqual([]);
  });

  it('2. controle: sem reduzir, os loops existem (o espião mede de verdade)', () => {
    reduzido.value = false;
    registrado.length = 0;

    renderIlustracoes();

    expect(loopsRegistrados().length).toBeGreaterThan(0);
  });

  it('3. o portão cobre o caso que o MotionConfig da raiz não pega: pathLength infinito', () => {
    // O gráfico de `dashboard` tem um loop de `pathLength` (não é transform,
    // por isso `reducedMotion="user"` não o desliga sozinho).
    reduzido.value = false;
    registrado.length = 0;
    renderIlustracoes();
    const pathLengthComLoop = registrado.filter(
      ({ props }) =>
        (props.animate as { pathLength?: unknown } | undefined)?.pathLength !== undefined &&
        (props.transition as { repeat?: number } | undefined)?.repeat === Infinity,
    );
    expect(pathLengthComLoop.length).toBeGreaterThan(0);

    reduzido.value = true;
    registrado.length = 0;
    renderIlustracoes();
    const pathLengthComLoopReduzido = registrado.filter(
      ({ props }) => (props.animate as { pathLength?: unknown } | undefined)?.pathLength !== undefined,
    );
    expect(pathLengthComLoopReduzido).toEqual([]);
  });
});

describe('selo pulsante do GenericEmptyState — movimento reduzido', () => {
  it('4. o selo usa motion-safe:animate-pulse (não anima com reduzir ligado)', () => {
    const { container } = render(
      <GenericEmptyState icon={Inbox} title="Nada por aqui" description="Sem itens para mostrar" />,
    );
    const selo = container.querySelector('.bg-accent');

    expect(selo).not.toBeNull();
    expect(selo?.className).toContain('motion-safe:animate-pulse');
    // Não pode sobrar classe de animação CRUA (a que ignora o reduzir movimento):
    // nenhuma classe do selo pode começar com o prefixo sem `motion-safe:`.
    const classes = (selo?.className ?? '').split(/\s+/);
    expect(classes.filter((c) => /^animate-/.test(c))).toEqual([]);
  });
});
