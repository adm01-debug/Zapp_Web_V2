/**
 * FASE C — sub-fase C2 (etapas 28–33): ações do card e o portão do Aguardando.
 *
 * O que estes testes trancam:
 *  - 28/29: mover para **Aguardando** sem motivo NÃO move e NÃO escreve no banco;
 *    abre o Sheet já em Aguardando, com o motivo pedido (focusField).
 *  - 30: kebab com os 5 grupos (Abrir · Concluir/Reabrir · Lembrar-me · Mover para · Cancelar)
 *    e "Fazendo" desabilitado com 3/3.
 *  - 31: RemindChip virou popover (15 min / 1 hora / Amanhã 9h / Remover) sem abrir o card.
 *  - 32: ContactChip aparece quando o item tem contato.
 *  - 33: MoveToMenu só existe em ponteiro grosso.
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
  supabaseMock,
} from '@/test/mocks/tarefas';
import { TooltipProvider } from '@/components/ui/tooltip';
import { WorkItemCard } from '@/components/tasks/shared/WorkItemCard';
import { RemindChip } from '@/components/tasks/shared/RemindChip';
import { MoveToMenu } from '@/components/tasks/board/MoveToMenu';
import { WorkItemSheet } from '@/components/tasks/shared/WorkItemSheet';
import { precisaMotivoDeEspera } from '@/hooks/tasks/workItemMachine';
import { aceitaLembrete } from '@/components/tasks/shared/cardActions';
import { TasksModule } from '@/components/tasks/TasksModule';
import type { WorkItem } from '@/hooks/tasks/workItem.types';

beforeEach(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
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
  contact_id: 'c1',
  created_by: 'u1',
  assigned_to: 'u1',
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
  contact: { id: 'c1', name: 'Ana Souza', phone: '5511999999999', avatar_url: null },
};

/** Abre um Radix Menu/DropdownMenu pelo gatilho (teclado; click como reserva). */
async function abrirMenu(el: HTMLElement) {
  fireEvent.keyDown(el, { key: 'Enter', code: 'Enter' });
  try {
    return await screen.findByRole('menu');
  } catch {
    fireEvent.click(el);
    return screen.findByRole('menu');
  }
}

describe('FASE C2 — 28: o Sheet aberto por DnD/kebab já vem em Aguardando com o motivo pedido', () => {
  afterEach(() => cleanup());

  it('28: precisaMotivoDeEspera barra Aguardando sem motivo e libera o resto', () => {
    expect(precisaMotivoDeEspera(base.waiting_reason, 'waiting')).toBe(true);
    expect(precisaMotivoDeEspera('aguardando cliente', 'waiting')).toBe(false);
    expect(precisaMotivoDeEspera('   ', 'waiting')).toBe(true);
    expect(precisaMotivoDeEspera(base.waiting_reason, 'doing')).toBe(false);
    expect(precisaMotivoDeEspera(base.waiting_reason, 'done')).toBe(false);
  });

  it('focusField=waiting_reason inicia em Aguardando e mostra o motivo', () => {
    render(
      <WorkItemSheet
        item={base}
        open
        onOpenChange={vi.fn()}
        onSave={vi.fn()}
        onMove={vi.fn()}
        onSnooze={vi.fn()}
        onSetReminder={vi.fn()}
        onCancel={vi.fn()}
        contactOptions={[{ id: 'c1', name: 'Ana Souza' }]}
        doingCount={0}
        focusField="waiting_reason"
      />
    );
    expect(screen.getByTestId('sheet-motivo')).toBeTruthy();
    expect(screen.getByTestId('sheet-estado').textContent).toContain('Aguardando');
  });

  it('sem focusField, um item em todo NÃO mostra o motivo', () => {
    render(
      <WorkItemSheet
        item={base}
        open
        onOpenChange={vi.fn()}
        onSave={vi.fn()}
        onMove={vi.fn()}
        onSnooze={vi.fn()}
        onSetReminder={vi.fn()}
        onCancel={vi.fn()}
        contactOptions={[]}
        doingCount={0}
      />
    );
    expect(screen.queryByTestId('sheet-motivo')).toBeNull();
  });
});

