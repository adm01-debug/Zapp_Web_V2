/**
 * Etapas 141–144 do plano (imagem 03) — estado de edição, rodapé, proteção ao
 * fechar e foco/teclado do painel "Detalhes da tarefa":
 *  - 141 Rodapé com ponto âmbar "Alterações não salvas" + "Ctrl+Enter para
 *        salvar"; limpo mostra "Tudo salvo".
 *  - 142 Botões "Concluir" (verde contorno), "Salvar alterações" (primary,
 *        desabilitado sem mudança) e menu ⋮ (reabrir, cancelar, copiar link).
 *  - 143 Proteção ao fechar: com alterações, "Descartar alterações?"; Esc e
 *        clique fora respeitam a proteção.
 *  - 144 Foco e teclado: Esc fecha e devolve o foco ao item; no painel não
 *        modal o F6 alterna painel ↔ lista/quadro; tab lógica no rodapé.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('@/components/catalog/useSendProduct', () => ({ openContactChat: vi.fn() }));

import { WorkItemSheet } from '@/components/tasks/shared/WorkItemSheet';
import type { WorkItem } from '@/hooks/tasks/workItem.types';

beforeEach(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

const matchMediaOriginal = window.matchMedia;

/**
 * Etapa 145: o painel só é modal (com overlay e "clicar fora") ABAIXO de `md` —
 * é isso que o `useNarrowViewport` (max-width: 767px) responde. No desktop ele é
 * não modal, e o clique fora não fecha; a prova disso está em
 * `WorkItemSheet.naoModal.test.tsx`.
 */
