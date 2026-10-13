/**
 * Etapa 160 — campo "Lembrete — Quando você quer ser avisado" do modal Nova tarefa.
 *
 * Plano, seção 3.4 (imagem 04), linha 119:
 *   | "Lembrete — Quando você quer ser avisado": data, hora e Em 1h / Amanhã, 9h /
 *     Próx. seg., 9h | FALTA | 160–161 |
 *
 * Prova pelo componente REAL (`NewTaskDialog` monta o `RemindField`), sem mock do
 * campo: os valores esperados saem das MESMAS funções que o campo usa
 * (`remindPresetISO` / `comporLocal`), então o teste confere o comportamento e não
 * uma cópia da conta. Relógio fixo (`now`) para o resultado ser determinístico.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

import { NewTaskDialog } from '@/components/tasks/shared/NewTaskDialog';
import { remindPresetISO } from '@/hooks/tasks/workItemPresets';
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
  return render(<NewTaskDialog open onOpenChange={vi.fn()} now={NOW} />);
}

function dataInput() {
  return screen.getByTestId('new-task-lembrete-data') as HTMLInputElement;
}
function horaInput() {
  return screen.getByTestId('new-task-lembrete-hora') as HTMLInputElement;
}
function limparBtn() {
  return screen.getByTestId('new-task-lembrete-limpar') as HTMLButtonElement;
}

describe('NewTaskDialog — campo Lembrete (etapa 160)', () => {
  it('renderiza o rótulo "Lembrete / Quando você quer ser avisado" e os três atalhos', () => {
    renderDialog();

    expect(screen.getByText('Lembrete')).toBeInTheDocument();
    expect(screen.getByText('Quando você quer ser avisado')).toBeInTheDocument();
    expect(screen.getByTestId('new-task-lembrete-em-1h')).toHaveTextContent('Em 1h');
    expect(screen.getByTestId('new-task-lembrete-amanha-9h')).toHaveTextContent('Amanhã, 9h');
    expect(screen.getByTestId('new-task-lembrete-prox-seg-9h')).toHaveTextContent('Próx. seg., 9h');
  });

  it('nasce sem lembrete: data e hora vazias e o limpar desabilitado', () => {
    renderDialog();

    expect(dataInput().value).toBe('');
    expect(horaInput().value).toBe('');
    expect(limparBtn()).toBeDisabled();
  });

  it('atalho "Em 1h" grava agora + 1 h (remindPresetISO), no dia local 13/10', () => {
    renderDialog();
    fireEvent.click(screen.getByTestId('new-task-lembrete-em-1h'));

    expect(diaLocal(remindPresetISO('in1h', NOW))).toBe('2026-10-13');
    expect(dataInput().value).toBe('2026-10-13');
    expect(horaInput().value).toBe('13:00');
    expect(limparBtn()).toBeEnabled();
  });

  it('atalho "Amanhã, 9h" grava o dia seguinte às 09:00 (14/10 09:00)', () => {
    renderDialog();
    fireEvent.click(screen.getByTestId('new-task-lembrete-amanha-9h'));

    expect(diaLocal(remindPresetISO('tomorrow9', NOW))).toBe('2026-10-14');
    expect(dataInput().value).toBe('2026-10-14');
    expect(horaInput().value).toBe('09:00');
  });

  it('atalho "Próx. seg., 9h" grava a próxima segunda às 09:00 (19/10 09:00)', () => {
    renderDialog();
    fireEvent.click(screen.getByTestId('new-task-lembrete-prox-seg-9h'));

    expect(diaLocal(remindPresetISO('nextMonday9', NOW))).toBe('2026-10-19');
    expect(dataInput().value).toBe('2026-10-19');
    expect(horaInput().value).toBe('09:00');
  });

  it('escolher só a data assume 09:00 locais; trocar a hora compõe o instante local', () => {
    renderDialog();

    fireEvent.change(dataInput(), { target: { value: '2026-11-05' } });
    expect(horaInput().value).toBe('09:00');

    fireEvent.change(horaInput(), { target: { value: '08:30' } });

    expect(dataInput().value).toBe('2026-11-05');
    expect(horaInput().value).toBe('08:30');
    expect(horaLocal(comporLocal('2026-11-05', '08:30'))).toBe('08:30');
  });

  it('limpar apaga o valor e volta a desabilitar o botão', () => {
    renderDialog();

    fireEvent.click(screen.getByTestId('new-task-lembrete-em-1h'));
    expect(dataInput().value).not.toBe('');

    fireEvent.click(limparBtn());

    expect(dataInput().value).toBe('');
    expect(horaInput().value).toBe('');
    expect(limparBtn()).toBeDisabled();
  });
});