describe('FASE C2 — 30: kebab do card com os 5 grupos', () => {
  afterEach(() => cleanup());

  function propsCard(over: Record<string, unknown> = {}) {
    return {
      item: base,
      mode: 'list' as const,
      onOpen: vi.fn(),
      onToggleDone: vi.fn(),
      onMoveTo: vi.fn(),
      onDelete: vi.fn(),
      onComplete: vi.fn(),
      onReopen: vi.fn(),
      onSnooze: vi.fn(),
      onClearReminder: vi.fn(),
      onOpenReminder: vi.fn(),
      doingCount: 0,
      ...over,
    };
  }

  it('mostra Abrir, Concluir, Lembrar-me, Mover para e Cancelar', async () => {
    render(<WorkItemCard {...propsCard()} />);
    await abrirMenu(screen.getByRole('button', { name: /mais ações|opções|menu/i }));

    expect(screen.getByRole('menuitem', { name: 'Abrir' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Concluir/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Lembrar-me/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Mover para/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Cancelar' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Remover' })).toBeNull();
  });

  it('Concluir chama onComplete e Cancelar chama onDelete (undo)', async () => {
    const p = propsCard();
    render(<WorkItemCard {...p} />);
    await abrirMenu(screen.getByRole('button', { name: /mais ações|opções|menu/i }));

    fireEvent.click(screen.getByRole('menuitem', { name: /Concluir/ }));
    expect(p.onComplete).toHaveBeenCalledTimes(1);

    await abrirMenu(screen.getByRole('button', { name: /mais ações|opções|menu/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cancelar' }));
    expect(p.onDelete).toHaveBeenCalledTimes(1);
  });

  it('Lembrar-me ▸ adia 15 min e Amanhã 9h pelo kebab', async () => {
    const p = propsCard();
    render(<WorkItemCard {...p} />);
    await abrirMenu(screen.getByRole('button', { name: /mais ações|opções|menu/i }));

    const lembrar = screen.getByRole('menuitem', { name: /Lembrar-me/ });
    lembrar.focus();
    fireEvent.keyDown(lembrar, { key: 'ArrowRight', code: 'ArrowRight' });
    fireEvent.click(await screen.findByRole('menuitem', { name: '15 min' }));
    expect(p.onSnooze).toHaveBeenCalledWith(15);

    // o menu fecha após a ação: reabre o kebab para a segunda checagem
    await abrirMenu(screen.getByRole('button', { name: /mais ações|opções|menu/i }));
    const lembrar2 = screen.getByRole('menuitem', { name: /Lembrar-me/ });
    lembrar2.focus();
    fireEvent.keyDown(lembrar2, { key: 'ArrowRight', code: 'ArrowRight' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Amanhã 9h' }));
    expect(p.onSnooze).toHaveBeenCalledWith('tomorrow9');
  });

  it('item concluído oferece Reabrir em vez de Concluir', async () => {
    render(<WorkItemCard {...propsCard({ item: { ...base, status: 'done' } })} />);
    await abrirMenu(screen.getByRole('button', { name: /mais ações|opções|menu/i }));

    expect(screen.getByRole('menuitem', { name: /Reabrir/ })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /^Concluir/ })).toBeNull();
  });

  // #425 / R2-MOD-057: o executor do alarme (`notify_due_tasks`) só seleciona
  // `status NOT IN ('done','cancelled')`. O card não pode oferecer um adiamento
  // que o executor descarta nem emitir o payload de snooze nesse estado.
  it('em estado terminal o "Lembrar-me" fica desabilitado, não abre e não emite snooze', async () => {
    const p = propsCard({ item: { ...base, status: 'done' } });
    render(<WorkItemCard {...p} />);
    await abrirMenu(screen.getByRole('button', { name: /mais ações|opções|menu/i }));

    const lembrar = screen.getByRole('menuitem', { name: /Lembrar-me/ });
    expect(lembrar.getAttribute('aria-disabled')).toBe('true');
    expect(lembrar.getAttribute('title')).toMatch(/reabra/i);

    lembrar.focus();
    fireEvent.keyDown(lembrar, { key: 'ArrowRight', code: 'ArrowRight' });
    fireEvent.click(lembrar);

    expect(screen.queryByRole('menuitem', { name: '15 min' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Amanhã 9h' })).toBeNull();
    expect(p.onSnooze).not.toHaveBeenCalled();
  });

  it('cancelada também perde o lembrete; em "todo" a ação segue liberada', async () => {
    const cancelada = propsCard({ item: { ...base, status: 'cancelled' } });
    const { unmount } = render(<WorkItemCard {...cancelada} />);
    await abrirMenu(screen.getByRole('button', { name: /mais ações|opções|menu/i }));
    expect(screen.getByRole('menuitem', { name: /Lembrar-me/ }).getAttribute('aria-disabled')).toBe('true');
    expect(cancelada.onSnooze).not.toHaveBeenCalled();
    unmount();

    render(<WorkItemCard {...propsCard()} />);
    await abrirMenu(screen.getByRole('button', { name: /mais ações|opções|menu/i }));
    const lembrar = screen.getByRole('menuitem', { name: /Lembrar-me/ });
    expect(lembrar.getAttribute('aria-disabled')).toBeNull();
  });

  it('a regra do card casa com a seleção do executor do alarme', () => {
    expect(aceitaLembrete('done')).toBe(false);
    expect(aceitaLembrete('cancelled')).toBe(false);
    (['backlog', 'todo', 'doing', 'waiting'] as const).forEach((s) => {
      expect(aceitaLembrete(s)).toBe(true);
    });
  });

  it('com doingCount 3, "Fazendo" fica desabilitado com o texto de cheio', async () => {
    render(<WorkItemCard {...propsCard({ doingCount: 3 })} />);
    await abrirMenu(screen.getByRole('button', { name: /mais ações|opções|menu/i }));

    const mover = screen.getByRole('menuitem', { name: /Mover para/ });
    mover.focus();
    fireEvent.keyDown(mover, { key: 'ArrowRight', code: 'ArrowRight' });

    const fazendo = await screen.findByRole('menuitem', { name: /Fazendo está cheio \(3\/3\)/ });
    expect(fazendo.getAttribute('aria-disabled')).toBe('true');
    expect(fazendo.getAttribute('title')).toContain('Fazendo está cheio (3/3)');
  });
});

describe('FASE C2 — 31: RemindChip virou popover', () => {
  afterEach(() => cleanup());

  it('abre com as 4 opções e chama onSnooze sem abrir o card', async () => {
    const pai = vi.fn();
    const onSnooze = vi.fn();
    render(
      <div onClick={pai}>
        <RemindChip remindAt="2026-10-01T09:00:00.000Z" onSnooze={onSnooze} onClearReminder={vi.fn()} onOpenReminder={vi.fn()} />
      </div>
    );

    const chip = screen.getByTestId('remind-chip');
    fireEvent.click(chip);
    pai.mockClear(); // o clique que abre o popover pode chegar ao pai; o que importa é o seguinte

    fireEvent.click(await screen.findByRole('button', { name: '15 min' }));
    expect(onSnooze).toHaveBeenCalledWith(15);
    expect(pai).not.toHaveBeenCalled();
  });

  it('oferece "Remover" quando há alarme e "Escolher…" para o Sheet', async () => {
    const onClearReminder = vi.fn();
    const onOpenReminder = vi.fn();
    render(<RemindChip remindAt="2026-10-01T09:00:00.000Z" onSnooze={vi.fn()} onClearReminder={onClearReminder} onOpenReminder={onOpenReminder} />);

    fireEvent.click(screen.getByTestId('remind-chip'));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }));
    expect(onClearReminder).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('remind-chip'));
    fireEvent.click(await screen.findByRole('button', { name: /Escolher/ }));
    expect(onOpenReminder).toHaveBeenCalledTimes(1);
  });
});

describe('FASE C2 — 33: MoveToMenu só em ponteiro grosso', () => {
  afterEach(() => cleanup());

  it('não renderiza nada em ponteiro fino', () => {
    render(<MoveToMenu item={base} doingCount={0} onMoveTo={vi.fn()} />);
    expect(screen.queryByTestId('move-to-menu')).toBeNull();
  });

  it('em ponteiro grosso abre a lista e chama onMoveTo', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: q.includes('pointer: coarse'),
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    const onMoveTo = vi.fn();
    render(<MoveToMenu item={base} doingCount={0} onMoveTo={onMoveTo} />);

    const btn = screen.getByTestId('move-to-menu');
    await abrirMenu(btn);
    fireEvent.click(screen.getByRole('menuitem', { name: /Aguardando/ }));
    expect(onMoveTo).toHaveBeenCalledWith('waiting');

    window.matchMedia = original;
  });
});

describe('FASE C2 — integração com o TasksModule (28/29/32)', () => {
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
    window.history.replaceState(null, '', '/');
  });
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    cleanup();
  });

  it('32: o card mostra o contato do item', async () => {
    setSelectResult({
      data: [makeTaskRow({ id: 't1', contact_id: 'c1', contact: { id: 'c1', name: 'Ana Souza' } })],
      error: null,
    });
    renderModulo();
    expect(await screen.findByTestId('contact-chip')).toHaveTextContent('Ana Souza');
  });

  it('29: mover para Aguardando pelo kebab abre o Sheet em Aguardando sem escrever no banco', async () => {
    setSelectResult({ data: [makeTaskRow({ id: 't1' })], error: null });
    renderModulo();

    const card = await screen.findByTestId('work-item-card');
    const kebab = card.querySelector('[data-state]') ?? card;
    void kebab;

    // O caminho do kebab é o mesmo portão do DnD; aqui ele é acionado pelo menu do card.
    const botoes = await screen.findAllByRole('button', { name: /mais ações|opções|menu/i });
    await abrirMenu(botoes[0]);
    const mover = screen.getByRole('menuitem', { name: /Mover para/ });
    mover.focus();
    fireEvent.keyDown(mover, { key: 'ArrowRight', code: 'ArrowRight' });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Aguardando/ }));

    await waitFor(() => expect(screen.getByTestId('sheet-motivo')).toBeTruthy());
    expect(screen.getByTestId('sheet-estado').textContent).toContain('Aguardando');
    // nada foi escrito: o portão abriu o Sheet em vez de chamar move()
    expect(supabaseMock.update).not.toHaveBeenCalled();
    expect(supabaseMock.upsert).not.toHaveBeenCalled();
  });
});
