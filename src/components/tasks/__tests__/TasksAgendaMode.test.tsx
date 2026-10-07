/**
 * Etapa 88 — a Agenda com o RELÓGIO FIXO.
 *
 * O teste irmão (`agendaGroups.test.tsx`, etapa 55/57) roda com a data real e
 * cobre os grupos, o QuickAdd e o bloco "Atrasadas". Aqui a âncora é uma data
 * fixa — 01/10/2026 10:00 no fuso local — travada por `vi.setSystemTime`, para
 * que a faixa de 7 dias, a troca de dia e o recorte da semana sejam
 * determinísticos. Sem isso, os rótulos da faixa dependeriam do dia em que a
 * suíte roda (virada de mês, fim de semana etc.).
 *
 * Só `Date` é falsificado (`toFake: ['Date']`): os timers continuam reais, então
 * o `waitFor`/`findBy` da Testing Library seguem funcionando com o react-query
 * do `ContactCombobox`.
 *
 * Nenhum caso repete um cenário do `agendaGroups.test.tsx`: os de lá checam
 * existência/cobertura; os de cá checam a geometria da faixa e o recorte de
 * dias sob um "agora" conhecido.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TasksAgendaMode } from '@/components/tasks/agenda/TasksAgendaMode';
import type { WorkItem } from '@/hooks/tasks/workItem.types';
import type { WorkItemInput } from '@/hooks/tasks/useMyWorkItems';

/** 01/10/2026 10:00 (horário local) — quinta-feira; offsets 2 (sáb) e 3 (dom) são o fim de semana. */
const AGORA = new Date(2026, 9, 1, 10, 0, 0);