function telaNarrow() {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('max-width: 767px'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

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

/** Edita o título: é o menor caminho para "há alteração não salva". */
function editarTitulo(valor = 'Outro título') {
  fireEvent.change(screen.getByTestId('sheet-titulo'), { target: { value: valor } });
}

/** Abre o menu ⋮ (Radix abre no pointerdown no jsdom). */
async function abrirMenu() {
  fireEvent.pointerDown(screen.getByTestId('sheet-menu'), { button: 0 });
  return screen.findByRole('menu');
}

/** Mente sobre as media queries do ambiente (§ pointerMedia.ts) e devolve o desfazer. */
function fingirMidia(matches: (consulta: string) => boolean) {
  const original = window.matchMedia;
  window.matchMedia = ((consulta: string) => ({
    matches: matches(consulta),
    media: consulta,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return () => { window.matchMedia = original; };
}

describe('WorkItemSheet — etapas 141–144 (estado de edição, rodapé, proteção e foco)', () => {
  beforeEach(() => cleanup());
  afterEach(() => {
    window.matchMedia = matchMediaOriginal;
    cleanup();
  });

  it('141: limpo mostra "Tudo salvo"; editando mostra o ponto âmbar, o aviso e a dica do Ctrl+Enter', () => {
    render(<WorkItemSheet {...props()} />);

    expect(screen.getByTestId('sheet-estado-edicao')).toHaveTextContent('Tudo salvo');
    expect(screen.queryByTestId('sheet-dica-ctrl-enter')).toBeNull();

    editarTitulo();

    expect(screen.getByTestId('sheet-estado-edicao')).toHaveTextContent('Alterações não salvas');
    expect(screen.getByTestId('sheet-dica-ctrl-enter')).toHaveTextContent('Ctrl+Enter para salvar');
  });

  it('141: Ctrl+Enter em qualquer campo salva a alteração', () => {
    const p = props();
    render(<WorkItemSheet {...p} />);
    editarTitulo();

    fireEvent.keyDown(screen.getByTestId('sheet-titulo'), { key: 'Enter', code: 'Enter', ctrlKey: true });

    expect(p.onSave).toHaveBeenCalledWith(base, expect.objectContaining({ title: 'Outro título' }));
  });

  it('142: "Salvar alterações" só habilita com mudança; "Concluir" é verde contorno', () => {
    render(<WorkItemSheet {...props()} />);

    const salvar = screen.getByTestId('sheet-salvar');
    expect(salvar).toHaveTextContent('Salvar alterações');
    expect((salvar as HTMLButtonElement).disabled).toBe(true);

    editarTitulo();
    expect((screen.getByTestId('sheet-salvar') as HTMLButtonElement).disabled).toBe(false);

    // Verde contorno = variante outline com os tokens de sucesso, sem cor literal.
    expect(screen.getByTestId('sheet-concluir').className).toContain('border-success/50');
  });

  it('142: "Concluir" move para done e fecha; o ⋮ cancela e reabre', async () => {
    const p = props({ item: { ...base, status: 'done' } });
    render(<WorkItemSheet {...p} />);

    fireEvent.click(screen.getByTestId('sheet-concluir'));
    expect(p.onMove).toHaveBeenCalledWith(expect.objectContaining({ status: 'done' }), 'done');
    expect(p.onOpenChange).toHaveBeenCalledWith(false);

    // Reabrir só existe em estado terminal.
    await abrirMenu();
    expect(screen.getByTestId('sheet-reabrir')).toHaveTextContent('Reabrir tarefa');
    fireEvent.click(screen.getByTestId('sheet-reabrir'));
    expect(p.onMove).toHaveBeenCalledWith(expect.objectContaining({ status: 'done' }), 'todo');
  });

  it('142: o ⋮ não oferece "Reabrir" em tarefa não terminal e "Cancelar tarefa" chama onCancel', async () => {
    const p = props();
    render(<WorkItemSheet {...p} />);

    await abrirMenu();
    expect(screen.queryByTestId('sheet-reabrir')).toBeNull();

    fireEvent.click(screen.getByTestId('sheet-cancelar'));
    expect(p.onCancel).toHaveBeenCalledWith(base);
  });

  it('142: "Copiar link interno" grava a URL do app (?view=tasks&task=t1) sem dado de cliente', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<WorkItemSheet {...props()} />);

    await abrirMenu();
    fireEvent.click(screen.getByTestId('sheet-copiar-link'));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    // Link interno da própria aplicação; nada de dado de cliente.
    expect(writeText.mock.calls[0][0]).toMatch(/\?view=tasks&task=t1$/);
  });

  it('143: com alteração, o Esc pede confirmação em vez de fechar', () => {
    const p = props();
    render(<WorkItemSheet {...p} />);
    editarTitulo();

    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });

    expect(screen.getByTestId('sheet-descartar')).toHaveTextContent('Descartar alterações?');
    expect(p.onOpenChange).not.toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByTestId('sheet-descartar-continuar'));
    expect(screen.queryByTestId('sheet-descartar')).toBeNull();
    expect(p.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('143: "Descartar" fecha o painel; clique fora também respeita a proteção', async () => {
    const p = props();
    // Etapa 145: "clicar fora" só existe no modo modal (bottom sheet do celular).
    telaNarrow();
    render(<WorkItemSheet {...p} />);
    editarTitulo();

    // O Radix só liga o listener de pointerdown num setTimeout(0) — espera 1 tick.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // "Clique fora": o overlay do Sheet fica fora do conteúdo. O Radix adia o
    // pointerdown-outside para o `click` seguinte (deferPointerDownOutside).
    const overlay = document.querySelector('[class*="bg-background/80"]') as HTMLElement;
    fireEvent.pointerDown(overlay, { button: 0 });
    fireEvent.click(overlay);
    expect(screen.getByTestId('sheet-descartar')).toBeTruthy();
    expect(p.onOpenChange).not.toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByTestId('sheet-descartar-confirmar'));
    expect(p.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('143/144: ao confirmar descarte depois do Esc, fecha e devolve o foco ao card', async () => {
    const p = props();
    render(
      <>
        <WorkItemSheet {...p} />
        <article data-item-id="t1" tabIndex={0} aria-label="card da tarefa" />
      </>,
    );
    editarTitulo();

    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
    fireEvent.click(screen.getByTestId('sheet-descartar-confirmar'));

    const card = document.querySelector<HTMLElement>('[data-item-id="t1"]')!;
    expect(p.onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => expect(document.activeElement).toBe(card));
  });

  it('143: "Concluir" com alteração pendente pede descarte antes de mover', () => {
    const p = props();
    render(<WorkItemSheet {...p} />);
    editarTitulo();

    fireEvent.click(screen.getByTestId('sheet-concluir'));

    expect(screen.getByTestId('sheet-descartar')).toHaveTextContent('Descartar alterações?');
    expect(p.onMove).not.toHaveBeenCalled();
    expect(p.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('143: "Cancelar tarefa" com alteração pendente pede descarte antes de cancelar', async () => {
    const p = props();
    render(<WorkItemSheet {...p} />);
    editarTitulo();

    await abrirMenu();
    fireEvent.click(screen.getByTestId('sheet-cancelar'));

    expect(screen.getByTestId('sheet-descartar')).toHaveTextContent('Descartar alterações?');
    expect(p.onCancel).not.toHaveBeenCalled();
    expect(p.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('143: "Reabrir tarefa" com alteração pendente pede descarte antes de mover', async () => {
    const p = props({ item: { ...base, status: 'done' } });
    render(<WorkItemSheet {...p} />);
    editarTitulo();

    await abrirMenu();
    fireEvent.click(screen.getByTestId('sheet-reabrir'));

    expect(screen.getByTestId('sheet-descartar')).toHaveTextContent('Descartar alterações?');
    expect(p.onMove).not.toHaveBeenCalled();
    expect(p.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('143: sem alteração o Esc fecha direto (a proteção não atrapalha)', () => {
    const p = props();
    render(<WorkItemSheet {...p} />);

    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });

    expect(screen.queryByTestId('sheet-descartar')).toBeNull();
    expect(p.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('144: o Esc sem alteração é consumido (fireEvent devolve false) e fecha uma única vez', () => {
    const p = props();
    render(<WorkItemSheet {...p} />);

    // preventDefault do Radix = o atalho foi consumido (fireEvent devolve false),
    // espelhando a checagem de consumo já feita para o F6.
    expect(fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' })).toBe(false);

    expect(screen.queryByTestId('sheet-descartar')).toBeNull();
    expect(p.onOpenChange).toHaveBeenCalledWith(false);
    expect(p.onOpenChange).toHaveBeenCalledTimes(1);
  });

  it('144: o Esc devolve o foco ao card da tarefa na lista/quadro', async () => {
    render(
      <>
        <WorkItemSheet {...props()} />
        <article data-item-id="t1" tabIndex={0} aria-label="card da tarefa" />
      </>,
    );
    const card = document.querySelector<HTMLElement>('[data-item-id="t1"]')!;

    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });

    await waitFor(() => expect(document.activeElement).toBe(card));
  });

  it('144: o F6 alterna o foco entre o painel e a lista/quadro', async () => {
    render(
      <>
        <WorkItemSheet {...props()} />
        <article data-item-id="t1" tabIndex={0} aria-label="card da tarefa" />
      </>,
    );
    const painel = screen.getByTestId('work-item-sheet');
    const card = document.querySelector<HTMLElement>('[data-item-id="t1"]')!;

    screen.getByTestId('sheet-titulo').focus();
    // preventDefault = o atalho foi consumido (fireEvent devolve false).
    expect(fireEvent.keyDown(document, { key: 'F6', code: 'F6' })).toBe(false);
    expect(document.activeElement).toBe(card);

    fireEvent.keyDown(document, { key: 'F6', code: 'F6' });
    expect(document.activeElement).toBe(painel);
  });

  it('144: no bottom sheet o F6 não tira o foco do painel modal', () => {
    const desfazerMidia = fingirMidia((consulta) => consulta.includes('max-width: 767px'));
    try {
      render(
        <>
          <WorkItemSheet {...props()} />
          <article data-item-id="t1" tabIndex={0} aria-label="card da tarefa" />
        </>,
      );
      const titulo = screen.getByTestId('sheet-titulo');
      const painel = screen.getByTestId('work-item-sheet');
      titulo.focus();

      expect(fireEvent.keyDown(document, { key: 'F6', code: 'F6' })).toBe(true);

      expect(painel).toContainElement(document.activeElement as HTMLElement);
      expect(document.activeElement).toBe(titulo);
    } finally {
      desfazerMidia();
    }
  });

  it('144: o rodapé segue a ordem de tab lógica (Concluir → Salvar → ⋮)', () => {
    render(<WorkItemSheet {...props()} />);

    const concluir = screen.getByTestId('sheet-concluir');
    const salvar = screen.getByTestId('sheet-salvar');
    const menu = screen.getByTestId('sheet-menu');

    // DOCUMENT_POSITION_FOLLOWING sobre o elemento seguinte.
    expect(concluir.compareDocumentPosition(salvar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(salvar.compareDocumentPosition(menu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
