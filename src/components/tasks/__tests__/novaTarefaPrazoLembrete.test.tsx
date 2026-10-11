/**
 * Etapas 159, 160, 163 e 164 (plano, linhas 439–442; imagem 04, seção 3.4) —
 * prazo, lembrete, coerência e destino no modal "Nova tarefa".
 *
 * O que este arquivo prova, e por quê:
 *  - o campo Prazo ("Prazo — Até quando concluir") grava `due_date` pelos
 *    atalhos Hoje / Amanhã / Próx. semana, deixa escolher data e hora e
 *    permite limpar — cada atalho chama a função pura `duePresetISO`, então os
 *    valores esperados saem da MESMA fonte que a tela usa;
 *  - o campo Lembrete ("Lembrete — Quando você quer ser avisado") grava
 *    `remind_at` pelos atalhos Em 1h / Amanhã 9h / Próx. seg. 9h e data/hora;
 *  - a coerência prazo × lembrete (etapa 163) mostra verde/âmbar/vermelho com
 *    os tokens de TEXTO do módulo (`text-success`, `--warning-text`,
 *    `--destructive-text`, AA em ambos os temas) e "Ajustar para 1 h antes do
 *    prazo" reposiciona o lembrete;
 *  - o destino escrito (etapa 164) diz que a tarefa nasce na Caixa de entrada e
 *    NÃO é um campo editável.
 *
 * O relógio é fixado (`vi.setSystemTime`) para os presets serem determinísticos;
 * os valores esperados vêm das funções puras, não de strings escritas à mão, o
 * que mantém a prova independente do fuso do runner.
 */
import '@/test/mocks/tarefas';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { axe } from 'vitest-axe';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/crm/useContactsSearch', () => ({
  useContactsSearch: () => ({ contacts: [], loading: false, handleSearchChange: () => {} }),
}));

import { TasksUiProvider } from '@/components/tasks/shared/TasksUiContext';
import { useTasksUi } from '@/components/tasks/shared/tasksUi';
import { NewTaskDialog } from '@/components/tasks/shared/NewTaskDialog';
import { diaLocal, horaLocal } from '@/components/tasks/shared/localDateTime';
import { duePresetISO, remindPresetISO } from '@/hooks/tasks/workItemPresets';

/** 11/10/2026 18:30 locais (21:30Z) — longe da virada de hora e de dia. */
const AGORA = new Date('2026-10-11T21:30:00.000Z');

function AbrirEMontar() {
  const { modalOpen, openModal } = useTasksUi();
  return (
    <>
      <button type="button" onClick={openModal}>abrir modal</button>
      {modalOpen && <NewTaskDialog />}
    </>
  );
}

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <TasksUiProvider>
        <AbrirEMontar />
      </TasksUiProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'abrir modal' }));
  return utils;
}

const campo = (testId: string) => screen.getByTestId(testId) as HTMLInputElement;
const aviso = () => screen.getByTestId('new-task-remind-coherence');
/** Trocar qualquer campo força um render novo — é assim que a coerência relê o relógio. */
const repintar = () => fireEvent.change(campo('new-task-title'), { target: { value: 'a' } });

