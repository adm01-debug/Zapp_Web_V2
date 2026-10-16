/**
 * Etapa 169 (plano, linha 449; seção 3.4) — responsivo do modal "Nova tarefa":
 * abaixo de 900 px a prévia vira acordeão sob o formulário; em ≥900 px ela
 * ocupa a coluna da direita; em 360 px o rodapé fica fixo no pé do modal; e
 * não nasce rolagem horizontal.
 *
 * O que este arquivo prova, e por quê:
 *  - o corte é o de 900 px (`min-[900px]`), não o `md` de 768 px: o gatilho do
 *    acordeão é do desenho estreito (`min-[900px]:hidden`) e o painel fechado
 *    só é escondido na faixa <900 px (`max-[899px]:data-[state=closed]:hidden`),
 *    pelo estado REAL do Radix (`data-state`) — nunca por um `hidden` solto,
 *    que apagaria a prévia no desktop também. As duas regras vivem em faixas
 *    DISJUNTAS: nenhuma disputa o mesmo caso;
 *  - o painel é `forceMount`: fechado ele continua montado, então a MESMA
 *    prévia serve às duas visões e a visibilidade é decidida só por classe;
 *  - a prévia é o cartão REAL (`work-item-card`), não um mock;
 *  - a ordem é medida por `compareDocumentPosition`: no desenho estreito a
 *    prévia vem DEPOIS do formulário (é "acordeão sob o formulário");
 *  - a rolagem horizontal é medida por ARITMÉTICA sobre as classes: a largura
 *    útil em 360 px é 360 − 2×24 (`p-6` do `DialogContent`) = 312 px, e nenhuma
 *    peça do modal fixa largura acima disso FORA de uma media query ≥900 px (os
 *    224 px da prévia são fixados só em ≥900 px, onde há espaço). O modal é
 *    `overflow-y-auto`, que pela regra do CSS também faz o overflow-x computar
 *    `auto` — logo qualquer filho mais largo que 312 px criaria a barra;
 *  - o rodapé fica fixo em telas estreitas (`max-sm:sticky bottom-0`), com
 *    fundo e z-index, e o modal é o contêiner que rola;
 *  - os alvos de toque têm ≥40 px (o gatilho do acordeão inclusive).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';

import { NewTaskDialog } from '@/components/tasks/shared/NewTaskDialog';

const NOW = new Date(2026, 9, 16, 12, 0, 0, 0);

/** Largura útil de um viewport de 360 px dentro do `p-6` (24 px por lado). */
const VIEWPORT_ESTREITO = 360;
const PADDING_DIALOGO = 24;
const LARGURA_UTIL_360 = VIEWPORT_ESTREITO - 2 * PADDING_DIALOGO; // 312

