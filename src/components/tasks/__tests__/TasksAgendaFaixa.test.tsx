/**
 * Etapas 108–111 — a faixa de atrasadas, o título da semana e a faixa de 7 dias
 * da Agenda (plano `PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md`, seção
 * 3.2 / imagem `Tarefas/02.png`).
 *
 * O relógio é FIXO em 11/10/2026 10:00 (domingo) para que o intervalo da semana
 * seja exatamente "11 – 17 de outubro de 2026" — o mesmo do plano — e a sigla de
 * cada cartão seja determinística (DOM…SÁB).
 *
 * Os testes irmãos (`TasksAgendaMode.test.tsx`, etapa 88, e `agendaGroups.test.tsx`,
 * etapas 55/57) continuam cobrindo a geometria sob outro "agora" e os grupos do
 * dia; aqui ficam a legenda dos pontos, as contagens no nome acessível, a pílula
 * "Hoje" e o teclado ←/→.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TasksAgendaMode } from '@/components/tasks/agenda/TasksAgendaMode';
import type { WorkItem } from '@/hooks/tasks/workItem.types';

/** 11/10/2026 10:00 local — domingo. Offsets 0 (dom) e 6 (sáb) são o fim de semana. */
const AGORA = new Date(2026, 9, 11, 10, 0, 0);

