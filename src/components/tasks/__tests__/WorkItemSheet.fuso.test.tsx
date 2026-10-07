/**
 * R2-MOD-050 — o "Salvar" do Sheet reconstruía as datas locais SEM offset
 * ("2026-10-20T09:00:00"), enquanto o QuickAdd já mandava ISO correto
 * ("2026-10-20T12:00:00.000Z"). Como `due_date`/`remind_at` são `timestamptz` e a
 * sessão do Postgres roda em UTC, o 09:00 local era lido como 09:00Z — 3 h antes
 * do horário escolhido em America/Sao_Paulo.
 *
 * Fuso do aparelho forçado a São Paulo de propósito: é o cenário em que o defeito
 * aparece. A leitura do banco é simulada por `instanteGravadoPeloBanco` (string
 * sem offset = fuso da sessão, UTC).
 */
process.env.TZ = 'America/Sao_Paulo';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { WorkItemSheet } from '@/components/tasks/shared/WorkItemSheet';
import { QuickAdd } from '@/components/tasks/shared/QuickAdd';
import { makeQueryClient, makeWrapper } from '@/test/mocks/tarefas';
import type { WorkItem } from '@/hooks/tasks/workItem.types';

/** Dia e hora escolhidos na tela: 2026-10-20 09:00 em São Paulo (UTC-3). */
const DIA = '2026-10-20';
const NOVE_H_LOCAL = new Date(2026, 9, 20, 9, 0, 0, 0);
/** O mesmo 09:00 de São Paulo em ISO — o instante que o banco tem de guardar. */
const NOVE_H_ISO = '2026-10-20T12:00:00.000Z';

/** Como o Postgres lê uma string para coluna `timestamptz`: sem offset = UTC. */
function instanteGravadoPeloBanco(payload: string): number {
  const temOffset = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(payload);
  return Date.parse(temOffset ? payload : `${payload}Z`);
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
    contactOptions: [],
    doingCount: 0,
    ...over,
  };
}

// jsdom não implementa as APIs de captura de ponteiro que o Radix usa.
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

describe('WorkItemSheet — prazo e alarme no fuso do aparelho (R2-MOD-050)', () => {
  beforeEach(() => cleanup());
  afterEach(() => cleanup());

  it('editar só o título não mexe em prazo/alarme nem habilita o Salvar por formato', () => {
    const item = { ...base, due_date: NOVE_H_ISO, remind_at: NOVE_H_ISO };
    const p = props({ item });
    render(<WorkItemSheet {...p} />);

    const salvar = () => screen.getByTestId('sheet-salvar') as HTMLButtonElement;
    // O ISO do banco ("2026-10-20T12:00:00+00:00" ou ".000Z") já é o 09:00 local:
    // não é mudança de prazo nem de alarme.
    expect(salvar().disabled).toBe(true);

    fireEvent.change(screen.getByTestId('sheet-titulo'), { target: { value: 'Ligar amanhã' } });
    expect(salvar().disabled).toBe(false);
    fireEvent.click(salvar());

    expect(p.onSave).toHaveBeenCalledWith(item, { title: 'Ligar amanhã' });
  });

  it('mudar a hora do prazo grava o instante local escolhido, com offset', () => {
    const item = { ...base, due_date: '2026-10-20T11:00:00.000Z' }; // 08:00 em SP
    const p = props({ item });
    render(<WorkItemSheet {...p} />);

    fireEvent.click(screen.getByTestId('sheet-prazo'));
    fireEvent.change(screen.getByTestId('sheet-prazo-hora'), { target: { value: '14:00' } });
    fireEvent.click(screen.getByTestId('sheet-salvar'));

    const patch = p.onSave.mock.calls[0][1] as { dueDate?: string | null };
    const escolhido = new Date(2026, 9, 20, 14, 0, 0, 0);
    expect(patch.dueDate).toBe(escolhido.toISOString());
    // O que o Postgres (sessão UTC) grava é o instante das 14:00 de São Paulo.
    expect(instanteGravadoPeloBanco(patch.dueDate as string)).toBe(escolhido.getTime());
  });

  it('criar pelo QuickAdd e editar no Sheet o mesmo 09:00 produzem o mesmo instante ISO', async () => {
    // Criação (QuickAdd): alarme 20/10 09:00.
    const onAdd = vi.fn().mockResolvedValue(undefined);
    const Wrapper = makeWrapper(makeQueryClient());
    render(<Wrapper><QuickAdd onAdd={onAdd} /></Wrapper>);
    const input = screen.getByTestId('quick-add-input');
    fireEvent.change(input, { target: { value: 'Ligar' } });
    fireEvent.click(screen.getByTestId('quick-add-chip-remind'));
    fireEvent.change(screen.getByTestId('quick-add-remind-date'), { target: { value: DIA } });
    fireEvent.change(screen.getByTestId('quick-add-remind-time'), { target: { value: '09:00' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));

    const criado = onAdd.mock.calls[0][0].remindAt as string;
    expect(criado).toBe(NOVE_H_LOCAL.toISOString());

    cleanup();

    // Edição (Sheet): o mesmo 20/10 09:00 no prazo, vindo de um 08:00.
    const item = { ...base, due_date: '2026-10-20T11:00:00.000Z' };
    const p = props({ item });
    render(<WorkItemSheet {...p} />);
    fireEvent.click(screen.getByTestId('sheet-prazo'));
    fireEvent.change(screen.getByTestId('sheet-prazo-hora'), { target: { value: '09:00' } });
    fireEvent.click(screen.getByTestId('sheet-salvar'));

    const patch = p.onSave.mock.calls[0][1] as { dueDate?: string | null };
    expect(patch.dueDate).toBe(criado);
    expect(instanteGravadoPeloBanco(patch.dueDate as string)).toBe(NOVE_H_LOCAL.getTime());
  });

  it('prazo de dia inteiro (23:59 local) volta intacto: só o título entra no patch', () => {
    const item = { ...base, due_date: '2026-10-21T02:59:00.000Z' }; // 21/10 23:59 em SP
    const p = props({ item });
    render(<WorkItemSheet {...p} />);

    const salvar = () => screen.getByTestId('sheet-salvar') as HTMLButtonElement;
    expect(salvar().disabled).toBe(true);

    fireEvent.change(screen.getByTestId('sheet-titulo'), { target: { value: 'Outro' } });
    fireEvent.click(salvar());

    expect(p.onSave).toHaveBeenCalledWith(item, { title: 'Outro' });
  });
});