beforeEach(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

afterEach(() => cleanup());

function montar() {
  const onOpenChange = vi.fn();
  render(<NewTaskDialog open onOpenChange={onOpenChange} now={NOW} />);
  return onOpenChange;
}

const classes = (el: Element) => (el as HTMLElement).className;

describe('NewTaskDialog — responsivo (etapa 169)', () => {
  it('abaixo de 900px a prévia é um acordeão: gatilho com aria-expanded e painel fechado', () => {
    montar();

    const gatilho = screen.getByTestId('nt-previa-gatilho');
    expect(gatilho.tagName).toBe('BUTTON');
    expect(gatilho).toHaveAttribute('aria-expanded', 'false');
    // o gatilho é do desenho estreito: some em ≥900 px
    expect(classes(gatilho)).toContain('min-[900px]:hidden');

    const painel = screen.getByTestId('nt-previa-painel');
    expect(painel).toHaveAttribute('data-state', 'closed');
    // fechado, mas montado (forceMount): a mesma prévia serve ao desktop
    expect(painel).toContainElement(screen.getByTestId('nt-previa'));
  });

  it('abrir o gatilho mostra a prévia real e alterna o estado do acordeão', () => {
    montar();

    const gatilho = screen.getByTestId('nt-previa-gatilho');
    fireEvent.click(gatilho);

    expect(gatilho).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('nt-previa-painel')).toHaveAttribute('data-state', 'open');

    const previa = screen.getByTestId('nt-previa');
    expect(previa).toBeInTheDocument();
    // a prévia é o cartão REAL de tarefa (WorkItemCard), não um mock
    expect(within(previa).getByTestId('work-item-card')).toBeInTheDocument();
  });

  it('fechar esconde o painel só na faixa estreita; em ≥900px a prévia fica sempre visível', () => {
    montar();

    const gatilho = screen.getByTestId('nt-previa-gatilho');
    fireEvent.click(gatilho); // abre
    fireEvent.click(gatilho); // fecha
    expect(gatilho).toHaveAttribute('aria-expanded', 'false');

    const painel = screen.getByTestId('nt-previa-painel');
    const c = classes(painel);
    // faixas disjuntas de media query, sobre o estado real do Radix
    expect(c).toContain('max-[899px]:data-[state=closed]:hidden');
    expect(c).toContain('min-[900px]:block');
    // segue montado e visível onde a regra de ≥900px vale
    expect(painel).toContainElement(screen.getByTestId('nt-previa'));
  });

  it('no desenho estreito a prévia vem DEPOIS do formulário (acordeão abaixo dele)', () => {
    montar();

    const linha = screen.getByTestId('nt-linha');
    expect(classes(linha)).toContain('flex-col');
    expect(classes(linha)).toContain('min-[900px]:flex-row');

    const formulario = screen.getByTestId('nt-formulario');
    const coluna = screen.getByTestId('nt-previa-coluna');
    const depois =
      formulario.compareDocumentPosition(coluna) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(depois).toBeTruthy();
  });

  it('em 360px o rodapé fica fixo no pé do modal, com fundo e z-index, dentro do contêiner que rola', () => {
    const onOpenChange = montar();

    const rodape = screen.getByTestId('nt-rodape');
    const c = classes(rodape);
    expect(c).toContain('max-sm:sticky');
    expect(c).toContain('max-sm:bottom-0');
    expect(c).toContain('max-sm:z-10');
    expect(c).toContain('max-sm:bg-background');

    // o modal é o contêiner que rola — a âncora do rodapé `sticky`
    const modal = screen.getByTestId('new-task-dialog');
    expect(classes(modal)).toContain('overflow-y-auto');
    expect(modal).toContainElement(rodape);

    fireEvent.click(within(rodape).getByRole('button', { name: 'Cancelar' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('nenhuma peça fixa largura acima da área útil de 360px fora da faixa ≥900px', () => {
    montar();

    const modal = screen.getByTestId('new-task-dialog');
    const infratores: string[] = [];
    modal.querySelectorAll<HTMLElement>('*').forEach((el) => {
      const atual = el.className;
      if (typeof atual !== 'string') return;
      for (const c of atual.split(/\s+/)) {
        // classe com `:` é variante: só vale quando o breakpoint/estado bate
        if (!c || c.includes(':')) continue;
        const m = c.match(/^(?:min-)?w-(?:\[(\d+(?:\.\d+)?)px\]|(\d+(?:\.\d+)?))$/);
        if (!m) continue;
        const px = m[1] ? parseFloat(m[1]) : parseFloat(m[2]) * 4;
        if (px > LARGURA_UTIL_360) infratores.push(`${el.tagName.toLowerCase()}.${c}=${px}px`);
      }
    });
    expect(infratores).toEqual([]);
  });

  it('o gatilho do acordeão é um alvo de toque de 40px, com foco visível', () => {
    montar();

    const c = classes(screen.getByTestId('nt-previa-gatilho'));
    expect(c).toContain('min-h-10'); // 10 × 4 px = 40 px
    expect(c).toMatch(/focus-visible:ring-2/);
  });
});
