/**
 * FASE C — etapa 23–27: Sheet de edição.
 *
 * Os dois últimos casos são de integração (`TasksModule`) e são eles que hoje
 * falham sem a etapa 26: nada no módulo renderiza o Sheet, então clicar no card
 * e abrir por `?task=` não faziam absolutamente nada.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  makeQueryClient,
  makeTaskRow,
  makeWrapper,
  resetSupabaseMock,
  setSelectResult,
} from '@/test/mocks/tarefas';
import { TooltipProvider } from '@/components/ui/tooltip';
import { WorkItemSheet } from '@/components/tasks/shared/WorkItemSheet';
import { TasksModule } from '@/components/tasks/TasksModule';
import type { WorkItem } from '@/hooks/tasks/workItem.types';

// jsdom não implementa as APIs de captura de ponteiro que o Radix Select usa.
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

/** Radix Select abre pelo teclado (ArrowDown no gatilho) — pointerdown não basta no jsdom. */
async function abrirEstado() {
  const trigger = screen.getByTestId('sheet-estado');
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown', code: 'ArrowDown' });
  return screen.findByRole('listbox');
}

describe('WorkItemSheet — FASE C (etapas 23–25)', () => {
  beforeEach(() => cleanup());
  afterEach(() => cleanup());

  it('23: abre com os 8 campos e fecha no Esc', () => {
    const p = props();
    render(<WorkItemSheet {...p} />);

    expect(screen.getByTestId('sheet-titulo')).toBeTruthy();
    expect(screen.getByTestId('sheet-estado')).toBeTruthy();
    expect(screen.getByTestId('sheet-prio-medium')).toBeTruthy();
    expect(screen.getByTestId('sheet-contato')).toBeTruthy();
    expect(screen.getByTestId('sheet-prazo')).toBeTruthy();
    expect(screen.getByTestId('sheet-alarme')).toBeTruthy();
    expect(screen.getByTestId('sheet-toggle-descricao')).toBeTruthy();
    expect(screen.getByTestId('sheet-salvar')).toBeTruthy();

    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
    expect(p.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('25: Salvar só habilita com mudança, salva o patch e fecha', () => {
    const p = props();
    render(<WorkItemSheet {...p} />);

    const salvar = screen.getByTestId('sheet-salvar') as HTMLButtonElement;
    expect(salvar.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('sheet-titulo'), { target: { value: 'Ligar amanhã' } });
    expect((screen.getByTestId('sheet-salvar') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId('sheet-salvar'));
    expect(p.onSave).toHaveBeenCalledWith(base, { title: 'Ligar amanhã' });
    expect(p.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('24: após preencher o motivo, salvar leva o motivo pelo move', async () => {
    const p = props();
    render(<WorkItemSheet {...p} />);
    await abrirEstado();
    fireEvent.click(await screen.findByRole('option', { name: 'Aguardando' }));

    const motivo = await screen.findByTestId('sheet-motivo');
    fireEvent.change(motivo, { target: { value: 'Aguardando aprovação do cliente' } });
    fireEvent.click(screen.getByTestId('sheet-salvar'));

    expect(p.onMove).toHaveBeenCalledWith(base, 'waiting', 'Aguardando aprovação do cliente');
  });

  it('24/25: Aguardando sem motivo não move e mostra o erro inline', async () => {
    const p = props();
    render(<WorkItemSheet {...p} />);
    await abrirEstado();
    fireEvent.click(await screen.findByRole('option', { name: 'Aguardando' }));

    fireEvent.click(screen.getByTestId('sheet-salvar'));

    expect(await screen.findByTestId('sheet-motivo-erro')).toHaveTextContent('Diga por que parou');
    expect(p.onMove).not.toHaveBeenCalled();
    expect(p.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('24: "Fazendo" fica desabilitado com o texto de cheio quando doingCount=3', async () => {
    render(<WorkItemSheet {...props({ doingCount: 3 })} />);
    await abrirEstado();
    const fazendo = screen.getByRole('option', { name: /Fazendo está cheio \(3\/3\)/ });
    expect(fazendo.getAttribute('aria-disabled')).toBe('true');
  });

  it('25: Concluir move para done e Cancelar tarefa chama onCancel', () => {
    const p = props();
    render(<WorkItemSheet {...p} />);

    fireEvent.click(screen.getByTestId('sheet-concluir'));
    expect(p.onMove).toHaveBeenCalledWith(base, 'done');

    fireEvent.click(screen.getByTestId('sheet-cancelar'));
    expect(p.onCancel).toHaveBeenCalledWith(base);
  });

  it('24: alarme já disparado mostra "Avisado em"', () => {
    const item = { ...base, remind_at: '2026-10-01T09:00:00.000Z', notified_at: '2026-10-01T09:00:00.000Z' };
    render(<WorkItemSheet {...props({ item })} />);
    expect(screen.getByTestId('sheet-avisado')).toHaveTextContent('Avisado em');
  });
});

describe('TasksModule — FASE C (etapas 26 e 27): o Sheet abre pelo card e pelo ?task=', () => {
  function renderModulo() {
    const qc = makeQueryClient();
    const Wrapper = makeWrapper(qc);
    return render(
      <MemoryRouter>
        <TooltipProvider>
          <Wrapper>
            <TasksModule />
          </Wrapper>
        </TooltipProvider>
      </MemoryRouter>
    );
  }

  beforeEach(() => {
    cleanup();
    resetSupabaseMock();
    localStorage.clear();
    setSelectResult({
      data: [makeTaskRow({ id: 't1', title: 'Ligar para o cliente', status: 'todo' })],
      error: null,
    });
  });
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    cleanup();
  });

  it('26 (vermelho antes): clicar no card abre o Sheet com os dados do item', async () => {
    window.history.replaceState(null, '', '/');
    renderModulo();

    const card = await screen.findByTestId('work-item-card');
    fireEvent.click(card.querySelector('[data-testid="work-item-open"]') ?? card);

    const titulo = await screen.findByTestId('sheet-titulo');
    expect((titulo as HTMLInputElement).value).toBe('Ligar para o cliente');
    expect(new URLSearchParams(window.location.search).get('task')).toBe('t1');
  });

  it('27: F5 com ?task=<id> reabre; fechar limpa a URL', async () => {
    window.history.replaceState(null, '', '/?task=t1');
    renderModulo();

    expect((await screen.findByTestId('sheet-titulo') as HTMLInputElement).value).toBe('Ligar para o cliente');

    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('task')).toBeNull());
  });
});
