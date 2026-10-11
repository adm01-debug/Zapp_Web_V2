/**
 * Etapas 132–136 do plano (imagem 03) — painel "Detalhes da tarefa":
 *  - 132 Cabeçalho: ícone calendário em quadrado primary, "Detalhes da tarefa" e expandir.
 *  - 133 Badges de estado e prioridade no topo, acompanhando a edição.
 *  - 134 Título (input grande) e Estado/Prioridade lado a lado como selects com
 *        ícone colorido; opção bloqueada pelo limite com explicação.
 *  - 135 Caixa "Motivo da espera" (borda âmbar + selo "Obrigatório", só em
 *        Aguardando), erro inline e foco automático vindo do arrastar.
 *  - 136 Contato com avatar no select e botão "Abrir conversa ↗" ao lado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

// `openContactChat` é o mecanismo do produto (mesmo do card); aqui só se prova
// que o botão "Abrir conversa" o chama com o contato escolhido.
const { abrirConversa } = vi.hoisted(() => ({ abrirConversa: vi.fn() }));
vi.mock('@/components/catalog/useSendProduct', () => ({ openContactChat: abrirConversa }));

import { WorkItemSheet } from '@/components/tasks/shared/WorkItemSheet';
import type { WorkItem } from '@/hooks/tasks/workItem.types';

// jsdom não implementa as APIs de captura de ponteiro que o Radix Select usa.
beforeEach(() => {
  abrirConversa.mockClear();
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

/** Radix Select abre pelo teclado no jsdom (pointerdown não basta). */
async function abrirSelect(testid: string) {
  const trigger = screen.getByTestId(testid);
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown', code: 'ArrowDown' });
  return screen.findByRole('listbox');
}

describe('WorkItemSheet — etapas 132–136 (painel Detalhes da tarefa)', () => {
  beforeEach(() => cleanup());
  afterEach(() => cleanup());

  it('132: o cabeçalho traz o ícone, "Detalhes da tarefa" e o expandir', () => {
    render(<WorkItemSheet {...props()} />);

    expect(screen.getByTestId('sheet-cabecalho')).toBeTruthy();
    expect(screen.getByText('Detalhes da tarefa')).toBeTruthy();

    const expandir = screen.getByTestId('sheet-expandir');
    expect(expandir.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(expandir);
    expect(screen.getByTestId('sheet-expandir').getAttribute('aria-pressed')).toBe('true');
  });

  it('133: os badges mostram o estado e a prioridade atuais e acompanham a edição', async () => {
    render(<WorkItemSheet {...props()} />);

    expect(screen.getByTestId('status-pill').getAttribute('data-status')).toBe('todo');
    expect(screen.getByTestId('priority-pill').getAttribute('data-priority')).toBe('medium');

    await abrirSelect('sheet-estado');
    fireEvent.click(await screen.findByRole('option', { name: 'Aguardando' }));
    expect(screen.getByTestId('status-pill').getAttribute('data-status')).toBe('waiting');
  });

  it('134: título é input e Estado/Prioridade são selects com ícone colorido', async () => {
    render(<WorkItemSheet {...props()} />);

    expect((screen.getByTestId('sheet-titulo') as HTMLElement).tagName).toBe('INPUT');
    expect((screen.getByTestId('sheet-estado') as HTMLElement).tagName).toBe('BUTTON');

    const prioridade = screen.getByTestId('sheet-prioridade');
    expect(prioridade.getAttribute('data-priority')).toBe('medium');

    await abrirSelect('sheet-prioridade');
    fireEvent.click(await screen.findByRole('option', { name: 'Urgente' }));
    expect(screen.getByTestId('sheet-prioridade').getAttribute('data-priority')).toBe('urgent');
  });

  it('134: a opção bloqueada pelo limite mostra a explicação', async () => {
    render(<WorkItemSheet {...props({ doingCount: 3 })} />);

    await abrirSelect('sheet-estado');
    const fazendo = await screen.findByRole('option', { name: /Fazendo está cheio \(3\/3\)/ });
    expect(fazendo.getAttribute('aria-disabled')).toBe('true');
  });

  it('135: a caixa "Motivo da espera" aparece só em Aguardando, com borda âmbar e selo Obrigatório', async () => {
    render(<WorkItemSheet {...props()} />);

    expect(screen.queryByTestId('sheet-motivo-caixa')).toBeNull();

    await abrirSelect('sheet-estado');
    fireEvent.click(await screen.findByRole('option', { name: 'Aguardando' }));

    const caixa = await screen.findByTestId('sheet-motivo-caixa');
    expect(caixa.className).toContain('border-warning');
    expect(screen.getByTestId('sheet-motivo-obrigatorio')).toHaveTextContent('Obrigatório');

    // Vazio: erro inline (a trava já existia e segue valendo).
    fireEvent.click(screen.getByTestId('sheet-salvar'));
    expect(await screen.findByTestId('sheet-motivo-erro')).toHaveTextContent('Diga por que parou');
  });

  it('135: o motivo recebe o foco quando o painel abre vindo do arrastar', () => {
    render(<WorkItemSheet {...props({ focusField: 'waiting_reason' })} />);
    expect(document.activeElement).toBe(screen.getByTestId('sheet-motivo'));
  });

  it('136: o Contato mostra avatar nas opções e "Abrir conversa" chama o produto', async () => {
    render(<WorkItemSheet {...props()} />);

    const botao = () => screen.getByTestId('sheet-abrir-conversa') as HTMLButtonElement;
    expect(botao().disabled).toBe(true);

    await abrirSelect('sheet-contato');
    const opcao = await screen.findByRole('option', { name: 'Ana Souza' });
    expect(opcao.querySelector('[data-testid="contact-avatar"]')).toBeTruthy();
    fireEvent.click(opcao);

    expect(botao().disabled).toBe(false);
    fireEvent.click(botao());
    expect(abrirConversa).toHaveBeenCalledWith('c1');
  });
});
