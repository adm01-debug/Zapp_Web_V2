/**
 * Etapa 42 — QuickAdd da fase D: captura com presets de data, alarme com
 * validação de passado e o menu ⋯ no modo compacto.
 *
 * Etapa 042 (plano do design): os chips passam a aparecer AO FOCAR o campo —
 * o teste que antes exigia a fileira sempre visível foi trocado por esse.
 *
 * O `ContactCombobox` é do passo paralelo do plano; aqui ele é substituído por
 * um stub com o mesmo `testId` para os testes não dependerem dele.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ contactoClicado: 0 }));

vi.mock('../shared/ContactCombobox', () => ({
  ContactCombobox: ({ testId }: { testId?: string }) => (
    <button
      type="button"
      data-testid={testId}
      aria-expanded="false"
      onClick={() => { h.contactoClicado += 1; }}
    />
  ),
}));

import { QuickAdd } from '../shared/QuickAdd';
import type { WorkItemInput } from '@/hooks/tasks/useMyWorkItems';

function montar(props: Partial<Parameters<typeof QuickAdd>[0]> = {}) {
  const onAdd = vi.fn().mockResolvedValue(undefined);
  render(<QuickAdd onAdd={onAdd} {...props} />);
  return { onAdd, input: screen.getByTestId('quick-add-input') as HTMLInputElement };
}

describe('QuickAdd — fase D (etapas 36–41)', () => {
  beforeEach(() => { cleanup(); h.contactoClicado = 0; });

  it('Enter cria a tarefa com o título digitado', async () => {
    const { onAdd, input } = montar();
    fireEvent.change(input, { target: { value: 'Ligar para o cliente' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd.mock.calls[0][0]).toMatchObject({
      title: 'Ligar para o cliente',
      status: 'backlog',
      priority: 'medium',
    });
  });

  it('Escape limpa o rascunho e o prazo escolhido', async () => {
    const { input } = montar();
    fireEvent.click(screen.getByTestId('quick-add-chip-today'));
    fireEvent.change(input, { target: { value: 'some' } });

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(input.value).toBe('');
    // O chip Data volta ao rótulo neutro (o prazo deixou de existir).
    expect(screen.getByTestId('quick-add-chip-date').textContent).toContain('Data');
  });

  it('o chip Hoje preenche o dueDate enviado', async () => {
    const { onAdd, input } = montar();
    fireEvent.change(input, { target: { value: 'Com prazo' } });
    fireEvent.click(screen.getByTestId('quick-add-chip-today'));
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    const due = onAdd.mock.calls[0][0].dueDate as string;
    expect(due).toBeTruthy();
    expect(new Date(due).toDateString()).toBe(new Date().toDateString());
  });

  // Etapa 042 (plano do design): a captura nasce limpa — os chips aparecem
  // quando o campo recebe o foco (antes eram sempre visíveis, etapa 36 da fase D).
  it('os chips da captura aparecem ao focar o campo (etapa 042)', () => {
    const { input } = montar();
    const fileira = screen.getByTestId('quick-add-chips');

    // Sem foco: a fileira existe no DOM (o teclado Ctrl+1/2 e os testes a
    // alcançam), mas está escondida — a barra é só o campo + a dica.
    expect(fileira.hidden).toBe(true);

    fireEvent.focus(input);
    expect(fileira.hidden).toBe(false);

    expect(screen.getByTestId('quick-add-chip-today').textContent).toContain('Hoje');
    expect(screen.getByTestId('quick-add-chip-tomorrow').textContent).toContain('Amanhã');
    expect(screen.getByTestId('quick-add-chip-date').textContent).toContain('Data');
    // Etapa 042: o rótulo é "Lembrete" (vocabulário do plano), não "Lembrar".
    expect(screen.getByTestId('quick-add-chip-remind').textContent).toContain('Lembrete');
    expect(screen.getByLabelText('Prioridade')).toBeTruthy();
    expect(screen.getByTestId('quick-add-chip-contact')).toBeTruthy();

    // Ordem do plano: Prioridade vem ANTES de Contato.
    const prioridade = screen.getByTestId('quick-add-chip-priority');
    const contato = screen.getByTestId('quick-add-chip-contact');
    expect(prioridade.compareDocumentPosition(contato) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('alarme no passado mostra erro inline e bloqueia a criação (etapa 38)', async () => {
    const { onAdd, input } = montar();
    fireEvent.change(input, { target: { value: 'Alarme vencido' } });

    // Abre o popover do chip Lembrar para alcançar os campos livres.
    fireEvent.click(screen.getByTestId('quick-add-chip-remind'));

    // Data/hora livres no passado.
    fireEvent.change(screen.getByTestId('quick-add-remind-date'), { target: { value: '2020-01-01' } });
    fireEvent.change(screen.getByTestId('quick-add-remind-time'), { target: { value: '09:00' } });

    expect(screen.getByTestId('quick-add-remind-error').textContent).toBe('O alarme precisa ser no futuro');
    expect((screen.getByText('Criar') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.keyDown(input, { key: 'Enter' });
    await new Promise((r) => setTimeout(r, 0));
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('compact esconde os chips atrás do botão ⋯ (etapa 36)', () => {
    montar({ compact: true });

    expect(screen.getByTestId('quick-add-more')).toBeTruthy();
    expect(screen.queryByTestId('quick-add-chip-today')).toBeNull();

    fireEvent.click(screen.getByTestId('quick-add-more'));
    expect(screen.getByTestId('quick-add-chip-today')).toBeTruthy();
  });

  it('Ctrl+1 aplica o preset Hoje pelo teclado (etapa 41)', async () => {
    const { onAdd, input } = montar();
    fireEvent.change(input, { target: { value: 'Atalho' } });
    fireEvent.keyDown(input, { key: '1', ctrlKey: true });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd.mock.calls[0][0].dueDate).toBeTruthy();
  });

  it('Ctrl+2 aplica o preset Amanhã pelo teclado (etapa 41)', async () => {
    const { onAdd, input } = montar();
    fireEvent.change(input, { target: { value: 'Amanhã de manhã' } });
    fireEvent.keyDown(input, { key: '2', ctrlKey: true });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    const due = new Date(onAdd.mock.calls[0][0].dueDate as string);
    expect(due.toDateString()).toBe(new Date(Date.now() + 86_400_000).toDateString());
  });

  it('sem parser de linguagem natural (G-5, etapa 41): o texto vai CRU e não vira prazo/alarme', async () => {
    const { onAdd, input } = montar();

    // Frase com data em linguagem natural: nada é interpretado — o título fica
    // inteiro e nenhum campo é preenchido por conta do texto.
    fireEvent.change(input, { target: { value: 'amanhã às 9h ligar para o cliente' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd.mock.calls[0][0]).toMatchObject({
      title: 'amanhã às 9h ligar para o cliente',
      dueDate: null,
      remindAt: null,
      priority: 'medium',
    });
  });

  it('omite o chip @ quando o contato é fixo do chat (etapa 39)', () => {
    montar({ defaultContactId: 'c1' });
    expect(screen.queryByTestId('quick-add-chip-contact')).toBeNull();
  });

  it('Ctrl+L abre o popover Lembrar e Ctrl+@ aciona o chip @ (etapa 41)', () => {
    const { input } = montar();

    // Ctrl+L: o conteúdo do popover (campos livres) fica alcançável.
    fireEvent.keyDown(input, { key: 'l', ctrlKey: true });
    expect(screen.getByTestId('quick-add-remind-date')).toBeTruthy();

    // Ctrl+@: dispara o gatilho do ContactCombobox (clique/abertura).
    fireEvent.keyDown(input, { key: '@', ctrlKey: true });
    expect(h.contactoClicado).toBe(1);
  });

  it('etapa 37: o chip Data aceita hora e leva o prazo escolhido ao create', async () => {
    const onAdd = vi.fn(async (_i: WorkItemInput) => {});
    render(<QuickAdd onAdd={onAdd} />);

    const chip = screen.getByTestId('quick-add-chip-date');
    fireEvent.pointerDown(chip, { button: 0 });
    fireEvent.click(chip);

    const hora = await screen.findByTestId('quick-add-date-time');
    fireEvent.change(hora, { target: { value: '08:30' } });

    fireEvent.change(screen.getByTestId('quick-add-input'), { target: { value: 'com hora marcada' } });
    fireEvent.keyDown(screen.getByTestId('quick-add-input'), { key: 'Enter' });

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    const due = new Date(onAdd.mock.calls[0][0].dueDate as string);
    expect(due.getHours()).toBe(8);
    expect(due.getMinutes()).toBe(30);
  });

  it('etapa 40: a prioridade nasce Média e a escolhida vai no create', async () => {
    const onAdd = vi.fn(async (_i: WorkItemInput) => {});
    render(<QuickAdd onAdd={onAdd} />);

    expect(screen.getByTestId('quick-add-chip-priority').textContent).toMatch(/M[eé]dia/);

    const chipPrio = screen.getByTestId('quick-add-chip-priority');
    fireEvent.pointerDown(chipPrio, { button: 0 });
    fireEvent.click(chipPrio);
    fireEvent.click(await screen.findByRole('button', { name: /Urgente/ }));

    fireEvent.change(screen.getByTestId('quick-add-input'), { target: { value: 'correr' } });
    fireEvent.keyDown(screen.getByTestId('quick-add-input'), { key: 'Enter' });

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd.mock.calls[0][0].priority).toBe('urgent');
  });
});
