/**
 * Etapa 159 — campo "Prazo — Até quando concluir" do modal Nova tarefa.
 *
 * Plano, seção 3.4 (imagem 04), linha 118:
 *   | "Prazo — Até quando concluir": data, hora e Hoje / Amanhã / Próx. semana | FALTA | 159 |
 *
 * Prova pelo componente REAL (`NewTaskDialog` monta o `PrazoField`), sem mock do
 * campo: os valores esperados saem das MESMAS funções que o campo usa
 * (`duePresetISO` / `comporLocal`), então o teste confere o comportamento e não
 * uma cópia da conta. Relógio fixo (`now`) para o resultado ser determinístico.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

import { NewTaskDialog } from '@/components/tasks/shared/NewTaskDialog';
import { duePresetISO } from '@/hooks/tasks/workItemPresets';
import { comporLocal, diaLocal, horaLocal } from '@/components/tasks/shared/localDateTime';

// Terça-feira, 13/10/2026, 12:00 locais.
const NOW = new Date(2026, 9, 13, 12, 0, 0, 0);

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

function renderDialog() {
  return render(
    <NewTaskDialog open onOpenChange={vi.fn()} now={NOW} />,
  );
}

function dataInput() {
  return screen.getByTestId('new-task-prazo-data') as HTMLInputElement;
}
function horaInput() {
  return screen.getByTestId('new-task-prazo-hora') as HTMLInputElement;
}
function limparBtn() {
  return screen.getByTestId('new-task-prazo-limpar') as HTMLButtonElement;
}

describe('NewTaskDialog — campo Prazo (etapa 159)', () => {
  it('renderiza o rótulo "Prazo / Até quando concluir" e os três atalhos', () => {
    renderDialog();

    expect(screen.getByText('Prazo')).toBeInTheDocument();
    expect(screen.getByText('Até quando concluir')).toBeInTheDocument();
    expect(screen.getByTestId('new-task-prazo-hoje')).toHaveTextContent('Hoje');
    expect(screen.getByTestId('new-task-prazo-amanha')).toHaveTextContent('Amanhã');
    expect(screen.getByTestId('new-task-prazo-prox-semana')).toHaveTextContent('Próx. semana');
  });

  it('nasce sem prazo: data e hora vazias e o limpar desabilitado', () => {
    renderDialog();

    expect(dataInput().value).toBe('');
    expect(horaInput().value).toBe('');
    expect(limparBtn()).toBeDisabled();
  });

  it('atalho "Hoje" grava o prazo de hoje (duePresetISO), no dia local 13/10', () => {
    renderDialog();
    fireEvent.click(screen.getByTestId('new-task-prazo-hoje'));

    expect(diaLocal(duePresetISO('today', NOW))).toBe('2026-10-13');
    expect(dataInput().value).toBe('2026-10-13');
    expect(horaInput().value).toBe('23:59');
    expect(limparBtn()).toBeEnabled();
  });

  it('atalho "Amanhã" grava o dia seguinte (14/10)', () => {
    renderDialog();
    fireEvent.click(screen.getByTestId('new-task-prazo-amanha'));

    expect(diaLocal(duePresetISO('tomorrow', NOW))).toBe('2026-10-14');
    expect(dataInput().value).toBe('2026-10-14');
  });

  it('atalho "Próx. semana" grava sete dias à frente (20/10)', () => {
    renderDialog();
    fireEvent.click(screen.getByTestId('new-task-prazo-prox-semana'));

    expect(diaLocal(duePresetISO('nextWeek', NOW))).toBe('2026-10-20');
    expect(dataInput().value).toBe('2026-10-20');
  });

  it('trocar a data e a hora compõe o instante local (comporLocal)', () => {
    renderDialog();

    fireEvent.change(dataInput(), { target: { value: '2026-11-05' } });
    fireEvent.change(horaInput(), { target: { value: '08:30' } });

    // Sem prazo anterior o campo assume 23:59 só ao escolher a data; depois da
    // hora, o instante é o par data+hora escolhido.
    expect(dataInput().value).toBe('2026-11-05');
    expect(horaInput().value).toBe('08:30');
    expect(horaLocal(comporLocal('2026-11-05', '08:30'))).toBe('08:30');
  });

  it('limpar apaga o valor e volta a desabilitar o botão', () => {
    renderDialog();

    fireEvent.click(screen.getByTestId('new-task-prazo-hoje'));
    expect(dataInput().value).not.toBe('');

    fireEvent.click(limparBtn());

    expect(dataInput().value).toBe('');
    expect(horaInput().value).toBe('');
    expect(limparBtn()).toBeDisabled();
  });
});
