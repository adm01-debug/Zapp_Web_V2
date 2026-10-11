/**
 * Etapas 145–146 do plano (imagem 03) — o painel "Detalhes da tarefa" como
 * painel de DETALHES no desktop e com memória de largura:
 *  - 145 De `md` (768px) para cima o painel é NÃO modal: sem overlay, o Quadro
 *        continua clicável e clicar em OUTRO cartão troca o item do painel sem
 *        fechá-lo (D14). Abaixo de `md` continua bottom sheet MODAL — o clique
 *        fora segue protegendo a edição pendente (etapa 143).
 *  - 146 Expandido usa ≈ 70% da largura da janela e a escolha é lembrada pelo
 *        NAVEGADOR (`localStorage`, D11), não pelo registro.
 *
 * A prova é sempre pelo componente REAL (`WorkItemSheet`), com o `matchMedia`
 * trocado do lado de fora — é ele quem responde "é desktop ou celular?".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

vi.mock('@/components/catalog/useSendProduct', () => ({ openContactChat: vi.fn() }));

import { WorkItemSheet } from '@/components/tasks/shared/WorkItemSheet';
import type { WorkItem } from '@/hooks/tasks/workItem.types';

const matchMediaOriginal = window.matchMedia;

/** O `useNarrowViewport` (max-width: 767px) é a única resposta de ambiente aqui. */
function telaDe(narrow: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: narrow && query.includes('max-width: 767px'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  localStorage.clear();
});

afterEach(() => {
  window.matchMedia = matchMediaOriginal;
  cleanup();
});

const base: WorkItem = {
  id: 't1',
  title: 'Ligar para o cliente',
  description: null,
  status: 'todo',
  priority: 'medium',
  due_date: null,
  remind_at: null,
  notified_at: null,
  waiting_reason: null,
  position: 0,
  started_at: null,
  status_changed_at: '2026-10-01T10:00:00.000Z',
  completed_at: null,
  contact_id: null,
  created_by: 'u1',
  assigned_to: 'u1',
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
  contact: null,
};

function props(over: Record<string, unknown> = {}) {
  return {
    item: base,
    open: true,
    onOpenChange: vi.fn(),
    onSave: vi.fn(),
    onMove: vi.fn(),
    onSnooze: vi.fn(),
    onSetReminder: vi.fn(),
    onCancel: vi.fn(),
    contactOptions: [{ id: 'c1', name: 'Ana Souza' }],
    doingCount: 0,
    ...over,
  };
}

/** O Radix só liga o listener de pointerdown-outside num setTimeout(0). */
const umTick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** O overlay do Sheet é o que existe SÓ no modo modal. */
function overlay(): HTMLElement | null {
  return document.querySelector('[class*="bg-background/80"]');
}

describe('WorkItemSheet — etapas 145–146 (painel não modal e largura lembrada)', () => {
  it('145: no desktop o painel é não modal — sem overlay e marcado como tal', () => {
    telaDe(false);
    render(<WorkItemSheet {...props()} />);

    const painel = screen.getByTestId('work-item-sheet');
    expect(painel).toHaveAttribute('data-nao-modal', 'true');
    expect(painel).toHaveAttribute('data-state', 'open');
    // Sem overlay: o Quadro atrás continua visível e clicável (D14).
    expect(overlay()).toBeNull();
    // O painel de detalhes fica acoplado à direita, como na imagem 03.
    expect(painel.className).toContain('right-0');
  });

  it('145: no desktop, clicar fora (no Quadro) NÃO fecha o painel', async () => {
    telaDe(false);
    const p = props();
    render(
      <>
        <WorkItemSheet {...p} />
        <article data-item-id="t2" tabIndex={0} aria-label="outro cartão" />
      </>,
    );
    await umTick();

    fireEvent.pointerDown(document.body, { button: 0 });
    fireEvent.click(document.body);

    expect(screen.getByTestId('work-item-sheet')).toBeTruthy();
    expect(p.onOpenChange).not.toHaveBeenCalledWith(false);
    // Nem com edição pendente: sem overlay não há "clicar fora" que descarte.
    fireEvent.change(screen.getByTestId('sheet-titulo'), { target: { value: 'Outro título' } });
    await umTick();
    fireEvent.pointerDown(document.body, { button: 0 });
    fireEvent.click(document.body);
    expect(screen.queryByTestId('sheet-descartar')).toBeNull();
    expect(p.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('145: no desktop, clicar em outro cartão troca a tarefa do painel sem fechá-lo', () => {
    telaDe(false);

    function Cenario() {
      const [id, setId] = React.useState('t1');
      const item = id === 't1' ? base : { ...base, id: 't2', title: 'Segunda tarefa' };
      return (
        <>
          <button type="button" data-item-id="t2" onClick={() => setId('t2')}>
            outro cartão
          </button>
          <WorkItemSheet {...props({ item })} />
        </>
      );
    }

    render(<Cenario />);
    expect((screen.getByTestId('sheet-titulo') as HTMLInputElement).value).toBe('Ligar para o cliente');

    fireEvent.click(screen.getByText('outro cartão'));

    expect((screen.getByTestId('sheet-titulo') as HTMLInputElement).value).toBe('Segunda tarefa');
    expect(screen.getByTestId('work-item-sheet')).toBeTruthy();
  });

  it('145: no celular o painel continua bottom sheet MODAL (overlay + proteção ao clicar fora)', async () => {
    telaDe(true);
    const p = props();
    render(<WorkItemSheet {...p} />);

    const painel = screen.getByTestId('work-item-sheet');
    expect(painel).toHaveAttribute('data-nao-modal', 'false');
    // Lado de baixo = bottom sheet (a variante traz o `bottom-0`).
    expect(painel.className).toContain('bottom-0');
    const fundo = overlay();
    expect(fundo).not.toBeNull();

    fireEvent.change(screen.getByTestId('sheet-titulo'), { target: { value: 'Outro título' } });
    await umTick();
    fireEvent.pointerDown(fundo as HTMLElement, { button: 0 });
    fireEvent.click(fundo as HTMLElement);

    expect(screen.getByTestId('sheet-descartar')).toHaveTextContent('Descartar alterações?');
    expect(p.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('146: expandido usa ≈70% da janela e a escolha fica lembrada no navegador', () => {
    telaDe(false);
    const { unmount } = render(<WorkItemSheet {...props()} />);

    const alternar = screen.getByTestId('sheet-expandir');
    expect(alternar).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('work-item-sheet').className).toContain('w-[420px]');

    fireEvent.click(alternar);
    expect(alternar).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('work-item-sheet').className).toContain('w-[70vw]');
    // D11: preferência de exibição do NAVEGADOR, ao lado do `tasks-mode`.
    expect(localStorage.getItem('tasks-painel-expandido')).toBe('1');

    unmount();
    render(<WorkItemSheet {...props()} />);
    expect(screen.getByTestId('sheet-expandir')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('work-item-sheet').className).toContain('w-[70vw]');

    // Recolher limpa a preferência (volta ao padrão de 420px do painel).
    fireEvent.click(screen.getByTestId('sheet-expandir'));
    expect(localStorage.getItem('tasks-painel-expandido')).toBeNull();
    expect(screen.getByTestId('work-item-sheet').className).toContain('w-[420px]');
  });
});