/** ISO local de "AGORA + offset dias" na hora pedida. */
const dia = (offset: number, h = 0, m = 0): string => {
  const d = new Date(AGORA);
  d.setDate(d.getDate() + offset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

let seq = 0;
function makeItem(over: Partial<WorkItem>): WorkItem {
  seq += 1;
  return {
    id: `b${seq}`,
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

function renderAgenda(items: WorkItem[], overdue: WorkItem[] = []) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <TasksAgendaMode
          items={items}
          overdue={overdue}
          isLoading={false}
          onCreate={vi.fn().mockResolvedValue(undefined)}
          onOpen={vi.fn()}
          onToggleDone={vi.fn()}
          onMoveTo={vi.fn()}
          onDelete={vi.fn()}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

/** Os 7 cartões de dia, na ordem da faixa. */
const cartoesDeDia = () => screen.getAllByTestId('agenda-day');
const pontos = (i: number) => screen.getAllByTestId('agenda-day-dots')[i];

describe('TasksAgendaMode — etapas 108–111 (relógio fixo em 11/10/2026)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AGORA);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('etapa 109: "Próximos 7 dias", o intervalo "11 – 17 de outubro de 2026" e a nota', () => {
    renderAgenda([]);

    expect(screen.getByText('Próximos 7 dias')).toBeTruthy();
    expect(screen.getByTestId('agenda-week-range').textContent).toBe('11 – 17 de outubro de 2026');
    expect(screen.getByText('O lembrete avisa você. O prazo marca a entrega.')).toBeTruthy();
  });

  it('etapa 110: sigla DOM…SÁB, número e a pílula "Hoje" só no dia de hoje', () => {
    renderAgenda([]);

    const cartoes = cartoesDeDia();
    expect(cartoes).toHaveLength(7);

    const siglas = cartoes.map(c => c.querySelector('span')?.textContent);
    expect(siglas).toEqual(['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']);
    // O número do dia em cada cartão (11 … 17).
    expect(cartoes.map(c => c.textContent).every((t, i) => t?.includes(String(11 + i)))).toBe(true);

    // A pílula "Hoje" existe UMA vez — no primeiro cartão (o chip do QuickAdd também diz "Hoje").
    expect(cartoes[0].textContent).toContain('Hoje');
    expect(cartoes[1].textContent).not.toContain('Hoje');
    expect(cartoes.filter(c => c.textContent?.includes('Hoje'))).toHaveLength(1);

    // O selecionado é o de hoje e traz a borda primary.
    expect(cartoes[0].getAttribute('aria-current')).toBe('date');
    expect(cartoes[0].className).toContain('border-primary');
  });

  it('etapa 110: ←/→ andam pela faixa e NÃO dão a volta nos limites', () => {
    renderAgenda([]);
    const cartoes = cartoesDeDia();

    // → de hoje para amanhã: a seleção (e o aria-current) acompanham.
    fireEvent.keyDown(cartoes[0], { key: 'ArrowRight' });
    expect(cartoesDeDia()[1].getAttribute('aria-current')).toBe('date');
    expect(cartoesDeDia()[0].getAttribute('aria-current')).toBeNull();

    // ← volta para hoje.
    fireEvent.keyDown(cartoesDeDia()[1], { key: 'ArrowLeft' });
    expect(cartoesDeDia()[0].getAttribute('aria-current')).toBe('date');

    // No limite esquerdo nada muda.
    fireEvent.keyDown(cartoesDeDia()[0], { key: 'ArrowLeft' });
    expect(cartoesDeDia()[0].getAttribute('aria-current')).toBe('date');
    expect(cartoesDeDia().filter(c => c.getAttribute('aria-current'))).toHaveLength(1);

    // No limite direito (sábado, 7º cartão) nada muda.
    fireEvent.click(cartoesDeDia()[6]);
    fireEvent.keyDown(cartoesDeDia()[6], { key: 'ArrowRight' });
    expect(cartoesDeDia()[6].getAttribute('aria-current')).toBe('date');
    expect(cartoesDeDia().filter(c => c.getAttribute('aria-current'))).toHaveLength(1);
  });

  it('etapa 111: lembrete é AZUL, prazo é ÂMBAR e atrasada é VERMELHO', () => {
    // Dia 12 (offset 1): só lembrete. Dia 13 (offset 2): só prazo.
    // Hoje (offset 0): lembrete + prazo + atrasada → 3 pontos, na ordem da legenda.
    renderAgenda(
      [
        makeItem({ remind_at: dia(1, 9) }),
        makeItem({ due_date: dia(2, 18) }),
        makeItem({ remind_at: dia(0, 9) }),
        makeItem({ due_date: dia(0, 18) }),
      ],
      [makeItem({ title: 'Vencida', due_date: dia(-3, 12) })],
    );

    expect(pontos(0).querySelectorAll('span')).toHaveLength(3);
    expect(pontos(0).querySelector('.bg-primary')).toBeTruthy();
    expect(pontos(0).querySelector('.bg-warning')).toBeTruthy();
    expect(pontos(0).querySelector('.bg-destructive')).toBeTruthy();
    // A ordem dos pontos é a da legenda: azul, âmbar, vermelho.
    expect(Array.from(pontos(0).querySelectorAll('span')).map(s => s.className)).toEqual([
      expect.stringContaining('bg-primary'),
      expect.stringContaining('bg-warning'),
      expect.stringContaining('bg-destructive'),
    ]);

    expect(pontos(1).querySelectorAll('span')).toHaveLength(1);
    expect(pontos(1).querySelector('.bg-primary')).toBeTruthy();

    expect(pontos(2).querySelectorAll('span')).toHaveLength(1);
    expect(pontos(2).querySelector('.bg-warning')).toBeTruthy();

    expect(pontos(3).querySelectorAll('span')).toHaveLength(0);
  });

  it('etapa 111: a legenda explica os três pontos e o nome acessível traz as contagens', () => {
    renderAgenda([
      makeItem({ remind_at: dia(0, 9) }),
      makeItem({ remind_at: dia(0, 10) }),
      makeItem({ due_date: dia(0, 18) }),
    ]);

    const legenda = screen.getByTestId('agenda-dots-legend');
    expect(legenda.textContent).toBe('LembretePrazoAtrasada');
    expect(legenda.querySelector('.bg-primary')).toBeTruthy();
    expect(legenda.querySelector('.bg-warning')).toBeTruthy();
    expect(legenda.querySelector('.bg-destructive')).toBeTruthy();

    // O nome acessível do dia de hoje: data + contagens por tipo.
    const rotulo = cartoesDeDia()[0].getAttribute('aria-label') ?? '';
    expect(rotulo).toContain('domingo, 11 de outubro');
    expect(rotulo).toContain('2 lembretes, 1 prazo');
    // Um dia vazio anuncia o vazio.
    expect(cartoesDeDia()[3].getAttribute('aria-label')).toContain('Nenhum compromisso');
  });

  it('etapa 108: a faixa de atrasadas ocupa a largura toda e o "Ver tarefas" abre a lista', () => {
    const atrasadas = [1, 2, 3, 4].map(n => makeItem({ title: `Vencida ${n}`, due_date: dia(-n, 12) }));
    renderAgenda([], atrasadas);

    const regiao = document.getElementById('agenda-atrasadas')!;
    expect(regiao.className).toContain('w-full');
    expect(regiao.className).toContain('bg-destructive/5');

    const botao = screen.getByRole('button', { name: /4 tarefas atrasadas/i });
    expect(botao.textContent).toContain('Ver tarefas');
    expect(botao.className).toContain('w-full');
    expect(botao.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Vencida 1')).toBeNull();

    fireEvent.click(botao);

    expect(botao.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Vencida 1')).toBeTruthy();
    expect(screen.getByText('Vencida 4')).toBeTruthy();
  });
});