describe('NewTaskDialog — prazo, lembrete, coerência e destino (etapas 159–164)', () => {
  beforeEach(() => {
    cleanup();
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    const proto = Element.prototype as unknown as Record<string, () => unknown>;
    proto.hasPointerCapture ??= () => false;
    proto.setPointerCapture ??= () => undefined;
    proto.releasePointerCapture ??= () => undefined;
    proto.scrollIntoView ??= () => undefined;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('etapa 159: campo Prazo com rótulo, atalhos e hora travada até haver dia', () => {
    montar();

    expect(screen.getByLabelText('Prazo — Até quando concluir')).toBe(campo('new-task-due-date'));
    expect(screen.getByTestId('new-task-due-today').textContent).toBe('Hoje');
    expect(screen.getByTestId('new-task-due-tomorrow').textContent).toBe('Amanhã');
    expect(screen.getByTestId('new-task-due-nextWeek').textContent).toBe('Próx. semana');

    // Sem dia não há hora nem "Limpar".
    expect(campo('new-task-due-time').disabled).toBe(true);
    expect(screen.queryByTestId('new-task-due-clear')).toBeNull();
  });

  it('etapa 159: atalho "Hoje" grava o preset, destrava a hora (23:59) e Limpar volta vazio', () => {
    montar();

    fireEvent.click(screen.getByTestId('new-task-due-today'));

    const esperado = duePresetISO('today', AGORA);
    expect(campo('new-task-due-date').value).toBe(diaLocal(esperado));
    expect(campo('new-task-due-time').value).toBe('23:59');
    expect(horaLocal(esperado)).toBe('23:59');
    expect(campo('new-task-due-time').disabled).toBe(false);

    // Trocar a hora recompõe o ISO mantendo o dia.
    fireEvent.change(campo('new-task-due-time'), { target: { value: '08:15' } });
    expect(campo('new-task-due-time').value).toBe('08:15');

    fireEvent.click(screen.getByTestId('new-task-due-clear'));
    expect(campo('new-task-due-date').value).toBe('');
    expect(campo('new-task-due-time').value).toBe('');
    expect(campo('new-task-due-time').disabled).toBe(true);
    expect(screen.queryByTestId('new-task-due-clear')).toBeNull();
  });

  it('etapa 159: "Amanhã" e "Próx. semana" caem no dia certo (aritmética de calendário)', () => {
    montar();

    fireEvent.click(screen.getByTestId('new-task-due-tomorrow'));
    expect(campo('new-task-due-date').value).toBe(diaLocal(duePresetISO('tomorrow', AGORA)));

    fireEvent.click(screen.getByTestId('new-task-due-nextWeek'));
    expect(campo('new-task-due-date').value).toBe(diaLocal(duePresetISO('nextWeek', AGORA)));
  });

  it('etapa 160: campo Lembrete com rótulo e os três atalhos', () => {
    montar();

    expect(screen.getByLabelText('Lembrete — Quando você quer ser avisado')).toBe(
      campo('new-task-remind-date'),
    );
    expect(screen.getByTestId('new-task-remind-in1h').textContent).toBe('Em 1h');
    expect(screen.getByTestId('new-task-remind-tomorrow9').textContent).toBe('Amanhã, 9h');
    expect(screen.getByTestId('new-task-remind-nextMonday9').textContent).toBe('Próx. seg., 9h');
    expect(campo('new-task-remind-time').disabled).toBe(true);
  });

  it('etapa 160: "Amanhã, 9h" grava 09:00 do dia seguinte e "Em 1h" usa a hora redonda', () => {
    montar();

    fireEvent.click(screen.getByTestId('new-task-remind-tomorrow9'));
    const amanha9 = remindPresetISO('tomorrow9', AGORA);
    expect(campo('new-task-remind-date').value).toBe(diaLocal(amanha9));
    expect(campo('new-task-remind-time').value).toBe('09:00');

    fireEvent.click(screen.getByTestId('new-task-remind-in1h'));
    const em1h = remindPresetISO('in1h', AGORA);
    expect(campo('new-task-remind-time').value).toBe(horaLocal(em1h));

    fireEvent.click(screen.getByTestId('new-task-remind-clear'));
    expect(campo('new-task-remind-date').value).toBe('');
  });

  it('etapa 163: sem lembrete não há aviso; lembrete ANTES do prazo fica verde', () => {
    montar();

    expect(screen.queryByTestId('new-task-remind-coherence')).toBeNull();

    fireEvent.click(screen.getByTestId('new-task-due-today')); // 23:59 de hoje
    fireEvent.click(screen.getByTestId('new-task-remind-in1h')); // 19:30 de hoje

    expect(aviso().dataset.state).toBe('ok');
    expect(aviso().textContent).toContain('Lembrete programado para antes do prazo.');
    expect(aviso().className).toContain('text-success');
  });

  it('etapa 163: lembrete DEPOIS do prazo fica âmbar e "Ajustar" põe 1 h antes', () => {
    montar();

    fireEvent.click(screen.getByTestId('new-task-due-today')); // hoje 23:59
    fireEvent.click(screen.getByTestId('new-task-remind-tomorrow9')); // amanhã 09:00

    expect(aviso().dataset.state).toBe('after_due');
    expect(aviso().textContent).toContain('O lembrete precisa ser antes do prazo.');
    expect(aviso().className).toContain('var(--warning-text)');

    fireEvent.click(screen.getByTestId('new-task-remind-fix'));

    // prazo − 1 h: mesmo dia, uma hora antes das 23:59.
    expect(campo('new-task-remind-time').value).toBe('22:59');
    expect(campo('new-task-remind-date').value).toBe(diaLocal(duePresetISO('today', AGORA)));
    expect(aviso().dataset.state).toBe('ok');
    expect(aviso().textContent).toContain('Lembrete programado para antes do prazo.');
  });

  it('etapa 163: lembrete no PASSADO fica vermelho; lembrete sem prazo fica âmbar', () => {
    montar();

    fireEvent.click(screen.getByTestId('new-task-remind-in1h')); // 19:30, sem prazo
    expect(aviso().dataset.state).toBe('no_due');
    expect(aviso().className).toContain('var(--warning-text)');

    // O relógio passa do lembrete: o aviso vira "no futuro", em vermelho.
    vi.setSystemTime(new Date(AGORA.getTime() + 2 * 3_600_000));
    repintar();
    expect(aviso().dataset.state).toBe('in_past');
    expect(aviso().textContent).toContain('O lembrete precisa estar no futuro.');
    expect(aviso().className).toContain('var(--destructive-text)');
  });

  it('etapa 164: destino escrito na Caixa de entrada e sem campo de estado', () => {
    montar();

    const destino = screen.getByTestId('new-task-destination');
    expect(destino.textContent).toContain('A tarefa será criada na Caixa de entrada.');
    // Não é campo: nenhum input/select/textarea dentro do aviso de destino.
    expect(destino.querySelector('input, select, textarea')).toBeNull();
    // E o modal não oferece nenhum campo de "destino"/coluna.
    expect(screen.queryByLabelText(/destino/i)).toBeNull();
  });

  it('sem violação de acessibilidade (axe) com prazo, lembrete e aviso', async () => {
    vi.useRealTimers();
    montar();

    fireEvent.click(screen.getByTestId('new-task-due-today'));
    fireEvent.click(screen.getByTestId('new-task-remind-tomorrow9'));

    await waitFor(() => expect(aviso().dataset.state).toBe('after_due'));
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