/** ISO local de "AGORA + offset dias" na hora pedida. */
const dia = (offset: number, h = 0, m = 0): string => {
  const d = new Date(AGORA);
  d.setDate(d.getDate() + offset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

/** Dia da semana (0=dom … 6=sáb) do offset a partir de AGORA. */
const dow = (offset: number): number => {
  const d = new Date(AGORA);
  d.setDate(d.getDate() + offset);
  return d.getDay();
};

/** Nº do dia do mês de AGORA + offset — base do rótulo "N de outubro". */
const numeroDoDia = (offset: number): number => {
  const d = new Date(AGORA);
  d.setDate(d.getDate() + offset);
  return d.getDate();
};

let seq = 0;
function makeItem(over: Partial<WorkItem>): WorkItem {
  seq += 1;
  return {
    id: `a${seq}`,
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
    status_changed_at: AGORA.toISOString(),
    completed_at: null,
    contact_id: null,
    created_by: 'p1',
    assigned_to: 'p1',
    created_at: AGORA.toISOString(),
    updated_at: AGORA.toISOString(),
    ...over,
  };
}

function renderAgenda(
  items: WorkItem[],
  overdue: WorkItem[] = [],
  opts: { isLoading?: boolean; onCreate?: (i: WorkItemInput) => Promise<void> } = {},
) {
  const onCreate = opts.onCreate ?? vi.fn().mockResolvedValue(undefined);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <TasksAgendaMode
          items={items}
          overdue={overdue}
          isLoading={opts.isLoading ?? false}
          onCreate={onCreate}
          onOpen={vi.fn()}
          onToggleDone={vi.fn()}
          onMoveTo={vi.fn()}
          onDelete={vi.fn()}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return onCreate;
}

/** `dd/MM` local de um ISO — o mesmo rótulo que o chip Data exibe. */
const rotuloCurto = (iso: string): string =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/** Botão da faixa do dia AGORA + offset, pelo rótulo acessível "N de outubro". */
const botaoDoDia = (offset: number) =>
  screen.getByRole('button', { name: new RegExp(`^${numeroDoDia(offset)} de `, 'i') });

describe('TasksAgendaMode — etapa 88 (relógio fixo)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AGORA);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('monta a faixa de 7 dias a partir do "agora" fixo, com hoje marcado', () => {
    renderAgenda([]);

    // Só os 7 botões de dia têm nome acessível "N de outubro".
    const dias = screen.getAllByRole('button', { name: /\d+ de /i });
    expect(dias).toHaveLength(7);

    expect(botaoDoDia(0).getAttribute('aria-label')).toBe('1 de outubro');
    expect(botaoDoDia(6).getAttribute('aria-label')).toBe('7 de outubro');

    expect(botaoDoDia(0).getAttribute('aria-current')).toBe('date');
    expect(botaoDoDia(1).getAttribute('aria-current')).toBeNull();
  });

  it('o QuickAdd nasce no dia fixo (01/10), não no relógio real', () => {
    renderAgenda([]);

    expect(screen.getByTestId('quick-add-chip-date').textContent).toContain('01/10');
    expect((screen.getByTestId('quick-add-input') as HTMLInputElement).placeholder).toContain('01/10');
  });

  it('escolher Amanhã (2 de outubro) mostra o item daquele dia e move o aria-current', () => {
    renderAgenda([makeItem({ title: 'Entregar amanhã', due_date: dia(1, 15) })]);

    // Hoje (01/10) não tem nada: o item está no dia seguinte, fora do recorte de hoje.
    expect(screen.queryByText('Entregar amanhã')).toBeNull();
    expect(screen.getByText('Nenhuma tarefa neste dia')).toBeTruthy();

    fireEvent.click(botaoDoDia(1));

    expect(screen.getByText('Entregar amanhã')).toBeTruthy();
    expect(botaoDoDia(1).getAttribute('aria-current')).toBe('date');
    expect(botaoDoDia(0).getAttribute('aria-current')).toBeNull();
  });

  it('#424: trocar de dia com uma criação PENDENTE não devolve o prazo do dia anterior', async () => {
    // A 1ª criação só resolve quando `resolverA` é chamado: assim o teste troca
    // de dia exatamente na janela entre o Enter e a resposta do servidor.
    let resolverA!: () => void;
    const pendente = new Promise<void>((res) => { resolverA = res; });
    const onCreate = vi.fn()
      .mockImplementationOnce(() => pendente)
      .mockResolvedValue(undefined);

    renderAgenda([], [], { onCreate });

    const campo = screen.getByTestId('quick-add-input') as HTMLInputElement;
    fireEvent.change(campo, { target: { value: 'Primeira' } });
    fireEvent.keyDown(campo, { key: 'Enter' });

    // Troca para o dia seguinte enquanto a 1ª criação ainda está pendente.
    fireEvent.click(botaoDoDia(1));
    expect(screen.getByTestId('quick-add-chip-date').textContent).toContain(rotuloCurto(dia(1, 23, 59)));

    // A 1ª criação resolve: o campo volta ao padrão VIGENTE (dia B), não ao dia A.
    await act(async () => { resolverA(); await pendente; });
    expect(screen.getByTestId('quick-add-chip-date').textContent).toContain(rotuloCurto(dia(1, 23, 59)));

    fireEvent.change(screen.getByTestId('quick-add-input'), { target: { value: 'Segunda' } });
    fireEvent.keyDown(screen.getByTestId('quick-add-input'), { key: 'Enter' });

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2));
    const segunda = onCreate.mock.calls[1][0];
    expect(segunda.title).toBe('Segunda');
    // O 2º create tem de sair no dia B (02/10), não no dia A (01/10).
    expect(new Date(segunda.dueDate as string).getDate()).toBe(numeroDoDia(1));
    expect(new Date(segunda.dueDate as string).getHours()).toBe(23);
  });

  it('o recorte é de 7 dias: o 7º dia entra, o 8º fica de fora', () => {
    renderAgenda([
      makeItem({ title: 'Dentro da janela', due_date: dia(6, 12) }),
      makeItem({ title: 'Fora da janela', due_date: dia(7, 12) }),
    ]);

    fireEvent.click(botaoDoDia(6));

    expect(screen.getByText('Dentro da janela')).toBeTruthy();
    expect(screen.queryByText('Fora da janela')).toBeNull();
  });

  it('os pontos da faixa são POR DIA: só o dia do prazo ganha ponto', () => {
    renderAgenda([makeItem({ title: 'Tarefa de sábado', due_date: dia(2, 10) })]);

    const dots = screen.getAllByTestId('agenda-day-dots');
    expect(dots).toHaveLength(7);

    expect(dots[0].querySelectorAll('span')).toHaveLength(0);
    expect(dots[1].querySelectorAll('span')).toHaveLength(0);
    expect(dots[2].querySelectorAll('span')).toHaveLength(1);
    expect(dots[2].querySelector('.bg-primary')).toBeTruthy();
  });

  it('fins de semana ganham o tom esmaecido na faixa; dias úteis não', () => {
    renderAgenda([]);

    const offsets = [0, 1, 2, 3, 4, 5, 6];
    const fimDeSemana = offsets.filter((o) => dow(o) === 0 || dow(o) === 6);
    const uteis = offsets.filter((o) => dow(o) !== 0 && dow(o) !== 6);

    // Sanidade do fixture: a semana fixa tem os dois fins de semana.
    expect(fimDeSemana).toHaveLength(2);
    fimDeSemana.forEach((o) => expect(botaoDoDia(o).className).toContain('bg-muted/30'));
    uteis.forEach((o) => expect(botaoDoDia(o).className).not.toContain('bg-muted/30'));
  });

  it('carregando: mostra 4 esqueletos e nenhum card nem faixa', () => {
    renderAgenda([], [], { isLoading: true });

    expect(document.querySelectorAll('.animate-shimmer')).toHaveLength(4);
    expect(screen.queryAllByTestId('work-item-card')).toHaveLength(0);
    expect(screen.queryByTestId('agenda-day-dots')).toBeNull();
  });
});
