/**
 * Etapa 55 — Agenda: os 3 grupos do dia, os pontos da faixa e o bloco "Atrasadas".
 *
 * O componente só recebe props (não fala com o banco), então o teste renderiza
 * direto — sem mock de Supabase. O `TooltipProvider` é o mesmo contexto que a app
 * monta em `AppProviders` (os chips usam `Tooltip`).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TasksAgendaMode } from '@/components/tasks/agenda/TasksAgendaMode';
import type { WorkItem } from '@/hooks/tasks/workItem.types';

const hoje = new Date();
const asHoje = (h: number, m = 0) => {
  const d = new Date(hoje); d.setHours(h, m, 0, 0); return d.toISOString();
};

let seq = 0;
function makeItem(over: Partial<WorkItem>): WorkItem {
  seq += 1;
  return {
    id: `i${seq}`,
    title: `Tarefa ${seq}`,
    description: null,
    status: 'todo',
    priority: 'medium',
    due_date: null,
    remind_at: null,
    notified_at: null,
    waiting_reason: null,
    position: 0,
    started_at: null,
    status_changed_at: hoje.toISOString(),
    completed_at: null,
    contact_id: null,
    created_by: 'p1',
    assigned_to: 'p1',
    created_at: hoje.toISOString(),
    updated_at: hoje.toISOString(),
    ...over,
  };
}

function renderAgenda(items: WorkItem[], overdue: WorkItem[] = [], onCreate = vi.fn().mockResolvedValue(undefined)) {
  const props = {
    items, overdue, isLoading: false, onCreate,
    onOpen: vi.fn(), onToggleDone: vi.fn(), onMoveTo: vi.fn(), onDelete: vi.fn(),
  };
  render(<TooltipProvider><TasksAgendaMode {...props} /></TooltipProvider>);
  return onCreate;
}

describe('TasksAgendaMode — etapa 57 (QuickAdd no dia selecionado)', () => {
  it('nasce com o prazo do dia selecionado e cria nele', async () => {
    const onCreate = renderAgenda([]);

    const campo = screen.getByTestId('quick-add-input');
    fireEvent.change(campo, { target: { value: 'Comprar insumo' } });

    // pré-preenchido: o chip do prazo já mostra o dia de hoje
    expect(screen.getByTestId('quick-add-due').textContent).toContain(new Date().toLocaleDateString('pt-BR'));

    fireEvent.keyDown(campo, { key: 'Enter' });

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const entrada = onCreate.mock.calls[0][0];
    expect(entrada.title).toBe('Comprar insumo');
    expect(entrada.status).toBe('todo');
    const prazo = new Date(entrada.dueDate);
    expect(prazo.getDate()).toBe(new Date().getDate());
    expect(prazo.getHours()).toBe(23);
    expect(prazo.getMinutes()).toBe(59);
  });

  it('ao trocar de dia o campo remonta e passa a criar no dia novo', async () => {
    const onCreate = renderAgenda([]);
    fireEvent.change(screen.getByTestId('quick-add-input'), { target: { value: 'Rascunho' } });

    const amanha = new Date(); amanha.setDate(amanha.getDate() + 1);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${amanha.getDate()} de`, 'i') }));

    const campo = screen.getByTestId('quick-add-input');
    expect((campo as HTMLInputElement).value).toBe('');

    fireEvent.change(campo, { target: { value: 'Para amanhã' } });
    fireEvent.keyDown(campo, { key: 'Enter' });

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(new Date(onCreate.mock.calls[0][0].dueDate).getDate()).toBe(amanha.getDate());
  });
});

describe('TasksAgendaMode — etapa 55', () => {
  it('o item com prazo e alarme no mesmo dia aparece nos dois grupos', () => {
    const dois = makeItem({ title: 'Ligar e entregar', remind_at: asHoje(9, 30), due_date: asHoje(18) });
    const diaInteiro = makeItem({ title: 'Comprar insumo', due_date: asHoje(0) });
    renderAgenda([dois, diaInteiro]);

    const alarmes = screen.getByRole('region', { name: 'Alarmes' });
    const prazos  = screen.getByRole('region', { name: 'Prazos' });
    const semHora = screen.getByRole('region', { name: 'Sem hora' });

    expect(within(alarmes).getByText('Ligar e entregar')).toBeTruthy();
    expect(within(prazos).getByText('Ligar e entregar')).toBeTruthy();   // DoD: nos dois
    expect(within(semHora).getByText('Comprar insumo')).toBeTruthy();
    expect(within(semHora).queryByText('Ligar e entregar')).toBeNull();
  });

  it('o grupo dos alarmes mostra a hora à esquerda', () => {
    renderAgenda([makeItem({ title: 'Chamar cliente', remind_at: asHoje(9, 30) })]);
    const alarmes = screen.getByRole('region', { name: 'Alarmes' });
    // a hora também aparece no RemindChip; a coluna da esquerda é a `w-14`
    expect(alarmes.querySelector('.w-14')?.textContent).toBe('09:30');
  });

  it('o card da Agenda é uma linha só de 44px, com checkbox e sem motivo de espera (etapa 56)', () => {
    const esperando = makeItem({
      title: 'Aguardando retorno', status: 'waiting', waiting_reason: 'cliente vai responder',
      remind_at: asHoje(11),
    });
    renderAgenda([esperando]);

    const card = screen.getAllByTestId('work-item-card')[0];
    expect(card.getAttribute('data-mode')).toBe('agenda');
    // contrato de classe: altura da linha única (a medida real é o gate visual da etapa 54)
    expect(card.className).toContain('h-11');
    expect(card.className).toContain('flex-row');
    // checkbox presente na Agenda (na Lista ele já era; no Quadro não)
    expect(within(card).getByRole('button', { name: 'Concluir tarefa' })).toBeTruthy();
    // nada de motivo de espera na linha
    expect(screen.queryByText('cliente vai responder')).toBeNull();
    // o kebab continua acessível (não fica escondido atrás do hover na Agenda)
    const kebab = within(card).getByRole('button', { name: 'Mais opções' });
    expect(kebab.className).not.toContain('opacity-0');
  });

  it('a faixa marca prazo, alarme e atrasada — até 3 pontos', () => {
    const item = makeItem({ remind_at: asHoje(9), due_date: asHoje(18) });
    renderAgenda([item], [makeItem({ title: 'Vencida' })]);

    const hoje0 = screen.getAllByTestId('agenda-day-dots')[0];
    const pontos = hoje0.querySelectorAll('span');
    expect(pontos).toHaveLength(3);
    expect(hoje0.querySelector('.bg-primary')).toBeTruthy();
    expect(hoje0.querySelector('.bg-warning')).toBeTruthy();
    expect(hoje0.querySelector('.bg-destructive')).toBeTruthy();
  });

  it('"Atrasadas" nasce colapsado quando passa de 3 e abre no clique', () => {
    const atrasadas = Array.from({ length: 4 }, (_, i) => makeItem({ title: `Vencida ${i + 1}` }));
    renderAgenda([], atrasadas);

    const bloco = screen.getByRole('button', { name: /4 atrasadas/ });
    expect(bloco.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Vencida 1')).toBeNull();

    fireEvent.click(bloco);

    expect(bloco.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Vencida 1')).toBeTruthy();
    expect(screen.getByText('Vencida 4')).toBeTruthy();
  });

  it('com até 3 atrasadas, o bloco já vem aberto', () => {
    renderAgenda([], [makeItem({ title: 'Vencida única' })]);
    expect(screen.getByText('Vencida única')).toBeTruthy();
    expect(screen.getByRole('button', { name: /1 atrasada/ }).getAttribute('aria-expanded')).toBe('true');
  });

  it('sem nada no dia, mostra o estado vazio', () => {
    renderAgenda([]);
    expect(screen.getByText('Nenhuma tarefa neste dia')).toBeTruthy();
  });
});
