/**
 * Etapas 137–140 — seção Planejamento do Sheet de tarefas.
 *
 * Escopo desta fatia: prazo/lembrete em dois cartões, validação visual por tom,
 * ações do lembrete já existentes e descrição com contador + data de criação.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

import { WorkItemSheet } from '@/components/tasks/shared/WorkItemSheet';
import { avaliarLembrete, formatCriadaEm } from '@/components/tasks/shared/sheet/planejamento';
import type { WorkItem } from '@/hooks/tasks/workItem.types';

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
    contactOptions: [],
    doingCount: 0,
    ...over,
  };
}

function hojeLabel(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `Hoje, ${dd}/${mm}`;
}

function daqui(n: number, hora: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hora, 0, 0, 0);
  return d;
}

describe('WorkItemSheet — etapas 137–140 (Planejamento)', () => {
  beforeEach(() => cleanup());
  afterEach(() => cleanup());

  it('137: a seção traz os dois cartões e o Prazo mostra data e hora visíveis', () => {
    const prazo = daqui(0, 18);
    render(<WorkItemSheet {...props({ item: { ...base, due_date: prazo.toISOString() } })} />);

    expect(screen.getByTestId('sheet-planejamento')).toBeTruthy();
    expect(screen.getByTestId('planejamento-prazo')).toBeTruthy();
    expect(screen.getByTestId('planejamento-lembrete')).toBeTruthy();
    expect(screen.getByText('Até quando concluir')).toBeTruthy();
    expect(screen.getByText('Quando avisar você')).toBeTruthy();
    expect(screen.getByTestId('sheet-prazo')).toHaveTextContent(hojeLabel(prazo));
    expect((screen.getByTestId('sheet-prazo-hora') as HTMLInputElement).value).toBe('18:00');
  });

  it('137: limpar o Prazo zera também a hora', async () => {
    const prazo = daqui(0, 18);
    render(<WorkItemSheet {...props({ item: { ...base, due_date: prazo.toISOString() } })} />);

    fireEvent.click(screen.getByTestId('sheet-prazo'));
    fireEvent.click(await screen.findByRole('button', { name: 'Limpar' }));

    expect(screen.getByTestId('sheet-prazo')).toHaveTextContent('Sem prazo');
    expect((screen.getByTestId('sheet-prazo-hora') as HTMLInputElement).value).toBe('');
  });

  it('137: o Lembrete mostra a data e a hora agendadas', () => {
    const aviso = daqui(1, 9);
    render(<WorkItemSheet {...props({ item: { ...base, remind_at: aviso.toISOString() } })} />);

    const dd = String(aviso.getDate()).padStart(2, '0');
    const mm = String(aviso.getMonth() + 1).padStart(2, '0');
    expect(screen.getByTestId('sheet-alarme')).toHaveTextContent(`Amanhã, ${dd}/${mm}`);
    expect((screen.getByTestId('sheet-alarme-hora') as HTMLInputElement).value).toBe('09:00');
  });

  it('138: lembrete no passado avisa em vermelho', () => {
    const passado = new Date(Date.now() - 60 * 60 * 1000);
    render(<WorkItemSheet {...props({ item: { ...base, remind_at: passado.toISOString() } })} />);

    const aviso = screen.getByTestId('sheet-lembrete-aviso');
    expect(aviso.getAttribute('data-tom')).toBe('destructive');
    expect(aviso).toHaveTextContent(/passado/i);
  });

  it('138: lembrete depois do prazo avisa em âmbar', () => {
    const prazo = daqui(1, 18);
    const aviso = daqui(2, 9);
    render(<WorkItemSheet {...props({ item: { ...base, due_date: prazo.toISOString(), remind_at: aviso.toISOString() } })} />);

    const chip = screen.getByTestId('sheet-lembrete-aviso');
    expect(chip.getAttribute('data-tom')).toBe('warning');
    expect(chip).toHaveTextContent(/depois do prazo/i);
  });

  it('138: lembrete antes do prazo mostra Agendado em verde', () => {
    const prazo = daqui(2, 18);
    const aviso = daqui(1, 9);
    render(<WorkItemSheet {...props({ item: { ...base, due_date: prazo.toISOString(), remind_at: aviso.toISOString() } })} />);

    const chip = screen.getByTestId('sheet-lembrete-aviso');
    expect(chip.getAttribute('data-tom')).toBe('success');
    expect(chip).toHaveTextContent('Agendado');
  });

  it('139: a linha do lembrete adia pela mutation existente', async () => {
    const item = { ...base, remind_at: daqui(1, 9).toISOString() };
    const p = props({ item });
    render(<WorkItemSheet {...p} />);

    expect(screen.getByTestId('sheet-lembrete-acoes')).toHaveTextContent('Remover');
    fireEvent.pointerDown(screen.getByTestId('sheet-adiar'), { button: 0 });
    const menu = await screen.findByRole('menu');
    expect(withinMenu(menu, '15 min')).toBeTruthy();
    fireEvent.click(screen.getByTestId('sheet-adiar-15'));
    expect(p.onSnooze).toHaveBeenCalledWith(item, 15);
  });

  it('139: Remover limpa o lembrete pela mutation existente', () => {
    const item = { ...base, remind_at: daqui(1, 9).toISOString() };
    const p = props({ item });
    render(<WorkItemSheet {...p} />);

    fireEvent.click(screen.getByTestId('sheet-remover-alarme'));
    expect(p.onSetReminder).toHaveBeenCalledWith(item, null);
    expect(screen.queryByTestId('sheet-lembrete-acoes')).toBeNull();
  });

  it('140: o contador acompanha a descrição e a caixa é redimensionável', () => {
    render(<WorkItemSheet {...props()} />);

    fireEvent.click(screen.getByTestId('sheet-toggle-descricao'));
    const caixa = screen.getByTestId('sheet-descricao') as HTMLTextAreaElement;
    expect(caixa.className).toContain('resize-y');
    expect(screen.getByTestId('sheet-descricao-contador')).toHaveTextContent('0 caracteres');

    fireEvent.change(caixa, { target: { value: 'Oi' } });
    expect(screen.getByTestId('sheet-descricao-contador')).toHaveTextContent('2 caracteres');
  });

  it('140: mostra Criada em 9 out. 2026 a partir do created_at', () => {
    render(<WorkItemSheet {...props({ item: { ...base, created_at: '2026-10-09T12:00:00.000Z' } })} />);

    expect(screen.getByTestId('sheet-criada-em')).toHaveTextContent('Criada em 9 out. 2026');
  });
});

describe('planejamento — regras puras (etapas 138 e 140)', () => {
  const agora = new Date('2026-10-11T12:00:00.000Z');

  it('sem lembrete não há aviso', () => {
    expect(avaliarLembrete(null, '2026-10-20T12:00:00.000Z', agora)).toBeNull();
  });

  it('lembrete no passado é vermelho', () => {
    expect(avaliarLembrete('2026-10-11T11:00:00.000Z', null, agora)?.tom).toBe('destructive');
  });

  it('lembrete depois do prazo é âmbar; antes do prazo é verde', () => {
    expect(avaliarLembrete('2026-10-15T12:00:00.000Z', '2026-10-13T12:00:00.000Z', agora)?.tom).toBe('warning');
    expect(avaliarLembrete('2026-10-12T12:00:00.000Z', '2026-10-13T12:00:00.000Z', agora)?.tom).toBe('success');
  });

  it('formatCriadaEm usa mês curto pt-BR e dia sem zero à esquerda', () => {
    expect(formatCriadaEm('2026-10-09T12:00:00.000Z')).toBe('Criada em 9 out. 2026');
    expect(formatCriadaEm(null)).toBeNull();
  });
});

function withinMenu(menu: HTMLElement, rotulo: string): HTMLElement | null {
  return (
    Array.from(menu.querySelectorAll('[role="menuitem"]')).find((el) =>
      (el.textContent ?? '').includes(rotulo),
    ) as HTMLElement | null
  );
}
